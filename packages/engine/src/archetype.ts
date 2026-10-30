// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Trait } from './traits.js';

export const GenderSchema = z.enum(['female', 'male', 'nonbinary']);
export type Gender = z.infer<typeof GenderSchema>;

/**
 * Everything the shared engine needs to know about one kind of hero. An archetype owns its skills,
 * its point budget and its trait catalogue, so a new archetype is a new definition and not a change
 * to the code that rolls dice, draws traits or validates heroes.
 */
export interface ArchetypeDefinition<Id extends string, Skill extends string> {
  readonly id: Id;
  readonly skills: readonly [Skill, ...Skill[]];
  /** The player spends exactly this many points when creating a hero. */
  readonly skillPoints: number;
  readonly maxSkillLevel: number;
  readonly traits: readonly Trait[];
}

/** Identity helper that keeps the literal id and skill names in the type. */
export function defineArchetype<const Id extends string, const Skill extends string>(
  definition: ArchetypeDefinition<Id, Skill>,
): ArchetypeDefinition<Id, Skill> {
  return definition;
}

export function createSkillLevelsSchema<Skill extends string>(archetype: ArchetypeDefinition<string, Skill>) {
  const level = z.int().min(0).max(archetype.maxSkillLevel);
  return z
    .record(z.enum(archetype.skills), level)
    .refine(
      (levels: Record<string, number>) =>
        Object.values(levels).reduce((total, value) => total + value, 0) === archetype.skillPoints,
      { message: `Skill levels must add up to exactly ${String(archetype.skillPoints)} points.` },
    );
}

// Hidden traits are deliberately absent: the engine rolls them, and the player never chooses them.
export function createHeroSchema<Id extends string, Skill extends string>(
  archetype: ArchetypeDefinition<Id, Skill>,
) {
  return z.object({
    name: z.string().trim().min(1).max(60),
    gender: GenderSchema,
    archetype: z.literal(archetype.id),
    skills: createSkillLevelsSchema(archetype),
  });
}
