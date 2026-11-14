// The write path, exercised against an invented home directory. CLIs are replaced by a recorder:
// no test ever starts `claude`, `codex` or `npx`.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSnapshot } from '../../collectors/index.ts';
import type { CollectContext } from '../../collectors/lib/context.ts';
import { applyActions, parseRequests, planActions, type ActionEnv } from '../../server/actions.ts';
import { buildCatalog, cleanView, runCommand } from '../../server/command.ts';
import type { ActionRequest, HarnessSnapshot } from '../../shared/schema.ts';
import { createFixtureHome, FAKE_SECRETS } from '../helpers/fixture-home.ts';

let ctx: CollectContext;
let env: ActionEnv;
let snapshot: HarnessSnapshot;
let calls: { command: string; args: string[] }[];
let cleanup: () => Promise<void> = async () => {};

async function rescan(): Promise<HarnessSnapshot> {
  // A fresh context each time: the inventory is memoised per context object.
  snapshot = await buildSnapshot({ ...ctx });
  return snapshot;
}

const skillId = (app: string, name: string) => snapshot.slices.skills.items.find((skill) => skill.app === app && skill.name === name)!.id;
const serverId = (app: string, name: string) => snapshot.slices.mcp.servers.find((server) => server.app === app && server.name === name)!.id;
const read = (relative: string) => fs.readFile(path.join(ctx.home, relative), 'utf8');

beforeEach(async () => {
  const fixture = await createFixtureHome();
  ctx = fixture.ctx;
  cleanup = fixture.cleanup;
  calls = [];
  env = {
    ctx,
    backupRoot: path.join(fixture.root, 'backups'),
    run: async (command, args) => {
      calls.push({ command, args });
      return { ok: true, output: '' };
    },
  };
  await rescan();
});

afterEach(() => cleanup());

describe('skills', () => {
  it('links a shared skill into another app, and does nothing until applied', async () => {
    const request: ActionRequest = { type: 'skill.connect', skillId: skillId('codex', 'sql-review'), app: 'claude-code' };
    const [step] = await planActions([request], snapshot, env);
    expect(step.ok).toBe(true);
    expect(step.detail).toContain('~/.claude/skills/sql-review');
    // Cursor reads ~/.claude/skills too, but it already has the skill through ~/.agents/skills.
    expect(step.warnings).toEqual([]);
    await expect(fs.lstat(path.join(ctx.home, '.claude/skills/sql-review'))).rejects.toThrow();

    const [result] = await applyActions([request], snapshot, env);
    expect(result.ok).toBe(true);
    expect((await fs.lstat(path.join(ctx.home, '.claude/skills/sql-review'))).isSymbolicLink()).toBe(true);
    await rescan();
    expect(snapshot.slices.skills.items.some((skill) => skill.app === 'claude-code' && skill.name === 'sql-review')).toBe(true);
  });

  it('refuses a skill the target already has, and one that belongs to a plugin', async () => {
    const steps = await planActions(
      [
        { type: 'skill.connect', skillId: skillId('codex', 'pdf-tools'), app: 'claude-code' },
        { type: 'skill.connect', skillId: skillId('claude-code', 'deploy:ship'), app: 'codex' },
        { type: 'skill.disconnect', skillId: skillId('codex', 'skill-creator') },
      ],
      snapshot,
      env,
    );
    expect(steps.map((step) => step.ok)).toEqual([false, false, false]);
    expect(steps[0].reason).toContain('already has');
  });

  it('removes a link by unlinking it and a real folder by moving it to the backup, never by deleting', async () => {
    await applyActions([{ type: 'skill.connect', skillId: skillId('codex', 'sql-review'), app: 'claude-code' }], snapshot, env);
    await rescan();
    const [unlinked] = await applyActions([{ type: 'skill.disconnect', skillId: skillId('claude-code', 'sql-review') }], snapshot, env);
    expect(unlinked.message).toBe('Link removed.');
    await expect(fs.access(path.join(ctx.home, '.agents/skills/sql-review/SKILL.md'))).resolves.toBeUndefined();

    await rescan();
    const request: ActionRequest = { type: 'skill.disconnect', skillId: skillId('claude-code', 'commit-helper') };
    const [step] = await planActions([request], snapshot, env);
    expect(step.detail).toContain('Nothing is deleted');
    const [moved] = await applyActions([request], snapshot, env);
    expect(moved.ok).toBe(true);
    await expect(fs.access(path.join(ctx.home, '.claude/skills/commit-helper'))).rejects.toThrow();
    const stamps = await fs.readdir(env.backupRoot);
    await expect(fs.access(path.join(env.backupRoot, stamps[0], 'skills', 'claude-code', 'commit-helper', 'SKILL.md'))).resolves.toBeUndefined();
  });

  it('says which other apps lose a skill that lives in a shared folder', async () => {
    const [step] = await planActions([{ type: 'skill.disconnect', skillId: skillId('codex', 'sql-review') }], snapshot, env);
    expect(step.ok).toBe(true);
    expect(step.warnings[0]).toContain('Cursor');
  });

  it('does not claim another app loses a skill it can still reach through a second folder', async () => {
    // pdf-tools is in ~/.agents/skills (Codex, Cursor) and in ~/.claude/skills (Claude Code, Cursor).
    const [step] = await planActions([{ type: 'skill.disconnect', skillId: skillId('codex', 'pdf-tools') }], snapshot, env);
    expect(step.ok).toBe(true);
    expect(step.warnings).toEqual([]);
  });

  it('will not remove a skill from an app that only borrows it from other apps\u2019 folders', async () => {
    const [step] = await planActions([{ type: 'skill.disconnect', skillId: skillId('cursor', 'pdf-tools') }], snapshot, env);
    expect(step.ok).toBe(false);
    expect(step.reason).toContain('belong to other apps');
    const results = await applyActions([{ type: 'skill.disconnect', skillId: skillId('cursor', 'pdf-tools') }], snapshot, env);
    expect(results[0].ok).toBe(false);
    await expect(fs.access(path.join(ctx.home, '.agents/skills/pdf-tools/SKILL.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(ctx.home, '.claude/skills/pdf-tools/SKILL.md'))).resolves.toBeUndefined();
  });
});

describe('skills inside projects', () => {
  it('copies a skill into a project for one app, and only into a project the scan knows', async () => {
    const request: ActionRequest = { type: 'skill.project.add', skillId: skillId('codex', 'sql-review'), project: '~/work/blog', app: 'claude-code' };
    const [step] = await planActions([request], snapshot, env);
    expect(step).toMatchObject({ ok: true, app: 'claude-code' });
    expect(step.detail).toContain('~/work/blog/.claude/skills/sql-review');
    expect(step.warnings.join(' ')).toContain('Cursor');

    const [result] = await applyActions([request], snapshot, env);
    expect(result.ok).toBe(true);
    const copied = path.join(ctx.home, 'work/blog/.claude/skills/sql-review');
    expect((await fs.lstat(copied)).isSymbolicLink()).toBe(false);
    await expect(fs.access(path.join(copied, 'SKILL.md'))).resolves.toBeUndefined();
    await rescan();
    expect(snapshot.slices.skills.items.some((skill) => skill.app === 'claude-code' && skill.project === 'blog' && skill.name === 'sql-review')).toBe(true);

    const refusedSteps = await planActions(
      [
        request,
        { type: 'skill.project.add', skillId: skillId('codex', 'sql-review'), project: '/etc', app: 'claude-code' },
        { type: 'skill.project.add', skillId: skillId('codex', 'sql-review'), project: '~/work/blog/../../..', app: 'claude-code' },
        { type: 'skill.project.add', skillId: skillId('claude-code', 'deploy:ship'), project: '~/work/blog', app: 'claude-code' },
      ],
      snapshot,
      env,
    );
    expect(refusedSteps.map((item) => item.ok)).toEqual([false, false, false, false]);
    expect(refusedSteps[0].reason).toContain('already has');
  });

  it('takes a skill out of a project by moving it to the backup', async () => {
    const request: ActionRequest = { type: 'skill.disconnect', skillId: skillId('claude-code', 'post-checker') };
    const [step] = await planActions([request], snapshot, env);
    expect(step.ok).toBe(true);
    expect(step.title).toBe('Remove post-checker from blog');
    expect(step.warnings.join(' ')).toContain('Cursor');
    const [result] = await applyActions([request], snapshot, env);
    expect(result.ok).toBe(true);
    await expect(fs.access(path.join(ctx.home, 'work/blog/.claude/skills/post-checker'))).rejects.toThrow();
    const stamps = await fs.readdir(env.backupRoot);
    await expect(fs.access(path.join(env.backupRoot, stamps[0], 'skills', 'projects', 'blog', 'post-checker', 'SKILL.md'))).resolves.toBeUndefined();
  });
});

describe('assistant commands', () => {
  const answer = (body: object) => (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), { status: 200 })) as unknown as typeof fetch;
  const ids = () => {
    const catalog = buildCatalog(snapshot);
    const find = <T>(map: Map<string, T[]>, test: (item: T) => boolean) => [...map.entries()].find(([, items]) => items.some(test))![0];
    return {
      catalog,
      sql: find(catalog.skills, (skill) => skill.name === 'sql-review'),
      postgres: find(catalog.servers, (server) => server.name === 'postgres'),
      blog: [...catalog.projects.entries()].find(([, project]) => project.name === 'blog')![0],
    };
  };

  it('describes the setup to the model without paths, commands or secrets', () => {
    const { catalog } = ids();
    expect(catalog.brief).toContain('sql-review');
    expect(catalog.brief).toContain('blog');
    for (const secret of FAKE_SECRETS) expect(catalog.brief).not.toContain(secret);
    expect(catalog.brief).not.toContain(ctx.home);
    expect(catalog.brief).not.toContain('~/');
    expect(catalog.brief).not.toContain('npx');
    // Skills that came with a plugin or an app cannot be managed, so they are not offered.
    expect(catalog.brief).not.toContain('skill-creator');
  });

  it('turns the model\u2019s choices into planned changes and applies nothing', async () => {
    const { sql, postgres, blog } = ids();
    const reply = await runCommand('put sql-review in claude code and the blog, and postgres in cursor', [], snapshot, env, {
      apiKey: 'test-key',
      fetchImpl: answer({
        reply: 'I can do that. Review below.',
        actions: [
          { op: 'connect_skill', item: sql, app: 'claude-code' },
          { op: 'add_skill_to_project', item: sql, app: 'claude-code', project: blog },
          { op: 'connect_server', item: postgres, app: 'cursor' },
          { op: 'connect_skill', item: 'S999', app: 'claude-code' },
          { op: 'connect_skill', item: sql, app: 'not-an-app' },
          { op: 'delete_everything', item: sql },
        ],
        view: { sort: 'usage', app: 'cursor', kind: 'nonsense', colour: 'red' },
        searches: [],
      }),
    });
    expect(reply.proposals.map((step) => step.request.type)).toEqual(['skill.connect', 'skill.project.add', 'mcp.connect']);
    expect(reply.proposals.every((step) => step.ok)).toBe(true);
    expect(reply.view).toEqual({ sort: 'usage', app: 'cursor' });
    for (const secret of FAKE_SECRETS) expect(JSON.stringify(reply)).not.toContain(secret);
    // Proposing is not doing.
    await expect(fs.lstat(path.join(ctx.home, '.claude/skills/sql-review'))).rejects.toThrow();
    expect(JSON.parse(await read('.cursor/mcp.json')).mcpServers.postgres).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('returns registry results for a search and says so when there is no key', async () => {
    const found = [{ id: 'skill:acme/skills/tidy', type: 'skill' as const, name: 'tidy', description: '', registry: 'skills.sh', sourceUrl: 'https://github.com/acme/skills', installed: false, tags: [], commands: [], checkedAt: '2026-11-14' }];
    const reply = await runCommand('find me something for testing', [], snapshot, env, {
      apiKey: 'test-key',
      fetchImpl: answer({ reply: 'Here are a few.', actions: [], searches: ['testing', 'x; rm -rf'] }),
      search: async (query) => (query === 'testing' ? found : []),
    });
    expect(reply.found).toEqual(found);
    expect(reply.proposals).toEqual([]);
    expect((await runCommand('hi', [], snapshot, env, {})).provider).toBe('local');
  });

  it('accepts only known view settings', () => {
    expect(cleanView({ kind: 'servers', shared: true, sort: 'shared', app: 'all', query: 'pdf' }, snapshot)).toEqual({ kind: 'servers', shared: true, sort: 'shared', app: '', query: 'pdf' });
    expect(cleanView({ app: 'pi' }, snapshot)).toBeUndefined();
    expect(cleanView(null, snapshot)).toBeUndefined();
  });
});

describe('mcp servers', () => {
  it('copies a server into a JSON config with its credentials, which never appear in the plan or result', async () => {
    const request: ActionRequest = { type: 'mcp.connect', serverId: serverId('claude-code', 'postgres'), app: 'cursor' };
    const steps = await planActions([request], snapshot, env);
    const results = await applyActions([request], snapshot, env);
    expect(results[0].ok).toBe(true);
    for (const secret of FAKE_SECRETS) expect(JSON.stringify({ steps, results })).not.toContain(secret);

    const config = JSON.parse(await read('.cursor/mcp.json'));
    expect(config.mcpServers.postgres.command).toBe('npx');
    expect(config.mcpServers.postgres.args[2]).toContain(FAKE_SECRETS[1]);
    // The server that was already there is untouched, and the old file was backed up first.
    expect(config.mcpServers.github.url).toContain(FAKE_SECRETS[3]);
    const stamps = await fs.readdir(env.backupRoot);
    expect(await fs.readdir(path.join(env.backupRoot, stamps[0], 'configs'))).toHaveLength(1);
  });

  it('leaves credentials out when asked to', async () => {
    await applyActions([{ type: 'mcp.connect', serverId: serverId('claude-code', 'github'), app: 'claude-desktop', copyCredentials: false }], snapshot, env);
    // Claude desktop cannot take a remote server from its config file at all.
    expect(await read('Library/Application Support/Claude/claude_desktop_config.json')).not.toContain('githubcopilot');
    const [step] = await planActions([{ type: 'mcp.connect', serverId: serverId('claude-code', 'github'), app: 'claude-desktop' }], snapshot, env);
    expect(step.ok).toBe(false);
    expect(step.reason).toContain('Connectors');
  });

  it('appends a section to Codex config.toml without disturbing the rest of the file', async () => {
    const before = await read('.codex/config.toml');
    const [result] = await applyActions([{ type: 'mcp.connect', serverId: serverId('claude-code', 'postgres'), app: 'codex' }], snapshot, env);
    expect(result.ok).toBe(true);
    const after = await read('.codex/config.toml');
    expect(after.startsWith(before)).toBe(true);
    expect(after).toContain('[mcp_servers.postgres]\ncommand = "npx"');
    await rescan();
    expect(snapshot.slices.mcp.servers.some((server) => server.app === 'codex' && server.name === 'postgres')).toBe(true);
  });

  it('uses the claude and codex CLIs, without a shell, where the app owns its config', async () => {
    await applyActions(
      [
        { type: 'mcp.connect', serverId: serverId('claude-desktop', 'filesystem'), app: 'claude-code' },
        { type: 'mcp.disconnect', serverId: serverId('claude-code', 'postgres') },
        { type: 'mcp.disconnect', serverId: serverId('codex', 'github') },
      ],
      snapshot,
      env,
    );
    expect(calls[0].command).toBe('claude');
    expect(calls[0].args.slice(0, 5)).toEqual(['mcp', 'add-json', '--scope', 'user', 'filesystem']);
    expect(JSON.parse(calls[0].args[5])).toMatchObject({ type: 'stdio', command: 'npx' });
    expect(calls[1]).toEqual({ command: 'claude', args: ['mcp', 'remove', 'postgres', '--scope', 'user'] });
    expect(calls[2]).toEqual({ command: 'codex', args: ['mcp', 'remove', 'github'] });
  });

  it('removes a server from a JSON config and keeps a backup', async () => {
    const [result] = await applyActions([{ type: 'mcp.disconnect', serverId: serverId('cursor', 'github') }], snapshot, env);
    expect(result.ok).toBe(true);
    expect(JSON.parse(await read('.cursor/mcp.json')).mcpServers).toEqual({});
  });

  it('refuses plugin servers, project servers and files with comments', async () => {
    await fs.writeFile(path.join(ctx.home, '.cursor/mcp.json'), '{\n  // my servers\n  "mcpServers": {}\n}\n');
    await rescan();
    const steps = await planActions(
      [
        { type: 'mcp.disconnect', serverId: serverId('claude-code', 'deploy') },
        { type: 'mcp.disconnect', serverId: serverId('claude-code', 'linear') },
        { type: 'mcp.connect', serverId: serverId('claude-code', 'postgres'), app: 'cursor' },
      ],
      snapshot,
      env,
    );
    expect(steps.map((step) => step.ok)).toEqual([false, false, false]);
    expect(steps[2].reason).toContain('comments');
    expect(steps[2].manual).toContain('"postgres"');
    expect(await read('.cursor/mcp.json')).toContain('// my servers');
  });
});

describe('installing from a registry', () => {
  it('runs one skills command for all chosen apps', async () => {
    const requests: ActionRequest[] = ['claude-code', 'codex', 'cursor'].map((app) => ({ type: 'registry.skill', source: 'acme/skills', skill: 'tidy', app }));
    const results = await applyActions(requests, snapshot, env);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(calls).toEqual([{ command: 'npx', args: ['--yes', 'skills', 'add', 'acme/skills', '--skill', 'tidy', '-g', '-y', '-a', 'claude-code', '-a', 'codex', '-a', 'cursor'] }]);
  });

  it('adds a registry server by address or package and warns that it is unreviewed', async () => {
    const steps = await planActions(
      [
        { type: 'registry.mcp', name: 'docs', app: 'cursor', url: 'https://mcp.example.com/mcp' },
        { type: 'registry.mcp', name: 'files', app: 'claude-desktop', registryType: 'npm', identifier: '@acme/files-mcp' },
      ],
      snapshot,
      env,
    );
    expect(steps.map((step) => step.ok)).toEqual([true, true]);
    expect(steps[0].warnings[0]).toContain('nobody here has reviewed');
  });

  it('rejects anything that could smuggle a flag, a shell character or a non-https address', async () => {
    const steps = await planActions(
      [
        { type: 'registry.skill', source: 'acme/skills; rm -rf ~', skill: 'tidy', app: 'codex' },
        { type: 'registry.skill', source: 'acme/skills', skill: '--all', app: 'codex' },
        { type: 'registry.mcp', name: 'x', app: 'cursor', url: 'http://mcp.example.com/' },
        { type: 'registry.mcp', name: 'x', app: 'cursor', registryType: 'npm', identifier: '--registry=https://evil.example' },
        { type: 'registry.mcp', name: '../../x', app: 'cursor', url: 'https://mcp.example.com/' },
      ],
      snapshot,
      env,
    );
    expect(steps.map((step) => step.ok)).toEqual([false, false, false, false, false]);
    await applyActions([{ type: 'registry.skill', source: 'acme/skills', skill: '--all', app: 'codex' }], snapshot, env);
    expect(calls).toEqual([]);
  });

  it('drops malformed requests before looking at them', () => {
    expect(parseRequests({ requests: [{ type: 'rm', path: '/' }, { type: 'skill.disconnect', skillId: 5 }, 'x'] })).toEqual([{ type: 'skill.disconnect', skillId: '' }]);
    expect(parseRequests(null)).toEqual([]);
  });
});
