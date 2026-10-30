// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { DETECTIVE_TRAITS } from './detective/traits.js';
import { createRng } from './dice.js';
import {
  DEFAULT_TRAIT_RULE,
  TraitSchema,
  isBeneficial,
  rollTraits,
  traitModifier,
  type Trait,
  type TraitRule,
} from './traits.js';

const trait = (id: Trait['id']): Trait => {
  const found = DETECTIVE_TRAITS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No trait ${id}`);
  return found;
};

const polarityCount = (polarity: Trait['polarity']): number =>
  DETECTIVE_TRAITS.filter((candidate) => candidate.polarity === polarity).length;

describe('DETECTIVE_TRAITS', () => {
  it('holds valid traits with unique ids', () => {
    for (const entry of DETECTIVE_TRAITS) {
      expect(TraitSchema.safeParse(entry).success).toBe(true);
    }
    expect(new Set(DETECTIVE_TRAITS.map(({ id }) => id)).size).toBe(DETECTIVE_TRAITS.length);
  });

  it('is big enough to vary and has traits of every polarity', () => {
    expect(DETECTIVE_TRAITS.length).toBeGreaterThanOrEqual(12);
    expect(DETECTIVE_TRAITS.length).toBeLessThanOrEqual(15);
    for (const polarity of ['positive', 'negative', 'mixed'] as const) {
      expect(polarityCount(polarity)).toBeGreaterThanOrEqual(3);
    }
  });

  it('only excludes traits that exist', () => {
    const ids = new Set(DETECTIVE_TRAITS.map(({ id }) => id));
    for (const entry of DETECTIVE_TRAITS) {
      for (const excluded of entry.excludes) expect(ids).toContain(excluded);
    }
  });
});

describe('TraitSchema', () => {
  const accountant = trait('former-accountant');

  it('rejects a modifier that does nothing', () => {
    const idle = { ...accountant, effects: [{ kind: 'modifier', skills: 'all', amount: 0 }] };

    expect(TraitSchema.safeParse(idle).success).toBe(false);
  });

  it('rejects a polarity that disagrees with the effects', () => {
    expect(TraitSchema.safeParse({ ...accountant, polarity: 'negative' }).success).toBe(false);
    expect(TraitSchema.safeParse({ ...trait('debtor'), polarity: 'positive' }).success).toBe(false);
    expect(TraitSchema.safeParse({ ...accountant, polarity: 'mixed' }).success).toBe(false);
  });

  it('rejects a trait without effects', () => {
    expect(TraitSchema.safeParse({ ...accountant, effects: [] }).success).toBe(false);
  });
});

describe('isBeneficial', () => {
  it('tells help from harm', () => {
    expect(isBeneficial({ kind: 'modifier', skills: 'all', amount: 1 })).toBe(true);
    expect(isBeneficial({ kind: 'modifier', skills: 'all', amount: -1 })).toBe(false);
    expect(isBeneficial({ kind: 'auto-discover' })).toBe(true);
    expect(isBeneficial({ kind: 'lock-out', source: 'police-data' })).toBe(false);
    expect(isBeneficial({ kind: 'spawn-event', event: 'debt-collector' })).toBe(false);
  });
});

describe('rollTraits', () => {
  it('deals one positive and one negative trait by default', () => {
    expect(DEFAULT_TRAIT_RULE).toEqual({ positive: 1, negative: 1, any: 0 });

    for (let seed = 0; seed < 200; seed += 1) {
      const polarities = rollTraits(createRng(seed), DETECTIVE_TRAITS).map(({ polarity }) => polarity);

      expect(polarities).toEqual(['positive', 'negative']);
    }
  });

  it('draws the same traits for the same seed', () => {
    expect(rollTraits(createRng('same'), DETECTIVE_TRAITS)).toEqual(
      rollTraits(createRng('same'), DETECTIVE_TRAITS),
    );
  });

  it('can reach every positive and negative trait, and every mixed one through the any slot', () => {
    const rule: TraitRule = { positive: 1, negative: 1, any: 1 };
    const seen = new Set<string>();
    for (let seed = 0; seed < 500; seed += 1) {
      for (const { id } of rollTraits(createRng(seed), DETECTIVE_TRAITS, rule)) seen.add(id);
    }

    expect(seen.size).toBe(DETECTIVE_TRAITS.length);
  });

  it('supports other rules: three traits, or two negatives', () => {
    expect(rollTraits(createRng(3), DETECTIVE_TRAITS, { positive: 1, negative: 1, any: 1 })).toHaveLength(3);

    const harsh = rollTraits(createRng(3), DETECTIVE_TRAITS, { positive: 0, negative: 2, any: 0 });
    expect(harsh.map(({ polarity }) => polarity)).toEqual(['negative', 'negative']);
  });

  it('never deals traits that exclude each other, in either direction', () => {
    const rule: TraitRule = { positive: 3, negative: 3, any: 3 };
    for (let seed = 0; seed < 300; seed += 1) {
      const traits = rollTraits(createRng(seed), DETECTIVE_TRAITS, rule);
      const ids = new Set(traits.map(({ id }) => id));

      expect(ids.size).toBe(traits.length);
      for (const dealt of traits) {
        for (const excluded of dealt.excludes) expect(ids.has(excluded)).toBe(false);
      }
    }
  });

  it('deals nothing for an empty rule', () => {
    expect(rollTraits(createRng(1), DETECTIVE_TRAITS, { positive: 0, negative: 0, any: 0 })).toEqual([]);
  });

  it('rejects a rule the catalogue cannot satisfy', () => {
    const positives = DETECTIVE_TRAITS.filter(({ polarity }) => polarity === 'positive');

    expect(() => rollTraits(createRng(1), positives)).toThrow(RangeError);
    expect(() => rollTraits(createRng(1), [], { positive: 0, negative: 0, any: 1 })).toThrow(RangeError);
    expect(() => rollTraits(createRng(1), DETECTIVE_TRAITS, { positive: 20, negative: 0, any: 0 })).toThrow(
      RangeError,
    );
  });

  it('rejects a malformed rule', () => {
    expect(() => rollTraits(createRng(1), DETECTIVE_TRAITS, { positive: -1, negative: 1, any: 0 })).toThrow(
      RangeError,
    );
    expect(() => rollTraits(createRng(1), DETECTIVE_TRAITS, { positive: 1.5, negative: 1, any: 0 })).toThrow(
      RangeError,
    );
  });
});

describe('traitModifier', () => {
  const accountant = trait('former-accountant');
  const claustrophobe = trait('claustrophobe');

  it('applies a bonus only to its skills and only when triggered', () => {
    expect(traitModifier([accountant], ['financial-documents'], 'reasoning')).toBe(3);
    expect(traitModifier([accountant], ['financial-documents'], 'social')).toBe(0);
    expect(traitModifier([accountant], ['confined-space'], 'reasoning')).toBe(0);
  });

  it('applies an all-skills penalty to any skill', () => {
    expect(traitModifier([claustrophobe], ['confined-space'], 'tech')).toBe(-3);
  });

  it('gives a mixed trait a bonus on one skill and a penalty on another', () => {
    const hothead = trait('hothead');

    expect(traitModifier([hothead], ['interrogation'], 'pressure')).toBe(3);
    expect(traitModifier([hothead], ['interrogation'], 'social')).toBe(-2);
    expect(traitModifier([hothead], ['interrogation'], 'tech')).toBe(0);
  });

  it('adds up several traits and ignores effects that are not modifiers', () => {
    const traits = [accountant, claustrophobe, trait('debtor')];

    expect(traitModifier(traits, ['financial-documents', 'confined-space', 'second-day'], 'reasoning')).toBe(
      0,
    );
    expect(traitModifier(traits, ['second-day'], 'reasoning')).toBe(0);
  });
});
