// Keeps fixtures/sample-snapshot.json in step with the collectors.
// `npm run fixture` rewrites it; the normal test run fails if it has drifted.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { buildSnapshot } from '../../collectors/index.ts';
import { createFixtureHome } from '../helpers/fixture-home.ts';

const FILE = path.join(import.meta.dirname, '..', '..', 'fixtures', 'sample-snapshot.json');

it('sample-snapshot.json matches what the collectors produce for the fixture home', async () => {
  const fixture = await createFixtureHome();
  try {
    const snapshot = await buildSnapshot(fixture.ctx);
    const fresh = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (process.env.UPDATE_FIXTURE) {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, fresh);
      return;
    }
    const committed = await fs.readFile(FILE, 'utf8');
    expect(JSON.parse(committed), 'Run `npm run fixture` in dashboard/ and commit the result.').toEqual(JSON.parse(fresh));
  } finally {
    await fixture.cleanup();
  }
});
