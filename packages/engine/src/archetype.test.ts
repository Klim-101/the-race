// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { COMMON_SKILLS, OWN_SKILL_COUNT, createHeroSchema, defineArchetype } from './archetype.js';
import { DETECTIVE } from './detective/archetype.js';
import { ARCHETYPES } from './hero.js';
import { defineMeter } from './meters.js';
import { defineSignal } from './signals.js';
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

describe('defineArchetype signals', () => {
  const base = { id: 'x', ownSkills: ['a', 'b', 'c'], skillPoints: 4, maxSkillLevel: 3, traits: [] } as const;
  const stamina = defineMeter({ id: 'stamina', max: 5, start: 5 });
  const calm = defineSignal({
    id: 'calm',
    voice: 'v',
    gift: 'g',
    cost: 'c',
    meters: [{ meter: 'stamina', cap: 3 }],
  });
  const lucky = defineSignal({
    id: 'lucky',
    voice: 'v',
    gift: 'g',
    cost: 'c',
    events: [
      {
        id: 'e',
        chance: 10,
        variants: [
          { tone: 'neutral', kind: 'k', weight: 1, effects: [{ kind: 'meter', meter: 'luck', delta: 1 }] },
        ],
      },
      {
        id: 'f',
        chance: 10,
        variants: [
          { tone: 'neutral', kind: 'k', weight: 1, effects: [{ kind: 'condition', condition: 'cold' }] },
        ],
      },
    ],
  });

  it('keeps the signals of an archetype, none by default', () => {
    expect(defineArchetype({ ...base, meters: [stamina], signals: [calm] }).signals).toEqual([calm]);
    expect(defineArchetype(base).signals).toEqual([]);
  });

  it('refuses a repeated id, and a rule or an effect on a meter the archetype lacks', () => {
    expect(() => defineArchetype({ ...base, meters: [stamina], signals: [calm, calm] })).toThrow(RangeError);
    expect(() => defineArchetype({ ...base, signals: [calm] })).toThrow(/stamina/);
    expect(() => defineArchetype({ ...base, meters: [stamina], signals: [lucky] })).toThrow(/luck/);
  });

  it('lets a hero pick one of the signals, or none, and nothing else', () => {
    const schema = createHeroSchema(defineArchetype({ ...base, meters: [stamina], signals: [calm] }));
    const hero = {
      name: 'Ilya',
      gender: 'male',
      archetype: 'x',
      skills: { perception: 1, reasoning: 0, social: 0, a: 2, b: 1, c: 0 },
    };

    expect(schema.safeParse(hero).success).toBe(true);
    expect(schema.safeParse({ ...hero, signalId: 'calm' }).data?.signalId).toBe('calm');
    expect(schema.safeParse({ ...hero, signalId: 'unknown' }).success).toBe(false);
    expect(schema.safeParse({ ...hero, signalId: ['calm'] }).success).toBe(false);
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
