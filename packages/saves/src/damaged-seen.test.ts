// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import { damagedSeenFile, takeUnseenDamaged } from './damaged-seen.js';
import type { DamagedRun } from './run-store.js';

const DIR = 'saves';
const damaged = (...ids: string[]): DamagedRun[] => ids.map((runId) => ({ runId, reason: 'corrupt' }));

describe('the runs that could not be read, told once', () => {
  it('has nothing to tell where nothing is damaged, and writes nothing', async () => {
    const fs = memoryFs();

    expect(await takeUnseenDamaged(DIR, [], fs)).toEqual([]);
    expect(fs.files.has(damagedSeenFile(DIR))).toBe(false);
  });

  it('tells each damaged run the first time and never again', async () => {
    const fs = memoryFs();

    expect(await takeUnseenDamaged(DIR, damaged('a', 'b'), fs)).toEqual(damaged('a', 'b'));
    expect(await takeUnseenDamaged(DIR, damaged('a', 'b'), fs)).toEqual([]);
  });

  it('tells a run that was damaged since, and only that one', async () => {
    const fs = memoryFs();
    await takeUnseenDamaged(DIR, damaged('a'), fs);

    expect(await takeUnseenDamaged(DIR, damaged('a', 'c'), fs)).toEqual(damaged('c'));
    expect(await takeUnseenDamaged(DIR, damaged('a', 'c'), fs)).toEqual([]);
  });

  it('tells again when the note cannot be read, because it is not a note', async () => {
    const fs = memoryFs();
    fs.files.set(damagedSeenFile(DIR), '{broken');
    expect(await takeUnseenDamaged(DIR, damaged('a'), fs)).toEqual(damaged('a'));

    fs.files.set(damagedSeenFile(DIR), JSON.stringify({ schemaVersion: 2, runIds: ['a'] }));
    expect(await takeUnseenDamaged(DIR, damaged('a'), fs)).toEqual(damaged('a'));
  });

  it('does not fail the call when the note cannot be written', async () => {
    const fs = memoryFs();
    fs.writeFileSynced = () => Promise.reject(new Error('disk full'));

    expect(await takeUnseenDamaged(DIR, damaged('a'), fs)).toEqual(damaged('a'));
  });

  it('never touches the damaged run itself', async () => {
    const fs = memoryFs();
    fs.files.set('saves/runs/a/state.json', '{broken');

    await takeUnseenDamaged(DIR, damaged('a'), fs);

    expect(fs.files.get('saves/runs/a/state.json')).toBe('{broken');
  });
});
