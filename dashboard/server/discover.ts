// Live lookup against public registries. There is no hosted index of our own: every result is fetched
// on demand, carries its source link and the date it was checked, and is shown as unvetted.
// Registry text is third-party data: it is passed through as plain strings and never interpreted.
//
// Endpoints checked 2026-11-14:
//   MCP Registry  GET https://registry.modelcontextprotocol.io/v0.1/servers?search=&version=latest&limit=
//                 (no auth; `search` matches the server name only and needs 3+ characters)
//   skills.sh     GET https://skills.sh/api/search?q=&limit=  (no auth; undocumented, so it may change)
//   npm           GET https://registry.npmjs.org/-/v1/search?text=keywords:pi-package+…

import type { DiscoverResult, HarnessSnapshot } from '../shared/schema.ts';
import { tagsFor } from '../shared/tags.ts';

const TIMEOUT_MS = 8000;

async function getJson(url: string): Promise<unknown> {
  // Registries occasionally answer 5xx for a moment; one retry is enough to ride that out.
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) return response.json();
    if (response.status < 500 || attempt >= 1) throw new Error(`${new URL(url).host} answered ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function httpsOnly(url: string): string {
  return /^https:\/\//i.test(url) ? url : '';
}

async function searchMcp(query: string, today: string, installedKeys: Set<string>, installedNames: Set<string>): Promise<DiscoverResult[]> {
  const term = query.trim().split(/\s+/)[0] ?? '';
  if (term.length < 3) return [];
  const data = record(await getJson(`https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(term)}&version=latest&limit=20`));
  const results: DiscoverResult[] = [];
  for (const raw of list(data.servers)) {
    const server = record(record(raw).server);
    const name = text(server.name, 120);
    if (!name) continue;
    const short = name.split('/').pop() ?? name;
    const remote = record(list(server.remotes)[0]);
    const pkg = record(list(server.packages)[0]);
    const remoteUrl = httpsOnly(text(remote.url, 300));
    const identifier = text(pkg.identifier, 200);
    const commands: DiscoverResult['commands'] = [];
    let key = '';
    let install: DiscoverResult['install'];
    const safeName = /^[A-Za-z0-9][\w.-]{0,63}$/.test(short);
    // The name and address end up in a command the user may paste into a shell, so both must be inert there.
    if (remoteUrl && safeName && /^https:\/\/[A-Za-z0-9._~:/?#@%+=-]+$/.test(remoteUrl)) {
      if (safeName) install = { type: 'registry.mcp', name: short, url: remoteUrl };
      commands.push({ label: 'Claude Code', command: `claude mcp add --transport http --scope user ${short} ${remoteUrl}` });
      commands.push({ label: 'Codex', command: `codex mcp add ${short} --url ${remoteUrl}` });
      try {
        const url = new URL(remoteUrl);
        key = `url:${url.host}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
      } catch {
        /* no key */
      }
    } else if (safeName && identifier && /^[@\w./-]+$/.test(identifier) && !identifier.startsWith('-')) {
      const registryType = text(pkg.registryType, 20);
      const runner = registryType === 'npm' ? `npx -y ${identifier}` : registryType === 'pypi' ? `uvx ${identifier}` : '';
      if (runner) {
        if (safeName) install = { type: 'registry.mcp', name: short, registryType: registryType as 'npm' | 'pypi', identifier };
        commands.push({ label: 'Claude Code', command: `claude mcp add --scope user ${short} -- ${runner}` });
        commands.push({ label: 'Codex', command: `codex mcp add ${short} -- ${runner}` });
        key = `cmd:${runner.replace(' -y', '')}`.toLowerCase();
      }
    }
    const repo = httpsOnly(text(record(server.repository).url, 300));
    results.push({
      id: `mcp:${name}`,
      type: 'mcp',
      name,
      description: text(server.description),
      registry: 'MCP Registry',
      sourceUrl: repo || httpsOnly(text(server.websiteUrl, 300)) || `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(term)}`,
      installed: (key !== '' && installedKeys.has(key)) || installedNames.has(short.toLowerCase()),
      tags: tagsFor(short, text(server.description)),
      owner: name.split('/')[0],
      commands,
      install,
      checkedAt: today,
    });
  }
  return results;
}

export async function searchSkills(query: string, today: string, installedSkills: Set<string>, limit = 20): Promise<DiscoverResult[]> {
  if (query.trim().length < 2) return [];
  const data = record(await getJson(`https://skills.sh/api/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`));
  const results: DiscoverResult[] = [];
  for (const raw of list(data.skills)) {
    const skill = record(raw);
    const source = text(skill.source, 140);
    const skillId = text(skill.skillId, 100);
    const name = text(skill.name, 100) || skillId;
    if (!/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(source) || !/^[A-Za-z0-9][\w.-]*$/.test(skillId)) continue;
    results.push({
      id: `skill:${source}/${skillId}`,
      type: 'skill',
      name,
      description: '',
      owner: source,
      tags: tagsFor(name, ''),
      registry: 'skills.sh',
      sourceUrl: `https://github.com/${source}`,
      installs: typeof skill.installs === 'number' ? skill.installs : undefined,
      installed: installedSkills.has(name.toLowerCase()) || installedSkills.has(skillId.toLowerCase()),
      commands: [
        { label: 'All your agents (asks which)', command: `npx skills add ${source} --skill ${skillId} -g` },
        { label: 'Claude Code only', command: `npx skills add ${source} --skill ${skillId} -g -a claude-code` },
      ],
      install: { type: 'registry.skill', source, skill: skillId },
      checkedAt: today,
    });
  }
  return results;
}

async function searchPiPackages(query: string, today: string): Promise<DiscoverResult[]> {
  const data = record(await getJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(`keywords:pi-package ${query.trim()}`)}&size=8`));
  const results: DiscoverResult[] = [];
  for (const raw of list(data.objects)) {
    const pkg = record(record(raw).package);
    const name = text(pkg.name, 120);
    if (!/^[@\w./-]+$/.test(name)) continue;
    results.push({
      id: `package:${name}`,
      type: 'package',
      name,
      description: text(pkg.description),
      registry: 'npm (pi-package)',
      sourceUrl: `https://www.npmjs.com/package/${name}`,
      installed: false,
      tags: tagsFor(name, text(pkg.description)),
      commands: [{ label: 'Pi', command: `pi install npm:${name}` }],
      checkedAt: today,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Descriptions. skills.sh search returns names only, so the card text comes from the skill's listing
// page on skills.sh. Best effort: a short timeout and a cache so each skill is asked for once.
// What comes back is third-party text: it is clipped and shown, never acted on.

const descriptionCache = new Map<string, string>();
const DESCRIPTION_LIMIT = 220;

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** The one-line summary skills.sh shows for a skill, read from its listing page. */
async function fetchDescription(source: string, skill: string): Promise<string> {
  try {
    const response = await fetch(`https://skills.sh/${source}/${skill}`, { signal: AbortSignal.timeout(4000), headers: { accept: 'text/html' } });
    if (!response.ok) return '';
    const html = (await response.text()).slice(0, 20000);
    const match = /<meta name="description" content="([^"]*)"/.exec(html);
    const description = decodeEntities(match?.[1] ?? '').trim();
    return description.length > DESCRIPTION_LIMIT ? `${description.slice(0, DESCRIPTION_LIMIT).trimEnd()}…` : description;
  } catch {
    return '';
  }
}

/** Fill in descriptions (and the tags they imply) for skill results, a few at a time. */
export async function describeSkills(results: DiscoverResult[]): Promise<void> {
  const pending = results.filter((result) => result.install?.type === 'registry.skill');
  const workers = Array.from({ length: 12 }, async () => {
    for (;;) {
      const result = pending.shift();
      if (!result || result.install?.type !== 'registry.skill') return;
      const key = `${result.install.source}/${result.install.skill}`;
      if (!descriptionCache.has(key)) descriptionCache.set(key, await fetchDescription(result.install.source, result.install.skill));
      result.description = descriptionCache.get(key) ?? '';
      const tags = new Set([...result.tags, ...tagsFor(result.name, result.description)]);
      result.tags = [...tags].slice(0, 3);
    }
  });
  await Promise.all(workers);
}

export interface DiscoverResponse {
  query: string;
  results: DiscoverResult[];
  /** One line per registry that could not be reached. */
  errors: string[];
}

/** Names a registry entry is compared against to say "you already have this". */
export function installedSkillNames(snapshot: HarnessSnapshot): Set<string> {
  const names = new Set<string>();
  for (const skill of snapshot.slices.skills.items) {
    names.add((skill.name.split(':').pop() ?? skill.name).toLowerCase());
    names.add((skill.path.split('/').pop() ?? '').toLowerCase());
  }
  return names;
}

export async function discover(query: string, snapshot: HarnessSnapshot, now = new Date()): Promise<DiscoverResponse> {
  const today = now.toISOString().slice(0, 10);
  const installedKeys = new Set(snapshot.slices.mcp.servers.map((server) => server.key));
  const installedNames = new Set(snapshot.slices.mcp.servers.map((server) => server.name.toLowerCase()));
  const installedSkills = installedSkillNames(snapshot);
  const hasPi = snapshot.slices.apps.items.some((app) => app.id === 'pi' && app.detected);

  const jobs: [string, Promise<DiscoverResult[]>][] = [
    ['skills.sh', searchSkills(query, today, installedSkills)],
    ['MCP Registry', searchMcp(query, today, installedKeys, installedNames)],
  ];
  if (hasPi) jobs.push(['npm', searchPiPackages(query, today)]);

  const settled = await Promise.allSettled(jobs.map(([, job]) => job));
  const results: DiscoverResult[] = [];
  const errors: string[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') results.push(...outcome.value);
    else errors.push(`${jobs[index][0]} could not be reached (${outcome.reason instanceof Error ? outcome.reason.message : 'error'}).`);
  });
  await describeSkills(results.filter((result) => result.type === 'skill'));
  return { query, results, errors };
}
