// Slice `skills`: every skill each app can load, with scope, origin and always-on cost.

import type { SkillsSlice } from '../shared/schema.ts';
import type { Collector } from './lib/context.ts';
import { getInventory } from './lib/inventory.ts';

const collector: Collector<SkillsSlice> = {
  id: 'skills',
  async collect(ctx) {
    const inventory = await getInventory(ctx);
    return { data: { items: inventory.skills, projects: inventory.projects }, warnings: [] };
  },
};

export default collector;
