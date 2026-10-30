// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { MAX_METERS, type MeterDefinition } from './meters.js';
import type { Trait } from './traits.js';

export const GenderSchema = z.enum(['female', 'male', 'nonbinary']);
export type Gender = z.infer<typeof GenderSchema>;

/** Skills every archetype has, so that traits, conditions and gear that name them work in all of them. */
export const COMMON_SKILLS = ['perception', 'reasoning', 'social'] as const;
export type CommonSkill = (typeof COMMON_SKILLS)[number];
/** The skills an archetype adds to the common ones. */
export const OWN_SKILL_COUNT = 3;

/**
 * Everything the shared engine needs to know about one kind of hero. An archetype owns its skills,
 * its point budget and its trait catalogue, so a new archetype is a new definition and not a change
 * to the code that rolls dice, draws traits or validates heroes.
 */
export interface ArchetypeDefinition<Id extends string, Skill extends string> {
  readonly id: Id;
  /** The common skills first, then the archetype's own. */
  readonly skills: readonly [Skill, ...Skill[]];
  /** The player spends exactly this many points when creating a hero. */
  readonly skillPoints: number;
  readonly maxSkillLevel: number;
  readonly traits: readonly Trait[];
  /** At most `MAX_METERS`; a meter is data, so a new one needs no new code. */
  readonly meters: readonly MeterDefinition[];
}

export interface ArchetypeInput<Id extends string, OwnSkill extends string> {
  readonly id: Id;
  readonly ownSkills: readonly [OwnSkill, OwnSkill, OwnSkill];
  readonly skillPoints: number;
  readonly maxSkillLevel: number;
  readonly traits: readonly Trait[];
  readonly meters?: readonly MeterDefinition[];
}

/** Adds the common skills to the archetype's own and keeps the literal id and skill names in the type. */
export function defineArchetype<const Id extends string, const OwnSkill extends string>(
  input: ArchetypeInput<Id, OwnSkill>,
): ArchetypeDefinition<Id, CommonSkill | OwnSkill> {
  const { ownSkills, meters = [], ...rest } = input;
  const skills = [...COMMON_SKILLS, ...ownSkills] as const;
  if (new Set<string>(skills).size !== skills.length) {
    throw new RangeError(`The skills of "${input.id}" repeat a common skill or one another.`);
  }
  if (meters.length > MAX_METERS) {
    throw new RangeError(
      `"${input.id}" has ${String(meters.length)} meters; the budget is ${String(MAX_METERS)}.`,
    );
  }
  if (new Set(meters.map(({ id }) => id)).size !== meters.length) {
    throw new RangeError(`The meters of "${input.id}" repeat an id.`);
  }
  // A condition on a meter that is not on the archetype could never hold, so it is a mistake in the data.
  const meterIds = new Set(meters.map(({ id }) => id));
  for (const { id, thresholds } of meters) {
    for (const { when = [] } of thresholds) {
      for (const { meter } of when) {
        if (meter === id || !meterIds.has(meter)) {
          throw new RangeError(
            `A threshold of "${id}" has a condition on "${meter}", which is not another meter of "${input.id}".`,
          );
        }
      }
    }
  }
  return { ...rest, skills, meters };
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
