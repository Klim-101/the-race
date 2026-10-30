// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { collectModifier } from '../modifiers.js';
import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../run.js';
import { DETECTIVE_NERVES, DETECTIVE_SLEEP_DEBT } from './archetype.js';
import {
  CONDITION_IDS,
  DETECTIVE_CONDITIONS,
  HeroConditionSchema,
  LATE_FROM_MINUTE,
  initialCondition,
  modifierSources,
  passTime,
  viewCondition,
  withCondition,
  withNervesStrained,
  type HeroCondition,
} from './condition.js';

const at = (hour: number, day = 1) => ({ day, minute: hour * 60 });
const modifier = (condition: HeroCondition, skill: string): number =>
  collectModifier(modifierSources({ traits: [], condition, kit: [] }), skill, []);

describe('initialCondition', () => {
  it('starts with full nerves, no sleep debt and no conditions', () => {
    expect(initialCondition()).toEqual({ nerves: 10, sleepDebt: 0, active: [] });
    expect(HeroConditionSchema.parse(initialCondition())).toEqual(initialCondition());
  });

  it('rejects the same condition twice and values out of range', () => {
    const twice = {
      ...initialCondition(),
      active: [
        { id: 'drunk', remaining: 5 },
        { id: 'drunk', remaining: 9 },
      ],
    };
    expect(HeroConditionSchema.safeParse(twice).success).toBe(false);
    expect(HeroConditionSchema.safeParse({ ...initialCondition(), nerves: 11 }).success).toBe(false);
    expect(HeroConditionSchema.safeParse({ ...initialCondition(), sleepDebt: -1 }).success).toBe(false);
  });
});

describe('passTime', () => {
  it('spends a point of nerves for every four hours the clock runs through', () => {
    expect(passTime(initialCondition(), at(0), 239).nerves).toBe(10);
    expect(passTime(initialCondition(), at(0), 240).nerves).toBe(9);
    expect(passTime(initialCondition(), at(3), 120).nerves).toBe(9);
    expect(passTime(initialCondition(), at(0), 2 * MINUTES_PER_DAY).nerves).toBe(0);
  });

  it('does not depend on how the time is split into turns', () => {
    for (const start of [0, 37, 600, 1300]) {
      for (const total of [45, 300, 1000, 3000]) {
        let split = initialCondition();
        let clock = { day: 1, minute: start };
        for (let spent = 0; spent < total; spent += 15) {
          const step = Math.min(15, total - spent);
          split = passTime(split, clock, step);
          const sum = clock.minute + step;
          clock = { day: clock.day + Math.floor(sum / MINUTES_PER_DAY), minute: sum % MINUTES_PER_DAY };
        }
        expect(split).toEqual(passTime(initialCondition(), { day: 1, minute: start }, total));
      }
    }
  });

  it('builds sleep debt from work late at night, an hour at a time, up to the cap', () => {
    expect(passTime(initialCondition(), at(21), 60).sleepDebt).toBe(0);
    expect(passTime(initialCondition(), at(22), 60).sleepDebt).toBe(1);
    expect(passTime(initialCondition(), at(22), 59).sleepDebt).toBe(0);
    expect(passTime(initialCondition(), at(22), 180).sleepDebt).toBe(2);
    expect(passTime(initialCondition(), at(5), 120).sleepDebt).toBe(0);
    expect(passTime(initialCondition(), at(20), 300).sleepDebt).toBe(2);
    expect(passTime(initialCondition(), at(10), 5 * MINUTES_PER_DAY).sleepDebt).toBe(
      DETECTIVE_SLEEP_DEBT.max,
    );
  });

  it('counts no sleep debt from a day that starts at 08:00 until work runs past 22:00', () => {
    const start = { day: 1, minute: DAY_START_MINUTE };

    expect(passTime(initialCondition(), start, LATE_FROM_MINUTE - DAY_START_MINUTE).sleepDebt).toBe(0);
    expect(passTime(initialCondition(), start, MINUTES_PER_DAY - DAY_START_MINUTE).sleepDebt).toBe(2);
  });

  it('runs timed conditions down, drops them at zero and keeps those that wait for the night', () => {
    let condition = withCondition(withCondition(initialCondition(), 'shaken'), 'exhausted');
    condition = withCondition(condition, 'sedated');

    const later = passTime(condition, at(8), 100);

    expect(later.active).toEqual([
      { id: 'shaken', remaining: 20 },
      { id: 'exhausted', remaining: 'night' },
      { id: 'sedated', remaining: 260 },
    ]);
    expect(passTime(later, at(10), 20).active.map(({ id }) => id)).toEqual(['exhausted', 'sedated']);
  });
});

describe('strainNerves', () => {
  it('costs a point and stops at zero', () => {
    expect(withNervesStrained(initialCondition()).nerves).toBe(9);
    expect(withNervesStrained({ ...initialCondition(), nerves: 0 }).nerves).toBe(0);
  });
});

describe('withCondition', () => {
  it('uses the duration of the catalogue', () => {
    expect(withCondition(initialCondition(), 'drunk').active).toEqual([{ id: 'drunk', remaining: 240 }]);
    expect(withCondition(initialCondition(), 'exhausted').active).toEqual([
      { id: 'exhausted', remaining: 'night' },
    ]);
  });

  it('starts a condition over instead of stacking it, and keeps the longer one', () => {
    const run = passTime(withCondition(initialCondition(), 'drunk'), at(8), 100);
    expect(withCondition(run, 'drunk').active).toEqual([{ id: 'drunk', remaining: 240 }]);

    const long: HeroCondition = { ...initialCondition(), active: [{ id: 'drunk', remaining: 1000 }] };
    expect(withCondition(long, 'drunk').active).toEqual([{ id: 'drunk', remaining: 1000 }]);

    const night: HeroCondition = { ...initialCondition(), active: [{ id: 'drunk', remaining: 'night' }] };
    expect(withCondition(night, 'drunk').active).toEqual([{ id: 'drunk', remaining: 'night' }]);

    const toNight: HeroCondition = { ...initialCondition(), active: [{ id: 'exhausted', remaining: 5 }] };
    expect(withCondition(toNight, 'exhausted').active).toEqual([{ id: 'exhausted', remaining: 'night' }]);
  });
});

describe('modifiers on checks', () => {
  it('give no modifier to a rested hero', () => {
    expect(modifier(initialCondition(), 'perception')).toBe(0);
  });

  it('come from active conditions through the shared path, by skill', () => {
    const drunk = withCondition(initialCondition(), 'drunk');

    expect(modifier(drunk, 'perception')).toBe(-2);
    expect(modifier(drunk, 'pressure')).toBe(1);
    expect(modifier(drunk, 'tech')).toBe(0);
    expect(modifier(withCondition(initialCondition(), 'sedated'), 'perception')).toBe(-3);
    expect(modifier(withCondition(initialCondition(), 'exhausted'), 'tech')).toBe(-2);
  });

  it('come from the thresholds of nerves and sleep debt', () => {
    expect(modifier({ ...initialCondition(), nerves: 6 }, 'tech')).toBe(0);
    expect(modifier({ ...initialCondition(), nerves: 5 }, 'tech')).toBe(-1);
    expect(modifier({ ...initialCondition(), nerves: 2 }, 'tech')).toBe(-2);
    expect(modifier({ ...initialCondition(), sleepDebt: 3 }, 'tech')).toBe(0);
    expect(modifier({ ...initialCondition(), sleepDebt: 4 }, 'tech')).toBe(-1);
    expect(modifier({ ...initialCondition(), sleepDebt: 7 }, 'tech')).toBe(-2);
  });

  it('add up with each other', () => {
    const tired = withCondition({ ...initialCondition(), nerves: 2, sleepDebt: 8 }, 'exhausted');

    expect(modifier(tired, 'reasoning')).toBe(-6);
  });

  it('define every condition and keep mishap and garble as data on the meters', () => {
    for (const id of CONDITION_IDS) {
      expect(DETECTIVE_CONDITIONS[id].effects.length).toBeGreaterThan(0);
    }
    expect(DETECTIVE_NERVES.thresholds.some(({ effects }) => effects.garbleLevel !== undefined)).toBe(true);
  });
});

describe('viewCondition', () => {
  it('shows nerves, sleep debt and what is on the hero, with minutes left or until the night', () => {
    const condition = withCondition(
      withCondition({ ...initialCondition(), nerves: 7, sleepDebt: 2 }, 'shaken'),
      'exhausted',
    );

    expect(viewCondition(condition)).toEqual({
      nerves: 7,
      maxNerves: 10,
      sleepDebt: 2,
      maxSleepDebt: 10,
      conditions: [
        { id: 'shaken', minutesLeft: 120 },
        { id: 'exhausted', minutesLeft: null },
      ],
    });
  });
});
