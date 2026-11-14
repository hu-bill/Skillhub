// Spine: the collection context and the small fs helpers every collector shares.
// Collectors only ever read. Nothing in this lane writes to a harness directory.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface CollectContext {
  /** The user's home directory. Tests point this at a fixture tree. */
  home: string;
  /** The project being inspected. */
  projectRoot: string;
  platform: NodeJS.Platform;
  now: Date;
  /** Where desktop apps are installed. Defaults to the platform's location; tests point it at a fixture. */
  appsDir?: string;
  /** Where collectors may keep derived caches. Never a harness directory. */
  cacheDir?: string;
}

export interface CollectResult<T> {
  data: T;
  warnings: string[];
}

export interface Collector<T = unknown> {
  id: string;
  collect(ctx: CollectContext): Promise<CollectResult<T>>;
}

/** Per-user application data directory for a desktop app. */
export function appDataDir(ctx: CollectContext): string {
  if (ctx.platform === 'darwin') return path.join(ctx.home, 'Library', 'Application Support');
  if (ctx.platform === 'win32') return path.join(ctx.home, 'AppData', 'Roaming');
  return path.join(ctx.home, '.config');
}

function defaultAppsDir(ctx: CollectContext): string {
  if (ctx.platform === 'darwin') return '/Applications';
  if (ctx.platform === 'win32') return path.join(ctx.home, 'AppData', 'Local', 'Programs');
  return '/opt';
}

/**
 * Expand a path template:
 *   `~/x`        under the home directory
 *   `./x`        under the inspected project
 *   `{appdata}/x` under the platform's application-data directory
 *   `{apps}/x`   under the directory desktop apps are installed in
 *   anything else is taken as absolute.
 */
export function expand(ctx: CollectContext, template: string): string {
  if (template.startsWith('~/')) return path.join(ctx.home, template.slice(2));
  if (template === '~') return ctx.home;
  if (template.startsWith('./')) return path.join(ctx.projectRoot, template.slice(2));
  if (template.startsWith('{appdata}/')) return path.join(appDataDir(ctx), template.slice('{appdata}/'.length));
  if (template.startsWith('{apps}/')) return path.join(ctx.appsDir ?? defaultAppsDir(ctx), template.slice('{apps}/'.length));
  return template;
}

/** Turn an absolute path into the form shown in the UI: `./…` for the project, `~/…` for home. */
export function display(ctx: CollectContext, absolute: string): string {
  const inProject = path.relative(ctx.projectRoot, absolute);
  if (inProject === '') return '.';
  if (!inProject.startsWith('..') && !path.isAbsolute(inProject)) return `./${inProject.split(path.sep).join('/')}`;
  const inHome = path.relative(ctx.home, absolute);
  if (inHome === '') return '~';
  if (!inHome.startsWith('..') && !path.isAbsolute(inHome)) return `~/${inHome.split(path.sep).join('/')}`;
  // An overridden apps directory (tests) is shown as the standard one, so no temporary path leaks out.
  if (ctx.appsDir) {
    const inApps = path.relative(ctx.appsDir, absolute);
    if (!inApps.startsWith('..') && !path.isAbsolute(inApps)) return `/Applications/${inApps.split(path.sep).join('/')}`;
  }
  return absolute;
}

export async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function readText(target: string): Promise<string | undefined> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return undefined;
  }
}

/** Strip `//` and block comments and trailing commas so editor-style JSON (JSONC) parses. */
export function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export type JsonRead =
  | { status: 'ok'; value: unknown }
  | { status: 'missing' }
  | { status: 'empty' }
  | { status: 'invalid'; message: string };

export async function readJson(target: string): Promise<JsonRead> {
  const text = await readText(target);
  if (text === undefined) return { status: 'missing' };
  if (text.trim() === '') return { status: 'empty' };
  try {
    return { status: 'ok', value: JSON.parse(text) };
  } catch {
    try {
      return { status: 'ok', value: JSON.parse(stripJsonComments(text)) };
    } catch (error) {
      return { status: 'invalid', message: error instanceof Error ? error.message : String(error) };
    }
  }
}

export async function listDir(target: string): Promise<string[]> {
  try {
    return (await fs.readdir(target)).sort();
  } catch {
    return [];
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Small, stable, non-cryptographic hash for identity keys. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
