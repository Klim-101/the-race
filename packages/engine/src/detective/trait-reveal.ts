// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { traitsActing, type Trait, type TraitTrigger } from '../traits.js';
import { closedSources } from './obtainability.js';
import { spendTime, type DetectiveRunState } from './run-state.js';

// A hidden trait is shown to the player the first time it does something: it shifts a roll, finds a clue
// without one, shuts a source or brings a debt collector to the door. The engine decides when, from the
// scene and the hero alone, so a replay of the log reveals the same traits at the same turns.

/** Runs started before this version play as they did: no trait is revealed and the engine adds no situation. */
export const TRAIT_REVEAL_RULESET_VERSION = 7;

/** From this minute of the day on, a check is made at night. */
export const NIGHT_FROM_MINUTE = 20 * 60;
/** What the debt collector costs on the second day. */
export const DEBT_COLLECTOR_MINUTES = 60;

export const REVEAL_REASONS = ['modifier', 'auto-discover', 'lock-out', 'spawn-event'] as const;
export type RevealReason = (typeof REVEAL_REASONS)[number];

/** A trait that has just shown itself, and how. */
export interface Revealed {
  readonly traitId: string;
  readonly polarity: Trait['polarity'];
  readonly reason: RevealReason;
}

/** A trait showing itself, with the polarity the narrator needs for the tone. */
export const revealedBy = (trait: Trait, reason: RevealReason): Revealed => ({
  traitId: trait.id,
  polarity: trait.polarity,
  reason,
});

const reveals = (run: DetectiveRunState): boolean => run.rulesetVersion >= TRAIT_REVEAL_RULESET_VERSION;

/** The scene's own situations, and those the clock adds: the evening and night hours, and any day after the first. */
export function sceneSituations(
  run: DetectiveRunState,
  scene: readonly TraitTrigger[],
): readonly TraitTrigger[] {
  if (!reveals(run)) return scene;
  const added: TraitTrigger[] = [];
  if (run.clock.minute >= NIGHT_FROM_MINUTE) added.push('night');
  if (run.clock.day >= 2) added.push('second-day');
  return [...new Set([...scene, ...added])];
}

/** The traits that moved a check of `skill` in these situations. */
export function actingReveals(
  run: DetectiveRunState,
  situations: readonly TraitTrigger[],
  skill: string,
): Revealed[] {
  return traitsActing(run.traits, situations, skill).map((trait) => revealedBy(trait, 'modifier'));
}

/** The trait that closes a source the hero came to a place for, if there is one. */
export function lockOutReveals(run: DetectiveRunState, locationId: string): Revealed[] {
  const closed = closedSources(run.traits);
  const shutOut = run.case.clues.some(
    (clue) =>
      clue.locationId === locationId &&
      !run.foundClueIds.includes(clue.id) &&
      clue.source !== null &&
      closed.has(clue.source),
  );
  if (!shutOut) return [];
  return run.traits
    .filter(({ effects }) => effects.some((effect) => effect.kind === 'lock-out'))
    .map((trait) => revealedBy(trait, 'lock-out'));
}

const SPAWNING = (trait: Trait): boolean => trait.effects.some((effect) => effect.kind === 'spawn-event');

/**
 * The debt collector of a hero in debt: on the turn the second day begins he costs an hour. The trait's
 * trigger is the second day itself, so it fires once, as the day turns.
 */
export function collectDebt(
  run: DetectiveRunState,
  previousDay: number,
): { run: DetectiveRunState; revealed: Revealed[] } {
  if (!reveals(run) || run.status !== 'active' || previousDay >= 2 || run.clock.day < 2) {
    return { run, revealed: [] };
  }
  const debtors = run.traits.filter((trait) => trait.trigger === 'second-day' && SPAWNING(trait));
  if (debtors.length === 0) return { run, revealed: [] };
  return {
    run: spendTime(run, DEBT_COLLECTOR_MINUTES * debtors.length),
    revealed: debtors.map((trait) => revealedBy(trait, 'spawn-event')),
  };
}

/** Marks the traits as shown and says which of them were new; a trait is only ever revealed once. */
export function applyReveals(
  run: DetectiveRunState,
  found: readonly Revealed[],
): { run: DetectiveRunState; revealed: Revealed[] } {
  if (!reveals(run)) return { run, revealed: [] };
  const known = new Set(run.revealedTraitIds);
  const fresh = found.filter(({ traitId }) => {
    if (known.has(traitId)) return false;
    known.add(traitId);
    return true;
  });
  if (fresh.length === 0) return { run, revealed: [] };
  return { run: { ...run, revealedTraitIds: [...known] }, revealed: fresh };
}
