// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Rng } from './dice.js';
import { ARCHETYPES, HeroSchema, type Hero } from './hero.js';
import { DEFAULT_TRAIT_RULE, rollTraits, type Trait, type TraitRule } from './traits.js';

/** A hero as the engine knows them: what the player chose, and what the dice dealt behind their back. */
export interface AssembledHero {
  readonly hero: Hero;
  readonly traits: readonly Trait[];
}

/** What the player and the narrator may see. Traits join it only once the engine reveals them. */
export interface HeroView {
  readonly hero: Hero;
  readonly hiddenTraitCount: number;
}

export interface HeroIssue {
  readonly path: string;
  readonly message: string;
}

export type HeroAssemblyResult =
  | { readonly isValid: true; readonly assembled: AssembledHero }
  | { readonly isValid: false; readonly issues: readonly HeroIssue[] };

/**
 * Turns the player's choices (name, gender, archetype, distributed skill points) into a hero and rolls
 * their hidden traits on the run's dice. Anything the player passes beyond those choices, including
 * traits, is dropped. Invalid input consumes no dice.
 */
export function assembleHero(
  input: unknown,
  rng: Rng,
  rule: TraitRule = DEFAULT_TRAIT_RULE,
): HeroAssemblyResult {
  const parsed = HeroSchema.safeParse(input);
  if (!parsed.success) {
    return {
      isValid: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }
  const hero = parsed.data;
  return {
    isValid: true,
    assembled: { hero, traits: rollTraits(rng, ARCHETYPES[hero.archetype].traits, rule) },
  };
}

export function viewHero({ hero, traits }: AssembledHero): HeroView {
  return { hero, hiddenTraitCount: traits.length };
}
