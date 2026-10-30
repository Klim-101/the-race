// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildHero } from '../test/fixtures/cheese-case.js';
import { HeroSchema } from './hero.js';

describe('HeroSchema', () => {
  it('accepts a hero who spent exactly the skill budget', () => {
    expect(HeroSchema.safeParse(buildHero()).success).toBe(true);
  });

  it('rejects unspent or overspent points', () => {
    const hero = buildHero();

    expect(HeroSchema.safeParse({ ...hero, skills: { ...hero.skills, tech: 1 } }).success).toBe(false);
    expect(HeroSchema.safeParse({ ...hero, skills: { ...hero.skills, tech: 3 } }).success).toBe(false);
  });

  it('rejects a skill above the maximum level', () => {
    const skills = { perception: 6, reasoning: 4, social: 0, pressure: 0, tech: 0, contacts: 0 };

    expect(HeroSchema.safeParse({ ...buildHero(), skills }).success).toBe(false);
  });
});
