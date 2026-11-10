// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { ProfileRecord } from './profile.js';
import { REMEMBER_ONE_IN, RememberedHeroSchema, chooseRemembered } from './remembered.js';

let counter = 0;
const record = (name: string, overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  version: 1,
  runId: `run-${String((counter += 1))}`,
  locale: 'en',
  title: 'A case',
  hero: { name, background: 'police', lifeState: undefined, signalId: 'in-love' },
  endReason: 'proven',
  won: true,
  days: 3,
  turns: 40,
  minutes: 600,
  cluesFound: 6,
  insights: 2,
  traitsRevealed: 1,
  traitsTotal: 2,
  ...overrides,
});
const fallen = (name: string, overrides: Partial<ProfileRecord> = {}) =>
  record(name, { won: false, endReason: 'time-ran-out', ...overrides });
const gaveUp = (name: string) => record(name, { won: false, endReason: 'gave-up' });

const seeds = Array.from({ length: 600 }, (_, index) => `seed-${String(index)}`);
/** A seed that remembers someone in a profile of many records, and one that does not. */
const remembering = (profile: ProfileRecord[]) =>
  seeds.filter((seed) => chooseRemembered(profile, seed) !== undefined);

describe('chooseRemembered', () => {
  const profile = [record('Ada'), fallen('Bo'), record('Cy'), gaveUp('Di'), record('Eve')];

  it('remembers no one when the profile holds no earlier hero', () => {
    for (const seed of seeds.slice(0, 60)) {
      expect(chooseRemembered([], seed)).toBeUndefined();
      expect(chooseRemembered([record('Ada')], seed)).toBeUndefined();
    }
  });

  it('remembers on about one run in three, and on the same ones every time', () => {
    const first = remembering(profile);
    const share = first.length / seeds.length;

    expect(share).toBeGreaterThan(1 / REMEMBER_ONE_IN - 0.07);
    expect(share).toBeLessThan(1 / REMEMBER_ONE_IN + 0.07);
    expect(remembering(profile)).toEqual(first);
    expect(first.length).toBeLessThan(seeds.length);
  });

  it('takes the fallen first, and the others only when none has fallen', () => {
    const withFallen = remembering(profile).map((seed) => chooseRemembered(profile, seed)?.name);
    const noneFallen = [record('Ada'), gaveUp('Bo'), record('Cy'), record('Eve')];
    const without = remembering(noneFallen).map((seed) => chooseRemembered(noneFallen, seed)?.name);

    expect(new Set(withFallen)).toEqual(new Set(['Bo']));
    expect(new Set(without)).toEqual(new Set(['Ada', 'Bo', 'Cy']));
  });

  it('never remembers the hero of the latest run, even when that hero fell', () => {
    const latestFell = [record('Ada'), record('Bo'), fallen('Cy')];

    for (const seed of seeds) {
      expect(chooseRemembered(latestFell, seed)?.name).not.toBe('Cy');
    }
    expect(new Set(remembering(latestFell).map((seed) => chooseRemembered(latestFell, seed)?.name))).toEqual(
      new Set(['Ada', 'Bo']),
    );
  });

  it('gives the public record of the run and nothing of the hero or the case beyond it', () => {
    const withPlace = [
      fallen('Bo', { setting: { id: 'norland', name: { ru: 'Норланд', en: 'Norland' } }, theme: 'forgery' }),
      record('Eve'),
    ];
    const seed = seeds.find((candidate) => chooseRemembered(withPlace, candidate) !== undefined) ?? '';

    const remembered = chooseRemembered(withPlace, seed);

    expect(remembered).toEqual({
      name: 'Bo',
      background: 'police',
      endReason: 'time-ran-out',
      setting: { id: 'norland', name: { ru: 'Норланд', en: 'Norland' } },
      theme: 'forgery',
    });
    expect(RememberedHeroSchema.strict().parse(remembered)).toEqual(remembered);
  });

  it('leaves out the country and the theme of a record that has none', () => {
    const plain = [fallen('Bo'), record('Eve')];
    const seed = seeds.find((candidate) => chooseRemembered(plain, candidate) !== undefined) ?? '';

    expect(chooseRemembered(plain, seed)).toEqual({
      name: 'Bo',
      background: 'police',
      endReason: 'time-ran-out',
    });
  });

  it('does not change what one seed does when an earlier hero is added behind the pool', () => {
    // The dice are rolled in the same order whatever the profile holds: a run that remembers no one in a short
    // profile still remembers no one when the same seed meets a longer one, unless the profile gave it someone to pick.
    const short = [fallen('Bo'), record('Eve')];
    const longer = [fallen('Bo'), fallen('Cy'), record('Eve')];

    const sameChance = seeds.filter(
      (seed) =>
        (chooseRemembered(short, seed) === undefined) === (chooseRemembered(longer, seed) === undefined),
    );

    expect(sameChance.length).toBe(seeds.length);
  });
});
