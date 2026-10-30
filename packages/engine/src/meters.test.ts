// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { defineArchetype } from './archetype.js';
import { DETECTIVE } from './detective/archetype.js';
import { ARCHETYPES } from './hero.js';
import { MAX_METERS, MeterDefinitionSchema, applyMeterRate, defineMeter, meterEffects } from './meters.js';
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
    expect(DETECTIVE.meters.map(({ id }) => id)).toEqual(['reputation']);
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
