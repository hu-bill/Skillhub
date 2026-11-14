// Spine: the outer HarnessSnapshot envelope and the types shared by collectors and UI.
// Each collector owns exactly one key under `slices`. Changing the envelope is a spine change.

export const SCHEMA_VERSION = 1;

export type Scope = 'user' | 'project' | 'local' | 'builtin';

/** Where an item physically comes from, independent of its scope. */
export type Origin =
  | { kind: 'user' }
  | { kind: 'project' }
  | { kind: 'builtin' }
  | { kind: 'shared'; label: string }
  | { kind: 'plugin'; name: string };

export type AppKind = 'cli' | 'desktop' | 'ide';

/** How much of an app's setup can be read from local files. */
export type Readable = 'full' | 'partial' | 'none';

export interface AppInfo {
  id: string;
  name: string;
  vendor: string;
  kind: AppKind;
  detected: boolean;
  /** Paths (home-relative) whose existence proved the app is installed. */
  evidence: string[];
  readable: Readable;
  /** Plain-language caveat shown to the user, e.g. "connectors live in your account". */
  note?: string;
  /** Where a user-level skill folder goes for this app, if it has one. */
  userSkillDir?: string;
  /** Template for connecting an MCP server to this app (see collectors/lib/apps.ts). */
  mcpAdd?: McpAddStyle;
  counts: { skills: number; mcp: number; packages: number };
  /** Where this app looks for skills inside a project, e.g. `./.claude/skills`. */
  projectSkillDir?: string;
  /** True when the installed app's own icon can be served from /api/app-icon. */
  hasIcon: boolean;
}

export type McpAddStyle =
  | { kind: 'cli'; tool: 'claude' | 'codex' }
  | { kind: 'json'; file: string; key: string }
  | { kind: 'toml'; file: string; key: string };

export interface AppsSlice {
  items: AppInfo[];
}

export interface SkillItem {
  /** Unique per (app, path). */
  id: string;
  /** Identity across apps: same name + same description = same skill. */
  key: string;
  name: string;
  description: string;
  app: string;
  scope: Scope;
  origin: Origin;
  /** Display path, `~/…` or `./…`. Never an absolute machine path. */
  path: string;
  /** For a project-scoped skill: the folder name of the project it lives in. */
  project?: string;
  /** Topic tags worked out from the name and description (see shared/tags.ts). */
  tags: string[];
  /** False when the skill sets `disable-model-invocation: true` (manual-only). */
  modelInvocable: boolean;
  descriptionChars: number;
  /** Rough always-on cost of the name + description, chars / 4. */
  estTokens: number;
  usageCount?: number;
  lastUsedAt?: string;
}

/** A project folder the user's apps remember. Skills can be added to it or removed from it. */
export interface ProjectInfo {
  /** Display path (`.` for the inspected project, `~/…` otherwise). Also how actions refer to it. */
  id: string;
  name: string;
  current: boolean;
  /** Distinct skills that live inside it. */
  skills: number;
}

export interface SkillsSlice {
  items: SkillItem[];
  projects: ProjectInfo[];
}

export type McpTransport = 'stdio' | 'http' | 'sse' | 'unknown';

export interface McpServer {
  id: string;
  /** Identity across apps: same endpoint or same launch command = same server. */
  key: string;
  name: string;
  app: string;
  scope: Scope;
  origin: Origin;
  transport: McpTransport;
  /** Redacted launch command for stdio servers. */
  command?: string;
  /** Redacted URL (no credentials, no query string) for remote servers. */
  url?: string;
  /** Names only. Values never leave the collector. */
  envNames: string[];
  headerNames: string[];
  enabled: boolean;
  /** Display path of the config file that declares it. */
  source: string;
}

export interface McpSlice {
  servers: McpServer[];
}

export interface PackageItem {
  id: string;
  name: string;
  app: string;
  scope: Scope;
  type: 'plugin' | 'extension' | 'package';
  marketplace?: string;
  version?: string;
  enabled: boolean;
  skillCount: number;
  mcpCount: number;
  usageCount?: number;
  lastUsedAt?: string;
}

export interface PackagesSlice {
  items: PackageItem[];
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Everything the model processed, cached tokens included. */
  total: number;
}

export interface UsageSource {
  app: string;
  /** ok = numbers were read; not-recorded = the app keeps no usage on disk. */
  status: 'ok' | 'not-recorded' | 'unavailable';
  note?: string;
  sessions: number;
  totals: TokenCounts;
  /** API-equivalent cost when the app records one. Not a bill. */
  costUSD?: number;
  firstDay?: string;
  lastDay?: string;
}

export interface UsageDay extends TokenCounts {
  day: string;
  app: string;
}

export interface UsageModel extends TokenCounts {
  app: string;
  model: string;
  messages: number;
}

export interface UsageProject {
  app: string;
  project: string;
  total: number;
  sessions: number;
}

export interface UsageLimit {
  app: string;
  label: string;
  usedPercent: number;
  windowMinutes?: number;
  resetsAt?: string;
  observedAt?: string;
  /** True when the window has rolled over since the reading, so the percentage is history, not current. */
  stale: boolean;
  /** Where the number came from, in plain words. */
  source: string;
}

export interface UsageCounter {
  app: string;
  kind: 'skill' | 'plugin';
  name: string;
  count: number;
  lastUsedAt?: string;
}

export interface UsageSlice {
  sources: UsageSource[];
  daily: UsageDay[];
  models: UsageModel[];
  projects: UsageProject[];
  limits: UsageLimit[];
  counters: UsageCounter[];
}

export interface SnapshotSlices {
  apps: AppsSlice;
  skills: SkillsSlice;
  mcp: McpSlice;
  packages: PackagesSlice;
  usage: UsageSlice;
  [sliceId: string]: unknown;
}

export interface HarnessSnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  /** Display form of the inspected project, never an absolute machine path in fixtures. */
  projectRoot: string;
  activeHarness: string;
  warnings: string[];
  slices: SnapshotSlices;
}

export const EMPTY_TOKENS: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

/** A cross-app finding the assistant tab shows, computed locally from the snapshot. */
export interface Insight {
  id: string;
  kind: 'sync-skill' | 'sync-mcp' | 'unused' | 'cost' | 'info';
  title: string;
  detail: string;
  /** The same fix as commands to copy and run by hand. */
  commands: string[];
  /** The same fix as actions the dashboard can carry out after the user confirms. */
  actions: ActionRequest[];
}

export interface DiscoverResult {
  id: string;
  type: 'mcp' | 'skill' | 'package';
  name: string;
  description: string;
  /** Registry the entry came from. */
  registry: string;
  sourceUrl: string;
  /** Popularity signal when the registry reports one. */
  installs?: number;
  /** Topic tags (see shared/tags.ts). */
  tags: string[];
  /** Who publishes it, e.g. the GitHub owner/repo. */
  owner?: string;
  installed: boolean;
  /** Copyable install commands, labelled by app. */
  commands: { label: string; command: string }[];
  /** What the Install button sends back, minus the target app. Absent when only a manual install exists. */
  install?:
    | { type: 'registry.skill'; source: string; skill: string }
    | { type: 'registry.mcp'; name: string; url?: string; registryType?: 'npm' | 'pypi'; identifier?: string };
  /** ISO date the registry was queried. */
  checkedAt: string;
}

export interface AssistantReply {
  provider: 'gemini' | 'local';
  model?: string;
  summary: string;
  steps: { title: string; detail: string; command?: string }[];
  /** Search phrases worth trying in Discover. */
  searches: string[];
  note?: string;
}

// ---------------------------------------------------------------------------------------------
// Actions: the only changes the dashboard can make, each one confirmed by the user first.
// A request names items by snapshot id. The server works out paths and commands itself.

export type ActionRequest =
  | { type: 'skill.connect'; skillId: string; app: string }
  | { type: 'skill.disconnect'; skillId: string }
  | { type: 'skill.project.add'; skillId: string; project: string; app: string }
  | { type: 'mcp.connect'; serverId: string; app: string; copyCredentials?: boolean }
  | { type: 'mcp.disconnect'; serverId: string }
  | { type: 'registry.skill'; source: string; skill: string; app: string }
  | { type: 'registry.mcp'; name: string; app: string; url?: string; registryType?: 'npm' | 'pypi'; identifier?: string };

export interface PlannedStep {
  request: ActionRequest;
  /** The app the step is about, for showing its logo. */
  app?: string;
  /** False when the step cannot be done; `reason` says why. */
  ok: boolean;
  title: string;
  /** The exact file that changes or command that runs. */
  detail: string;
  warnings: string[];
  reason?: string;
  /** What to do by hand when the step is refused. Never contains a credential. */
  manual?: string;
}

export interface StepResult {
  title: string;
  ok: boolean;
  message: string;
}

/** A row of skill cards on the Explore page. */
export interface SuggestionRail {
  id: string;
  title: string;
  /** Why these are shown, in a few words. */
  reason: string;
  items: DiscoverResult[];
}

export interface Suggestions {
  /** Tag ids the user's own skills lean toward, strongest first. */
  interests: string[];
  rails: SuggestionRail[];
  errors: string[];
}

/** How the map is filtered and ordered. Set by the controls, or by the assistant on request. */
export interface MapView {
  kind: 'all' | 'skills' | 'servers';
  shared: boolean;
  /** Show skills that live inside projects. */
  projects: boolean;
  /** Show the grouped skills that came with plugins and apps. */
  bundles: boolean;
  sort: 'default' | 'name' | 'usage' | 'shared';
  /** Only what this app is connected to. Empty for all apps. */
  app: string;
  query: string;
}

export const DEFAULT_MAP_VIEW: MapView = { kind: 'all', shared: false, projects: true, bundles: true, sort: 'default', app: '', query: '' };

/** What the assistant sends back for a request typed on the map. Nothing in it has been done yet. */
export interface CommandReply {
  provider: 'gemini' | 'local';
  text: string;
  /** Changes the assistant proposes, already checked by the server. The user still confirms them. */
  proposals: PlannedStep[];
  /** A new way to look at the map, if the request was about that. */
  view?: Partial<MapView>;
  /** Skills found in the registry for the request. */
  found: DiscoverResult[];
}
