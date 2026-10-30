// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { meterEffects, type MeterReading, type ModifierEffect } from './meters.js';
import { signalModifier, type Signal } from './signals.js';
import { traitModifier, type Trait, type TraitTrigger } from './traits.js';

/** A timed condition or a piece of gear: while it is on the hero, its effects apply to checks. */
export interface ModifierItem {
  readonly id: string;
  readonly effects: readonly ModifierEffect[];
}

/** Everything that can move a check; every part is optional, so a caller names only what it has. */
export interface ModifierSources {
  readonly traits?: readonly Trait[];
  readonly conditions?: readonly ModifierItem[];
  readonly gear?: readonly ModifierItem[];
  readonly meters?: readonly MeterReading[];
  /** The hero's character signal, whose modifiers apply under their own triggers. */
  readonly signal?: Signal | undefined;
}

function effectTotal(effects: readonly ModifierEffect[], skill: string): number {
  let total = 0;
  for (const { skills, amount } of effects) {
    if (skills === 'all' || skills.includes(skill)) total += amount;
  }
  return total;
}

/**
 * The one place a check's modifier is added up: traits (when their trigger is among the situations),
 * timed conditions, gear, and the thresholds of meters. Consumables act through the conditions they start.
 */
export function collectModifier(
  sources: ModifierSources,
  skill: string,
  situations: readonly TraitTrigger[],
): number {
  let total =
    traitModifier(sources.traits ?? [], situations, skill) +
    signalModifier(sources.signal, situations, skill);
  for (const item of [...(sources.conditions ?? []), ...(sources.gear ?? [])]) {
    total += effectTotal(item.effects, skill);
  }
  for (const { definition, value } of sources.meters ?? []) {
    total += effectTotal(meterEffects(definition, value).modifiers, skill);
  }
  return total;
}
