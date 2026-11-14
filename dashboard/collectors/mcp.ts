// Slice `mcp`: MCP servers per app and scope. Commands and URLs are redacted in lib/inventory.ts.

import type { McpSlice } from '../shared/schema.ts';
import type { Collector } from './lib/context.ts';
import { getInventory } from './lib/inventory.ts';

const collector: Collector<McpSlice> = {
  id: 'mcp',
  async collect(ctx) {
    const inventory = await getInventory(ctx);
    return { data: { servers: inventory.servers }, warnings: [] };
  },
};

export default collector;
