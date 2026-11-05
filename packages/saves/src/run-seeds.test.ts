// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { type NewsSeed } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import { RUN_SEEDS_FILE, loadRunSeeds, runSeedsFile, saveRunSeeds } from './run-seeds.js';
import { runFiles } from './run-store.js';

const SEED: NewsSeed = {
  id: 'grain-shortage',
  headlineIds: ['h0a1b2c3d'],
  kind: 'shortage',
  tone: 'wry',
  premise: 'A staple runs short and everyone suspects the middlemen.',
};
const ENTRY = { day: '2026-10-31', seeds: [SEED], realNames: ['norway', 'норвегия'] };
const RUN_ID = '2026-11-05-1200-abc';

describe('the seeds a run keeps', () => {
  it('lives in the folder of the run, under its own name', () => {
    expect(runSeedsFile('dir', RUN_ID)).toBe(join(runFiles('dir', RUN_ID).directory, RUN_SEEDS_FILE));
  });

  it('returns what was saved: the day, the seeds and the real names', async () => {
    const fs = memoryFs();

    await saveRunSeeds('dir', RUN_ID, ENTRY, fs);

    expect(await loadRunSeeds('dir', RUN_ID, fs)).toEqual({ schemaVersion: 1, ...ENTRY });
  });

  it('keeps the seeds of each run apart, and replaces a run saved again', async () => {
    const fs = memoryFs();
    await saveRunSeeds('dir', RUN_ID, ENTRY, fs);
    await saveRunSeeds('dir', 'other-run', { ...ENTRY, day: '2026-10-30' }, fs);
    await saveRunSeeds('dir', RUN_ID, { ...ENTRY, realNames: [] }, fs);

    expect((await loadRunSeeds('dir', RUN_ID, fs))?.realNames).toEqual([]);
    expect((await loadRunSeeds('dir', 'other-run', fs))?.day).toBe('2026-10-30');
  });

  it('has nothing for a run made before they were kept, and for one that was made with no seeds', async () => {
    expect(await loadRunSeeds('dir', RUN_ID, memoryFs())).toBeUndefined();
  });

  it('counts a file that cannot be used as no seeds: the run does not need them', async () => {
    const fs = memoryFs();
    fs.files.set(runSeedsFile('dir', RUN_ID), '{ not json');
    expect(await loadRunSeeds('dir', RUN_ID, fs)).toBeUndefined();

    fs.files.set(
      runSeedsFile('dir', RUN_ID),
      JSON.stringify({ schemaVersion: 1, day: 'today', seeds: [], realNames: [] }),
    );
    expect(await loadRunSeeds('dir', RUN_ID, fs)).toBeUndefined();

    fs.files.set(runSeedsFile('dir', RUN_ID), JSON.stringify({ schemaVersion: 2, ...ENTRY }));
    expect(await loadRunSeeds('dir', RUN_ID, fs)).toBeUndefined();

    fs.failRead(runSeedsFile('dir', RUN_ID));
    expect(await loadRunSeeds('dir', RUN_ID, fs)).toBeUndefined();
  });

  it('refuses to write seeds that are not seeds', async () => {
    await expect(saveRunSeeds('dir', RUN_ID, { ...ENTRY, day: 'yesterday' }, memoryFs())).rejects.toThrow();
  });
});
