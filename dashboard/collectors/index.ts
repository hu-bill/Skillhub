// Spine: assembles the HarnessSnapshot. Collectors are auto-discovered: any `collectors/<slice-id>.ts`
// that default-exports a `Collector` is picked up. Never edit this file to register a slice.

import os from 'node:os';
import path from 'node:path';
import { SCHEMA_VERSION, type HarnessSnapshot, type SnapshotSlices } from '../shared/schema.ts';
import { display, type CollectContext, type Collector } from './lib/context.ts';

const modules = import.meta.glob<{ default?: Collector }>('./*.ts', { eager: true });

export function discoverCollectors(): Collector[] {
  return Object.entries(modules)
    .filter(([file]) => !['./index.ts', './redact.ts'].includes(file))
    .map(([, mod]) => mod.default)
    .filter((collector): collector is Collector => Boolean(collector && typeof collector.collect === 'function'))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function defaultContext(overrides: Partial<CollectContext> = {}): CollectContext {
  return {
    home: os.homedir(),
    projectRoot: path.resolve(process.cwd(), '..'),
    platform: process.platform,
    now: new Date(),
    ...overrides,
  };
}

export async function buildSnapshot(ctx: CollectContext = defaultContext()): Promise<HarnessSnapshot> {
  const warnings: string[] = [];
  const slices: Record<string, unknown> = {};

  await Promise.all(
    discoverCollectors().map(async (collector) => {
      try {
        const result = await collector.collect(ctx);
        slices[collector.id] = result.data;
        warnings.push(...result.warnings);
      } catch (error) {
        // One broken slice must never take the snapshot down.
        slices[collector.id] = {};
        warnings.push(`The ${collector.id} collector failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: ctx.now.toISOString(),
    projectRoot: display(ctx, ctx.projectRoot),
    activeHarness: 'pi',
    warnings: [...new Set(warnings)].sort(),
    slices: slices as SnapshotSlices,
  };
}
