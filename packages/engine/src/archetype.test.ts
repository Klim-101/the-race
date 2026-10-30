// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { COMMON_SKILLS, OWN_SKILL_COUNT, createHeroSchema, defineArchetype } from './archetype.js';
import { DETECTIVE } from './detective/archetype.js';
import { ARCHETYPES } from './hero.js';
import { TraitSchema } from './traits.js';

const SURVIVOR = defineArchetype({
  id: 'survivor',
  ownSkills: ['endurance', 'foraging', 'first-aid'],
  skillPoints: 4,
  maxSkillLevel: 3,
  traits: [],
});

describe('defineArchetype', () => {
  it('puts the common skills first and the archetype’s own after them', () => {
    expect(SURVIVOR.skills).toEqual([...COMMON_SKILLS, 'endurance', 'foraging', 'first-aid']);
  });

  it('refuses an own skill that repeats a common skill or another own skill', () => {
    const base = { id: 'x', skillPoints: 4, maxSkillLevel: 3, traits: [] };

    expect(() => defineArchetype({ ...base, ownSkills: ['social', 'a', 'b'] })).toThrow(RangeError);
    expect(() => defineArchetype({ ...base, ownSkills: ['a', 'a', 'b'] })).toThrow(RangeError);
  });

  it('gives every archetype the same number of skills, the common ones included', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      expect(archetype.skills).toHaveLength(COMMON_SKILLS.length + OWN_SKILL_COUNT);
      expect(archetype.skills.slice(0, COMMON_SKILLS.length)).toEqual([...COMMON_SKILLS]);
    }
  });
});

describe('createHeroSchema', () => {
  const schema = createHeroSchema(SURVIVOR);
  const skills = { perception: 1, reasoning: 0, social: 0, endurance: 2, foraging: 1, 'first-aid': 0 };
  const hero = { name: 'Ilya', gender: 'male', archetype: 'survivor', skills };

  it('builds a schema from the skills and the budget of any archetype', () => {
    expect(schema.safeParse(hero).success).toBe(true);
  });

  it('enforces that archetype’s own budget and cap', () => {
    expect(schema.safeParse({ ...hero, skills: { ...skills, endurance: 1 } }).success).toBe(false);
    expect(
      schema.safeParse({ ...hero, skills: { ...skills, endurance: 4, foraging: 0, perception: 0 } }).success,
    ).toBe(false);
  });

  it('rejects skills that belong to another archetype, and missing ones', () => {
    const withoutForaging = { perception: 1, reasoning: 0, social: 0, endurance: 3, 'first-aid': 0 };

    expect(schema.safeParse({ ...hero, skills: { ...withoutForaging, pressure: 1 } }).success).toBe(false);
    expect(schema.safeParse({ ...hero, skills: withoutForaging }).success).toBe(false);
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
