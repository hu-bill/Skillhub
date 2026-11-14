// Slice `usage`: how many tokens each app has processed and, where the app records it, how much of a
// rate-limit window is left. Only numbers, model names, dates and project folder names are read out of
// session logs. Message text is never parsed into the snapshot.

import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  EMPTY_TOKENS,
  type TokenCounts,
  type UsageCounter,
  type UsageDay,
  type UsageLimit,
  type UsageModel,
  type UsageProject,
  type UsageSlice,
  type UsageSource,
} from '../shared/schema.ts';
import { asRecord, asString, exists, expand, listDir, readJson, type CollectContext, type Collector } from './lib/context.ts';

// ---------------------------------------------------------------------------------------------
// Shared helpers

function add(target: TokenCounts, source: TokenCounts): void {
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.total += source.total;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function dayOf(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

async function walkFiles(root: string, match: (file: string) => boolean, maxDepth = 6): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) await walk(child, depth + 1);
      } else if (match(entry.name)) {
        out.push(child);
      }
    }
  }
  await walk(root, 1);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Claude Code: one JSONL transcript per session under ~/.claude/projects

interface Bucket extends TokenCounts {
  day: string;
  model: string;
  messages: number;
}

interface FileSummary {
  size: number;
  mtimeMs: number;
  project: string;
  buckets: Bucket[];
  costUSD: number;
}

const CACHE_VERSION = 2;
const memoryCache = new Map<string, FileSummary>();
let diskCacheLoaded = false;

async function loadDiskCache(ctx: CollectContext): Promise<void> {
  if (diskCacheLoaded || !ctx.cacheDir) return;
  diskCacheLoaded = true;
  const read = await readJson(path.join(ctx.cacheDir, 'claude-usage.json'));
  if (read.status !== 'ok') return;
  const root = asRecord(read.value);
  if (root.version !== CACHE_VERSION) return;
  for (const [file, summary] of Object.entries(asRecord(root.files))) memoryCache.set(file, summary as FileSummary);
}

async function saveDiskCache(ctx: CollectContext, files: string[]): Promise<void> {
  if (!ctx.cacheDir) return;
  const kept: Record<string, FileSummary> = {};
  for (const file of files) {
    const summary = memoryCache.get(file);
    if (summary) kept[file] = summary;
  }
  try {
    await fs.mkdir(ctx.cacheDir, { recursive: true });
    await fs.writeFile(path.join(ctx.cacheDir, 'claude-usage.json'), JSON.stringify({ version: CACHE_VERSION, files: kept }));
  } catch {
    /* the cache is an optimisation; ignore write failures */
  }
}

/** Read one transcript. Each API response is logged once per content block, so dedupe on its ids. */
async function summarizeTranscript(file: string, size: number, mtimeMs: number): Promise<FileSummary> {
  const buckets = new Map<string, Bucket>();
  const seen = new Set<string>();
  let project = '';
  let costUSD = 0;

  const lines = readline.createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    const isUsage = line.includes('"usage"') && line.includes('"assistant"');
    const isCost = line.includes('"cost-state"');
    if (!isUsage && !isCost) continue;
    let entry: Record<string, unknown>;
    try {
      entry = asRecord(JSON.parse(line));
    } catch {
      continue;
    }
    if (entry.type === 'cost-state') {
      // Cumulative for the session, so the last one wins.
      costUSD = num(entry.totalCostUSD);
      continue;
    }
    if (entry.type !== 'assistant') continue;
    const message = asRecord(entry.message);
    const usage = asRecord(message.usage);
    if (!message.usage) continue;
    const dedupeKey = `${asString(message.id) ?? ''}:${asString(entry.requestId) ?? ''}`;
    if (dedupeKey !== ':') {
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
    }
    const model = asString(message.model) ?? 'unknown';
    if (model === '<synthetic>') continue;
    const day = dayOf(asString(entry.timestamp));
    if (!day) continue;
    if (!project) project = path.basename(asString(entry.cwd) ?? '');

    const input = num(usage.input_tokens);
    const output = num(usage.output_tokens);
    const cacheRead = num(usage.cache_read_input_tokens);
    const cacheWrite = num(usage.cache_creation_input_tokens);
    const key = `${day}|${model}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { day, model, messages: 0, ...EMPTY_TOKENS };
      buckets.set(key, bucket);
    }
    bucket.messages += 1;
    add(bucket, { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite });
  }
  return { size, mtimeMs, project, buckets: [...buckets.values()], costUSD };
}

interface AppUsage {
  source: UsageSource;
  daily: UsageDay[];
  models: UsageModel[];
  projects: UsageProject[];
}

async function collectClaudeCode(ctx: CollectContext, warnings: string[]): Promise<AppUsage | undefined> {
  const root = expand(ctx, '~/.claude/projects');
  if (!(await exists(root))) return undefined;
  await loadDiskCache(ctx);

  const files = await walkFiles(root, (name) => name.endsWith('.jsonl'));
  const totals: TokenCounts = { ...EMPTY_TOKENS };
  const daily = new Map<string, UsageDay>();
  const models = new Map<string, UsageModel>();
  const projects = new Map<string, UsageProject>();
  let costUSD = 0;
  let sessions = 0;
  let dirty = false;
  let failed = 0;

  for (const file of files) {
    let stat: import('node:fs').Stats;
    try {
      stat = await fs.stat(file);
    } catch {
      continue;
    }
    let summary = memoryCache.get(file);
    if (!summary || summary.size !== stat.size || summary.mtimeMs !== stat.mtimeMs) {
      try {
        summary = await summarizeTranscript(file, stat.size, stat.mtimeMs);
        memoryCache.set(file, summary);
        dirty = true;
      } catch {
        failed += 1;
        continue;
      }
    }
    if (summary.buckets.length === 0) continue;
    sessions += 1;
    costUSD += summary.costUSD;
    let fileTotal = 0;
    for (const bucket of summary.buckets) {
      add(totals, bucket);
      fileTotal += bucket.total;
      let day = daily.get(bucket.day);
      if (!day) {
        day = { day: bucket.day, app: 'claude-code', ...EMPTY_TOKENS };
        daily.set(bucket.day, day);
      }
      add(day, bucket);
      let model = models.get(bucket.model);
      if (!model) {
        model = { app: 'claude-code', model: bucket.model, messages: 0, ...EMPTY_TOKENS };
        models.set(bucket.model, model);
      }
      model.messages += bucket.messages;
      add(model, bucket);
    }
    const projectName = summary.project || 'unknown';
    const project = projects.get(projectName) ?? { app: 'claude-code', project: projectName, total: 0, sessions: 0 };
    project.total += fileTotal;
    project.sessions += 1;
    projects.set(projectName, project);
  }

  if (dirty) await saveDiskCache(ctx, files);
  if (failed > 0) warnings.push(`Skipped ${failed} unreadable Claude Code transcript(s) while adding up usage.`);

  const days = [...daily.keys()].sort();
  return {
    source: {
      app: 'claude-code',
      status: 'ok',
      note: 'Added up from session transcripts on this machine. Sessions resumed into a new file can be counted twice, so treat totals as an estimate.',
      sessions,
      totals,
      costUSD: costUSD > 0 ? Math.round(costUSD * 100) / 100 : undefined,
      firstDay: days[0],
      lastDay: days[days.length - 1],
    },
    daily: [...daily.values()],
    models: [...models.values()],
    projects: [...projects.values()],
  };
}

// ---------------------------------------------------------------------------------------------
// Codex: per-thread totals in a SQLite index, rate limits in the newest rollout file

interface SqliteDatabase {
  prepare(sql: string): { all(): Record<string, unknown>[] };
  close(): void;
}

async function openReadOnly(file: string): Promise<SqliteDatabase | undefined> {
  try {
    const sqlite = (await import('node:sqlite')) as unknown as {
      DatabaseSync: new (file: string, options: { readOnly: boolean }) => SqliteDatabase;
    };
    return new sqlite.DatabaseSync(file, { readOnly: true });
  } catch {
    return undefined;
  }
}

async function collectCodex(ctx: CollectContext, warnings: string[]): Promise<AppUsage | undefined> {
  const home = expand(ctx, '~/.codex');
  if (!(await exists(home))) return undefined;
  const dbFile = (await listDir(home))
    .filter((name) => /^state_\d+\.sqlite$/.test(name))
    .sort()
    .pop();
  const empty: AppUsage = {
    source: { app: 'codex', status: 'unavailable', sessions: 0, totals: { ...EMPTY_TOKENS } },
    daily: [],
    models: [],
    projects: [],
  };
  if (!dbFile) {
    empty.source.note = 'No Codex thread index was found on this machine.';
    return empty;
  }
  const db = await openReadOnly(path.join(home, dbFile));
  if (!db) {
    empty.source.note = 'Reading Codex usage needs Node 22.13 or newer (built-in SQLite).';
    return empty;
  }

  const totals: TokenCounts = { ...EMPTY_TOKENS };
  const daily = new Map<string, UsageDay>();
  const models = new Map<string, UsageModel>();
  const projects = new Map<string, UsageProject>();
  let sessions = 0;
  try {
    const rows = db.prepare('SELECT tokens_used, model, cwd, created_at FROM threads WHERE tokens_used > 0').all();
    for (const row of rows) {
      const total = num(row.tokens_used);
      const day = dayOf(num(row.created_at) * 1000);
      if (!day || total <= 0) continue;
      sessions += 1;
      // Codex stores one combined figure per thread, so only `total` is known.
      const counts: TokenCounts = { ...EMPTY_TOKENS, total };
      add(totals, counts);
      const dayEntry = daily.get(day) ?? { day, app: 'codex', ...EMPTY_TOKENS };
      add(dayEntry, counts);
      daily.set(day, dayEntry);
      const modelName = asString(row.model) ?? 'unknown';
      const model = models.get(modelName) ?? { app: 'codex', model: modelName, messages: 0, ...EMPTY_TOKENS };
      model.messages += 1;
      add(model, counts);
      models.set(modelName, model);
      const projectName = path.basename(asString(row.cwd) ?? '') || 'unknown';
      const project = projects.get(projectName) ?? { app: 'codex', project: projectName, total: 0, sessions: 0 };
      project.total += total;
      project.sessions += 1;
      projects.set(projectName, project);
    }
  } catch (error) {
    warnings.push(`Could not read Codex usage: ${error instanceof Error ? error.message : String(error)}`);
    empty.source.note = 'The Codex thread index could not be read.';
    return empty;
  } finally {
    db.close();
  }

  const days = [...daily.keys()].sort();
  return {
    source: {
      app: 'codex',
      status: 'ok',
      note: 'Per-thread totals from Codex’s local index. Codex stores one combined number per thread, so there is no input/output split.',
      sessions,
      totals,
      firstDay: days[0],
      lastDay: days[days.length - 1],
    },
    daily: [...daily.values()],
    models: [...models.values()],
    projects: [...projects.values()],
  };
}

async function readRollout(file: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(file);
    if (!file.endsWith('.zst')) return raw.toString('utf8');
    const zlib = (await import('node:zlib')) as unknown as { zstdDecompressSync?: (data: Buffer) => Buffer };
    return zlib.zstdDecompressSync ? zlib.zstdDecompressSync(raw).toString('utf8') : undefined;
  } catch {
    return undefined;
  }
}

/** Codex writes its rate-limit snapshot into every `token_count` event; the newest one is current. */
async function collectCodexLimits(ctx: CollectContext): Promise<UsageLimit[]> {
  const root = expand(ctx, '~/.codex/sessions');
  const files = await walkFiles(root, (name) => name.startsWith('rollout-') && (name.endsWith('.jsonl') || name.endsWith('.jsonl.zst')));
  if (files.length === 0) return [];
  const newest = files.sort().slice(-3).reverse();
  for (const file of newest) {
    const text = await readRollout(file);
    if (!text) continue;
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (!lines[i].includes('"rate_limits"')) continue;
      let event: Record<string, unknown>;
      try {
        event = asRecord(JSON.parse(lines[i]));
      } catch {
        continue;
      }
      const limits = asRecord(asRecord(event.payload).rate_limits);
      const observedAt = asString(event.timestamp);
      const out: UsageLimit[] = [];
      for (const [slot, fallback] of [
        ['primary', 'Short window'],
        ['secondary', 'Weekly window'],
      ] as const) {
        const window = asRecord(limits[slot]);
        if (typeof window.used_percent !== 'number') continue;
        const minutes = num(window.window_minutes);
        out.push({
          app: 'codex',
          label: minutes ? windowLabel(minutes) : fallback,
          usedPercent: window.used_percent,
          windowMinutes: minutes || undefined,
          resetsAt: typeof window.resets_at === 'number' ? new Date(window.resets_at * 1000).toISOString() : undefined,
          observedAt,
          stale: false,
          source: 'Last rate-limit reading Codex saved in a session log',
        });
      }
      if (out.length > 0) return out;
    }
  }
  return [];
}

/** A reading is history once its window has reset, or once a full window has passed since it was taken. */
function isStale(limit: UsageLimit, now: Date): boolean {
  if (limit.resetsAt && new Date(limit.resetsAt).getTime() <= now.getTime()) return true;
  if (limit.observedAt && limit.windowMinutes) {
    return new Date(limit.observedAt).getTime() + limit.windowMinutes * 60_000 <= now.getTime();
  }
  return false;
}

function windowLabel(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}-day window`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour window`;
  return `${minutes}-minute window`;
}

// ---------------------------------------------------------------------------------------------
// Claude plan: the desktop app samples plan usage into a small history file

async function collectClaudePlanLimits(ctx: CollectContext): Promise<UsageLimit[]> {
  const read = await readJson(expand(ctx, '{appdata}/Claude/plan-usage-history.json'));
  if (read.status !== 'ok') return [];
  const samples = asRecord(read.value).samples;
  if (!Array.isArray(samples) || samples.length === 0) return [];
  // Key names are undocumented; `fh` and `sd` are read as the five-hour and seven-day windows.
  const labels: Record<string, { label: string; minutes: number }> = {
    fh: { label: '5-hour window', minutes: 300 },
    sd: { label: '7-day window', minutes: 10080 },
  };
  const out: UsageLimit[] = [];
  for (const [key, meta] of Object.entries(labels)) {
    for (let i = samples.length - 1; i >= 0; i -= 1) {
      const sample = asRecord(samples[i]);
      const value = asRecord(sample.u)[key];
      if (typeof value !== 'number') continue;
      out.push({
        app: 'claude-desktop',
        label: meta.label,
        usedPercent: value,
        windowMinutes: meta.minutes,
        observedAt: typeof sample.t === 'number' ? new Date(sample.t).toISOString() : undefined,
        stale: false,
        source: 'Last plan-usage sample saved by the Claude desktop app (field meaning inferred)',
      });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Skill and plugin invocation counters kept by Claude Code

async function collectCounters(ctx: CollectContext): Promise<UsageCounter[]> {
  const read = await readJson(expand(ctx, '~/.claude.json'));
  if (read.status !== 'ok') return [];
  const root = asRecord(read.value);
  const out: UsageCounter[] = [];
  for (const [kind, map] of [
    ['skill', root.skillUsage],
    ['plugin', root.pluginUsage],
  ] as const) {
    for (const [name, raw] of Object.entries(asRecord(map))) {
      const record = asRecord(raw);
      const count = num(record.usageCount);
      if (count <= 0) continue;
      out.push({
        app: 'claude-code',
        kind,
        name: kind === 'plugin' ? name.split('@')[0] : name,
        count,
        lastUsedAt: typeof record.lastUsedAt === 'number' ? new Date(record.lastUsedAt).toISOString() : undefined,
      });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------------------------

const NOT_RECORDED: { app: string; detect: string; note: string }[] = [
  { app: 'cursor', detect: '~/.cursor', note: 'Cursor keeps token usage on its servers. See cursor.com/dashboard.' },
  {
    app: 'chatgpt',
    detect: '{appdata}/com.openai.chat',
    note: 'ChatGPT keeps usage in your OpenAI account. Nothing is written to local files.',
  },
  { app: 'antigravity', detect: '~/.gemini/antigravity', note: 'Antigravity does not write token counts to readable local files.' },
];

const collector: Collector<UsageSlice> = {
  id: 'usage',
  async collect(ctx) {
    const warnings: string[] = [];
    const slice: UsageSlice = { sources: [], daily: [], models: [], projects: [], limits: [], counters: [] };

    for (const result of await Promise.all([collectClaudeCode(ctx, warnings), collectCodex(ctx, warnings)])) {
      if (!result) continue;
      slice.sources.push(result.source);
      slice.daily.push(...result.daily);
      slice.models.push(...result.models);
      slice.projects.push(...result.projects);
    }
    for (const entry of NOT_RECORDED) {
      if (await exists(expand(ctx, entry.detect))) {
        slice.sources.push({ app: entry.app, status: 'not-recorded', note: entry.note, sessions: 0, totals: { ...EMPTY_TOKENS } });
      }
    }

    slice.limits.push(...(await collectCodexLimits(ctx)), ...(await collectClaudePlanLimits(ctx)));
    for (const limit of slice.limits) limit.stale = isStale(limit, ctx.now);
    slice.counters = await collectCounters(ctx);
    slice.daily.sort((a, b) => a.day.localeCompare(b.day) || a.app.localeCompare(b.app));
    slice.models.sort((a, b) => b.total - a.total);
    slice.projects.sort((a, b) => b.total - a.total);
    return { data: slice, warnings };
  },
};

export default collector;
