// Spine: the registry of AI apps the dashboard knows how to find and read.
// Adding an app is a data change here: where it lives, where it keeps skills, where it declares MCP servers.
// Path templates are expanded by `expand()` in ./context.ts (`~/`, `./`, `{appdata}/`, `{apps}/`).
//
// Locations were checked against a real install where one was available (2026-11-14):
// Claude Code, Claude desktop, Codex, Cursor, VS Code and Antigravity. Pi follows docs/dashboard-spec.md.
// Gemini CLI, opencode, Windsurf and Zed follow their documented defaults and are unverified on a live machine.
// Skill directories follow each vendor's docs and the `npx skills` agent table (github.com/vercel-labs/skills,
// docs/agents.md), checked 2026-11-14. `~/.codex/skills` is not in Codex's current docs; it is kept because
// Codex ships its bundled skills there (`~/.codex/skills/.system`).

import type { AppKind, McpAddStyle, Readable, Scope } from '../../shared/schema.ts';

export interface SkillDirDef {
  path: string;
  scope: Scope;
  origin: 'user' | 'project' | 'builtin' | 'shared';
}

export interface McpFileDef {
  path: string;
  scope: Scope;
  format: 'json' | 'toml';
  /** Top-level key holding the name -> server map. */
  key: string;
}

export interface AppDef {
  id: string;
  name: string;
  vendor: string;
  kind: AppKind;
  /** The app counts as installed when any of these exists. */
  detect: string[];
  skillDirs: SkillDirDef[];
  mcpFiles: McpFileDef[];
  readable: Readable;
  note?: string;
  userSkillDir?: string;
  /** The folder inside a project this app reads skills from. */
  projectSkillDir?: string;
  mcpAdd?: McpAddStyle;
  /** Where to look for the app's own icon: an app bundle, or an .icns file inside one. */
  icons?: string[];
}

/** Skill folder shared by several agents (the `npx skills` convention). */
export const SHARED_SKILLS_DIR = '~/.agents/skills';

const SHARED_USER: SkillDirDef = { path: SHARED_SKILLS_DIR, scope: 'user', origin: 'shared' };
const SHARED_PROJECT: SkillDirDef = { path: './.agents/skills', scope: 'project', origin: 'project' };

export const APP_DEFS: AppDef[] = [
  {
    id: 'claude-code',
    projectSkillDir: './.claude/skills',
    icons: ['{apps}/Claude.app'],
    name: 'Claude Code',
    vendor: 'Anthropic',
    kind: 'cli',
    detect: ['~/.claude', '~/.claude.json'],
    skillDirs: [
      { path: '~/.claude/skills', scope: 'user', origin: 'user' },
      { path: './.claude/skills', scope: 'project', origin: 'project' },
    ],
    mcpFiles: [
      { path: '~/.claude.json', scope: 'user', format: 'json', key: 'mcpServers' },
      { path: './.mcp.json', scope: 'project', format: 'json', key: 'mcpServers' },
    ],
    readable: 'partial',
    note: 'Connectors added on claude.ai are tied to your account and are not in local files.',
    userSkillDir: '~/.claude/skills',
    mcpAdd: { kind: 'cli', tool: 'claude' },
  },
  {
    id: 'claude-desktop',
    icons: ['{apps}/Claude.app'],
    name: 'Claude desktop',
    vendor: 'Anthropic',
    kind: 'desktop',
    detect: ['{appdata}/Claude', '{apps}/Claude.app'],
    skillDirs: [],
    mcpFiles: [{ path: '{appdata}/Claude/claude_desktop_config.json', scope: 'user', format: 'json', key: 'mcpServers' }],
    readable: 'partial',
    note: 'Only local MCP servers are in a file. Skills and connectors you enable in the app live in your account.',
    mcpAdd: { kind: 'json', file: '{appdata}/Claude/claude_desktop_config.json', key: 'mcpServers' },
  },
  {
    id: 'codex',
    projectSkillDir: './.agents/skills',
    icons: ['{apps}/Codex.app', '{apps}/ChatGPT.app/Contents/Resources/app.icns'],
    name: 'Codex',
    vendor: 'OpenAI',
    kind: 'cli',
    detect: ['~/.codex'],
    skillDirs: [
      { path: '~/.codex/skills', scope: 'user', origin: 'user' },
      SHARED_USER,
      SHARED_PROJECT,
      { path: './.codex/skills', scope: 'project', origin: 'project' },
    ],
    mcpFiles: [{ path: '~/.codex/config.toml', scope: 'user', format: 'toml', key: 'mcp_servers' }],
    readable: 'full',
    userSkillDir: SHARED_SKILLS_DIR,
    mcpAdd: { kind: 'cli', tool: 'codex' },
  },
  {
    id: 'chatgpt',
    icons: ['{apps}/ChatGPT.app'],
    name: 'ChatGPT',
    vendor: 'OpenAI',
    kind: 'desktop',
    detect: ['{apps}/ChatGPT.app', '{appdata}/com.openai.chat'],
    skillDirs: [],
    mcpFiles: [],
    readable: 'none',
    note: 'ChatGPT keeps connectors, custom GPTs and usage in your OpenAI account. Nothing about them is stored in local files, so this map can only show that the app is installed.',
  },
  {
    id: 'cursor',
    projectSkillDir: './.cursor/skills',
    icons: ['{apps}/Cursor.app'],
    name: 'Cursor',
    vendor: 'Anysphere',
    kind: 'ide',
    detect: ['~/.cursor', '{apps}/Cursor.app'],
    skillDirs: [
      { path: '~/.cursor/skills', scope: 'user', origin: 'user' },
      { path: '~/.cursor/skills-cursor', scope: 'builtin', origin: 'builtin' },
      SHARED_USER,
      // Cursor also loads these as compatibility directories (cursor.com/docs/skills, checked 2026-11-14).
      { path: '~/.claude/skills', scope: 'user', origin: 'shared' },
      { path: '~/.codex/skills', scope: 'user', origin: 'shared' },
      { path: './.cursor/skills', scope: 'project', origin: 'project' },
      SHARED_PROJECT,
      { path: './.claude/skills', scope: 'project', origin: 'project' },
    ],
    mcpFiles: [
      { path: '~/.cursor/mcp.json', scope: 'user', format: 'json', key: 'mcpServers' },
      { path: './.cursor/mcp.json', scope: 'project', format: 'json', key: 'mcpServers' },
    ],
    readable: 'partial',
    note: 'Token usage is kept on Cursor’s servers, not on disk.',
    userSkillDir: '~/.cursor/skills',
    mcpAdd: { kind: 'json', file: '~/.cursor/mcp.json', key: 'mcpServers' },
  },
  {
    id: 'vscode',
    projectSkillDir: './.github/skills',
    icons: ['{apps}/Visual Studio Code.app'],
    name: 'VS Code (Copilot)',
    vendor: 'Microsoft',
    kind: 'ide',
    detect: ['{appdata}/Code'],
    skillDirs: [
      { path: '~/.copilot/skills', scope: 'user', origin: 'user' },
      { path: './.github/skills', scope: 'project', origin: 'project' },
    ],
    mcpFiles: [
      { path: '{appdata}/Code/User/mcp.json', scope: 'user', format: 'json', key: 'servers' },
      { path: './.vscode/mcp.json', scope: 'project', format: 'json', key: 'servers' },
    ],
    readable: 'partial',
    mcpAdd: { kind: 'json', file: '{appdata}/Code/User/mcp.json', key: 'servers' },
  },
  {
    id: 'antigravity',
    projectSkillDir: './.agent/skills',
    icons: ['{apps}/Antigravity.app'],
    name: 'Antigravity',
    vendor: 'Google',
    kind: 'ide',
    detect: ['~/.gemini/antigravity', '{apps}/Antigravity.app'],
    skillDirs: [
      // `~/.gemini/config/skills` is where the skills CLI installs for Antigravity (docs/agents.md, 2026-11-14).
      { path: '~/.gemini/config/skills', scope: 'user', origin: 'user' },
      { path: '~/.gemini/antigravity/skills', scope: 'user', origin: 'user' },
      { path: '~/.gemini/antigravity/builtin/skills', scope: 'builtin', origin: 'builtin' },
      { path: './.agent/skills', scope: 'project', origin: 'project' },
    ],
    mcpFiles: [
      { path: '~/.gemini/antigravity/mcp_config.json', scope: 'user', format: 'json', key: 'mcpServers' },
      { path: '~/.gemini/config/mcp_config.json', scope: 'user', format: 'json', key: 'mcpServers' },
    ],
    readable: 'partial',
    userSkillDir: '~/.gemini/config/skills',
    mcpAdd: { kind: 'json', file: '~/.gemini/config/mcp_config.json', key: 'mcpServers' },
  },
  {
    id: 'gemini-cli',
    projectSkillDir: './.gemini/skills',
    name: 'Gemini CLI',
    vendor: 'Google',
    kind: 'cli',
    detect: ['~/.gemini/settings.json'],
    skillDirs: [
      { path: '~/.gemini/skills', scope: 'user', origin: 'user' },
      { path: './.gemini/skills', scope: 'project', origin: 'project' },
      SHARED_PROJECT,
    ],
    mcpFiles: [
      { path: '~/.gemini/settings.json', scope: 'user', format: 'json', key: 'mcpServers' },
      { path: './.gemini/settings.json', scope: 'project', format: 'json', key: 'mcpServers' },
    ],
    readable: 'full',
    userSkillDir: '~/.gemini/skills',
    mcpAdd: { kind: 'json', file: '~/.gemini/settings.json', key: 'mcpServers' },
  },
  {
    id: 'pi',
    projectSkillDir: './.pi/skills',
    name: 'Pi',
    vendor: 'Earendil Works',
    kind: 'cli',
    detect: ['~/.pi'],
    skillDirs: [
      { path: '~/.pi/agent/skills', scope: 'user', origin: 'user' },
      SHARED_USER,
      { path: './.pi/skills', scope: 'project', origin: 'project' },
      SHARED_PROJECT,
    ],
    mcpFiles: [
      { path: '~/.pi/agent/mcp.json', scope: 'user', format: 'json', key: 'mcpServers' },
      { path: './.pi/mcp.json', scope: 'project', format: 'json', key: 'mcpServers' },
    ],
    readable: 'full',
    userSkillDir: '~/.pi/agent/skills',
    mcpAdd: { kind: 'json', file: '~/.pi/agent/mcp.json', key: 'mcpServers' },
  },
  {
    id: 'opencode',
    projectSkillDir: './.opencode/skills',
    name: 'opencode',
    vendor: 'SST',
    kind: 'cli',
    detect: ['~/.config/opencode/opencode.json', '~/.config/opencode/opencode.jsonc', '~/.local/share/opencode'],
    skillDirs: [
      { path: '~/.config/opencode/skills', scope: 'user', origin: 'user' },
      { path: './.opencode/skills', scope: 'project', origin: 'project' },
    ],
    mcpFiles: [
      { path: '~/.config/opencode/opencode.json', scope: 'user', format: 'json', key: 'mcp' },
      { path: '~/.config/opencode/opencode.jsonc', scope: 'user', format: 'json', key: 'mcp' },
      { path: './opencode.json', scope: 'project', format: 'json', key: 'mcp' },
    ],
    readable: 'full',
    userSkillDir: '~/.config/opencode/skills',
    mcpAdd: { kind: 'json', file: '~/.config/opencode/opencode.json', key: 'mcp' },
  },
  {
    id: 'windsurf',
    icons: ['{apps}/Windsurf.app'],
    name: 'Windsurf',
    vendor: 'Cognition',
    kind: 'ide',
    detect: ['~/.codeium/windsurf'],
    skillDirs: [{ path: '~/.codeium/windsurf/skills', scope: 'user', origin: 'user' }],
    mcpFiles: [{ path: '~/.codeium/windsurf/mcp_config.json', scope: 'user', format: 'json', key: 'mcpServers' }],
    readable: 'partial',
    userSkillDir: '~/.codeium/windsurf/skills',
    mcpAdd: { kind: 'json', file: '~/.codeium/windsurf/mcp_config.json', key: 'mcpServers' },
  },
  {
    id: 'zed',
    icons: ['{apps}/Zed.app'],
    name: 'Zed',
    vendor: 'Zed Industries',
    kind: 'ide',
    detect: ['~/.config/zed'],
    skillDirs: [],
    mcpFiles: [{ path: '~/.config/zed/settings.json', scope: 'user', format: 'json', key: 'context_servers' }],
    readable: 'partial',
    mcpAdd: { kind: 'json', file: '~/.config/zed/settings.json', key: 'context_servers' },
  },
];

export function appDef(id: string): AppDef | undefined {
  return APP_DEFS.find((def) => def.id === id);
}
