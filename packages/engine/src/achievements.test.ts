// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_KINDS,
  earnedAchievements,
  newlyEarned,
  ruleHolds,
  type AchievementRule,
} from './achievements.js';
import { createRng } from './dice.js';
import { CRIME_TYPES } from './detective/case-schema.js';
import { END_REASONS } from './run.js';
import type { ProfileRecord } from './profile.js';

let counter = 0;
const record = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  version: 1,
  runId: `run-${String((counter += 1))}`,
  locale: 'en',
  title: 'A case',
  hero: { name: 'Mira', background: 'police', lifeState: undefined },
  endReason: 'proven',
  won: true,
  days: 3,
  turns: 40,
  minutes: 600,
  cluesFound: 6,
  insights: 2,
  traitsRevealed: 0,
  traitsTotal: 2,
  ...overrides,
});
const lost = (overrides: Partial<ProfileRecord> = {}): ProfileRecord =>
  record({ won: false, endReason: 'time-ran-out', ...overrides });
const trade = (background: ProfileRecord['hero']['background'], overrides: Partial<ProfileRecord> = {}) =>
  record({ hero: { name: 'Mira', background, lifeState: undefined }, ...overrides });
const land = (id: string) => ({ id, name: { ru: id, en: id } });

describe('the catalogue', () => {
  it('has a unique kebab-case id for each achievement, and every kind has some', () => {
    const ids = ACHIEVEMENTS.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z]+(-[a-z]+)*$/.test(id))).toBe(true);
    for (const kind of ACHIEVEMENT_KINDS) {
      expect(ACHIEVEMENTS.some((achievement) => achievement.kind === kind)).toBe(true);
    }
  });

  it('asks for every crime theme in the full house', () => {
    const fullHouse = ACHIEVEMENTS.find(({ id }) => id === 'full-house');

    expect(fullHouse?.rule).toEqual({ type: 'distinct', field: 'theme', atLeast: CRIME_TYPES.length });
  });
});

describe('ruleHolds', () => {
  const wins = (atLeast: number): AchievementRule => ({ type: 'wins', atLeast });

  it('counts wins, and only wins', () => {
    expect(ruleHolds(wins(2), [record(), lost()])).toBe(false);
    expect(ruleHolds(wins(2), [record(), lost(), record()])).toBe(true);
  });

  it('wants a streak in a row', () => {
    const rule: AchievementRule = { type: 'streak', atLeast: 2 };

    expect(ruleHolds(rule, [record(), lost(), record()])).toBe(false);
    expect(ruleHolds(rule, [lost(), record(), record()])).toBe(true);
  });

  it('holds every field of a condition for one won run, not spread over several', () => {
    const rule: AchievementRule = { type: 'win', where: { maxDays: 2, minDays: 2, maxTurns: 10 } };

    expect(ruleHolds(rule, [record({ days: 2, turns: 10 })])).toBe(true);
    expect(ruleHolds(rule, [record({ days: 3, turns: 10 })])).toBe(false);
    expect(ruleHolds(rule, [record({ days: 1, turns: 10 })])).toBe(false);
    expect(ruleHolds(rule, [record({ days: 2, turns: 11 })])).toBe(false);
    expect(ruleHolds(rule, [record({ days: 2, turns: 5 }), record({ days: 3, turns: 10 })])).toBe(true);
    expect(ruleHolds(rule, [lost({ days: 2, turns: 5 })])).toBe(false);
  });

  it('wants every trait shown, and a hero who had some', () => {
    const rule: AchievementRule = { type: 'win', where: { allTraitsRevealed: true } };

    expect(ruleHolds(rule, [record({ traitsRevealed: 2, traitsTotal: 2 })])).toBe(true);
    expect(ruleHolds(rule, [record({ traitsRevealed: 1, traitsTotal: 2 })])).toBe(false);
    expect(ruleHolds(rule, [record({ traitsRevealed: 0, traitsTotal: 0 })])).toBe(false);
  });

  it('counts the different trades, themes and countries of the won runs', () => {
    const trades: AchievementRule = { type: 'distinct', field: 'background', atLeast: 2 };
    const themes: AchievementRule = { type: 'distinct', field: 'theme', atLeast: 2 };
    const lands: AchievementRule = { type: 'distinct', field: 'setting', atLeast: 2 };

    expect(ruleHolds(trades, [trade('nurse'), trade('nurse')])).toBe(false);
    expect(ruleHolds(trades, [trade('nurse'), trade('police')])).toBe(true);
    expect(ruleHolds(trades, [trade('nurse'), trade('police', { won: false })])).toBe(false);
    expect(ruleHolds(themes, [record({ theme: 'forgery' }), record({ theme: 'cyber' })])).toBe(true);
    expect(ruleHolds(themes, [record({ theme: 'forgery' }), record()])).toBe(false);
    expect(ruleHolds(lands, [record({ setting: land('a') }), record({ setting: land('b') })])).toBe(true);
    expect(ruleHolds(lands, [record({ setting: land('a') }), record({ setting: land('a') })])).toBe(false);
  });
});

describe('earnedAchievements', () => {
  it('is empty for a profile with no runs', () => {
    expect(earnedAchievements([])).toEqual([]);
  });

  it('follows the catalogue: the first case, then the quick one', () => {
    expect(earnedAchievements([record()])).toEqual(['first-case']);
    expect(earnedAchievements([record({ days: 1, turns: 8 })])).toEqual([
      'first-case',
      'swift-hand',
      'few-words',
      'by-the-book',
    ]);
  });

  it('earns the legacy ones by the number of wins', () => {
    const many = Array.from({ length: 10 }, () => record());

    expect(earnedAchievements(many)).toContain('old-hand');
    expect(earnedAchievements(many)).not.toContain('living-legend');
  });

  it('is never earned by losing or giving up, whatever the profile holds', () => {
    for (const endReason of END_REASONS.filter((reason) => reason !== 'proven')) {
      const failures = Array.from({ length: 30 }, () =>
        lost({ endReason, days: 1, turns: 1, traitsRevealed: 2, traitsTotal: 2 }),
      );

      expect(earnedAchievements(failures)).toEqual([]);
    }
  });

  it('is never changed by one more failed run, over many random profiles', () => {
    const rng = createRng('achievements');
    const trades = ['nurse', 'police', 'bailiff', 'courier', 'sommelier'] as const;
    for (let round = 0; round < 200; round += 1) {
      const profile = Array.from({ length: rng.roll(14) }, () =>
        trade(trades[rng.roll(trades.length) - 1] ?? 'nurse', {
          won: rng.roll(3) !== 1,
          days: rng.roll(8),
          turns: rng.roll(60),
          ...(rng.roll(2) === 1 ? { theme: CRIME_TYPES[rng.roll(CRIME_TYPES.length) - 1] } : {}),
        }),
      );
      const before = earnedAchievements(profile);

      expect(earnedAchievements([...profile, lost({ days: 1, turns: 1 })])).toEqual(before);
      expect(earnedAchievements([...profile, lost({ endReason: 'gave-up' })])).toEqual(before);
    }
  });
});

describe('newlyEarned', () => {
  it('names what the last run added and nothing it already had', () => {
    const before = [record()];

    expect(newlyEarned(before, [...before, record({ days: 1, turns: 5 })])).toEqual([
      'swift-hand',
      'few-words',
      'by-the-book',
    ]);
    expect(newlyEarned(before, [...before, lost()])).toEqual([]);
    expect(newlyEarned([], [record()])).toEqual(['first-case']);
  });
});
