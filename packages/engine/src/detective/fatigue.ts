// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import { meterEffects } from '../meters.js';
import type { Consequence, Outcome, Resolution } from './actions.js';
import { DETECTIVE_NERVES, DETECTIVE_SLEEP_DEBT } from './archetype.js';
import type { HeroCondition } from './condition.js';
import { EntityIdSchema } from './case-schema.js';
import { changeReputation, endTurn, spendTime, type DetectiveRunState } from './run-state.js';

// Fatigue makes the hero clumsy and muddles what they read. It is bookkeeping around a turn, never a
// change to the case: a mishap costs time or a little reputation, and a garbled reading only means the
// clue has to be read again before it can be used. No clue is ever lost or hidden by either.

/** Read a clue that was garbled again: the clean text is shown by the engine's data, the agent narrates it. */
export const RereadIntentSchema = z.object({ kind: z.literal('reread'), clueId: EntityIdSchema });
export type RereadIntent = z.infer<typeof RereadIntentSchema>;

/** A careful re-read costs time and never nerves. */
export const REREAD_MINUTES = 10;
/** Time lost to a mishap that costs time. */
export const MISHAP_MINUTES = 10;
/** Reputation lost to a mishap that costs reputation. */
export const MISHAP_REPUTATION = 1;

export interface MishapDefinition {
  readonly id: string;
  readonly cost: 'time' | 'reputation';
}

/** The kinds of mishap: the outcome names one by id and the agent writes what it looked like. */
export const MISHAPS = [
  { id: 'stumble', cost: 'time' },
  { id: 'spilled-coffee', cost: 'reputation' },
  { id: 'lost-keys', cost: 'time' },
  { id: 'wrong-name', cost: 'reputation' },
] as const satisfies readonly MishapDefinition[];
export type MishapKind = (typeof MISHAPS)[number]['id'];
export const MISHAP_KINDS = MISHAPS.map(({ id }) => id) as [MishapKind, ...MishapKind[]];
export const MishapKindSchema = z.enum(MISHAP_KINDS);

/** The chance, in percent, that a turn goes wrong from the hero's nerves and sleep debt: the worst band. */
export function mishapChanceOf(condition: Pick<HeroCondition, 'nerves' | 'sleepDebt'>): number {
  return Math.max(
    meterEffects(DETECTIVE_NERVES, condition.nerves).mishapChance,
    meterEffects(DETECTIVE_SLEEP_DEBT, condition.sleepDebt).mishapChance,
  );
}

/** How garbled a reading is, 0 (clean) to 3: a pure function of nerves and sleep debt, the worst band. */
export function garbleLevelOf(condition: Pick<HeroCondition, 'nerves' | 'sleepDebt'>): number {
  return Math.max(
    meterEffects(DETECTIVE_NERVES, condition.nerves).garbleLevel,
    meterEffects(DETECTIVE_SLEEP_DEBT, condition.sleepDebt).garbleLevel,
  );
}

/** Clues the hero has found whose text is still garbled: ids the player already knows. */
export function garbledFoundClueIds(run: DetectiveRunState): string[] {
  return run.garbledClueIds.filter((id) => run.foundClueIds.includes(id));
}

/** Whether any of the clues is still garbled. */
export function anyGarbled(run: DetectiveRunState, clueIds: readonly string[]): boolean {
  return clueIds.some((id) => run.garbledClueIds.includes(id));
}

/** What fatigue adds to an outcome: both are left out when there is nothing to say. */
export interface Fatigue {
  readonly mishap: MishapKind;
  readonly garbleLevel: number;
}

/** The one refusal both deduction and accusation give for a garbled clue: it names none. */
export const GARBLED_REFUSAL_MESSAGE = 'A clue was read badly: the hero must read it again first.';

/** Re-reads a garbled clue: it costs time, never nerves, and the clue is clean from then on. */
export function resolveReread(run: DetectiveRunState, intent: RereadIntent, rng: Rng): Resolution {
  if (!run.foundClueIds.includes(intent.clueId)) {
    return {
      ok: false,
      refusal: { code: 'clue-not-found', message: 'The hero can only read clues they found.' },
    };
  }
  if (!run.garbledClueIds.includes(intent.clueId)) {
    return { ok: false, refusal: { code: 'not-garbled', message: 'The clue was read clearly already.' } };
  }
  const cleared: DetectiveRunState = {
    ...run,
    garbledClueIds: run.garbledClueIds.filter((id) => id !== intent.clueId),
  };
  return {
    ok: true,
    run: endTurn(spendTime(cleared, REREAD_MINUTES), rng),
    outcome: { kind: 'reread', clueId: intent.clueId, minutes: REREAD_MINUTES },
    details: [],
  };
}

/**
 * What fatigue adds to a turn that was carried out on `before`: the garble of what the hero read, and
 * maybe a mishap. Both follow the hero as they were when the turn began. The mishap is rolled on the run's
 * dice only when its chance is above zero, so a rested hero's dice are untouched. Evidence is not touched.
 * The accusation is left alone: it ends the run.
 */
export function applyFatigue(
  before: DetectiveRunState,
  resolution: Resolution & { ok: true },
  rng: Rng,
): Resolution {
  const { outcome } = resolution;
  if (outcome.kind === 'accuse') return resolution;
  let { run } = resolution;
  let extra: Partial<Fatigue> = {};
  let minutes = 0;
  let consequences: readonly Consequence[] | undefined;

  const level = garbleLevelOf(before.condition);
  if (level > 0 && (outcome.kind === 'look' || outcome.kind === 'search' || outcome.kind === 'interrogate')) {
    extra = { garbleLevel: level };
    if (outcome.kind !== 'interrogate') {
      const fresh = outcome.foundClueIds.filter((id) => !run.garbledClueIds.includes(id));
      run = { ...run, garbledClueIds: [...run.garbledClueIds, ...fresh] };
    }
  }

  const chance = mishapChanceOf(before.condition);
  if (chance > 0 && rng.roll(100) <= chance) {
    // `?? MISHAPS[0]` only satisfies the index check: the roll is always inside the list.
    /* v8 ignore next */
    const mishap = MISHAPS[rng.roll(MISHAPS.length) - 1] ?? MISHAPS[0];
    extra = { ...extra, mishap: mishap.id };
    if (mishap.cost === 'time') {
      minutes = MISHAP_MINUTES;
      run = spendTime(run, minutes);
    } else {
      run = changeReputation(run, -MISHAP_REPUTATION);
    }
    if ('consequences' in outcome) consequences = [...outcome.consequences, 'mishap'];
  }

  // The turn closed its dice state before the mishap was rolled: take it again so a save resumes right.
  const next = {
    ...outcome,
    ...extra,
    minutes: outcome.minutes + minutes,
    ...(consequences === undefined ? {} : { consequences }),
  } as Outcome;
  return { ...resolution, run: { ...run, rngState: rng.state() }, outcome: next };
}
