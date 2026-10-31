// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { NewsSeed } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import { SEED_DAYS_KEPT, loadSeeds, saveSeedsForDay, seedsFile, seedsOnOrBefore } from './seed-store.js';

const SEED: NewsSeed = {
  id: 'grain-shortage',
  headlineIds: ['h0a1b2c3d'],
  kind: 'shortage',
  tone: 'wry',
  premise: 'A staple runs short and everyone suspects the middlemen.',
};

describe('loadSeeds and saveSeedsForDay', () => {
  it('has no seeds before anything is saved, and returns what was saved', async () => {
    const fs = memoryFs();

    expect(await loadSeeds('dir', fs)).toEqual({});
    await saveSeedsForDay('dir', '2026-10-31', [SEED], fs);

    expect(await loadSeeds('dir', fs)).toEqual({ '2026-10-31': [SEED] });
  });

  it('keeps the other days, and replaces a day saved again', async () => {
    const fs = memoryFs();
    await saveSeedsForDay('dir', '2026-10-30', [SEED], fs);
    await saveSeedsForDay('dir', '2026-10-31', [SEED], fs);
    await saveSeedsForDay('dir', '2026-10-31', [{ ...SEED, id: 'other-seed' }], fs);

    const days = await loadSeeds('dir', fs);

    expect(Object.keys(days)).toEqual(['2026-10-30', '2026-10-31']);
    expect(days['2026-10-31']?.[0]?.id).toBe('other-seed');
  });

  it('drops the oldest days beyond the limit', async () => {
    const fs = memoryFs();
    for (let day = 1; day <= SEED_DAYS_KEPT + 2; day += 1) {
      await saveSeedsForDay('dir', `2026-09-${String(day).padStart(2, '0')}`, [SEED], fs);
    }

    const keys = Object.keys(await loadSeeds('dir', fs));

    expect(keys).toHaveLength(SEED_DAYS_KEPT);
    expect(keys[0]).toBe('2026-09-03');
  });

  it('counts a file that cannot be used as no seeds', async () => {
    const fs = memoryFs();
    fs.files.set(seedsFile('dir'), '{ not json');
    expect(await loadSeeds('dir', fs)).toEqual({});

    fs.files.set(seedsFile('dir'), JSON.stringify({ schemaVersion: 1, days: { '2026-10-31': [{ id: 1 }] } }));
    expect(await loadSeeds('dir', fs)).toEqual({});

    fs.failRead(seedsFile('dir'));
    expect(await loadSeeds('dir', fs)).toEqual({});
  });

  it('writes a file that holds only the day', async () => {
    const fs = memoryFs();
    await saveSeedsForDay('dir', '2026-10-31', [SEED], fs);

    expect(JSON.parse(fs.files.get(seedsFile('dir')) ?? '')).toEqual({
      schemaVersion: 1,
      days: { '2026-10-31': [SEED] },
    });
  });
});

describe('seedsOnOrBefore', () => {
  const days = { '2026-10-29': [SEED], '2026-10-31': [{ ...SEED, id: 'newer' }] };

  it('takes the day itself, else the latest day before it, else nothing', () => {
    expect(seedsOnOrBefore(days, '2026-10-31')?.day).toBe('2026-10-31');
    expect(seedsOnOrBefore(days, '2026-10-30')?.day).toBe('2026-10-29');
    expect(seedsOnOrBefore(days, '2026-10-28')).toBeUndefined();
    expect(seedsOnOrBefore({}, '2026-10-31')).toBeUndefined();
  });
});
