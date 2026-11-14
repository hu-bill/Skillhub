// Spine: app logos, read from the apps the user has installed.
// Nothing is bundled with the dashboard: an installed app's own icon file is the source, so the logo
// is always the real one and no third-party artwork lives in this repository. An app that is not
// installed as a bundle (or a platform without .icns files) simply has no icon and gets a monogram.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppDef } from './apps.ts';
import { exists, expand, listDir, readText, type CollectContext } from './context.ts';

/** Resolve the .icns file for an app, or undefined when none is installed. */
export async function findAppIcon(ctx: CollectContext, def: AppDef): Promise<string | undefined> {
  for (const template of def.icons ?? []) {
    const target = expand(ctx, template);
    if (target.endsWith('.icns')) {
      if (await exists(target)) return target;
      continue;
    }
    const resources = path.join(target, 'Contents', 'Resources');
    const files = (await listDir(resources)).filter((name) => name.toLowerCase().endsWith('.icns'));
    if (files.length === 0) continue;
    // The bundle names its own icon in Info.plist; fall back to the usual names.
    const plist = (await readText(path.join(target, 'Contents', 'Info.plist'))) ?? '';
    const declared = /<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1];
    const wanted = declared ? (declared.toLowerCase().endsWith('.icns') ? declared : `${declared}.icns`) : undefined;
    const pick = files.find((name) => name === wanted) ?? files.find((name) => /^(appicon|icon|electron|app)\.icns$/i.test(name));
    if (pick) return path.join(resources, pick);
  }
  return undefined;
}

/** Entry types that hold a PNG, smallest useful size first (128px, then 256px, then larger). */
const PNG_ENTRIES = ['ic07', 'ic13', 'ic08', 'ic14', 'ic09', 'ic12', 'ic10'];

/** Pull one PNG out of an .icns container. It is a simple list of (type, length, data) records. */
export async function readIcnsPng(file: string): Promise<Buffer | undefined> {
  let buffer: Buffer;
  try {
    const stat = await fs.stat(file);
    if (stat.size > 8 * 1024 * 1024) return undefined;
    buffer = await fs.readFile(file);
  } catch {
    return undefined;
  }
  if (buffer.length < 16 || buffer.toString('latin1', 0, 4) !== 'icns') return undefined;
  const found = new Map<string, Buffer>();
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const type = buffer.toString('latin1', offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > buffer.length) break;
    const data = buffer.subarray(offset + 8, offset + length);
    if (data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) found.set(type, data);
    offset += length;
  }
  for (const type of PNG_ENTRIES) {
    const data = found.get(type);
    if (data) return data;
  }
  return undefined;
}
