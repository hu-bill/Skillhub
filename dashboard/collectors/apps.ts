// Slice `apps`: which AI apps are installed on this machine and how much of each can be read locally.

import type { AppsSlice } from '../shared/schema.ts';
import type { Collector } from './lib/context.ts';
import { getInventory } from './lib/inventory.ts';

const collector: Collector<AppsSlice> = {
  id: 'apps',
  async collect(ctx) {
    const inventory = await getInventory(ctx);
    // Inventory-wide parse warnings are reported once, here.
    return { data: { items: inventory.apps }, warnings: inventory.warnings };
  },
};

export default collector;
