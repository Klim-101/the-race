// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from './dice.js';

/** Every hero carries exactly this many hidden traits. */
export const HERO_TRAIT_COUNT = 2;

/** Situations the engine can recognise; a trait fires when its trigger is among the current ones. */
export const TRAIT_TRIGGERS = [
  'financial-documents',
  'confined-space',
  'police-contact',
  'second-day',
  'reinspection',
] as const;

export const TraitTriggerSchema = z.enum(TRAIT_TRIGGERS);
export type TraitTrigger = z.infer<typeof TraitTriggerSchema>;

export const TraitEffectSchema = z.discriminatedUnion('kind', [
  // A bonus or penalty on checks of the listed skills, or on every check.
  z.object({
    kind: z.literal('modifier'),
    skills: z.union([z.literal('all'), z.array(z.string().min(1)).min(1)]),
    amount: z.int().refine((amount) => amount !== 0, { message: 'A modifier of zero does nothing.' }),
  }),
  // The clue is found without a check.
  z.object({ kind: z.literal('auto-discover') }),
  // The named source is closed to the hero.
  z.object({ kind: z.literal('lock-out'), source: z.enum(['police-data']) }),
  // A world event the hero brings along, which costs time.
  z.object({ kind: z.literal('spawn-event'), event: z.enum(['debt-collector']) }),
]);
export type TraitEffect = z.infer<typeof TraitEffectSchema>;

export const TraitSchema = z.object({
  id: z.string().min(1),
  trigger: TraitTriggerSchema,
  effect: TraitEffectSchema,
});
export type Trait = z.infer<typeof TraitSchema>;

/** Draws distinct traits from a catalogue; a given seed always draws the same ones. */
export function rollTraits(rng: Rng, catalogue: readonly Trait[], count: number = HERO_TRAIT_COUNT): Trait[] {
  if (!Number.isInteger(count) || count < 0 || count > catalogue.length) {
    throw new RangeError(`Cannot draw ${String(count)} distinct traits from ${String(catalogue.length)}.`);
  }
  const pool = [...catalogue];
  const drawn: Trait[] = [];
  for (let index = 0; index < count; index += 1) {
    drawn.push(...pool.splice(rng.roll(pool.length) - 1, 1));
  }
  return drawn;
}

/** The total modifier the hero's traits give to a check of `skill` in the current situations. */
export function traitModifier(
  traits: readonly Trait[],
  situations: readonly TraitTrigger[],
  skill: string,
): number {
  let total = 0;
  for (const { trigger, effect } of traits) {
    if (effect.kind === 'modifier' && situations.includes(trigger)) {
      if (effect.skills === 'all' || effect.skills.includes(skill)) {
        total += effect.amount;
      }
    }
  }
  return total;
}
