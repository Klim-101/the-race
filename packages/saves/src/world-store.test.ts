// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { EMPTY_WORLD, proposeEntry, type World, type WorldProposal } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { memoryFs } from '../test/memory-fs.js';
import { loadWorld, saveWorld, worldFile } from './world-store.js';

const DIR = 'save-root';
const FILE = join(DIR, 'world.json');

const RUSSIA: WorldProposal = {
  kind: 'country',
  real: ['Россия', 'Russia'],
  mirror: { ru: 'Вальдмарк', en: 'Valdmark' },
};
const BANK: WorldProposal = {
  kind: 'organisation',
  real: ['Банк России'],
  mirror: { ru: 'Норделл', en: 'Nordell' },
};

function grown(world: World, proposal: WorldProposal): World {
  const result = proposeEntry(world, proposal);
  if (!result.ok) throw new Error('The fixture is refused.');
  return result.world;
}

describe('worldFile', () => {
  it('sits beside the runs, not inside one', () => {
    expect(worldFile(DIR)).toBe(FILE);
  });
});

describe('loadWorld and saveWorld', () => {
  it('starts with an empty world when nothing has been saved', async () => {
    expect(await loadWorld(DIR, memoryFs())).toEqual({ ok: true, world: EMPTY_WORLD });
  });

  it('round-trips a world and lets it grow', async () => {
    const fs = memoryFs();
    const one = grown(EMPTY_WORLD, RUSSIA);
    const two = grown(one, BANK);

    await saveWorld(DIR, one, fs);
    await saveWorld(DIR, two, fs);

    expect(await loadWorld(DIR, fs)).toEqual({ ok: true, world: two });
    expect(fs.files.has(`${FILE}.tmp`)).toBe(false);
  });

  it('refuses to save a world that drops or changes what is already there', async () => {
    const fs = memoryFs();
    const two = grown(grown(EMPTY_WORLD, RUSSIA), BANK);
    await saveWorld(DIR, two, fs);

    await expect(saveWorld(DIR, EMPTY_WORLD, fs)).rejects.toThrow('does not keep');
    const renamed = {
      ...two,
      entries: [{ ...two.entries[0]!, mirror: { ru: 'Другой', en: 'Other' } }, two.entries[1]!],
    };
    await expect(saveWorld(DIR, renamed, fs)).rejects.toThrow('does not keep');
    expect(await loadWorld(DIR, fs)).toEqual({ ok: true, world: two });
  });

  it('refuses to save a world that breaks its own rules', async () => {
    const one = grown(EMPTY_WORLD, RUSSIA);
    const twice = { ...one, entries: [...one.entries, ...one.entries] };

    await expect(saveWorld(DIR, twice, memoryFs())).rejects.toThrow();
  });

  it('never replaces a file it cannot use with an empty world', async () => {
    const fs = memoryFs();
    fs.files.set(FILE, '{broken');

    await expect(saveWorld(DIR, grown(EMPTY_WORLD, RUSSIA), fs)).rejects.toThrow('unusable');
    expect(fs.files.get(FILE)).toBe('{broken');
  });

  it('says why a file cannot be used', async () => {
    const fs = memoryFs();

    fs.files.set(FILE, '{broken');
    expect(await loadWorld(DIR, fs)).toMatchObject({ ok: false, reason: 'corrupt' });

    fs.files.set(FILE, JSON.stringify({ schemaVersion: 1, entries: [{ id: 'x' }] }));
    expect(await loadWorld(DIR, fs)).toMatchObject({ ok: false, reason: 'corrupt' });

    fs.files.set(FILE, JSON.stringify({ entries: [] }));
    expect(await loadWorld(DIR, fs)).toMatchObject({ ok: false, reason: 'corrupt' });

    fs.files.set(FILE, JSON.stringify({ schemaVersion: 99, entries: [] }));
    expect(await loadWorld(DIR, fs)).toMatchObject({ ok: false, reason: 'unsupported-version' });

    fs.failRead(FILE);
    expect(await loadWorld(DIR, fs)).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('upgrades an older file in memory through the migrations it is given', async () => {
    const fs = memoryFs();
    fs.files.set(FILE, JSON.stringify({ schemaVersion: 0, entries: [] }));

    const loaded = await loadWorld(DIR, fs, { 0: (raw) => raw });
    expect(loaded).toEqual({ ok: true, world: EMPTY_WORLD });

    expect(await loadWorld(DIR, fs, {})).toMatchObject({ ok: false, reason: 'unsupported-version' });
    expect(
      await loadWorld(DIR, fs, {
        0: () => {
          throw new Error('boom');
        },
      }),
    ).toMatchObject({ ok: false, reason: 'corrupt' });
  });
});
