// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { createHeroSchema, defineArchetype } from '../archetype.js';
import { defineMeter } from '../meters.js';
import { MAX_REPUTATION } from '../run.js';
import { DETECTIVE_TRAITS } from './traits.js';

export const DETECTIVE = defineArchetype({
  id: 'detective',
  ownSkills: ['pressure', 'tech', 'contacts'],
  skillPoints: 10,
  maxSkillLevel: 5,
  traits: DETECTIVE_TRAITS,
  // Reputation is spent on blunders and has no effect of its own yet; its value lives in the run state.
  meters: [
    defineMeter({
      id: 'reputation',
      max: MAX_REPUTATION,
      start: MAX_REPUTATION,
      drain: { amount: 1, per: 'failure' },
    }),
  ],
});

export const DetectiveSkillSchema = z.enum(DETECTIVE.skills);
export type DetectiveSkill = z.infer<typeof DetectiveSkillSchema>;

export const DetectiveHeroSchema = createHeroSchema(DETECTIVE);
export type DetectiveHero = z.infer<typeof DetectiveHeroSchema>;
export type DetectiveSkillLevels = DetectiveHero['skills'];
