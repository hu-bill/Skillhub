// Spine: one pass over every known app that finds its skills, MCP servers and plugins.
// The apps / skills / mcp / packages collectors each publish their own slice of this result,
// so the disk is scanned once per snapshot, not once per slice.

import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type {
  AppInfo,
  ProjectInfo,
  McpServer,
  McpTransport,
  Origin,
  PackageItem,
  Scope,
  SkillItem,
} from '../../shared/schema.ts';
import { namesOnly, redactCommand, redactUrl } from '../redact.ts';
import { tagsFor } from '../../shared/tags.ts';
import { APP_DEFS, type AppDef } from './apps.ts';
import { findAppIcon } from './icons.ts';
import {
  asRecord,
  asString,
  asStringArray,
  display,
  exists,
  expand,
  hash,
  isDirectory,
  listDir,
  readJson,
  readText,
  type CollectContext,
} from './context.ts';

export interface Inventory {
  apps: AppInfo[];
  skills: SkillItem[];
  servers: McpServer[];
  packages: PackageItem[];
  projects: ProjectInfo[];
  warnings: string[];
}

const memo = new WeakMap<CollectContext, Promise<Inventory>>();

export function getInventory(ctx: CollectContext): Promise<Inventory> {
  let pending = memo.get(ctx);
  if (!pending) {
    pending = buildInventory(ctx);
    memo.set(ctx, pending);
  }
  return pending;
}

// ---------------------------------------------------------------------------------------------
// Skills

/** Minimal YAML front matter reader: top-level `key: value`, quoted values and folded blocks. */
export function parseFrontmatter(text: string): Record<string, string> {
  const normalized = text.replace(/^﻿/, '');
  if (!normalized.startsWith('---')) return {};
  const end = normalized.indexOf('\n---', 3);
  if (end < 0) return {};
  const out: Record<string, string> = {};
  let key: string | undefined;
  for (const line of normalized.slice(3, end).split(/\r?\n/)) {
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (top) {
      key = top[1];
      const value = top[2].trim();
      out[key] = /^[>|][+-]?$/.test(value) ? '' : unquote(value);
      continue;
    }
    if (key && /^\s+\S/.test(line)) {
      out[key] = out[key] ? `${out[key]} ${line.trim()}` : line.trim();
    }
  }
  return out;
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

interface FoundSkill {
  dir: string;
  file: string;
  /** True when the skill sits under a dot-directory such as `.system`, i.e. shipped by the app. */
  system: boolean;
}

async function findSkills(root: string, maxDepth = 3): Promise<FoundSkill[]> {
  const found: FoundSkill[] = [];
  async function walk(dir: string, depth: number, system: boolean): Promise<void> {
    for (const entry of await listDir(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const child = path.join(dir, entry);
      if (!(await isDirectory(child))) continue;
      const file = path.join(child, 'SKILL.md');
      const childSystem = system || entry.startsWith('.');
      if (await exists(file)) {
        found.push({ dir: child, file, system: childSystem });
      } else if (depth < maxDepth) {
        await walk(child, depth + 1, childSystem);
      }
    }
  }
  await walk(root, 1, false);
  return found;
}

async function readSkill(
  ctx: CollectContext,
  found: FoundSkill,
  app: string,
  scope: Scope,
  origin: Origin,
  namePrefix = '',
): Promise<SkillItem | undefined> {
  const text = await readText(found.file);
  if (text === undefined) return undefined;
  const meta = parseFrontmatter(text);
  const baseName = meta.name?.trim() || path.basename(found.dir);
  const name = namePrefix ? `${namePrefix}:${baseName}` : baseName;
  const description = (meta.description ?? '').trim();
  const shown = display(ctx, found.dir);
  return {
    id: `${app}:${shown}`,
    key: hash(`${baseName}\n${description}`),
    name,
    description,
    app,
    scope,
    origin,
    path: shown,
    tags: tagsFor(baseName, description),
    modelInvocable: meta['disable-model-invocation']?.toLowerCase() !== 'true',
    descriptionChars: description.length,
    estTokens: Math.ceil((name.length + description.length) / 4),
  };
}

async function scanSkillDir(
  ctx: CollectContext,
  dir: string,
  app: string,
  scope: Scope,
  origin: Origin,
  namePrefix = '',
): Promise<SkillItem[]> {
  const items: SkillItem[] = [];
  for (const found of await findSkills(dir)) {
    const effective: Origin = found.system && origin.kind !== 'plugin' ? { kind: 'builtin' } : origin;
    const item = await readSkill(ctx, found, app, found.system ? 'builtin' : scope, effective, namePrefix);
    if (item) items.push(item);
  }
  return items;
}

// ---------------------------------------------------------------------------------------------
// MCP servers

const RUNNERS = new Set(['npx', 'bunx', 'pnpx', 'uvx', 'uv', 'pipx', 'pnpm', 'yarn', 'bun', 'deno', 'node', 'python', 'python3', 'docker']);

/** The part of a launch command that identifies the server, ignoring flags and machine paths. */
function commandIdentity(command: string, args: string[]): string {
  const base = path.basename(command);
  if (RUNNERS.has(base)) {
    const skip = new Set(['run', 'dlx', 'x', 'tool', 'exec']);
    const target = args.find((arg) => !arg.startsWith('-') && !skip.has(arg));
    if (target) return `${base} ${path.isAbsolute(target) ? path.basename(target) : target}`;
  }
  return base;
}

export function normalizeServer(
  ctx: CollectContext,
  name: string,
  raw: unknown,
  app: string,
  scope: Scope,
  origin: Origin,
  sourceFile: string,
): McpServer {
  const record = asRecord(raw);
  let command: string | undefined;
  let args: string[] = [];
  let env: unknown = record.env ?? record.environment;

  if (typeof record.command === 'string') {
    command = record.command;
    args = asStringArray(record.args);
  } else if (Array.isArray(record.command)) {
    // opencode: `command` is the whole argv.
    const argv = asStringArray(record.command);
    command = argv[0];
    args = argv.slice(1);
  } else if (record.command && typeof record.command === 'object') {
    // Zed: `command` is `{ path, args, env }`.
    const nested = asRecord(record.command);
    command = asString(nested.path);
    args = asStringArray(nested.args);
    env = env ?? nested.env;
  }

  const rawUrl = asString(record.url) ?? asString(record.httpUrl) ?? asString(record.serverUrl);
  const declared = (asString(record.type) ?? asString(record.transport) ?? '').toLowerCase();
  let transport: McpTransport = 'unknown';
  if (rawUrl) transport = declared.includes('sse') ? 'sse' : 'http';
  else if (command) transport = 'stdio';

  const envNames = new Set<string>([...namesOnly(env), ...asStringArray(record.env_vars)]);
  const bearer = asString(record.bearer_token_env_var);
  if (bearer) envNames.add(bearer);

  let key = `name:${name.toLowerCase()}`;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      key = `url:${url.host}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      /* keep the name-based key */
    }
  } else if (command) {
    key = `cmd:${commandIdentity(command, args)}`.toLowerCase();
  }

  const source = display(ctx, sourceFile);
  return {
    id: `${app}:${scope}:${name}:${source}`,
    key,
    name,
    app,
    scope,
    origin,
    transport,
    command: command ? redactCommand(path.isAbsolute(command) ? display(ctx, command) : command, args) : undefined,
    url: rawUrl ? redactUrl(rawUrl) : undefined,
    envNames: [...envNames].sort(),
    headerNames: namesOnly(record.headers ?? record.http_headers),
    enabled: record.disabled !== true && record.enabled !== false,
    source,
  };
}

type ConfigRead = { status: 'ok'; value: Record<string, unknown> } | { status: 'absent' } | { status: 'invalid'; message: string };

async function readConfig(file: string, format: 'json' | 'toml'): Promise<ConfigRead> {
  if (format === 'toml') {
    const text = await readText(file);
    if (text === undefined || text.trim() === '') return { status: 'absent' };
    try {
      return { status: 'ok', value: asRecord(parseToml(text)) };
    } catch (error) {
      return { status: 'invalid', message: error instanceof Error ? error.message.split('\n')[0] : String(error) };
    }
  }
  const read = await readJson(file);
  if (read.status === 'ok') return { status: 'ok', value: asRecord(read.value) };
  if (read.status === 'invalid') return { status: 'invalid', message: read.message };
  return { status: 'absent' };
}

function serversFromMap(
  ctx: CollectContext,
  map: unknown,
  app: string,
  scope: Scope,
  origin: Origin,
  sourceFile: string,
): McpServer[] {
  return Object.entries(asRecord(map)).map(([name, raw]) => normalizeServer(ctx, name, raw, app, scope, origin, sourceFile));
}

/** A plugin's `.mcp.json` is either `{ mcpServers: {...} }` or the bare name -> server map. */
async function pluginServers(ctx: CollectContext, dir: string, app: string, scope: Scope, plugin: string): Promise<McpServer[]> {
  const file = path.join(dir, '.mcp.json');
  const read = await readJson(file);
  if (read.status !== 'ok') return [];
  const root = asRecord(read.value);
  const map = root.mcpServers && typeof root.mcpServers === 'object' ? root.mcpServers : root;
  return serversFromMap(ctx, map, app, scope, { kind: 'plugin', name: plugin }, file);
}

// ---------------------------------------------------------------------------------------------
// Plugins, per app

interface PluginScan {
  packages: PackageItem[];
  skills: SkillItem[];
  servers: McpServer[];
}

function emptyScan(): PluginScan {
  return { packages: [], skills: [], servers: [] };
}

function isoFromMillis(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : undefined;
}

async function scanClaudePlugins(ctx: CollectContext, warnings: string[]): Promise<PluginScan> {
  const scan = emptyScan();
  const installedFile = expand(ctx, '~/.claude/plugins/installed_plugins.json');
  const installed = await readJson(installedFile);
  if (installed.status === 'invalid') warnings.push(`Could not parse ${display(ctx, installedFile)}: ${installed.message}`);
  if (installed.status !== 'ok') return scan;

  // Later files override earlier ones, matching Claude Code's settings precedence.
  const enabled: Record<string, unknown> = {};
  for (const file of ['~/.claude/settings.json', './.claude/settings.json', './.claude/settings.local.json']) {
    const read = await readJson(expand(ctx, file));
    if (read.status === 'ok') Object.assign(enabled, asRecord(asRecord(read.value).enabledPlugins));
  }
  const state = await readJson(expand(ctx, '~/.claude.json'));
  const pluginUsage = state.status === 'ok' ? asRecord(asRecord(state.value).pluginUsage) : {};

  for (const [id, entries] of Object.entries(asRecord(asRecord(installed.value).plugins))) {
    const entry = asRecord(Array.isArray(entries) ? entries[entries.length - 1] : entries);
    const installPath = asString(entry.installPath);
    const [pluginId, marketplace] = id.split('@');
    const isEnabled = enabled[id] !== false;
    const manifest = installPath ? await readJson(path.join(installPath, '.claude-plugin', 'plugin.json')) : { status: 'missing' as const };
    const shortName = (manifest.status === 'ok' && asString(asRecord(manifest.value).name)) || pluginId;
    const scope: Scope = entry.scope === 'project' ? 'project' : entry.scope === 'local' ? 'local' : 'user';

    let skills: SkillItem[] = [];
    let servers: McpServer[] = [];
    if (installPath && isEnabled) {
      skills = await scanSkillDir(ctx, path.join(installPath, 'skills'), 'claude-code', scope, { kind: 'plugin', name: shortName }, shortName);
      servers = await pluginServers(ctx, installPath, 'claude-code', scope, shortName);
    }
    const usage = asRecord(pluginUsage[id]);
    scan.packages.push({
      id: `claude-code:${id}`,
      name: shortName,
      app: 'claude-code',
      scope,
      type: 'plugin',
      marketplace,
      version: asString(entry.version),
      enabled: isEnabled,
      skillCount: skills.length,
      mcpCount: servers.length,
      usageCount: typeof usage.usageCount === 'number' ? usage.usageCount : undefined,
      lastUsedAt: isoFromMillis(usage.lastUsedAt),
    });
    scan.skills.push(...skills);
    scan.servers.push(...servers);
  }
  return scan;
}

/** Newest version directory of a cached Codex plugin. */
async function latestVersionDir(dir: string): Promise<string | undefined> {
  const { promises: fs } = await import('node:fs');
  let best: { dir: string; mtime: number } | undefined;
  for (const entry of await listDir(dir)) {
    const child = path.join(dir, entry);
    try {
      const stat = await fs.stat(child);
      if (stat.isDirectory() && (!best || stat.mtimeMs > best.mtime)) best = { dir: child, mtime: stat.mtimeMs };
    } catch {
      /* unreadable entry: skip */
    }
  }
  return best?.dir;
}

async function scanCodexPlugins(ctx: CollectContext, config: Record<string, unknown>): Promise<PluginScan> {
  const scan = emptyScan();
  for (const [id, raw] of Object.entries(asRecord(config.plugins))) {
    const [name, marketplace] = id.split('@');
    const isEnabled = asRecord(raw).enabled !== false;
    const dir = marketplace ? await latestVersionDir(expand(ctx, `~/.codex/plugins/cache/${marketplace}/${name}`)) : undefined;
    let skills: SkillItem[] = [];
    let servers: McpServer[] = [];
    if (dir && isEnabled) {
      skills = await scanSkillDir(ctx, path.join(dir, 'skills'), 'codex', 'user', { kind: 'plugin', name }, name);
      servers = await pluginServers(ctx, dir, 'codex', 'user', name);
    }
    scan.packages.push({
      id: `codex:${id}`,
      name,
      app: 'codex',
      scope: 'user',
      type: 'plugin',
      marketplace,
      version: dir ? path.basename(dir) : undefined,
      enabled: isEnabled,
      skillCount: skills.length,
      mcpCount: servers.length,
    });
    scan.skills.push(...skills);
    scan.servers.push(...servers);
  }
  return scan;
}

async function scanSimplePackages(ctx: CollectContext): Promise<PackageItem[]> {
  const packages: PackageItem[] = [];

  // Antigravity: `plugins` map in its config.
  const antigravity = await readJson(expand(ctx, '~/.gemini/config/config.json'));
  if (antigravity.status === 'ok') {
    for (const [name, raw] of Object.entries(asRecord(asRecord(antigravity.value).plugins))) {
      packages.push({
        id: `antigravity:${name}`,
        name,
        app: 'antigravity',
        scope: 'user',
        type: 'plugin',
        enabled: asRecord(raw).enabled !== false,
        skillCount: 0,
        mcpCount: 0,
      });
    }
  }

  // Gemini CLI: one directory per extension.
  const extensionsDir = expand(ctx, '~/.gemini/extensions');
  for (const entry of await listDir(extensionsDir)) {
    const manifest = await readJson(path.join(extensionsDir, entry, 'gemini-extension.json'));
    if (manifest.status !== 'ok') continue;
    const record = asRecord(manifest.value);
    packages.push({
      id: `gemini-cli:${entry}`,
      name: asString(record.name) ?? entry,
      app: 'gemini-cli',
      scope: 'user',
      type: 'extension',
      version: asString(record.version),
      enabled: true,
      skillCount: 0,
      mcpCount: Object.keys(asRecord(record.mcpServers)).length,
    });
  }

  // Pi: `packages` in its settings, user then project.
  for (const [file, scope] of [
    ['~/.pi/agent/settings.json', 'user'],
    ['./.pi/settings.json', 'project'],
  ] as const) {
    const settings = await readJson(expand(ctx, file));
    if (settings.status !== 'ok') continue;
    const list = asRecord(settings.value).packages;
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const source = typeof raw === 'string' ? raw : asString(asRecord(raw).source);
      if (!source) continue;
      // A local path would leak the machine layout; keep only its last segment.
      const name = source.startsWith('/') || source.startsWith('.') || source.startsWith('~') ? path.basename(source) : source;
      packages.push({
        id: `pi:${scope}:${name}`,
        name,
        app: 'pi',
        scope,
        type: 'package',
        enabled: typeof raw === 'string' || asRecord(raw).autoload !== false,
        skillCount: 0,
        mcpCount: 0,
      });
    }
  }
  return packages;
}

// ---------------------------------------------------------------------------------------------
// Assembly

async function detect(ctx: CollectContext, def: AppDef): Promise<string[]> {
  const evidence: string[] = [];
  for (const template of def.detect) {
    const target = expand(ctx, template);
    if (await exists(target)) evidence.push(display(ctx, target));
  }
  return evidence;
}

function originFor(def: { origin: 'user' | 'project' | 'builtin' | 'shared'; path: string }): Origin {
  if (def.origin === 'shared') return { kind: 'shared', label: def.path };
  return { kind: def.origin };
}

const MAX_PROJECTS = 200;

/**
 * Other project folders the user has worked in, as remembered by the apps themselves:
 * Claude Code's `projects` map and Codex's `[projects."…"]` entries. Only folders that still exist.
 */
async function knownProjects(ctx: CollectContext): Promise<string[]> {
  const roots = new Set<string>();
  const claude = await readJson(expand(ctx, '~/.claude.json'));
  if (claude.status === 'ok') for (const key of Object.keys(asRecord(asRecord(claude.value).projects))) roots.add(key);
  const codex = await readConfig(expand(ctx, '~/.codex/config.toml'), 'toml');
  if (codex.status === 'ok') for (const key of Object.keys(asRecord(codex.value.projects))) roots.add(key);

  const out: string[] = [];
  for (const root of [...roots].sort()) {
    if (out.length >= MAX_PROJECTS) break;
    const resolved = path.resolve(root);
    // The home folder and the filesystem root are not projects, and the current one is scanned already.
    if (!path.isAbsolute(root) || resolved === path.parse(resolved).root || resolved === ctx.home || resolved === ctx.projectRoot) continue;
    if (await isDirectory(resolved)) out.push(resolved);
  }
  return out;
}

async function buildInventory(ctx: CollectContext): Promise<Inventory> {
  const warnings: string[] = [];
  const apps: AppInfo[] = [];
  const skills: SkillItem[] = [];
  const servers: McpServer[] = [];
  const packages: PackageItem[] = [];
  const otherProjects = await knownProjects(ctx);

  for (const def of APP_DEFS) {
    const evidence = await detect(ctx, def);
    const detected = evidence.length > 0;
    apps.push({
      id: def.id,
      name: def.name,
      vendor: def.vendor,
      kind: def.kind,
      detected,
      evidence,
      readable: def.readable,
      note: def.note,
      userSkillDir: def.userSkillDir,
      projectSkillDir: def.projectSkillDir,
      // Resolve path templates so the UI shows a real location such as `~/Library/Application Support/…`.
      mcpAdd: def.mcpAdd && def.mcpAdd.kind !== 'cli' ? { ...def.mcpAdd, file: display(ctx, expand(ctx, def.mcpAdd.file)) } : def.mcpAdd,
      counts: { skills: 0, mcp: 0, packages: 0 },
      hasIcon: detected ? Boolean(await findAppIcon(ctx, def)) : false,
    });
    if (!detected) continue;

    for (const dirDef of def.skillDirs) {
      const found = await scanSkillDir(ctx, expand(ctx, dirDef.path), def.id, dirDef.scope, originFor(dirDef));
      if (dirDef.path.startsWith('./')) for (const skill of found) skill.project = path.basename(ctx.projectRoot);
      skills.push(...found);
    }

    // Skills kept inside the user's other projects. They only load when the app runs in that project.
    for (const root of otherProjects) {
      for (const dirDef of def.skillDirs) {
        if (!dirDef.path.startsWith('./')) continue;
        const found = await scanSkillDir(ctx, path.join(root, dirDef.path.slice(2)), def.id, 'project', { kind: 'project' });
        for (const skill of found) skill.project = path.basename(root);
        skills.push(...found);
      }
    }

    for (const fileDef of def.mcpFiles) {
      const file = expand(ctx, fileDef.path);
      const read = await readConfig(file, fileDef.format);
      if (read.status === 'invalid') {
        warnings.push(`Could not parse ${display(ctx, file)}: ${read.message}`);
        continue;
      }
      if (read.status !== 'ok') continue;
      servers.push(...serversFromMap(ctx, read.value[fileDef.key], def.id, fileDef.scope, { kind: fileDef.scope === 'project' ? 'project' : 'user' }, file));

      if (def.id === 'claude-code' && fileDef.path === '~/.claude.json') {
        // Servers added with `claude mcp add --scope local` sit under the project's entry.
        const project = asRecord(asRecord(read.value.projects)[ctx.projectRoot]);
        servers.push(...serversFromMap(ctx, project.mcpServers, def.id, 'local', { kind: 'project' }, file));
        applySkillUsage(skills.filter((skill) => skill.app === 'claude-code'), asRecord(read.value.skillUsage));
      }
      if (def.id === 'codex' && fileDef.format === 'toml') {
        const scan = await scanCodexPlugins(ctx, read.value);
        packages.push(...scan.packages);
        skills.push(...scan.skills);
        servers.push(...scan.servers);
      }
    }

    if (def.id === 'claude-code') {
      const scan = await scanClaudePlugins(ctx, warnings);
      packages.push(...scan.packages);
      servers.push(...scan.servers);
      // Plugin skills are recorded in skillUsage under their prefixed name too.
      const state = await readJson(expand(ctx, '~/.claude.json'));
      const skillUsage = state.status === 'ok' ? asRecord(asRecord(state.value).skillUsage) : {};
      applySkillUsage(scan.skills, skillUsage);
      skills.push(...scan.skills);
    }
  }

  const detectedIds = new Set(apps.filter((app) => app.detected).map((app) => app.id));
  for (const item of await scanSimplePackages(ctx)) {
    if (detectedIds.has(item.app)) packages.push(item);
  }

  // The same folder can be reachable twice (a symlink, or one directory listed for two scopes).
  const uniqueSkills = dedupeById(skills);
  const uniqueServers = dedupeById(servers);

  for (const app of apps) {
    app.counts = {
      skills: uniqueSkills.filter((skill) => skill.app === app.id).length,
      mcp: uniqueServers.filter((server) => server.app === app.id).length,
      packages: packages.filter((item) => item.app === app.id).length,
    };
  }

  const projects: ProjectInfo[] = [ctx.projectRoot, ...otherProjects].map((root) => {
    const id = display(ctx, root);
    const prefix = id === '.' ? './' : `${id}/`;
    const inside = uniqueSkills.filter((skill) => skill.scope === 'project' && skill.path.startsWith(prefix));
    return { id, name: path.basename(root), current: root === ctx.projectRoot, skills: new Set(inside.map((skill) => skill.key)).size };
  });

  return { apps, skills: uniqueSkills, servers: uniqueServers, packages, projects, warnings };
}

/**
 * Claude Code counts invocations under the name the skill was called by, which is the folder name
 * for a user skill and `plugin:folder` for a plugin skill. The front-matter name can differ.
 */
function applySkillUsage(skills: SkillItem[], skillUsage: Record<string, unknown>): void {
  for (const skill of skills) {
    const folder = skill.path.split('/').pop() ?? '';
    const prefix = skill.origin.kind === 'plugin' ? `${skill.origin.name}:` : '';
    for (const candidate of [skill.name, `${prefix}${folder}`, folder]) {
      const usage = asRecord(skillUsage[candidate]);
      if (typeof usage.usageCount !== 'number') continue;
      skill.usageCount = usage.usageCount;
      skill.lastUsedAt = isoFromMillis(usage.lastUsedAt);
      break;
    }
  }
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}
