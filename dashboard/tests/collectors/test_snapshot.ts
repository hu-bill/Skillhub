import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSnapshot, discoverCollectors } from '../../collectors/index.ts';
import path from 'node:path';
import { readIcnsPng } from '../../collectors/lib/icons.ts';
import { interestsOf } from '../../server/suggest.ts';
import { alwaysOnTokens, computeInsights } from '../../shared/insights.ts';
import { tagsFor } from '../../shared/tags.ts';
import type { HarnessSnapshot } from '../../shared/schema.ts';
import { createFixtureHome, FAKE_PNG, FAKE_SECRETS } from '../helpers/fixture-home.ts';

let snapshot: HarnessSnapshot;
let root = '';
let cleanup: () => Promise<void> = async () => {};

beforeAll(async () => {
  const fixture = await createFixtureHome();
  root = fixture.root;
  cleanup = fixture.cleanup;
  snapshot = await buildSnapshot(fixture.ctx);
});

afterAll(() => cleanup());

describe('snapshot envelope', () => {
  it('auto-discovers one collector per slice', () => {
    expect(discoverCollectors().map((collector) => collector.id)).toEqual(['apps', 'mcp', 'packages', 'skills', 'usage']);
    expect(Object.keys(snapshot.slices).sort()).toEqual(['apps', 'mcp', 'packages', 'skills', 'usage']);
    expect(snapshot.schemaVersion).toBe(1);
  });

  it('never contains a secret value, a machine path or transcript text', () => {
    const json = JSON.stringify(snapshot);
    for (const secret of FAKE_SECRETS) expect(json).not.toContain(secret);
    expect(json).not.toContain(root);
    expect(json).not.toContain('must never be read');
  });

  it('turns an unparseable config into a warning instead of failing', () => {
    expect(snapshot.warnings.some((warning) => warning.includes('Code/User/mcp.json'))).toBe(true);
  });
});

describe('apps slice', () => {
  it('detects installed apps and leaves the rest undetected', () => {
    const detected = snapshot.slices.apps.items.filter((app) => app.detected).map((app) => app.id);
    expect(detected).toEqual(['claude-code', 'claude-desktop', 'codex', 'chatgpt', 'cursor', 'vscode']);
    expect(snapshot.slices.apps.items.find((app) => app.id === 'pi')?.detected).toBe(false);
  });
});

describe('skills slice', () => {
  const find = (app: string, name: string) => snapshot.slices.skills.items.find((skill) => skill.app === app && skill.name === name);

  it('gives the same skill one identity across apps', () => {
    const claude = find('claude-code', 'pdf-tools');
    const codex = find('codex', 'pdf-tools');
    const cursor = find('cursor', 'pdf-tools');
    expect(claude && codex && cursor).toBeTruthy();
    expect(new Set([claude?.key, codex?.key, cursor?.key]).size).toBe(1);
    expect(codex?.origin).toEqual({ kind: 'shared', label: '~/.agents/skills' });
    expect(claude?.path).toBe('~/.claude/skills/pdf-tools');
  });

  it('reads manual-only, plugin, built-in and project skills', () => {
    expect(find('claude-code', 'commit-helper')?.modelInvocable).toBe(false);
    expect(find('claude-code', 'deploy:ship')?.origin).toEqual({ kind: 'plugin', name: 'deploy' });
    expect(find('codex', 'skill-creator')?.origin.kind).toBe('builtin');
    expect(find('codex', 'docs:write-docs')?.origin).toEqual({ kind: 'plugin', name: 'docs' });
    expect(find('claude-code', 'new-card')?.scope).toBe('project');
    expect(find('claude-code', 'new-card')?.path).toBe('./.claude/skills/new-card');
  });

  it('attaches Claude Code invocation counts, including plugin skills', () => {
    expect(find('claude-code', 'pdf-tools')?.usageCount).toBe(12);
    expect(find('claude-code', 'deploy:ship')?.usageCount).toBe(3);
    expect(find('claude-code', 'commit-helper')?.usageCount).toBeUndefined();
  });
});

describe('skills in other projects', () => {
  const inBlog = () => snapshot.slices.skills.items.filter((skill) => skill.project === 'blog');

  it('finds skills in the projects the apps remember, and names the project', () => {
    expect(inBlog().map((skill) => `${skill.app}:${skill.name}`).sort()).toEqual(['claude-code:post-checker', 'cursor:post-checker']);
    expect(inBlog()[0]).toMatchObject({ scope: 'project', origin: { kind: 'project' }, path: '~/work/blog/.claude/skills/post-checker' });
    expect(snapshot.slices.skills.items.find((skill) => skill.name === 'new-card')?.project).toBe('project');
  });

  it('does not treat the home folder or the filesystem root as a project', () => {
    // If it did, the user-level skills would turn up a second time as project skills.
    const userLevel = snapshot.slices.skills.items.filter((skill) => skill.app === 'claude-code' && skill.name === 'pdf-tools');
    expect(userLevel).toHaveLength(1);
    expect(userLevel[0].scope).toBe('user');
  });

  it('leaves another project\u2019s skills out of the always-on cost and the sync suggestions', () => {
    const withBlog = alwaysOnTokens(snapshot, 'claude-code');
    const blogTokens = inBlog().find((skill) => skill.app === 'claude-code')!.estTokens;
    const everything = snapshot.slices.skills.items.filter((skill) => skill.app === 'claude-code' && skill.modelInvocable).reduce((sum, skill) => sum + skill.estTokens, 0);
    expect(withBlog).toBe(everything - blogTokens);
    expect(computeInsights(snapshot).some((insight) => insight.commands.some((command) => command.includes('post-checker')))).toBe(false);
  });
});

describe('tags', () => {
  it('tags a skill from its name and description', () => {
    expect(tagsFor('frontend-design', 'Guidance for visual design when building new UI')).toEqual(['design', 'frontend']);
    expect(tagsFor('sql-review', 'Review a SQL migration for locks and data loss.')).toContain('data');
    expect(tagsFor('zzz', 'nothing recognisable')).toEqual([]);
    expect(snapshot.slices.skills.items.find((skill) => skill.name === 'pdf-tools')?.tags).toContain('docs');
  });

  it('ranks the topics the user\u2019s own skills lean toward', () => {
    const interests = interestsOf(snapshot);
    expect(interests.slice(0, 2)).toContain('docs');
    expect(interests).toContain('data');
  });
});

describe('app icons', () => {
  it('reports an icon only where an installed bundle has one', () => {
    const apps = snapshot.slices.apps.items;
    expect(apps.find((app) => app.id === 'cursor')?.hasIcon).toBe(true);
    expect(apps.find((app) => app.id === 'claude-code')?.hasIcon).toBe(false);
    expect(apps.find((app) => app.id === 'pi')?.hasIcon).toBe(false);
  });

  it('extracts the PNG from an .icns file and rejects anything else', async () => {
    const icns = path.join(root, 'Applications/Cursor.app/Contents/Resources/Cursor.icns');
    expect((await readIcnsPng(icns))?.equals(FAKE_PNG)).toBe(true);
    expect(await readIcnsPng(path.join(root, 'Applications/Cursor.app/Contents/Info.plist'))).toBeUndefined();
    expect(await readIcnsPng(path.join(root, 'missing.icns'))).toBeUndefined();
  });
});

describe('mcp slice', () => {
  const servers = () => snapshot.slices.mcp.servers;

  it('recognises one server connected to three apps', () => {
    const github = servers().filter((server) => server.name === 'github');
    expect(github.map((server) => server.app).sort()).toEqual(['claude-code', 'codex', 'cursor']);
    expect(new Set(github.map((server) => server.key)).size).toBe(1);
  });

  it('keeps names of credentials and drops their values', () => {
    const claude = servers().find((server) => server.app === 'claude-code' && server.name === 'github');
    expect(claude?.headerNames).toEqual(['Authorization']);
    expect(servers().find((server) => server.app === 'codex' && server.name === 'github')?.envNames).toEqual(['GITHUB_TOKEN']);
    expect(servers().find((server) => server.app === 'cursor')?.url).toBe('https://api.githubcopilot.com/mcp/?…');
    expect(servers().find((server) => server.name === 'postgres')?.command).toBe('npx -y @modelcontextprotocol/server-postgres postgresql://db.example.com/app');
    const desktop = servers().find((server) => server.app === 'claude-desktop');
    expect(desktop?.envNames).toEqual(['API_TOKEN']);
    expect(desktop?.command).toBe('npx -y @modelcontextprotocol/server-filesystem --token ‹redacted›');
  });

  it('assigns user, project, local and plugin origins', () => {
    expect(servers().find((server) => server.name === 'linear')?.scope).toBe('project');
    expect(servers().find((server) => server.name === 'scratch')?.scope).toBe('local');
    expect(servers().find((server) => server.name === 'deploy')?.origin).toEqual({ kind: 'plugin', name: 'deploy' });
  });
});

describe('packages slice', () => {
  it('lists plugins with their enabled state and what they bring', () => {
    const items = snapshot.slices.packages.items;
    expect(items.find((item) => item.id === 'claude-code:deploy-kit@acme')).toMatchObject({ name: 'deploy', enabled: true, skillCount: 1, mcpCount: 1, usageCount: 40 });
    expect(items.find((item) => item.id === 'codex:docs@openai-curated')).toMatchObject({ enabled: true, skillCount: 1 });
    expect(items.find((item) => item.id === 'codex:legacy@openai-curated')).toMatchObject({ enabled: false, skillCount: 0 });
  });
});

describe('usage slice', () => {
  it('adds up Claude Code tokens once per response', () => {
    const source = snapshot.slices.usage.sources.find((item) => item.app === 'claude-code');
    expect(source?.status).toBe('ok');
    expect(source?.totals).toEqual({ input: 150, output: 1350, cacheRead: 28000, cacheWrite: 500, total: 30000 });
    expect(source?.costUSD).toBe(1.25);
    expect(snapshot.slices.usage.projects.find((project) => project.app === 'claude-code')).toMatchObject({ project: 'shop', total: 30000 });
  });

  it('reads Codex thread totals when built-in SQLite is available', () => {
    const source = snapshot.slices.usage.sources.find((item) => item.app === 'codex');
    if (source?.status !== 'ok') return;
    expect(source.totals.total).toBe(200000);
    expect(source.sessions).toBe(2);
  });

  it('reports current and expired limit windows differently', () => {
    const limits = snapshot.slices.usage.limits;
    expect(limits.find((limit) => limit.app === 'codex' && limit.windowMinutes === 300)).toMatchObject({ usedPercent: 42, stale: false, label: '5-hour window' });
    expect(limits.find((limit) => limit.app === 'claude-desktop' && limit.windowMinutes === 10080)).toMatchObject({ usedPercent: 31, stale: false });
    // The last five-hour sample is two weeks old, so it is history.
    expect(limits.find((limit) => limit.app === 'claude-desktop' && limit.windowMinutes === 300)).toMatchObject({ usedPercent: 80, stale: true });
  });

  it('says so when an app keeps usage in the cloud', () => {
    expect(snapshot.slices.usage.sources.find((item) => item.app === 'chatgpt')?.status).toBe('not-recorded');
  });
});

describe('insights', () => {
  it('suggests sharing a skill and a server, as commands only', () => {
    const insights = computeInsights(snapshot);
    const skillSync = insights.find((insight) => insight.id === 'sync-skill:claude-code');
    expect(skillSync?.commands).toEqual(['mkdir -p ~/.claude/skills && ln -s ~/.agents/skills/sql-review ~/.claude/skills/sql-review']);
    const postgres = insights.find((insight) => insight.kind === 'sync-mcp' && insight.title.includes('postgres'));
    expect(postgres?.commands.some((command) => command.startsWith('codex mcp add postgres -- npx -y @modelcontextprotocol/server-postgres'))).toBe(true);
    for (const insight of insights) for (const command of insight.commands) for (const secret of FAKE_SECRETS) expect(command).not.toContain(secret);
  });
});
