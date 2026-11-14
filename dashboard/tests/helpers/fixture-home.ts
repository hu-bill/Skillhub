// Builds a throwaway home directory that looks like a machine with several AI apps installed.
// Everything in it is invented. The "secrets" are fake strings the tests then prove never leave a collector.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CollectContext } from '../../collectors/lib/context.ts';

export const FAKE_SECRETS = [
  'ghp_FAKEFAKEFAKEFAKEFAKE1234567890',
  'hunter2-db-password',
  'sk-fake-desktop-token-0000000000',
  'cursor-query-key-abcdef123456',
];

export const FIXED_NOW = new Date('2026-11-14T12:00:00Z');

async function write(root: string, relative: string, content: string | object): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}

function skill(name: string, description: string, extra = ''): string {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n\nInstructions go here.\n`;
}

const PDF_TOOLS = skill('pdf-tools', 'Read, merge and fill PDF files. Use when the task mentions a PDF.');

/** The smallest valid .icns: a header, one entry the reader skips, and one PNG entry. */
export const FAKE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fixture-pixels')]);

function fakeIcns(): Buffer {
  const entry = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'latin1');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([entry('TOC ', Buffer.alloc(8)), entry('ic07', FAKE_PNG)]);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'latin1');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

function assistantLine(id: string, timestamp: string, cwd: string, usage: Record<string, number>, model = 'claude-opus-5-5'): string {
  return JSON.stringify({ type: 'assistant', requestId: `req_${id}`, timestamp, cwd, message: { id: `msg_${id}`, model, usage } });
}

export async function createFixtureHome(): Promise<{ ctx: CollectContext; root: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wayfinder-fixture-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const appData = 'Library/Application Support';

  // Claude Code
  const pluginDir = path.join(home, '.claude/plugins/cache/acme/deploy-kit/1.2.0');
  await write(home, '.claude.json', {
    mcpServers: {
      github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: `Bearer ${FAKE_SECRETS[0]}` } },
      postgres: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', `postgresql://admin:${FAKE_SECRETS[1]}@db.example.com/app`] },
    },
    // Projects Claude Code remembers: the current one, another that has its own skill, one that no
    // longer exists, and the two entries that are not projects at all (the home folder and `/`).
    projects: {
      [project]: { mcpServers: { scratch: { command: 'uvx', args: ['scratch-mcp'] } } },
      [path.join(home, 'work/blog')]: {},
      [path.join(home, 'work/gone')]: {},
      [home]: {},
      '/': {},
    },
    skillUsage: { 'pdf-tools': { usageCount: 12, lastUsedAt: Date.parse('2026-11-12T09:00:00Z') }, 'deploy:ship': { usageCount: 3, lastUsedAt: Date.parse('2026-11-01T09:00:00Z') } },
    pluginUsage: { 'deploy-kit@acme': { usageCount: 40, lastUsedAt: Date.parse('2026-11-13T09:00:00Z') } },
  });
  await write(home, '.claude/settings.json', { enabledPlugins: { 'deploy-kit@acme': true } });
  await write(home, '.claude/skills/pdf-tools/SKILL.md', PDF_TOOLS);
  await write(home, '.claude/skills/commit-helper/SKILL.md', skill('commit-helper', 'Write a commit message from the staged diff.', 'disable-model-invocation: true\n'));
  await write(home, '.claude/plugins/installed_plugins.json', {
    version: 2,
    plugins: { 'deploy-kit@acme': [{ scope: 'user', installPath: pluginDir, version: '1.2.0' }] },
  });
  await write(pluginDir, '.claude-plugin/plugin.json', { name: 'deploy', version: '1.2.0' });
  await write(pluginDir, 'skills/ship/SKILL.md', skill('ship', 'Deploy the current project and report the URL.'));
  await write(pluginDir, '.mcp.json', { mcpServers: { deploy: { type: 'http', url: 'https://mcp.deploy.example.com/' } } });
  await write(
    home,
    '.claude/projects/-work-shop/session-a.jsonl',
    [
      assistantLine('1', '2026-11-10T10:00:00Z', '/work/shop', { input_tokens: 100, output_tokens: 400, cache_read_input_tokens: 9000, cache_creation_input_tokens: 500 }),
      // The same response logged again for a second content block: must be counted once.
      assistantLine('1', '2026-11-10T10:00:00Z', '/work/shop', { input_tokens: 100, output_tokens: 400, cache_read_input_tokens: 9000, cache_creation_input_tokens: 500 }),
      assistantLine('2', '2026-11-12T11:00:00Z', '/work/shop', { input_tokens: 50, output_tokens: 950, cache_read_input_tokens: 19000, cache_creation_input_tokens: 0 }),
      JSON.stringify({ type: 'user', message: { content: 'this text must never be read into the snapshot' } }),
      JSON.stringify({ type: 'cost-state', sessionId: 'a', totalCostUSD: 1.25 }),
      'not json at all',
    ].join('\n'),
  );

  // A skill that lives inside another project, and an installed app bundle with an icon.
  await write(home, 'work/blog/.claude/skills/post-checker/SKILL.md', skill('post-checker', 'Check a blog post for broken links before publishing.'));
  await write(root, 'Applications/Cursor.app/Contents/Info.plist', '<plist><dict><key>CFBundleIconFile</key><string>Cursor.icns</string></dict></plist>');
  await fs.writeFile(path.join(root, 'Applications/Cursor.app/Contents/Resources/Cursor.icns'), fakeIcns()).catch(async () => {
    await fs.mkdir(path.join(root, 'Applications/Cursor.app/Contents/Resources'), { recursive: true });
    await fs.writeFile(path.join(root, 'Applications/Cursor.app/Contents/Resources/Cursor.icns'), fakeIcns());
  });

  // Shared skills folder (the `npx skills` convention) with the same skill Claude Code has.
  await write(home, '.agents/skills/pdf-tools/SKILL.md', PDF_TOOLS);
  await write(home, '.agents/skills/sql-review/SKILL.md', skill('sql-review', 'Review a SQL migration for locks and data loss.'));

  // Codex
  await write(
    home,
    '.codex/config.toml',
    [
      'model = "gpt-5.6-sol"',
      '',
      '[mcp_servers.github]',
      'url = "https://api.githubcopilot.com/mcp/"',
      'bearer_token_env_var = "GITHUB_TOKEN"',
      '',
      '[plugins."docs@openai-curated"]',
      'enabled = true',
      '',
      '[plugins."legacy@openai-curated"]',
      'enabled = false',
      '',
    ].join('\n'),
  );
  await write(home, '.codex/skills/.system/skill-creator/SKILL.md', skill('skill-creator', 'Create a new skill from a description.'));
  await write(home, '.codex/plugins/cache/openai-curated/docs/abc123/skills/write-docs/SKILL.md', skill('write-docs', 'Draft documentation pages in the house style.'));
  await write(
    home,
    '.codex/sessions/2026/11/13/rollout-2026-11-13T10-00-00-fixture.jsonl',
    [
      JSON.stringify({ type: 'session_meta', timestamp: '2026-11-14T08:00:00Z', payload: { cwd: '/work/shop' } }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-11-14T11:00:00Z',
        payload: {
          type: 'token_count',
          rate_limits: {
            primary: { used_percent: 42, window_minutes: 300, resets_at: Date.parse('2026-11-14T15:00:00Z') / 1000 },
            secondary: { used_percent: 17, window_minutes: 10080, resets_at: Date.parse('2026-11-20T00:00:00Z') / 1000 },
          },
        },
      }),
    ].join('\n'),
  );
  try {
    const sqlite = (await import('node:sqlite')) as unknown as { DatabaseSync: new (file: string) => { exec(sql: string): void; close(): void } };
    const db = new sqlite.DatabaseSync(path.join(home, '.codex/state_5.sqlite'));
    db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, tokens_used INTEGER, model TEXT, cwd TEXT, created_at INTEGER)');
    db.exec(`INSERT INTO threads VALUES ('t1', 120000, 'gpt-5.6-sol', '/work/shop', ${Date.parse('2026-11-11T09:00:00Z') / 1000})`);
    db.exec(`INSERT INTO threads VALUES ('t2', 80000, 'gpt-5.6-sol', '/work/blog', ${Date.parse('2026-11-13T09:00:00Z') / 1000})`);
    db.exec(`INSERT INTO threads VALUES ('t3', 0, 'gpt-5.6-sol', '/work/blog', ${Date.parse('2026-11-13T10:00:00Z') / 1000})`);
    db.close();
  } catch {
    /* Node without built-in SQLite: the Codex usage source reports itself unavailable. */
  }

  // Cursor
  await write(home, '.cursor/mcp.json', { mcpServers: { github: { url: `https://api.githubcopilot.com/mcp/?api_key=${FAKE_SECRETS[3]}` } } });
  await write(home, '.cursor/skills-cursor/create-rule/SKILL.md', skill('create-rule', 'Create a Cursor rule file.'));

  // Claude desktop
  await write(home, `${appData}/Claude/claude_desktop_config.json`, {
    mcpServers: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '--token', FAKE_SECRETS[2]], env: { API_TOKEN: FAKE_SECRETS[2] } } },
  });
  await write(home, `${appData}/Claude/plan-usage-history.json`, {
    version: 2,
    samples: [
      { t: Date.parse('2026-11-01T00:00:00Z'), org: 'x', u: { fh: 80, sd: 20 } },
      { t: Date.parse('2026-11-14T10:00:00Z'), org: 'x', u: { sd: 31 } },
    ],
  });

  // ChatGPT (installed, nothing readable) and VS Code (a config that does not parse).
  await fs.mkdir(path.join(home, appData, 'com.openai.chat'), { recursive: true });
  await write(home, `${appData}/Code/User/mcp.json`, '{ "servers": { broken');

  // The project being inspected.
  await write(project, '.mcp.json', { mcpServers: { linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } } });
  await write(project, '.claude/skills/new-card/SKILL.md', skill('new-card', 'Draft a decision card for this repository.'));

  return {
    ctx: { home, projectRoot: project, platform: 'darwin', now: FIXED_NOW, appsDir: path.join(root, 'Applications') },
    root,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}
