// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createHeroSchema, defineArchetype } from './archetype.js';
import { DETECTIVE } from './detective/archetype.js';
import { TraitSchema } from './traits.js';

const SURVIVOR = defineArchetype({
  id: 'survivor',
  skills: ['endurance', 'foraging'],
  skillPoints: 4,
  maxSkillLevel: 3,
  traits: [],
});

describe('createHeroSchema', () => {
  const schema = createHeroSchema(SURVIVOR);
  const hero = { name: 'Ilya', gender: 'male', archetype: 'survivor', skills: { endurance: 3, foraging: 1 } };

  it('builds a schema from the skills and the budget of any archetype', () => {
    expect(schema.safeParse(hero).success).toBe(true);
  });

  it('enforces that archetype’s own budget and cap', () => {
    expect(schema.safeParse({ ...hero, skills: { endurance: 2, foraging: 1 } }).success).toBe(false);
    expect(schema.safeParse({ ...hero, skills: { endurance: 4, foraging: 0 } }).success).toBe(false);
  });

  it('rejects skills that belong to another archetype, and missing ones', () => {
    expect(schema.safeParse({ ...hero, skills: { endurance: 3, logic: 1 } }).success).toBe(false);
    expect(schema.safeParse({ ...hero, skills: { endurance: 4 } }).success).toBe(false);
  });

  it('rejects a hero of another archetype', () => {
    expect(schema.safeParse({ ...hero, archetype: 'detective' }).success).toBe(false);
  });
});

describe('DETECTIVE', () => {
  it('has a valid trait catalogue that only touches its own skills', () => {
    for (const trait of DETECTIVE.traits) {
      expect(TraitSchema.safeParse(trait).success).toBe(true);
      for (const effect of trait.effects) {
        if (effect.kind === 'modifier' && effect.skills !== 'all') {
          for (const skill of effect.skills) expect(DETECTIVE.skills).toContain(skill);
        }
      }
    }
  });
});
