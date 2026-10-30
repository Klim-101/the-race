// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { createHeroSchema, defineArchetype } from '../archetype.js';
import { DETECTIVE_TRAITS } from './traits.js';

export const DETECTIVE = defineArchetype({
  id: 'detective',
  ownSkills: ['pressure', 'tech', 'contacts'],
  skillPoints: 10,
  maxSkillLevel: 5,
  traits: DETECTIVE_TRAITS,
});

export const DetectiveSkillSchema = z.enum(DETECTIVE.skills);
export type DetectiveSkill = z.infer<typeof DetectiveSkillSchema>;

export const DetectiveHeroSchema = createHeroSchema(DETECTIVE);
export type DetectiveHero = z.infer<typeof DetectiveHeroSchema>;
export type DetectiveSkillLevels = DetectiveHero['skills'];
