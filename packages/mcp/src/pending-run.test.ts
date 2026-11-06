// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { CRIME_TYPES } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../../saves/test/memory-fs.js';
import {
  clearPending,
  loadPending,
  newPendingRun,
  pendingFile,
  savePending,
  themeOfSeed,
} from './pending-run.js';

const DIR = 'pending-save';

describe('pending run', () => {
  it('picks the same theme for the same seed, from the list, and every theme occurs', () => {
    const themes = new Set(
      Array.from({ length: 400 }, (_, index) => themeOfSeed(`seed-${String(index)}`, CRIME_TYPES)),
    );
    expect([...themes].sort()).toEqual([...CRIME_TYPES].sort());
    expect(themeOfSeed('x', CRIME_TYPES)).toBe(themeOfSeed('x', CRIME_TYPES));
  });

  it('picks from the themes it is given, whichever archetype they are of', () => {
    const storms = ['storm', 'famine'];

    const picked = new Set(
      Array.from({ length: 100 }, (_, index) => themeOfSeed(`seed-${String(index)}`, storms)),
    );

    expect([...picked].sort()).toEqual(['famine', 'storm']);
    expect(themeOfSeed('only', ['one'])).toBe('one');
  });

  it('starts with no theme: the archetype is not known until the hero is made, and the brief takes one', () => {
    expect(newPendingRun('abc', 'ru')).not.toHaveProperty('theme');
  });

  it('starts without a hero and keeps what it saves', async () => {
    const fs = memoryFs();
    const pending = newPendingRun('abc', 'ru');
    expect(pending).toMatchObject({ hero: null, traits: [], locale: 'ru', schemaVersion: 1 });
    await savePending(DIR, pending, fs);
    expect(await loadPending(DIR, fs)).toEqual(pending);
    expect([...fs.files.keys()]).toEqual([pendingFile(DIR)]);
    await clearPending(DIR, fs);
    expect(await loadPending(DIR, fs)).toBeUndefined();
  });

  it('treats a missing, unreadable, damaged or foreign file as none', async () => {
    const fs = memoryFs();
    expect(await loadPending(DIR, fs)).toBeUndefined();
    fs.files.set(pendingFile(DIR), '{nope');
    expect(await loadPending(DIR, fs)).toBeUndefined();
    fs.files.set(pendingFile(DIR), '{"schemaVersion":2}');
    expect(await loadPending(DIR, fs)).toBeUndefined();
    fs.failRead(pendingFile(DIR));
    expect(await loadPending(DIR, fs)).toBeUndefined();
  });

  it('leaves the old file and no temporary one when a save fails', async () => {
    const fs = memoryFs();
    const first = newPendingRun('one', 'en');
    await savePending(DIR, first, fs);
    fs.failRename(pendingFile(DIR));
    await expect(savePending(DIR, newPendingRun('two', 'en'), fs)).rejects.toThrow('rename failed');
    expect(await loadPending(DIR, fs)).toEqual(first);
    expect([...fs.files.keys()]).toEqual([pendingFile(DIR)]);
    fs.failRemove();
    await expect(savePending(DIR, newPendingRun('two', 'en'), fs)).rejects.toThrow('rename failed');
  });
});
