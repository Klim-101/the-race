// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { DETECTIVE_TRAITS } from './detective/traits.js';
import { createRng } from './dice.js';
import { HERO_TRAIT_COUNT, TraitSchema, rollTraits, traitModifier, type Trait } from './traits.js';

const trait = (id: Trait['id']): Trait => {
  const found = DETECTIVE_TRAITS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No trait ${id}`);
  return found;
};

describe('DETECTIVE_TRAITS', () => {
  it('holds valid traits with unique ids', () => {
    for (const entry of DETECTIVE_TRAITS) {
      expect(TraitSchema.safeParse(entry).success).toBe(true);
    }
    expect(new Set(DETECTIVE_TRAITS.map(({ id }) => id)).size).toBe(DETECTIVE_TRAITS.length);
  });

  it('rejects a modifier that does nothing', () => {
    const idle = { ...trait('claustrophobe'), effect: { kind: 'modifier', skills: 'all', amount: 0 } };

    expect(TraitSchema.safeParse(idle).success).toBe(false);
  });
});

describe('rollTraits', () => {
  it('draws the standard number of distinct traits', () => {
    const traits = rollTraits(createRng('hero'), DETECTIVE_TRAITS);

    expect(traits).toHaveLength(HERO_TRAIT_COUNT);
    expect(new Set(traits.map(({ id }) => id)).size).toBe(HERO_TRAIT_COUNT);
  });

  it('draws the same traits for the same seed', () => {
    expect(rollTraits(createRng('same'), DETECTIVE_TRAITS)).toEqual(
      rollTraits(createRng('same'), DETECTIVE_TRAITS),
    );
  });

  it('can reach every trait in the catalogue', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      for (const { id } of rollTraits(createRng(seed), DETECTIVE_TRAITS)) seen.add(id);
    }

    expect(seen.size).toBe(DETECTIVE_TRAITS.length);
  });

  it('draws the whole catalogue when asked, and nothing when asked for zero', () => {
    expect(rollTraits(createRng(1), DETECTIVE_TRAITS, DETECTIVE_TRAITS.length)).toHaveLength(
      DETECTIVE_TRAITS.length,
    );
    expect(rollTraits(createRng(1), DETECTIVE_TRAITS, 0)).toEqual([]);
  });

  it('rejects counts the catalogue cannot satisfy', () => {
    expect(() => rollTraits(createRng(1), DETECTIVE_TRAITS, -1)).toThrow(RangeError);
    expect(() => rollTraits(createRng(1), DETECTIVE_TRAITS, 1.5)).toThrow(RangeError);
    expect(() => rollTraits(createRng(1), DETECTIVE_TRAITS, DETECTIVE_TRAITS.length + 1)).toThrow(RangeError);
  });
});

describe('traitModifier', () => {
  const accountant = trait('former-accountant');
  const claustrophobe = trait('claustrophobe');

  it('applies a bonus only to its skills and only when triggered', () => {
    expect(traitModifier([accountant], ['financial-documents'], 'logic')).toBe(3);
    expect(traitModifier([accountant], ['financial-documents'], 'charm')).toBe(0);
    expect(traitModifier([accountant], ['confined-space'], 'logic')).toBe(0);
  });

  it('applies an all-skills penalty to any skill', () => {
    expect(traitModifier([claustrophobe], ['confined-space'], 'tech')).toBe(-3);
  });

  it('adds up several traits and ignores effects that are not modifiers', () => {
    const traits = [accountant, claustrophobe, trait('debtor')];

    expect(traitModifier(traits, ['financial-documents', 'confined-space', 'second-day'], 'logic')).toBe(0);
    expect(traitModifier(traits, ['second-day'], 'logic')).toBe(0);
  });
});
