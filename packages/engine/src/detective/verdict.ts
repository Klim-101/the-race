// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import { statusOfEndReason } from '../run.js';
import { EntityIdSchema, type Truth } from './case-schema.js';
import { GARBLED_REFUSAL_MESSAGE, anyGarbled } from './fatigue.js';
import { addInsight, endRun, endTurn, spendTime, type DetectiveRunState } from './run-state.js';
import { assertCaseSealIntact } from './seal.js';

// Deduction and the accusation live apart from the other intents: they are the only ones that read the
// solution, so they are kept in one place where the rule "nothing from the sealed truth leaks before the
// verdict is final" can be checked.

export const DeduceIntentSchema = z.object({
  kind: z.literal('deduce'),
  /** The clues the hero tries to link into one insight. */
  clueIds: z.array(EntityIdSchema).min(2),
});
export type DeduceIntent = z.infer<typeof DeduceIntentSchema>;

export const AccuseIntentSchema = z.object({
  kind: z.literal('accuse'),
  culpritId: EntityIdSchema,
  /** The insight the hero offers as the motive, or `null` for an accusation without one. */
  motiveInsightId: EntityIdSchema.nullable(),
  /** The clues the hero lays out as proof. */
  evidenceClueIds: z.array(EntityIdSchema),
});
export type AccuseIntent = z.infer<typeof AccuseIntentSchema>;

export const DEDUCE_MINUTES = 10;
/** A link that leads nowhere is time spent staring at the wall. */
export const FAILED_DEDUCTION_MINUTES = 20;

export type VerdictRefusalCode =
  'invalid-intent' | 'run-over' | 'unknown-suspect' | 'not-found' | 'no-insight' | 'garbled-clue';

/** Why an intent was not carried out. Nothing changed and no time passed. */
export interface VerdictRefusal {
  readonly code: VerdictRefusalCode;
  readonly message: string;
}

export type DeduceOutcome =
  | {
      readonly kind: 'deduce';
      readonly result: 'insight' | 'already-known';
      readonly deductionId: string;
      readonly minutes: number;
    }
  // Deliberately says nothing of how close the link was.
  | {
      readonly kind: 'deduce';
      readonly result: 'nothing';
      readonly minutes: number;
      readonly consequences: readonly ('time-lost' | 'mishap')[];
    };

export type DeduceResolution =
  | { readonly ok: true; readonly run: DetectiveRunState; readonly outcome: DeduceOutcome }
  | { readonly ok: false; readonly refusal: VerdictRefusal };

export const VERDICTS = ['proven', 'unproven', 'wrong'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** What the accusation turned out to be. Only built once the run is over, so it may show the truth. */
export interface AccusationOutcome {
  readonly kind: 'accuse';
  readonly verdict: Verdict;
  readonly culpritRight: boolean;
  readonly motiveRight: boolean;
  readonly evidenceComplete: boolean;
  readonly truth: Pick<Truth, 'culpritId' | 'motive' | 'method' | 'crimeLocationId'>;
}

export type AccuseResolution =
  | { readonly ok: true; readonly run: DetectiveRunState; readonly outcome: AccusationOutcome }
  | { readonly ok: false; readonly refusal: VerdictRefusal };

function refuse(code: VerdictRefusalCode, message: string): { ok: false; refusal: VerdictRefusal } {
  return { ok: false, refusal: { code, message } };
}

/**
 * Links found clues into an insight. A link that is exactly the clue set of a deduction of the case gives
 * that insight. Any other link costs time and reveals nothing, so it never tells whether it was close.
 * An id that is not among the found clues is refused before anything is spent, and names nothing: the
 * same answer for a clue that does not exist and one that was not found.
 */
export function deduce(run: DetectiveRunState, input: unknown, rng: Rng): DeduceResolution {
  const parsed = DeduceIntentSchema.safeParse(input);
  if (!parsed.success) {
    return refuse('invalid-intent', parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  if (run.status !== 'active') {
    return refuse('run-over', `The run is already over (${run.status}).`);
  }
  const link = new Set(parsed.data.clueIds);
  if (link.size < 2 || [...link].some((id) => !run.foundClueIds.includes(id))) {
    return refuse('not-found', 'A link needs two different clues the hero has found.');
  }

  if (anyGarbled(run, [...link])) return refuse('garbled-clue', GARBLED_REFUSAL_MESSAGE);

  const match = run.case.deductions.find(
    (deduction) =>
      new Set(deduction.clueIds).size === link.size && deduction.clueIds.every((id) => link.has(id)),
  );
  if (!match) {
    return {
      ok: true,
      run: endTurn(spendTime(run, FAILED_DEDUCTION_MINUTES), rng),
      outcome: {
        kind: 'deduce',
        result: 'nothing',
        minutes: FAILED_DEDUCTION_MINUTES,
        consequences: ['time-lost'],
      },
    };
  }
  const known = run.insightIds.includes(match.id);
  const next = endTurn(spendTime(known ? run : addInsight(run, match.id), DEDUCE_MINUTES), rng);
  return {
    ok: true,
    run: next,
    outcome: {
      kind: 'deduce',
      result: known ? 'already-known' : 'insight',
      deductionId: match.id,
      minutes: DEDUCE_MINUTES,
    },
  };
}

/**
 * The final accusation: who did it, why (an insight the hero has made) and the clues that prove it.
 * - `proven`: the culprit is right, the motive is the one in the solution and the evidence holds a whole
 *   evidence chain;
 * - `unproven`: the culprit is right but the proof falls short;
 * - `wrong`: someone else did it.
 * The verdict ends the run (`won` only for a proven case) and only then does the outcome show the truth.
 * A case that no longer matches its seal is not judged at all.
 */
export function accuse(run: DetectiveRunState, input: unknown, rng: Rng): AccuseResolution {
  const parsed = AccuseIntentSchema.safeParse(input);
  if (!parsed.success) {
    return refuse('invalid-intent', parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  assertCaseSealIntact(run);
  if (run.status !== 'active') {
    return refuse('run-over', `The run is already over (${run.status}).`);
  }
  const { culpritId, motiveInsightId, evidenceClueIds } = parsed.data;
  if (!run.case.suspects.some(({ id }) => id === culpritId)) {
    return refuse('unknown-suspect', `"${culpritId}" is not a suspect.`);
  }
  if (evidenceClueIds.some((id) => !run.foundClueIds.includes(id))) {
    return refuse('not-found', 'Only clues the hero has found can be laid out as evidence.');
  }
  if (anyGarbled(run, evidenceClueIds)) return refuse('garbled-clue', GARBLED_REFUSAL_MESSAGE);
  if (motiveInsightId !== null && !run.insightIds.includes(motiveInsightId)) {
    return refuse('no-insight', 'The hero has made no such deduction.');
  }

  const { truth, solution } = run.case;
  const culpritRight = culpritId === truth.culpritId;
  const motiveRight = motiveInsightId === solution.motiveDeductionId;
  const laidOut = new Set(evidenceClueIds);
  const evidenceComplete = solution.evidenceChains.some((chain) => chain.every((id) => laidOut.has(id)));
  const verdict: Verdict = !culpritRight ? 'wrong' : motiveRight && evidenceComplete ? 'proven' : 'unproven';

  return {
    ok: true,
    run: endRun(endTurn(run, rng), statusOfEndReason(verdict), verdict),
    outcome: {
      kind: 'accuse',
      verdict,
      culpritRight,
      motiveRight,
      evidenceComplete,
      truth: {
        culpritId: truth.culpritId,
        motive: truth.motive,
        method: truth.method,
        crimeLocationId: truth.crimeLocationId,
      },
    },
  };
}
