// Slice `packages`: plugins, extensions and packages per app, with enabled state.

import type { PackagesSlice } from '../shared/schema.ts';
import type { Collector } from './lib/context.ts';
import { getInventory } from './lib/inventory.ts';

const collector: Collector<PackagesSlice> = {
  id: 'packages',
  async collect(ctx) {
    const inventory = await getInventory(ctx);
    return { data: { items: inventory.packages }, warnings: [] };
  },
};

export default collector;
