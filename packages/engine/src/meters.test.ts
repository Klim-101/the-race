// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { defineArchetype } from './archetype.js';
import { DETECTIVE } from './detective/archetype.js';
import { ARCHETYPES } from './hero.js';
import {
  MAX_METERS,
  MeterDefinitionSchema,
  applyMeterRate,
  defineMeter,
  endReasonOfMeters,
  inBand,
  meterEffects,
  warningsOfMeters,
} from './meters.js';
import { collectModifier } from './modifiers.js';
import { TraitSchema } from './traits.js';

const NERVES = defineMeter({
  id: 'nerves',
  max: 10,
  start: 10,
  drain: { amount: 2, per: 'hour' },
  recovery: { amount: 3, per: 'night' },
  thresholds: [
    { below: 6, effects: { modifiers: [{ skills: ['perception'], amount: -1 }] } },
    { below: 3, effects: { modifiers: [{ skills: 'all', amount: -2 }], mishapChance: 20, garbleLevel: 1 } },
    { below: 2, effects: { mishapChance: 10, garbleLevel: 3 } },
    { atLeast: 10, effects: { modifiers: [{ skills: ['social'], amount: 1 }] } },
  ],
});

describe('MeterDefinitionSchema', () => {
  const base = { id: 'sleep-debt', max: 8, start: 0 };

  it('accepts a meter written as data and fills in its defaults', () => {
    expect(defineMeter(base)).toEqual({ ...base, thresholds: [] });
  });

  it('refuses ids that are not kebab-case, a start above the maximum and bad thresholds', () => {
    expect(MeterDefinitionSchema.safeParse({ ...base, id: 'Sleep Debt' }).success).toBe(false);
    expect(MeterDefinitionSchema.safeParse({ ...base, start: 9 }).success).toBe(false);
    const threshold = (value: object) => ({ ...base, thresholds: [value] });
    expect(MeterDefinitionSchema.safeParse(threshold({ effects: { mishapChance: 5 } })).success).toBe(false);
    expect(
      MeterDefinitionSchema.safeParse(threshold({ below: 3, atLeast: 5, effects: { mishapChance: 5 } }))
        .success,
    ).toBe(false);
    expect(MeterDefinitionSchema.safeParse(threshold({ below: 3, effects: {} })).success).toBe(false);
    expect(
      MeterDefinitionSchema.safeParse(
        threshold({ below: 3, effects: { modifiers: [{ skills: 'all', amount: 0 }] } }),
      ).success,
    ).toBe(false);
  });
});

describe('meterEffects', () => {
  it('applies the bands the value is in, summing modifiers and taking the worst chance and garble', () => {
    expect(meterEffects(NERVES, 10)).toEqual({
      modifiers: [{ skills: ['social'], amount: 1 }],
      mishapChance: 0,
      garbleLevel: 0,
      warnings: [],
    });
    expect(meterEffects(NERVES, 5).modifiers).toEqual([{ skills: ['perception'], amount: -1 }]);
    expect(meterEffects(NERVES, 2)).toMatchObject({ mishapChance: 20, garbleLevel: 1 });
    expect(meterEffects(NERVES, 1)).toMatchObject({ mishapChance: 20, garbleLevel: 3 });
    expect(meterEffects(NERVES, 1).modifiers).toHaveLength(2);
  });

  it('is pure: the same value always gives the same effects', () => {
    for (let value = 0; value <= NERVES.max; value += 1) {
      expect(meterEffects(NERVES, value)).toEqual(meterEffects(NERVES, value));
    }
  });
});

const REPUTATION = defineMeter({
  id: 'reputation',
  max: 10,
  start: 10,
  thresholds: [{ below: 3, effects: { warning: 'low-reputation' } }],
});
const FRAYED = defineMeter({
  id: 'nerves',
  max: 10,
  start: 10,
  thresholds: [
    { below: 1, when: [{ meter: 'reputation', below: 3 }], effects: { endsRun: { reason: 'breakdown' } } },
    {
      below: 1,
      when: [
        { meter: 'reputation', atLeast: 9 },
        { meter: 'sleep', atLeast: 5 },
      ],
      effects: { endsRun: { reason: 'gave-up' } },
    },
    { below: 4, effects: { warning: 'low-reputation', modifiers: [{ skills: 'all', amount: -1 }] } },
  ],
});
const SLEEP = defineMeter({ id: 'sleep', max: 10, start: 0 });
const readings = (reputation: number, nerves: number, sleep = 0) => [
  { definition: REPUTATION, value: reputation },
  { definition: FRAYED, value: nerves },
  { definition: SLEEP, value: sleep },
];
const ending = (id: string, reason: 'wrong' | 'unproven') =>
  defineMeter({ id, max: 3, start: 3, thresholds: [{ below: 1, effects: { endsRun: { reason } } }] });

describe('a threshold that ends the run', () => {
  const threshold = (value: object) => ({ id: 'n', max: 5, start: 5, thresholds: [value] });
  const ends = { endsRun: { reason: 'breakdown' } };
  const when = [{ meter: 'reputation', below: 3 }];
  const accepts = (value: object) => MeterDefinitionSchema.safeParse(threshold(value)).success;

  it('names a reason and may carry a condition on other meters, but then does nothing else', () => {
    expect(accepts({ below: 1, effects: ends })).toBe(true);
    expect(accepts({ below: 1, when, effects: ends })).toBe(true);
    expect(accepts({ below: 1, effects: { endsRun: { reason: 'nonsense' } } })).toBe(false);
    expect(accepts({ below: 1, when: [], effects: ends })).toBe(false);
    expect(accepts({ below: 1, when, effects: { warning: 'w' } })).toBe(false);
    expect(accepts({ below: 1, when, effects: { ...ends, mishapChance: 5 } })).toBe(false);
    expect(accepts({ below: 1, when: [{ meter: 'a' }], effects: ends })).toBe(false);
    expect(accepts({ below: 1, effects: { warning: 'Not Kebab' } })).toBe(false);
  });

  it('holds when the own band and every condition hold', () => {
    expect(endReasonOfMeters(readings(2, 0))).toBe('breakdown');
    expect(endReasonOfMeters(readings(3, 0))).toBeNull();
    expect(endReasonOfMeters(readings(2, 1))).toBeNull();
    expect(endReasonOfMeters(readings(9, 0, 5))).toBe('gave-up');
    expect(endReasonOfMeters(readings(9, 0, 4))).toBeNull();
  });

  it('never holds for a condition on a meter without a reading', () => {
    expect(endReasonOfMeters([{ definition: FRAYED, value: 0 }])).toBeNull();
  });

  it('takes the first threshold that applies, meters in the order given', () => {
    expect(endReasonOfMeters(readings(2, 0, 9))).toBe('breakdown');
    const two = [
      { definition: ending('a', 'wrong'), value: 0 },
      { definition: ending('b', 'unproven'), value: 0 },
    ];
    expect(endReasonOfMeters(two)).toBe('wrong');
    expect(endReasonOfMeters([...two].reverse())).toBe('unproven');
  });

  it('is decided by the readings alone, for every pair of values', () => {
    for (let reputation = 0; reputation <= 10; reputation += 1) {
      for (let nerves = 0; nerves <= 10; nerves += 1) {
        expect(endReasonOfMeters(readings(reputation, nerves))).toBe(
          nerves === 0 && reputation < 3 ? 'breakdown' : null,
        );
      }
    }
  });

  it('leaves a conditional threshold out of the effects on checks', () => {
    expect(meterEffects(FRAYED, 0).modifiers).toEqual([{ skills: 'all', amount: -1 }]);
  });
});

describe('warnings', () => {
  it('apply while their band does, once each, in the order of the meters', () => {
    expect(meterEffects(REPUTATION, 2).warnings).toEqual(['low-reputation']);
    expect(meterEffects(REPUTATION, 3).warnings).toEqual([]);
    expect(warningsOfMeters(readings(2, 1))).toEqual(['low-reputation']);
    expect(warningsOfMeters(readings(5, 9))).toEqual([]);
  });
});

describe('inBand', () => {
  it('is below or at least', () => {
    expect(inBand({ below: 3 }, 2)).toBe(true);
    expect(inBand({ below: 3 }, 3)).toBe(false);
    expect(inBand({ atLeast: 3 }, 3)).toBe(true);
    expect(inBand({ atLeast: 3 }, 2)).toBe(false);
  });
});

describe('applyMeterRate', () => {
  it('drains and recovers by the data, and clamps to the range', () => {
    expect(applyMeterRate(NERVES, 10, 'drain', 'hour', 2)).toBe(6);
    expect(applyMeterRate(NERVES, 1, 'drain', 'hour', 5)).toBe(0);
    expect(applyMeterRate(NERVES, 4, 'recovery', 'night')).toBe(7);
    expect(applyMeterRate(NERVES, 9, 'recovery', 'night', 4)).toBe(10);
  });

  it('does nothing for a unit the meter does not use or has no rate for', () => {
    expect(applyMeterRate(NERVES, 5, 'drain', 'day')).toBe(5);
    expect(applyMeterRate(defineMeter({ id: 'x', max: 3, start: 3 }), 3, 'drain', 'hour')).toBe(3);
  });

  it('refuses a count that is not a whole non-negative number', () => {
    expect(() => applyMeterRate(NERVES, 5, 'drain', 'hour', -1)).toThrow(RangeError);
    expect(() => applyMeterRate(NERVES, 5, 'drain', 'hour', 0.5)).toThrow(RangeError);
  });
});

describe('collectModifier', () => {
  const trait = TraitSchema.parse({
    id: 'night-owl',
    polarity: 'positive',
    trigger: 'night',
    effects: [{ kind: 'modifier', skills: ['perception'], amount: 2 }],
  });
  const item = (id: string, amount: number, skills: 'all' | string[] = ['perception']) => ({
    id,
    effects: [{ skills, amount }],
  });

  it('is zero without sources', () => {
    expect(collectModifier({}, 'perception', ['night'])).toBe(0);
  });

  it('adds traits, conditions, gear and meter thresholds through one function', () => {
    const sources = {
      traits: [trait],
      conditions: [item('shaken', -1, 'all')],
      gear: [item('lamp', 1)],
      meters: [{ definition: NERVES, value: 5 }],
    };

    expect(collectModifier(sources, 'perception', ['night'])).toBe(2 - 1 + 1 - 1);
    expect(collectModifier(sources, 'perception', [])).toBe(-1 + 1 - 1);
    expect(collectModifier(sources, 'tech', ['night'])).toBe(-1);
  });

  it('gives the same result as the trait path alone when only traits are named', () => {
    expect(collectModifier({ traits: [trait] }, 'perception', ['night'])).toBe(2);
    expect(collectModifier({ traits: [trait] }, 'social', ['night'])).toBe(0);
  });
});

describe('the complexity budget', () => {
  it('keeps every archetype within MAX_METERS', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      expect(archetype.meters.length).toBeLessThanOrEqual(MAX_METERS);
    }
  });

  it('gives the detective reputation as a meter', () => {
    expect(DETECTIVE.meters.map(({ id }) => id)).toEqual(['reputation', 'nerves', 'sleep-debt']);
  });

  it('refuses a condition on a meter that is not another meter of the archetype', () => {
    const base = {
      id: 'x',
      ownSkills: ['a', 'b', 'c'],
      skillPoints: 4,
      maxSkillLevel: 3,
      traits: [],
    } as const;
    const watcher = (meter: string) =>
      defineMeter({
        id: 'w',
        max: 3,
        start: 3,
        thresholds: [
          { below: 1, when: [{ meter, below: 3 }], effects: { endsRun: { reason: 'breakdown' } } },
        ],
      });
    const other = defineMeter({ id: 'o', max: 3, start: 3 });

    expect(defineArchetype({ ...base, meters: [watcher('o'), other] }).meters).toHaveLength(2);
    expect(() => defineArchetype({ ...base, meters: [watcher('missing'), other] })).toThrow(RangeError);
    expect(() => defineArchetype({ ...base, meters: [watcher('w'), other] })).toThrow(RangeError);
  });

  it('refuses more meters than the budget and repeated ids', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => defineMeter({ id, max: 3, start: 3 }));
    const base = {
      id: 'x',
      ownSkills: ['a', 'b', 'c'],
      skillPoints: 4,
      maxSkillLevel: 3,
      traits: [],
    } as const;

    expect(defineArchetype({ ...base, meters: [a!, b!, c!] }).meters).toHaveLength(MAX_METERS);
    expect(() => defineArchetype({ ...base, meters: [a!, b!, c!, d!] })).toThrow(RangeError);
    expect(() => defineArchetype({ ...base, meters: [a!, a!] })).toThrow(RangeError);
  });
});
