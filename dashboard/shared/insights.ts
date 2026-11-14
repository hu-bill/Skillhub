// Spine: findings computed from a snapshot with no model call. Pure functions, so they run in the
// browser (demo mode) and on the server (as grounding for the Gemini assistant) alike.
//
// Every suggestion comes as a command to copy and as an action the user can confirm in the dashboard.

import type { ActionRequest, AppInfo, HarnessSnapshot, Insight, McpServer, SkillItem } from './schema.ts';

function byId(snapshot: HarnessSnapshot): Map<string, AppInfo> {
  return new Map(snapshot.slices.apps.items.map((app) => [app.id, app]));
}

function quote(value: string): string {
  return /^[\w@%+=:,./~-]+$/.test(value) ? value : `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

/** Command or snippet that connects `server` to `target`. Secrets are never included. */
export function mcpAddCommand(server: McpServer, target: AppInfo): string | undefined {
  const style = target.mcpAdd;
  if (!style) return undefined;
  const needsAuth = server.headerNames.length > 0 || server.envNames.length > 0;
  if (style.kind === 'cli') {
    if (style.tool === 'claude') {
      if (server.url) return `claude mcp add --transport http --scope user ${quote(server.name)} ${quote(server.url)}`;
      if (server.command) {
        const env = server.envNames.map((name) => `--env ${name}=<value>`).join(' ');
        return `claude mcp add --scope user ${env ? `${env} ` : ''}${quote(server.name)} -- ${server.command}`;
      }
    }
    if (style.tool === 'codex') {
      if (server.url) return `codex mcp add ${quote(server.name)} --url ${quote(server.url)}`;
      if (server.command) {
        const env = server.envNames.map((name) => `--env ${name}=<value>`).join(' ');
        return `codex mcp add ${quote(server.name)} ${env ? `${env} ` : ''}-- ${server.command}`;
      }
    }
    return undefined;
  }
  // Claude desktop's config file only takes servers it can start itself; remote ones are added in the app.
  if (target.id === 'claude-desktop' && server.url) return undefined;
  const placeholders = (names: string[]) => Object.fromEntries(names.map((name) => [name, '<value>']));
  const argv = (server.command ?? '').split(' ').filter(Boolean);
  let entry: Record<string, unknown>;
  if (target.id === 'opencode') {
    // opencode has its own shape: a `type`, the whole argv in `command`, and `environment`.
    entry = server.url
      ? { type: 'remote', url: server.url, ...(server.headerNames.length ? { headers: placeholders(server.headerNames) } : {}) }
      : { type: 'local', command: argv, ...(server.envNames.length ? { environment: placeholders(server.envNames) } : {}) };
  } else {
    entry = server.url
      ? { ...(target.id === 'vscode' ? { type: 'http' } : {}), url: server.url, ...(server.headerNames.length ? { headers: placeholders(server.headerNames) } : {}) }
      : { ...(target.id === 'vscode' ? { type: 'stdio' } : {}), command: argv[0], args: argv.slice(1), ...(server.envNames.length ? { env: placeholders(server.envNames) } : {}) };
  }
  const snippet = JSON.stringify({ [server.name]: entry }, null, 2);
  return `# Add under "${style.key}" in ${style.file}${needsAuth ? ' and fill in your own values' : ''}\n${snippet}`;
}

/** Command that makes a user-level skill available to another app by linking its folder. */
export function skillLinkCommand(skill: SkillItem, target: AppInfo): string | undefined {
  if (!target.userSkillDir) return undefined;
  const folder = skill.path.split('/').pop() ?? skill.name;
  return `mkdir -p ${target.userSkillDir} && ln -s ${quote(skill.path)} ${target.userSkillDir}/${quote(folder)}`;
}

/**
 * A server is worth offering to other apps when it is a remote endpoint or is launched through a
 * package runner. One that runs a binary from inside an app bundle belongs to that app.
 */
export function portableServer(server: McpServer): boolean {
  if (server.url) return true;
  const runner = (server.command ?? '').split(' ')[0].split('/').pop() ?? '';
  return ['npx', 'bunx', 'pnpx', 'uvx', 'uv', 'pipx', 'docker', 'deno'].includes(runner);
}

function portableSkill(skill: SkillItem): boolean {
  return skill.scope === 'user' && (skill.origin.kind === 'user' || skill.origin.kind === 'shared');
}

export function computeInsights(snapshot: HarnessSnapshot): Insight[] {
  const insights: Insight[] = [];
  const apps = byId(snapshot);
  const detected = snapshot.slices.apps.items.filter((app) => app.detected);
  const skills = snapshot.slices.skills.items;
  const servers = snapshot.slices.mcp.servers;

  // 1. Skills you wrote or installed for one app that another app could use too.
  const skillGroups = new Map<string, SkillItem[]>();
  for (const skill of skills) {
    if (!portableSkill(skill)) continue;
    skillGroups.set(skill.key, [...(skillGroups.get(skill.key) ?? []), skill]);
  }
  const skillTargets = detected.filter((app) => app.userSkillDir);
  const missingByTarget = new Map<string, { skill: SkillItem; command: string; action: ActionRequest }[]>();
  for (const group of skillGroups.values()) {
    const has = new Set(group.map((skill) => skill.app));
    for (const target of skillTargets) {
      if (has.has(target.id)) continue;
      const command = skillLinkCommand(group[0], target);
      if (!command) continue;
      const action: ActionRequest = { type: 'skill.connect', skillId: group[0].id, app: target.id };
      missingByTarget.set(target.id, [...(missingByTarget.get(target.id) ?? []), { skill: group[0], command, action }]);
    }
  }
  for (const [targetId, missing] of missingByTarget) {
    const target = apps.get(targetId);
    if (!target || missing.length === 0) continue;
    const names = missing.map((entry) => entry.skill.name);
    insights.push({
      id: `sync-skill:${targetId}`,
      kind: 'sync-skill',
      title: `${target.name} is missing ${missing.length} of your skills`,
      detail: `${preview(names)} ${missing.length === 1 ? 'is' : 'are'} set up for another app but not for ${target.name}. Linking the folder shares one copy, so an edit shows up everywhere.`,
      commands: missing.map((entry) => entry.command),
      actions: missing.map((entry) => entry.action),
    });
  }

  // 2. MCP servers connected to one app but not the others.
  const serverGroups = new Map<string, McpServer[]>();
  for (const server of servers) {
    if (server.origin.kind === 'plugin' || !portableServer(server)) continue;
    serverGroups.set(server.key, [...(serverGroups.get(server.key) ?? []), server]);
  }
  for (const group of serverGroups.values()) {
    const has = new Set(group.map((server) => server.app));
    const targets = detected.filter((app) => app.mcpAdd && !has.has(app.id));
    const commands = targets.map((target) => mcpAddCommand(group[0], target)).filter((command): command is string => Boolean(command));
    if (commands.length === 0) continue;
    const connected = [...has].map((id) => apps.get(id)?.name ?? id);
    insights.push({
      id: `sync-mcp:${group[0].key}`,
      kind: 'sync-mcp',
      title: `"${group[0].name}" is connected to ${connected.length} of ${connected.length + targets.length} apps`,
      detail: `Connected to ${preview(connected)}. Not connected to ${preview(targets.map((app) => app.name))}.${group[0].headerNames.length + group[0].envNames.length > 0 ? ' It needs credentials, which are never copied: add your own.' : ''}`,
      commands,
      actions: targets.map((target): ActionRequest => ({ type: 'mcp.connect', serverId: group[0].id, app: target.id })),
    });
  }

  // 3. Always-on cost: every auto-loadable skill description is in context for every session.
  for (const app of detected) {
    const loaded = skills.filter((skill) => skill.app === app.id && skill.modelInvocable && loadsHere(skill));
    const tokens = loaded.reduce((sum, skill) => sum + skill.estTokens, 0);
    if (tokens < 4000) continue;
    const heaviest = [...loaded].sort((a, b) => b.estTokens - a.estTokens).slice(0, 3);
    insights.push({
      id: `cost:${app.id}`,
      kind: 'cost',
      title: `${app.name} loads about ${tokens.toLocaleString('en-US')} tokens of skill descriptions into every session`,
      detail: `${loaded.length} skills can trigger on their own, and each one\u2019s description is always in context. The longest are ${preview(heaviest.map((skill) => `${skill.name} (~${skill.estTokens})`))}.`,
      commands: [],
      actions: [],
    });
  }

  // 4. Skills Claude Code has never been seen to use.
  const tracked = skills.filter((skill) => skill.app === 'claude-code' && portableSkill(skill));
  if (tracked.some((skill) => skill.usageCount !== undefined)) {
    const unused = tracked.filter((skill) => skill.usageCount === undefined);
    if (unused.length > 0) {
      insights.push({
        id: 'unused:claude-code',
        kind: 'unused',
        title: `${unused.length} Claude Code skill${unused.length === 1 ? ' has' : 's have'} no recorded use`,
        detail: `${preview(unused.map((skill) => skill.name))}. Claude Code\u2019s own counter has no entry for ${unused.length === 1 ? 'it' : 'them'}. Unused skills still cost description tokens in every session.`,
        commands: [],
        actions: [],
      });
    }
  }

  // 5. Apps the map cannot see inside.
  for (const app of detected.filter((item) => item.readable === 'none')) {
    insights.push({ id: `info:${app.id}`, kind: 'info', title: `${app.name} is installed but keeps its setup in the cloud`, detail: app.note ?? '', commands: [], actions: [] });
  }

  return insights;
}

/** A skill that lives in some other project is not in context when the app runs here. */
function loadsHere(skill: SkillItem): boolean {
  return skill.scope !== 'project' || skill.path.startsWith('./');
}

function preview(names: string[], max = 4): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** Always-on description tokens per app, the number behind the cost insight. */
export function alwaysOnTokens(snapshot: HarnessSnapshot, appId: string): number {
  return snapshot.slices.skills.items
    .filter((skill) => skill.app === appId && skill.modelInvocable && loadsHere(skill))
    .reduce((sum, skill) => sum + skill.estTokens, 0);
}
