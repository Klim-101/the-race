// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

export const SKILLS = ['observation', 'logic', 'charm', 'pressure', 'tech', 'contacts'] as const;

export const SkillSchema = z.enum(SKILLS);
export type Skill = z.infer<typeof SkillSchema>;

/** The player spends exactly this many points when creating a hero. */
export const HERO_SKILL_POINTS = 10;
export const MAX_SKILL_LEVEL = 5;

const SkillLevelSchema = z.int().min(0).max(MAX_SKILL_LEVEL);

export const SkillLevelsSchema = z
  .object({
    observation: SkillLevelSchema,
    logic: SkillLevelSchema,
    charm: SkillLevelSchema,
    pressure: SkillLevelSchema,
    tech: SkillLevelSchema,
    contacts: SkillLevelSchema,
  })
  .refine(
    (levels) => Object.values(levels).reduce((total, level) => total + level, 0) === HERO_SKILL_POINTS,
    { message: `Skill levels must add up to exactly ${String(HERO_SKILL_POINTS)} points.` },
  );
export type SkillLevels = z.infer<typeof SkillLevelsSchema>;

export const GenderSchema = z.enum(['female', 'male', 'nonbinary']);
export type Gender = z.infer<typeof GenderSchema>;

export const ArchetypeSchema = z.enum(['detective']);
export type Archetype = z.infer<typeof ArchetypeSchema>;

// Hidden traits are deliberately absent: the engine rolls them, and the player never chooses them.
export const HeroSchema = z.object({
  name: z.string().trim().min(1).max(60),
  gender: GenderSchema,
  archetype: ArchetypeSchema,
  skills: SkillLevelsSchema,
});
export type Hero = z.infer<typeof HeroSchema>;
