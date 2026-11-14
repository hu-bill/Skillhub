// The dashboard's local HTTP API, mounted under /api by the Vite plugin in vite.config.ts.
// Reading is open to this machine. The two /actions routes change things and need the write token.

import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { buildSnapshot, defaultContext } from '../collectors/index.ts';
import { appDef } from '../collectors/lib/apps.ts';
import { findAppIcon, readIcnsPng } from '../collectors/lib/icons.ts';
import type { HarnessSnapshot } from '../shared/schema.ts';
import { applyActions, defaultRunner, parseRequests, planActions, skillInstallTargets } from './actions.ts';
import { runCommand } from './command.ts';
import { discover } from './discover.ts';
import { askGemini, DEFAULT_GEMINI_MODEL, localReply } from './gemini.ts';
import { suggest } from './suggest.ts';

export interface ApiConfig {
  /** Serve the bundled fixture instead of scanning this machine. */
  demo: boolean;
  dashboardDir: string;
  projectRoot: string;
  geminiApiKey?: string;
  geminiModel?: string;
  /** Random per server start. Write requests must echo it, which a page on another origin cannot read. */
  writeToken: string;
}

const SNAPSHOT_TTL_MS = 5000;
let cached: { at: number; snapshot: HarnessSnapshot } | undefined;

async function getSnapshot(config: ApiConfig, refresh = false): Promise<HarnessSnapshot> {
  if (config.demo) {
    return JSON.parse(await fs.readFile(path.join(config.dashboardDir, 'fixtures', 'sample-snapshot.json'), 'utf8')) as HarnessSnapshot;
  }
  if (!refresh && cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.snapshot;
  const snapshot = await buildSnapshot(contextFor(config));
  cached = { at: Date.now(), snapshot };
  return snapshot;
}

/**
 * Append what was just done to a plain log, so "what changed, and when?" always has an answer.
 * Titles and messages are written by server/actions.ts and never contain a credential.
 */
async function recordActions(file: string, results: { title: string; ok: boolean; message: string }[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const at = new Date().toISOString();
    await fs.appendFile(file, results.map((result) => `${JSON.stringify({ at, ...result })}\n`).join(''), { mode: 0o600 });
  } catch {
    /* the log is a convenience; a failure to write it must not fail the action */
  }
}

function contextFor(config: ApiConfig) {
  return defaultContext({ projectRoot: config.projectRoot, cacheDir: path.join(config.dashboardDir, 'node_modules', '.cache', 'wayfinder') });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 16 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('Request body is too large.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Only a page served from this machine may call the API. */
function isLocalRequest(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export async function handle(req: IncomingMessage, res: ServerResponse, config: ApiConfig): Promise<void> {
  if (!isLocalRequest(req)) return send(res, 403, { error: 'The dashboard API only answers requests from this machine.' });
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;

  if (route === 'GET /snapshot') {
    return send(res, 200, await getSnapshot(config, url.searchParams.has('refresh')));
  }

  if (route === 'GET /status') {
    return send(res, 200, {
      demo: config.demo,
      gemini: Boolean(config.geminiApiKey),
      geminiModel: config.geminiModel ?? DEFAULT_GEMINI_MODEL,
      canWrite: !config.demo,
      writeToken: config.demo ? '' : config.writeToken,
      skillTargets: skillInstallTargets(await getSnapshot(config)),
    });
  }

  if (route === 'POST /actions/plan' || route === 'POST /actions/apply') {
    if (config.demo) return send(res, 403, { error: 'Demo data is read-only.' });
    // Three checks a page on another site cannot pass: a JSON body, a local Origin, and the token.
    if (!(req.headers['content-type'] ?? '').includes('application/json')) return send(res, 415, { error: 'Send JSON.' });
    if (!req.headers.origin || req.headers['x-wayfinder-token'] !== config.writeToken) return send(res, 403, { error: 'This request did not come from the dashboard.' });
    let requests;
    try {
      requests = parseRequests(JSON.parse(await readBody(req, 64 * 1024)));
    } catch {
      return send(res, 400, { error: 'The request body is not valid JSON.' });
    }
    if (requests.length === 0) return send(res, 400, { error: 'Nothing to do.' });
    const ctx = contextFor(config);
    const env = { ctx, run: defaultRunner, backupRoot: path.join(ctx.home, '.wayfinder', 'backups') };
    // Always work from a fresh scan, never from what the browser last saw.
    const snapshot = await getSnapshot(config, true);
    if (route === 'POST /actions/plan') return send(res, 200, { steps: await planActions(requests, snapshot, env) });
    const results = await applyActions(requests, snapshot, env);
    cached = undefined;
    await recordActions(path.join(ctx.home, '.wayfinder', 'actions.log'), results);
    return send(res, 200, { results });
  }

  if (route === 'GET /suggestions') {
    return send(res, 200, await suggest(await getSnapshot(config)));
  }

  if (route === 'GET /app-icon') {
    // The id is matched against the app registry; the path is never taken from the request.
    const def = appDef(url.searchParams.get('id') ?? '');
    const file = def && !config.demo ? await findAppIcon(contextFor(config), def) : undefined;
    const png = file ? await readIcnsPng(file) : undefined;
    if (!png) return send(res, 404, { error: 'No icon for that app.' });
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'private, max-age=86400');
    res.end(png);
    return;
  }

  if (route === 'GET /discover') {
    const query = (url.searchParams.get('q') ?? '').slice(0, 80);
    if (query.trim().length < 2) return send(res, 400, { error: 'Type at least two characters to search.' });
    return send(res, 200, await discover(query, await getSnapshot(config)));
  }

  if (route === 'POST /assistant/command') {
    if (!(req.headers['content-type'] ?? '').includes('application/json')) return send(res, 415, { error: 'Send JSON.' });
    let body: { message?: unknown; history?: unknown };
    try {
      body = JSON.parse(await readBody(req, 32 * 1024)) as typeof body;
    } catch {
      return send(res, 400, { error: 'The request body is not valid JSON.' });
    }
    const message = String(body.message ?? '').trim();
    if (!message) return send(res, 400, { error: 'Type a request first.' });
    const history = (Array.isArray(body.history) ? body.history : [])
      .map((turn) => turn as { role?: unknown; text?: unknown })
      .filter((turn) => (turn.role === 'user' || turn.role === 'assistant') && typeof turn.text === 'string')
      .map((turn) => ({ role: turn.role as 'user' | 'assistant', text: turn.text as string }));
    const ctx = contextFor(config);
    const env = { ctx, run: defaultRunner, backupRoot: path.join(ctx.home, '.wayfinder', 'backups') };
    try {
      // Planning only: this route proposes changes and never applies one.
      return send(res, 200, await runCommand(message, history, await getSnapshot(config, true), env, { apiKey: config.demo ? undefined : config.geminiApiKey, model: config.geminiModel }));
    } catch (error) {
      return send(res, 200, { provider: 'local', text: error instanceof Error ? error.message : 'The assistant could not be reached.', proposals: [], found: [] });
    }
  }

  if (route === 'POST /assistant') {
    // A JSON content type cannot be sent by a plain cross-site form, which keeps other pages from spending the key.
    if (!(req.headers['content-type'] ?? '').includes('application/json')) return send(res, 415, { error: 'Send JSON.' });
    let question = '';
    try {
      question = String((JSON.parse(await readBody(req)) as { question?: unknown }).question ?? '').trim();
    } catch {
      return send(res, 400, { error: 'The request body is not valid JSON.' });
    }
    const snapshot = await getSnapshot(config);
    if (!config.geminiApiKey) return send(res, 200, localReply(snapshot));
    try {
      const reply = await askGemini(question || 'Look at my setup. What should I know, and what would you change first?', snapshot, {
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
      });
      return send(res, 200, reply);
    } catch (error) {
      return send(res, 200, { ...localReply(snapshot), note: `${error instanceof Error ? error.message : 'Gemini could not be reached.'} Showing the built-in analysis instead.` });
    }
  }

  return send(res, 404, { error: 'Unknown API route.' });
}
