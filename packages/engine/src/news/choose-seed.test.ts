// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { CRIME_TYPES } from '../detective/case-schema.js';
import { BACKGROUNDS } from '../detective/gear.js';
import { BACKGROUND_CRIMES, SEED_CRIMES, chooseSeed } from './choose-seed.js';
import { SEED_KINDS, type NewsSeed } from './seed.js';

const seedOf = (kind: NewsSeed['kind'], id = `${kind}-seed`): NewsSeed => ({
  id,
  headlineIds: ['h0a1b2c3d'],
  kind,
  tone: 'wry',
  premise: 'A pattern of trouble with an invented twist to it.',
});
const SEEDS = SEED_KINDS.map((kind) => seedOf(kind));
const runs = (count: number): string[] => Array.from({ length: count }, (_, index) => `run-${String(index)}`);

describe('the tables', () => {
  it('give every kind at least one crime, and every crime type is reachable', () => {
    for (const kind of SEED_KINDS) expect(SEED_CRIMES[kind].length).toBeGreaterThan(0);
    const reachable = new Set(Object.values(SEED_CRIMES).flat());
    for (const crime of CRIME_TYPES) expect(reachable.has(crime)).toBe(true);
  });

  it('lean every background towards crimes that exist', () => {
    for (const background of BACKGROUNDS) {
      for (const crime of BACKGROUND_CRIMES[background]) expect(CRIME_TYPES).toContain(crime);
    }
  });
});

describe('chooseSeed', () => {
  it('has nothing to choose from when there are no seeds', () => {
    expect(chooseSeed([], { background: 'police', runSeed: 'run-1' })).toBeUndefined();
  });

  it('is the same on every call for the same hero and run', () => {
    const hero = { background: 'analyst', runSeed: 'run-7' } as const;

    expect(chooseSeed(SEEDS, hero)).toEqual(chooseSeed(SEEDS, hero));
  });

  it('only pairs a seed with a crime its kind allows', () => {
    for (const runSeed of runs(200)) {
      const choice = chooseSeed(SEEDS, { background: 'locksmith', runSeed });
      expect(SEED_CRIMES[choice?.seed.kind ?? 'shortage']).toContain(choice?.crimeType);
    }
  });

  it('gives the same news to different heroes as different cases', () => {
    const crimesOf = (background: (typeof BACKGROUNDS)[number]): Set<string | undefined> =>
      new Set(runs(200).map((runSeed) => chooseSeed(SEEDS, { background, runSeed })?.crimeType));
    const analyst = runs(400).map(
      (runSeed) => chooseSeed(SEEDS, { background: 'analyst', runSeed })?.crimeType,
    );
    const journalist = runs(400).map(
      (runSeed) => chooseSeed(SEEDS, { background: 'journalist', runSeed })?.crimeType,
    );
    const share = (crimes: (string | undefined)[], wanted: string): number =>
      crimes.filter((crime) => crime === wanted).length / crimes.length;

    expect(share(analyst, 'financial')).toBeGreaterThan(share(journalist, 'financial'));
    expect(share(journalist, 'political-leak')).toBeGreaterThan(share(analyst, 'political-leak'));
    expect(crimesOf('police').size).toBeGreaterThan(3);
  });

  it('still lets a crime outside the background come up', () => {
    const crimes = new Set(
      runs(400).map((runSeed) => chooseSeed(SEEDS, { background: 'police', runSeed })?.crimeType),
    );

    expect(crimes.has('cyber')).toBe(true);
  });

  it('picks from the one seed there is', () => {
    const only = seedOf('outage');

    expect(chooseSeed([only], { background: 'police', runSeed: 'run-1' })?.seed).toBe(only);
  });
});
