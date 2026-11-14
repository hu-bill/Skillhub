// Changes the dashboard can make to an AI app's setup, and only these:
//   - link or remove a user-level skill folder for an app
//   - add or remove an MCP server in an app's config
//   - install a skill or an MCP server found in Discover
//
// Rules every action follows:
//   1. Nothing runs without the user confirming a plan that names the exact file or command.
//   2. A request names items by snapshot id. The server resolves paths and commands itself, so a
//      request can never point a write at an arbitrary file.
//   3. Config files are backed up before they are edited and written atomically. A file that is not
//      strict JSON (it has comments) is never rewritten: the step is refused with the manual snippet.
//   4. Skill folders are never deleted. A link is unlinked; a real folder is moved to the backup directory.
//   5. Credentials copied from one app's config to another stay on disk. They are never put in an
//      HTTP response, a plan, a result message or a log.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { APP_DEFS } from '../collectors/lib/apps.ts';
import { asRecord, asString, asStringArray, display, expand, readText, type CollectContext } from '../collectors/lib/context.ts';
import { mcpAddCommand, portableServer } from '../shared/insights.ts';
import type { ActionRequest, AppInfo, HarnessSnapshot, McpServer, PlannedStep, SkillItem, StepResult } from '../shared/schema.ts';

export type Runner = (command: string, args: string[], timeoutMs?: number) => Promise<{ ok: boolean; output: string }>;

export interface ActionEnv {
  ctx: CollectContext;
  /** Starts a CLI without a shell. Tests replace it; nothing else may spawn processes. */
  run: Runner;
  /** Where backups of edited configs and removed skill folders go. */
  backupRoot: string;
}

export const defaultRunner: Runner = (command, args, timeoutMs = 60_000) =>
  new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // CLI output can echo arguments, which may hold a credential. Only a generic outcome is reported.
      void stdout;
      void stderr;
      if (!error) return resolve({ ok: true, output: '' });
      const code = (error as NodeJS.ErrnoException).code;
      resolve({ ok: false, output: code === 'ENOENT' ? `The ${command} command was not found.` : `The ${command} command reported an error.` });
    });
  });

interface Op {
  step: PlannedStep;
  exec?: () => Promise<string>;
  /** Steps sharing a batch key are carried out by one command. */
  batch?: { key: string; source: string; skill: string; agent: string };
}

/** A server definition with its real values. Never leaves this module. */
interface RawServer {
  command?: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers: Record<string, string>;
  bearerEnvVar?: string;
}

// ---------------------------------------------------------------------------------------------
// Helpers

/**
 * A name that is safe as a command-line argument and as a path segment: it starts with a letter or
 * digit, so it can never be read as a flag, and has no separators or shell characters.
 */
const SAFE_NAME = /^[A-Za-z0-9][\w.-]{0,63}$/;
const SAFE_REPO = /^[A-Za-z0-9][\w.-]{0,63}\/[A-Za-z0-9][\w.-]{0,63}$/;

function undisplay(ctx: CollectContext, shown: string): string {
  if (shown === '~') return ctx.home;
  if (shown.startsWith('~/')) return path.join(ctx.home, shown.slice(2));
  if (shown === '.') return ctx.projectRoot;
  if (shown.startsWith('./')) return path.join(ctx.projectRoot, shown.slice(2));
  return shown;
}

async function lstatOrNull(target: string) {
  try {
    return await fs.lstat(target);
  } catch {
    return null;
  }
}

async function realpathOr(target: string): Promise<string> {
  try {
    return await fs.realpath(target);
  } catch {
    return target;
  }
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

async function backupFile(env: ActionEnv, file: string): Promise<void> {
  const exists = await lstatOrNull(file);
  if (!exists) return;
  const dir = path.join(env.backupRoot, stamp(new Date()), 'configs');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.copyFile(file, path.join(dir, display(env.ctx, file).replace(/[^\w.-]+/g, '_')));
}

async function writeAtomic(file: string, content: string): Promise<void> {
  const existing = await lstatOrNull(file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.wayfinder-${process.pid}.tmp`;
  await fs.writeFile(temp, content, { mode: existing ? existing.mode & 0o777 : 0o600 });
  await fs.rename(temp, file);
}

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(asRecord(value))) if (typeof item === 'string') out[key] = item;
  return out;
}

function refused(request: ActionRequest, title: string, reason: string, manual?: string): Op {
  return { step: { request, ok: false, title, detail: '', warnings: [], reason, manual } };
}

function appOf(snapshot: HarnessSnapshot, id: string): AppInfo | undefined {
  return snapshot.slices.apps.items.find((app) => app.id === id && app.detected);
}

function portableSkill(skill: SkillItem): boolean {
  return skill.scope === 'user' && (skill.origin.kind === 'user' || skill.origin.kind === 'shared');
}

/** Other apps that read the same folder, so a change there shows up for them too. */
function readersOf(ctx: CollectContext, dir: string, except: string): string[] {
  return APP_DEFS.filter((def) => def.id !== except && def.skillDirs.some((entry) => expand(ctx, entry.path) === dir)).map((def) => def.id);
}

function names(snapshot: HarnessSnapshot, ids: string[]): string {
  return ids.map((id) => snapshot.slices.apps.items.find((app) => app.id === id)?.name ?? id).join(', ');
}

// ---------------------------------------------------------------------------------------------
// Skills

async function planSkillConnect(request: Extract<ActionRequest, { type: 'skill.connect' }>, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  const skill = snapshot.slices.skills.items.find((item) => item.id === request.skillId);
  const app = appOf(snapshot, request.app);
  const title = `Add ${skill?.name ?? 'skill'} to ${app?.name ?? request.app}`;
  if (!skill || !app) return refused(request, title, 'That skill or app is no longer there. Rescan and try again.');
  if (!portableSkill(skill)) return refused(request, title, 'This skill came with a plugin, an app or the current project, so it is not copied between apps.');
  if (!app.userSkillDir) return refused(request, title, `${app.name} has no skills folder on this computer.`);
  if (snapshot.slices.skills.items.some((item) => item.app === app.id && item.key === skill.key)) return refused(request, title, `${app.name} already has this skill.`);

  const source = await realpathOr(undisplay(env.ctx, skill.path));
  const dir = expand(env.ctx, app.userSkillDir);
  const dest = path.join(dir, path.basename(skill.path));
  if (await lstatOrNull(dest)) return refused(request, title, `${display(env.ctx, dest)} already exists.`);

  const detected = new Set(snapshot.slices.apps.items.filter((item) => item.detected).map((item) => item.id));
  const alsoSeenBy = readersOf(env.ctx, dir, app.id).filter((id) => detected.has(id) && !snapshot.slices.skills.items.some((item) => item.app === id && item.key === skill.key));
  return {
    step: {
      request,
      ok: true,
      title,
      detail: `Creates a link at ${display(env.ctx, dest)} that points to ${display(env.ctx, source)}. One copy, so an edit shows up everywhere.`,
      warnings: alsoSeenBy.length > 0 ? [`${names(snapshot, alsoSeenBy)} also read${alsoSeenBy.length === 1 ? 's' : ''} that folder, so the skill appears there too.`] : [],
    },
    exec: async () => {
      await fs.mkdir(dir, { recursive: true });
      await fs.symlink(source, dest, 'dir');
      return `Linked into ${display(env.ctx, dir)}.`;
    },
  };
}

/** Copy a skill into a project, for one app. A copy, not a link: a project has to carry its own files. */
async function planSkillProjectAdd(request: Extract<ActionRequest, { type: 'skill.project.add' }>, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  const skill = snapshot.slices.skills.items.find((item) => item.id === request.skillId);
  const app = appOf(snapshot, request.app);
  // The project must be one the scan found. A request can never name a folder of its own.
  const project = snapshot.slices.skills.projects.find((item) => item.id === request.project);
  const title = `Add ${skill?.name ?? 'skill'} to ${project?.name ?? 'project'} for ${app?.name ?? request.app}`;
  if (!skill || !app || !project) return refused(request, title, 'That skill, app or project is no longer there. Rescan and try again.');
  if (skill.origin.kind === 'plugin' || skill.origin.kind === 'builtin') return refused(request, title, 'This skill came with a plugin or an app, so it is not copied into projects.');
  if (!app.projectSkillDir) return refused(request, title, `${app.name} does not read skills from a project folder.`);

  const root = undisplay(env.ctx, project.id);
  const dir = path.join(root, app.projectSkillDir.slice(2));
  const dest = path.join(dir, path.basename(skill.path));
  const shownDir = display(env.ctx, dir);
  if (snapshot.slices.skills.items.some((item) => item.app === app.id && item.key === skill.key && item.path.startsWith(`${shownDir}/`))) {
    return refused(request, title, `${project.name} already has this skill for ${app.name}.`);
  }
  if (await lstatOrNull(dest)) return refused(request, title, `${display(env.ctx, dest)} already exists.`);
  if (!(await lstatOrNull(root))) return refused(request, title, `${project.id} is no longer there.`);

  const source = await realpathOr(undisplay(env.ctx, skill.path));
  const detected = new Set(snapshot.slices.apps.items.filter((item) => item.detected).map((item) => item.id));
  const alsoSeenBy = APP_DEFS.filter((def) => def.id !== app.id && detected.has(def.id) && def.skillDirs.some((entry) => entry.path === app.projectSkillDir)).map((def) => def.id);
  const warnings = [`This adds files to the project ${project.name}. If it is a git repository, the new folder shows up as a change to commit.`];
  if (alsoSeenBy.length > 0) warnings.push(`${names(snapshot, alsoSeenBy)} also read${alsoSeenBy.length === 1 ? 's' : ''} that folder, so the skill appears there too.`);
  return {
    step: { request, ok: true, title, detail: `Copies ${skill.path} to ${display(env.ctx, dest)}. The project gets its own copy, so it works for anyone who opens it.`, warnings },
    exec: async () => {
      await fs.mkdir(dir, { recursive: true });
      await fs.cp(source, dest, { recursive: true, dereference: true, errorOnExist: true });
      return `Copied into ${shownDir}.`;
    },
  };
}

/** Take a skill out of a project. The folder is moved to the backup directory, never deleted. */
async function planProjectSkillRemove(request: ActionRequest, skill: SkillItem, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  const project = skill.project ?? 'the project';
  const title = `Remove ${skill.name} from ${project}`;
  const target = undisplay(env.ctx, skill.path);
  const stat = await lstatOrNull(target);
  if (!stat) return refused(request, title, `${skill.path} is no longer there.`);
  const others = [...new Set(snapshot.slices.skills.items.filter((item) => item.path === skill.path && item.app !== skill.app).map((item) => item.app))];
  const warnings = [`This removes files from the project ${project}. If it is a git repository, the removal shows up as a change to commit.`];
  if (others.length > 0) warnings.push(`${names(snapshot, others)} read${others.length === 1 ? 's' : ''} the same folder and will lose the skill in this project too.`);
  const backupDir = path.join(env.backupRoot, stamp(new Date()), 'skills', 'projects', project.replace(/[^\w.-]+/g, '_'));
  return {
    step: {
      request,
      ok: true,
      title,
      detail: stat.isSymbolicLink()
        ? `Removes the link ${skill.path}; the skill's files stay where they are.`
        : `Moves the folder ${skill.path} to ${display(env.ctx, path.join(env.backupRoot, '…', 'skills', 'projects'))}. Nothing is deleted; move it back to restore it.`,
      warnings,
    },
    exec: async () => {
      if (stat.isSymbolicLink()) {
        await fs.unlink(target);
        return 'Link removed.';
      }
      await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
      const backupPath = path.join(backupDir, path.basename(target));
      await fs.rename(target, backupPath);
      return `Moved to ${display(env.ctx, backupPath)}.`;
    },
  };
}

async function planSkillDisconnect(request: Extract<ActionRequest, { type: 'skill.disconnect' }>, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  const skill = snapshot.slices.skills.items.find((item) => item.id === request.skillId);
  const app = skill ? appOf(snapshot, skill.app) : undefined;
  const title = `Remove ${skill?.name ?? 'skill'} from ${app?.name ?? 'app'}`;
  if (!skill || !app) return refused(request, title, 'That skill is no longer there. Rescan and try again.');
  if (skill.scope === 'project' && skill.origin.kind === 'project') return planProjectSkillRemove(request, skill, snapshot, env);
  if (!portableSkill(skill)) return refused(request, title, 'This skill came with a plugin, an app or the current project. Turn off the plugin or edit the project instead.');

  // An app can see one skill through several folders, some of which belong to other apps
  // (Cursor reads Claude Code's and Codex's folders). Only the app's own folders are touched.
  const everyone = snapshot.slices.skills.items.filter((item) => item.key === skill.key && portableSkill(item));
  const mine = everyone.filter((item) => item.app === app.id);
  const ownDir = app.userSkillDir ? expand(env.ctx, app.userSkillDir) : undefined;
  const owns = (item: SkillItem) => item.origin.kind === 'user' || path.dirname(undisplay(env.ctx, item.path)) === ownDir;
  const removable = mine.filter(owns);
  const borrowed = mine.filter((item) => !owns(item));
  if (removable.length === 0) {
    const folders = [...new Set(borrowed.map((item) => path.dirname(item.path)))].join(' and ');
    return refused(request, title, `${app.name} reads this skill straight from ${folders}, which belong${borrowed.length === 1 ? 's' : ''} to other apps. Remove it from those apps to remove it here.`);
  }

  const targets: { shown: string; target: string; link: boolean; real: string }[] = [];
  for (const item of removable) {
    const target = undisplay(env.ctx, item.path);
    const stat = await lstatOrNull(target);
    if (stat) targets.push({ shown: item.path, target, link: stat.isSymbolicLink(), real: await realpathOr(target) });
  }
  if (targets.length === 0) return refused(request, title, `${skill.path} is no longer there.`);

  // Another app loses the skill only if every folder it sees it through is going away
  // (the same folder, or a link into a real folder that is being moved).
  const goingPaths = new Set(targets.map((entry) => entry.shown));
  const goingReal = new Set(targets.filter((entry) => !entry.link).map((entry) => entry.real));
  const alsoLost: string[] = [];
  for (const other of new Set(everyone.filter((item) => item.app !== app.id).map((item) => item.app))) {
    let survives = false;
    for (const item of everyone.filter((entry) => entry.app === other)) {
      if (goingPaths.has(item.path)) continue;
      if (goingReal.has(await realpathOr(undisplay(env.ctx, item.path)))) continue;
      survives = true;
    }
    if (!survives) alsoLost.push(other);
  }
  const warnings: string[] = [];
  if (alsoLost.length > 0) warnings.push(`${names(snapshot, alsoLost)} use${alsoLost.length === 1 ? 's' : ''} the same folder and will lose the skill too.`);
  if (borrowed.length > 0) {
    warnings.push(`${app.name} will still see it through ${[...new Set(borrowed.map((item) => path.dirname(item.path)))].join(' and ')}, which belong${borrowed.length === 1 ? 's' : ''} to another app.`);
  }

  const backupDir = path.join(env.backupRoot, stamp(new Date()), 'skills', app.id);
  const describe = (entry: (typeof targets)[number]) =>
    entry.link
      ? `Removes the link ${entry.shown}; the skill's files stay where they are.`
      : `Moves the folder ${entry.shown} to ${display(env.ctx, path.join(env.backupRoot, '…', 'skills', app.id))}. Nothing is deleted; move it back to restore it.`;
  return {
    step: { request, ok: true, title, detail: targets.map(describe).join(' '), warnings },
    exec: async () => {
      const done: string[] = [];
      for (const entry of targets) {
        if (entry.link) {
          await fs.unlink(entry.target);
          done.push('Link removed.');
        } else {
          await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
          const backupPath = path.join(backupDir, path.basename(entry.target));
          await fs.rename(entry.target, backupPath);
          done.push(`Moved to ${display(env.ctx, backupPath)}.`);
        }
      }
      return done.join(' ');
    },
  };
}

// ---------------------------------------------------------------------------------------------
// MCP servers

const SERVER_KEYS = ['mcpServers', 'servers', 'mcp_servers', 'mcp', 'context_servers'];

async function readConfigRoot(file: string): Promise<Record<string, unknown> | undefined> {
  const text = await readText(file);
  if (text === undefined) return undefined;
  try {
    return file.endsWith('.toml') ? asRecord(parseToml(text)) : asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** Read a server's real definition, credentials included, from the file that declares it. */
async function readRawServer(ctx: CollectContext, server: McpServer): Promise<RawServer | undefined> {
  const root = await readConfigRoot(undisplay(ctx, server.source));
  if (!root) return undefined;
  const maps = [...SERVER_KEYS.map((key) => root[key]), asRecord(asRecord(root.projects)[ctx.projectRoot]).mcpServers, root];
  let record: Record<string, unknown> | undefined;
  for (const map of maps) {
    const candidate = asRecord(map)[server.name];
    if (candidate && typeof candidate === 'object') {
      record = asRecord(candidate);
      break;
    }
  }
  if (!record) return undefined;

  let command: string | undefined;
  let args: string[] = [];
  let env: unknown = record.env ?? record.environment;
  if (typeof record.command === 'string') {
    command = record.command;
    args = asStringArray(record.args);
  } else if (Array.isArray(record.command)) {
    const argv = asStringArray(record.command);
    command = argv[0];
    args = argv.slice(1);
  } else if (record.command && typeof record.command === 'object') {
    const nested = asRecord(record.command);
    command = asString(nested.path);
    args = asStringArray(nested.args);
    env = env ?? nested.env;
  }
  return {
    command,
    args,
    env: stringMap(env),
    url: asString(record.url) ?? asString(record.httpUrl) ?? asString(record.serverUrl),
    headers: stringMap(record.headers ?? record.http_headers),
    bearerEnvVar: asString(record.bearer_token_env_var),
  };
}

function withoutCredentials(raw: RawServer): RawServer {
  let url = raw.url;
  if (url) {
    try {
      const parsed = new URL(url);
      url = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      /* keep as is */
    }
  }
  return { ...raw, url, env: {}, headers: {} };
}

function hasCredentials(raw: RawServer): boolean {
  if (Object.keys(raw.env).length > 0 || Object.keys(raw.headers).length > 0) return true;
  if (!raw.url) return false;
  try {
    const parsed = new URL(raw.url);
    return parsed.search !== '' || parsed.username !== '';
  } catch {
    return false;
  }
}

/** The entry in the shape the target app's config file expects. */
function jsonEntry(appId: string, raw: RawServer): Record<string, unknown> {
  const headers = Object.keys(raw.headers).length > 0 ? raw.headers : undefined;
  const env = Object.keys(raw.env).length > 0 ? raw.env : undefined;
  if (appId === 'opencode') {
    return raw.url
      ? { type: 'remote', url: raw.url, ...(headers ? { headers } : {}) }
      : { type: 'local', command: [raw.command, ...raw.args], ...(env ? { environment: env } : {}) };
  }
  if (raw.url) return { ...(appId === 'vscode' || appId === 'claude-code' ? { type: 'http' } : {}), url: raw.url, ...(headers ? { headers } : {}) };
  return { ...(appId === 'vscode' || appId === 'claude-code' ? { type: 'stdio' } : {}), command: raw.command, args: raw.args, ...(env ? { env } : {}) };
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function tomlInline(map: Record<string, string>): string {
  return `{ ${Object.entries(map)
    .map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)}`)
    .join(', ')} }`;
}

function tomlBlock(name: string, raw: RawServer): string {
  const lines = [`[mcp_servers.${tomlKey(name)}]`];
  if (raw.url) {
    lines.push(`url = ${JSON.stringify(raw.url)}`);
    if (raw.bearerEnvVar) lines.push(`bearer_token_env_var = ${JSON.stringify(raw.bearerEnvVar)}`);
    if (Object.keys(raw.headers).length > 0) lines.push(`http_headers = ${tomlInline(raw.headers)}`);
  } else {
    lines.push(`command = ${JSON.stringify(raw.command ?? '')}`);
    lines.push(`args = [${raw.args.map((arg) => JSON.stringify(arg)).join(', ')}]`);
    if (Object.keys(raw.env).length > 0) lines.push(`env = ${tomlInline(raw.env)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Plan adding `raw` as server `name` to `app`. Shared by "connect from another app" and "install from the registry". */
async function planMcpWrite(request: ActionRequest, title: string, app: AppInfo, name: string, raw: RawServer, snapshot: HarnessSnapshot, env: ActionEnv, manual?: string): Promise<Op> {
  const style = app.mcpAdd;
  if (!style) return refused(request, title, `${app.name} has no local MCP config this dashboard can write.`);
  if (snapshot.slices.mcp.servers.some((server) => server.app === app.id && server.name === name)) return refused(request, title, `${app.name} already has a server called "${name}".`);
  if (!raw.url && !raw.command) return refused(request, title, 'The server has no address or command to copy.');
  const warnings = [`${app.name} picks up the change the next time it starts.`];
  if (raw.bearerEnvVar && app.id !== 'codex') warnings.push(`The source reads its token from the ${raw.bearerEnvVar} variable. Add your own Authorization header in ${app.name} afterwards.`);

  if (style.kind === 'cli' && style.tool === 'claude') {
    if (!SAFE_NAME.test(name)) return refused(request, title, `"${name}" is not a name the claude command line accepts safely.`, manual);
    return {
      step: { request, ok: true, title, detail: `Runs "claude mcp add-json --scope user ${name} …", which adds it to ~/.claude.json for every project.`, warnings },
      exec: async () => {
        const result = await env.run('claude', ['mcp', 'add-json', '--scope', 'user', name, JSON.stringify(jsonEntry('claude-code', raw))]);
        if (!result.ok) throw new Error(result.output);
        return 'Added with the claude CLI.';
      },
    };
  }

  if (style.kind === 'cli' && style.tool === 'codex') {
    const file = expand(env.ctx, '~/.codex/config.toml');
    const current = (await readText(file)) ?? '';
    const block = tomlBlock(name, raw);
    const next = `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}\n${block}`;
    try {
      parseToml(next);
    } catch {
      return refused(request, title, '~/.codex/config.toml could not be extended safely.', manual);
    }
    return {
      step: { request, ok: true, title, detail: `Appends a [mcp_servers.${name}] section to ~/.codex/config.toml. The rest of the file is left untouched; a backup is kept.`, warnings },
      exec: async () => {
        await backupFile(env, file);
        await writeAtomic(file, next);
        return 'Added to ~/.codex/config.toml.';
      },
    };
  }

  if (style.kind !== 'json') return refused(request, title, `${app.name} cannot be written automatically.`, manual);
  if (app.id === 'claude-desktop' && raw.url) {
    return refused(request, title, 'The Claude desktop config file only takes servers it starts itself. Add a remote server in the app under Settings, Connectors.');
  }
  const file = undisplay(env.ctx, style.file);
  const text = await readText(file);
  let root: Record<string, unknown> = {};
  if (text !== undefined && text.trim() !== '') {
    try {
      root = asRecord(JSON.parse(text));
    } catch {
      // Comments or trailing commas: rewriting would destroy them, so leave the file to the user.
      return refused(request, title, `${style.file} has comments or is not plain JSON, so it is not rewritten automatically.`, manual);
    }
  }
  return {
    step: { request, ok: true, title, detail: `Adds "${name}" under "${style.key}" in ${style.file}. A backup of the file is kept.`, warnings },
    exec: async () => {
      await backupFile(env, file);
      const map = { ...asRecord(root[style.key]), [name]: jsonEntry(app.id, raw) };
      await writeAtomic(file, `${JSON.stringify({ ...root, [style.key]: map }, null, 2)}\n`);
      return `Added to ${style.file}.`;
    },
  };
}

async function planMcpConnect(request: Extract<ActionRequest, { type: 'mcp.connect' }>, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  const server = snapshot.slices.mcp.servers.find((item) => item.id === request.serverId);
  const app = appOf(snapshot, request.app);
  const title = `Connect ${server?.name ?? 'server'} to ${app?.name ?? request.app}`;
  if (!server || !app) return refused(request, title, 'That server or app is no longer there. Rescan and try again.');
  if (!portableServer(server)) return refused(request, title, 'This server runs from inside one app, so it cannot be connected to another.');
  if (snapshot.slices.mcp.servers.some((item) => item.app === app.id && item.key === server.key)) return refused(request, title, `${app.name} already has this server.`);
  const full = await readRawServer(env.ctx, server);
  if (!full) return refused(request, title, `Could not read the server's definition from ${server.source}.`, mcpAddCommand(server, app));
  const copy = request.copyCredentials !== false;
  const op = await planMcpWrite(request, title, app, server.name, copy ? full : withoutCredentials(full), snapshot, env, mcpAddCommand(server, app));
  if (op.step.ok && hasCredentials(full)) {
    op.step.warnings.unshift(
      copy
        ? `Its credentials are copied from ${server.source} into ${app.name}'s config on this computer. They are not shown or sent anywhere.`
        : `Credentials are left out, so ${app.name} will ask you to sign in or you add them yourself.`,
    );
  }
  return op;
}

async function planMcpDisconnect(request: Extract<ActionRequest, { type: 'mcp.disconnect' }>, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  const server = snapshot.slices.mcp.servers.find((item) => item.id === request.serverId);
  const app = server ? appOf(snapshot, server.app) : undefined;
  const title = `Disconnect ${server?.name ?? 'server'} from ${app?.name ?? 'app'}`;
  if (!server || !app) return refused(request, title, 'That server is no longer there. Rescan and try again.');
  if (server.origin.kind === 'plugin') return refused(request, title, `It comes with the ${server.origin.name} plugin. Turn the plugin off in ${app.name} to remove it.`);
  if (server.scope !== 'user') return refused(request, title, `It is declared for this project in ${server.source}. Edit that file to remove it for everyone working on the project.`);
  const warnings = [`${app.name} drops it the next time it starts. Connect it again from the map to undo this.`];

  if ((app.id === 'claude-code' || app.id === 'codex') && !SAFE_NAME.test(server.name)) {
    return refused(request, title, `"${server.name}" is not a name the command line accepts safely. Remove it from ${server.source} by hand.`);
  }
  if (app.id === 'claude-code') {
    return {
      step: { request, ok: true, title, detail: `Runs "claude mcp remove ${server.name} --scope user".`, warnings },
      exec: async () => {
        const result = await env.run('claude', ['mcp', 'remove', server.name, '--scope', 'user']);
        if (!result.ok) throw new Error(result.output);
        return 'Removed with the claude CLI.';
      },
    };
  }
  if (app.id === 'codex') {
    return {
      step: { request, ok: true, title, detail: `Runs "codex mcp remove ${server.name}".`, warnings },
      exec: async () => {
        await backupFile(env, expand(env.ctx, '~/.codex/config.toml'));
        const result = await env.run('codex', ['mcp', 'remove', server.name]);
        if (!result.ok) throw new Error(result.output);
        return 'Removed with the codex CLI.';
      },
    };
  }

  const file = undisplay(env.ctx, server.source);
  const text = await readText(file);
  let root: Record<string, unknown>;
  try {
    root = asRecord(JSON.parse(text ?? ''));
  } catch {
    return refused(request, title, `${server.source} has comments or is not plain JSON, so it is not rewritten automatically. Remove the "${server.name}" entry by hand.`);
  }
  const key = SERVER_KEYS.find((candidate) => server.name in asRecord(root[candidate]));
  if (!key) return refused(request, title, `"${server.name}" was not found in ${server.source}.`);
  return {
    step: { request, ok: true, title, detail: `Removes "${server.name}" from "${key}" in ${server.source}. A backup of the file is kept.`, warnings },
    exec: async () => {
      await backupFile(env, file);
      const map = { ...asRecord(root[key]) };
      delete map[server.name];
      await writeAtomic(file, `${JSON.stringify({ ...root, [key]: map }, null, 2)}\n`);
      return `Removed from ${server.source}.`;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Installing from a registry

/** Agent ids the `skills` CLI uses (github.com/vercel-labs/skills, docs/agents.md, checked 2026-11-14). */
const SKILLS_CLI_AGENT: Record<string, string> = {
  'claude-code': 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  antigravity: 'antigravity',
  'gemini-cli': 'gemini-cli',
  opencode: 'opencode',
  pi: 'pi',
  windsurf: 'windsurf',
  vscode: 'github-copilot',
  zed: 'zed',
};

export function skillInstallTargets(snapshot: HarnessSnapshot): string[] {
  return snapshot.slices.apps.items.filter((app) => app.detected && SKILLS_CLI_AGENT[app.id]).map((app) => app.id);
}

function planRegistrySkill(request: Extract<ActionRequest, { type: 'registry.skill' }>, snapshot: HarnessSnapshot): Op {
  const app = appOf(snapshot, request.app);
  const title = `Install ${request.skill} for ${app?.name ?? request.app}`;
  if (!SAFE_REPO.test(request.source) || !SAFE_NAME.test(request.skill)) return refused(request, title, 'The registry entry has an unexpected name, so it is not installed automatically.');
  const agent = app ? SKILLS_CLI_AGENT[app.id] : undefined;
  if (!app || !agent) return refused(request, title, 'The skills installer does not know this app.');
  return {
    step: {
      request,
      ok: true,
      title,
      detail: `Runs "npx skills add ${request.source} --skill ${request.skill} -g -a ${agent} -y", which downloads the skill from github.com/${request.source} into ${app.name}'s skills folder.`,
      warnings: ['This is third-party content nobody here has reviewed. A skill can tell your AI app to do anything you can do. Read the source first.'],
    },
    batch: { key: `${request.source}#${request.skill}`, source: request.source, skill: request.skill, agent },
  };
}

async function planRegistryMcp(request: Extract<ActionRequest, { type: 'registry.mcp' }>, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  const app = appOf(snapshot, request.app);
  const title = `Connect ${request.name} to ${app?.name ?? request.app}`;
  if (!app) return refused(request, title, 'That app is no longer there. Rescan and try again.');
  if (!SAFE_NAME.test(request.name)) return refused(request, title, 'The registry entry has an unexpected name, so it is not added automatically.');
  let raw: RawServer | undefined;
  if (request.url && /^https:\/\/[A-Za-z0-9._~:/?#@%+=-]+$/.test(request.url)) {
    raw = { url: request.url, args: [], env: {}, headers: {} };
  } else if (request.identifier && /^[@\w./-]+$/.test(request.identifier) && !request.identifier.startsWith('-')) {
    if (request.registryType === 'npm') raw = { command: 'npx', args: ['-y', request.identifier], env: {}, headers: {} };
    if (request.registryType === 'pypi') raw = { command: 'uvx', args: [request.identifier], env: {}, headers: {} };
  }
  if (!raw) return refused(request, title, 'The registry does not publish an address or package this dashboard can add on its own. Follow the source page.');
  const op = await planMcpWrite(request, title, app, request.name, raw, snapshot, env);
  if (op.step.ok) {
    op.step.warnings.unshift(
      raw.url
        ? `This is a third-party service nobody here has reviewed. Once connected, ${app.name} can send it whatever a task involves.`
        : `This is a third-party package nobody here has reviewed. ${app.name} will download and run it on this computer.`,
    );
  }
  return op;
}

// ---------------------------------------------------------------------------------------------
// Plan and apply

/** The app a request is about, so the confirmation can show its logo. */
function appFor(request: ActionRequest, snapshot: HarnessSnapshot): string | undefined {
  if ('app' in request) return request.app;
  if (request.type === 'skill.disconnect') return snapshot.slices.skills.items.find((item) => item.id === request.skillId)?.app;
  if (request.type === 'mcp.disconnect') return snapshot.slices.mcp.servers.find((item) => item.id === request.serverId)?.app;
  return undefined;
}

async function planOne(request: ActionRequest, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  const op = await planRequest(request, snapshot, env);
  op.step.app = appFor(request, snapshot);
  return op;
}

async function planRequest(request: ActionRequest, snapshot: HarnessSnapshot, env: ActionEnv): Promise<Op> {
  switch (request.type) {
    case 'skill.connect':
      return planSkillConnect(request, snapshot, env);
    case 'skill.disconnect':
      return planSkillDisconnect(request, snapshot, env);
    case 'skill.project.add':
      return planSkillProjectAdd(request, snapshot, env);
    case 'mcp.connect':
      return planMcpConnect(request, snapshot, env);
    case 'mcp.disconnect':
      return planMcpDisconnect(request, snapshot, env);
    case 'registry.skill':
      return planRegistrySkill(request, snapshot);
    case 'registry.mcp':
      return planRegistryMcp(request, snapshot, env);
    default:
      return refused(request, 'Unknown action', 'This dashboard does not know how to do that.');
  }
}

const MAX_REQUESTS = 60;

/** Keep only well-formed requests; anything else in the body is dropped before it is looked at. */
export function parseRequests(body: unknown): ActionRequest[] {
  const list = Array.isArray(asRecord(body).requests) ? (asRecord(body).requests as unknown[]) : [];
  const out: ActionRequest[] = [];
  for (const item of list.slice(0, MAX_REQUESTS)) {
    const record = asRecord(item);
    const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string).slice(0, 400) : '');
    switch (record.type) {
      case 'skill.connect':
        out.push({ type: 'skill.connect', skillId: text('skillId'), app: text('app') });
        break;
      case 'skill.disconnect':
        out.push({ type: 'skill.disconnect', skillId: text('skillId') });
        break;
      case 'skill.project.add':
        out.push({ type: 'skill.project.add', skillId: text('skillId'), project: text('project'), app: text('app') });
        break;
      case 'mcp.connect':
        out.push({ type: 'mcp.connect', serverId: text('serverId'), app: text('app'), copyCredentials: record.copyCredentials !== false });
        break;
      case 'mcp.disconnect':
        out.push({ type: 'mcp.disconnect', serverId: text('serverId') });
        break;
      case 'registry.skill':
        out.push({ type: 'registry.skill', source: text('source'), skill: text('skill'), app: text('app') });
        break;
      case 'registry.mcp':
        out.push({
          type: 'registry.mcp',
          name: text('name'),
          app: text('app'),
          url: text('url') || undefined,
          identifier: text('identifier') || undefined,
          registryType: record.registryType === 'npm' || record.registryType === 'pypi' ? record.registryType : undefined,
        });
        break;
      default:
        break;
    }
  }
  return out;
}

export async function planActions(requests: ActionRequest[], snapshot: HarnessSnapshot, env: ActionEnv): Promise<PlannedStep[]> {
  const ops: Op[] = [];
  for (const request of requests) ops.push(await planOne(request, snapshot, env));
  return ops.map((op) => op.step);
}

export async function applyActions(requests: ActionRequest[], snapshot: HarnessSnapshot, env: ActionEnv): Promise<StepResult[]> {
  // Plan again on the server at the moment of applying: what the browser saw may be out of date.
  const ops: Op[] = [];
  for (const request of requests) ops.push(await planOne(request, snapshot, env));

  // One `skills add` per skill, naming every chosen app, instead of one download per app.
  const batchOutcome = new Map<string, { ok: boolean; message: string }>();
  const batches = new Map<string, { source: string; skill: string; agents: string[] }>();
  for (const op of ops) {
    if (!op.step.ok || !op.batch) continue;
    const batch = batches.get(op.batch.key) ?? { source: op.batch.source, skill: op.batch.skill, agents: [] };
    if (!batch.agents.includes(op.batch.agent)) batch.agents.push(op.batch.agent);
    batches.set(op.batch.key, batch);
  }
  for (const [key, batch] of batches) {
    const args = ['--yes', 'skills', 'add', batch.source, '--skill', batch.skill, '-g', '-y', ...batch.agents.flatMap((agent) => ['-a', agent])];
    const result = await env.run('npx', args, 180_000);
    batchOutcome.set(key, { ok: result.ok, message: result.ok ? 'Installed with the skills CLI.' : `${result.output} Nothing was installed.` });
  }

  const results: StepResult[] = [];
  for (const op of ops) {
    if (!op.step.ok) {
      results.push({ title: op.step.title, ok: false, message: op.step.reason ?? 'Not possible.' });
      continue;
    }
    if (op.batch) {
      const outcome = batchOutcome.get(op.batch.key) ?? { ok: false, message: 'Not run.' };
      results.push({ title: op.step.title, ...outcome });
      continue;
    }
    try {
      results.push({ title: op.step.title, ok: true, message: op.exec ? await op.exec() : 'Done.' });
    } catch (error) {
      results.push({ title: op.step.title, ok: false, message: error instanceof Error ? error.message : 'It failed.' });
    }
  }
  return results;
}
