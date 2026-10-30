// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from './dice.js';

/** Situations the engine can recognise; a trait fires when its trigger is among the current ones. */
export const TRAIT_TRIGGERS = [
  'financial-documents',
  'confined-space',
  'police-contact',
  'second-day',
  'reinspection',
  'digital-evidence',
  'crowd',
  'night',
  'interrogation',
  'high-society',
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

export const TRAIT_POLARITIES = ['positive', 'negative', 'mixed'] as const;
export const TraitPolaritySchema = z.enum(TRAIT_POLARITIES);
export type TraitPolarity = z.infer<typeof TraitPolaritySchema>;

/** Whether an effect helps the hero (`true`) or hurts them (`false`). */
export function isBeneficial(effect: TraitEffect): boolean {
  switch (effect.kind) {
    case 'modifier':
      return effect.amount > 0;
    case 'auto-discover':
      return true;
    case 'lock-out':
    case 'spawn-event':
      return false;
  }
}

export const TraitSchema = z
  .object({
    id: z.string().min(1),
    polarity: TraitPolaritySchema,
    trigger: TraitTriggerSchema,
    effects: z.array(TraitEffectSchema).min(1),
    // Traits that make no sense on the same hero, such as an accountant who cannot read a ledger.
    excludes: z.array(z.string().min(1)).default([]),
  })
  .superRefine((trait, context) => {
    const beneficial = trait.effects.filter(isBeneficial).length;
    const harmful = trait.effects.length - beneficial;
    const agrees =
      trait.polarity === 'positive'
        ? harmful === 0
        : trait.polarity === 'negative'
          ? beneficial === 0
          : beneficial > 0 && harmful > 0;
    if (!agrees) {
      context.addIssue({
        code: 'custom',
        path: ['polarity'],
        message: `Trait "${trait.id}" is marked ${trait.polarity} but its effects do not agree.`,
      });
    }
  });
export type Trait = z.output<typeof TraitSchema>;

/** How many traits of each kind a hero is dealt; `any` is drawn from whatever is left, mixed included. */
export const TraitRuleSchema = z.object({
  positive: z.int().min(0),
  negative: z.int().min(0),
  any: z.int().min(0),
});
export type TraitRule = z.infer<typeof TraitRuleSchema>;

/** One plus and one minus. */
export const DEFAULT_TRAIT_RULE: TraitRule = { positive: 1, negative: 1, any: 0 };

/** Draws traits by the rule; a given seed always draws the same ones, and excluded pairs never meet. */
export function rollTraits(
  rng: Rng,
  catalogue: readonly Trait[],
  rule: TraitRule = DEFAULT_TRAIT_RULE,
): Trait[] {
  if (!TraitRuleSchema.safeParse(rule).success) {
    throw new RangeError(`Invalid trait rule: ${JSON.stringify(rule)}.`);
  }
  let pool = [...catalogue];
  const drawn: Trait[] = [];
  const steps: [TraitPolarity | 'any', number][] = [
    ['positive', rule.positive],
    ['negative', rule.negative],
    ['any', rule.any],
  ];
  for (const [kind, count] of steps) {
    for (let index = 0; index < count; index += 1) {
      const candidates = pool.filter((trait) => kind === 'any' || trait.polarity === kind);
      const pick = candidates[rng.roll(candidates.length || 1) - 1];
      if (!pick) {
        throw new RangeError(`The catalogue has no ${kind} trait left to draw.`);
      }
      drawn.push(pick);
      pool = pool.filter(
        (other) =>
          other.id !== pick.id && !pick.excludes.includes(other.id) && !other.excludes.includes(pick.id),
      );
    }
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
  for (const { trigger, effects } of traits) {
    if (!situations.includes(trigger)) continue;
    for (const effect of effects) {
      if (effect.kind === 'modifier' && (effect.skills === 'all' || effect.skills.includes(skill))) {
        total += effect.amount;
      }
    }
  }
  return total;
}
