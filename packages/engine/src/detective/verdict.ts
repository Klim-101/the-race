// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import { statusOfEndReason } from '../run.js';
import { clueNumber } from './clue-number.js';
import { EntityIdSchema, type Truth } from './case-schema.js';
import { epilogueOf, type Epilogue } from './epilogue.js';
import { GARBLED_REFUSAL_MESSAGE, anyGarbled } from './fatigue.js';
import {
  addInsight,
  endRun,
  endTurn,
  openLinkSizes,
  recordLink,
  spendTime,
  strainByAction,
  type DetectiveRunState,
} from './run-state.js';
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
  /** For an abduction, the place where the hero says the victim is kept; for no other form. */
  whereaboutsId: EntityIdSchema.optional(),
  /** The insight the hero offers as the motive, or `null` for an accusation without one. */
  motiveInsightId: EntityIdSchema.nullable(),
  /**
   * For a homicide, the insight the hero offers as what it was done with, or `null` for none; for no other form, left out
   * (or `null`, as a host may send it).
   */
  meansInsightId: EntityIdSchema.nullable().optional(),
  /** The clues the hero lays out as proof. */
  evidenceClueIds: z.array(EntityIdSchema),
});
export type AccuseIntent = z.infer<typeof AccuseIntentSchema>;

export const DEDUCE_MINUTES = 10;
/**
 * How many clues too many a link may hold and still give its conclusion: sound reasoning with a clue of noise
 * thrown in is not answered with silence. One is enough to forgive a slip and too few to find a conclusion by
 * piling clues on: the pair that makes it still has to be picked out.
 */
export const EXTRA_CLUES_FORGIVEN = 1;
/** The first ruleset in which a link may hold a clue too many; before it a link was exactly a conclusion's clues. */
export const LENIENT_LINKS_RULESET_VERSION = 20;
/** The first ruleset in which a failed link says whether one of its clues belongs to a conclusion still to draw. */
export const WARM_LINKS_RULESET_VERSION = 31;
/** A link that leads nowhere is time spent staring at the wall. */
export const FAILED_DEDUCTION_MINUTES = 20;

export type VerdictRefusalCode =
  | 'invalid-intent'
  | 'run-over'
  | 'unknown-suspect'
  | 'unknown-location'
  | 'place-needed'
  | 'place-unwanted'
  | 'means-needed'
  | 'means-unwanted'
  | 'not-found'
  | 'no-insight'
  | 'garbled-clue'
  | 'wrong-link-size';

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
      /** The suspect the conclusion clears, when it clears one. */
      readonly clears?: string;
      readonly minutes: number;
    }
  // Says nothing of how close the link was but for one weak sign, `warm`: a clue of it belongs to a conclusion not yet
  // drawn. It never says which clue or which conclusion, and a link that holds none of them is not warm.
  | {
      readonly kind: 'deduce';
      readonly result: 'nothing';
      readonly warm?: true;
      readonly minutes: number;
      readonly consequences: readonly ('time-lost' | 'mishap' | 'nerves-lost')[];
    };

export type DeduceResolution =
  | { readonly ok: true; readonly run: DetectiveRunState; readonly outcome: DeduceOutcome }
  | { readonly ok: false; readonly refusal: VerdictRefusal };

export const VERDICTS = ['proven', 'unproven', 'wrong'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Where a clue of the chain stood when the hero accused: laid out, found and left out, or never found. */
export const SHORTFALL_CLUE_STATES = ['laid-out', 'found', 'never-found'] as const;
export type ShortfallClueState = (typeof SHORTFALL_CLUE_STATES)[number];

/**
 * What an accusation of the right culprit lacked, told once the run is over (so it may name what the hero never
 * found). The motive: whether the hero offered a conclusion, and whether the conclusion of the case's motive had been
 * drawn at all. The evidence: the clues of the chain the hero came nearest to, and where each stood.
 */
export interface Shortfall {
  readonly motive: { readonly held: boolean; readonly offered: boolean; readonly drawn: boolean };
  /** Only for a homicide whose case asks for a conclusion about the means: as the motive, whether it was offered and drawn. */
  readonly means?: { readonly held: boolean; readonly offered: boolean; readonly drawn: boolean } | undefined;
  /**
   * Only for an abduction whose case has a conclusion about where the victim is: whether the hero had drawn it. A place
   * named without it is a place guessed, and the accusation falls short of proof however right the place was.
   */
  readonly place?: { readonly drawn: boolean } | undefined;
  readonly evidence: {
    readonly held: boolean;
    readonly clues: readonly {
      readonly clueId: string;
      readonly state: ShortfallClueState;
      readonly description: string;
      /** The number the hero knows the clue by, or `null` for one never found. */
      readonly number: string | null;
    }[];
  };
}

/** What the accusation turned out to be. Only built once the run is over, so it may show the truth. */
export interface AccusationOutcome {
  readonly kind: 'accuse';
  readonly verdict: Verdict;
  readonly culpritRight: boolean;
  /** Only for an abduction: whether the victim is where the hero said. */
  readonly placeRight?: boolean;
  readonly motiveRight: boolean;
  /** Only for a homicide whose case asks for it: whether the means the hero named is the one of the case. */
  readonly meansRight?: boolean;
  readonly evidenceComplete: boolean;
  /** Only for `unproven`: what the proof lacked. */
  readonly shortfall?: Shortfall;
  /** What the closing story is told from: the course of the crime and, by verdict, what was missed or misled. */
  readonly epilogue: Epilogue;
  readonly truth: Pick<Truth, 'culpritId' | 'motive' | 'method' | 'crimeLocationId'> & {
    /** Only for an abduction: where the victim was kept. */
    readonly whereaboutsId?: string;
    /** Only for a homicide: the victim, and whether they lived. */
    readonly homicide?: Truth['homicide'];
  };
}

export type AccuseResolution =
  | { readonly ok: true; readonly run: DetectiveRunState; readonly outcome: AccusationOutcome }
  | { readonly ok: false; readonly refusal: VerdictRefusal };

function refuse(code: VerdictRefusalCode, message: string): { ok: false; refusal: VerdictRefusal } {
  return { ok: false, refusal: { code, message } };
}

/**
 * What the player is told when a link is of a size that no open conclusion has: the sizes, and nothing else. A
 * link may hold up to `EXTRA_CLUES_FORGIVEN` clues more than a conclusion needs, and it is not refused for that.
 */
function wrongSizeMessage(sizes: readonly number[]): string {
  return sizes.length === 0
    ? 'Every conclusion of this case has been drawn; there is nothing left to link.'
    : `No conclusion takes a link of that size. The links still to be made take ${sizes.join(' or ')} clues.`;
}

/**
 * Links found clues into an insight. A link that holds all the clues of a deduction of the case, and at most
 * `EXTRA_CLUES_FORGIVEN` more, gives that insight. Any other link of a size an open conclusion has costs time and
 * reveals nothing, so it never tells whether it was close, and a link short of a conclusion by a clue is not told
 * so either; one of a size none has is refused unspent (the sizes are public: `openLinks`).
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

  const forgiven = run.rulesetVersion >= LENIENT_LINKS_RULESET_VERSION ? EXTRA_CLUES_FORGIVEN : 0;
  // The conclusions the link holds. One not yet drawn comes first, then the one that fits the link exactly.
  const held = run.case.deductions
    .filter((deduction) => {
      const needed = new Set(deduction.clueIds);
      return needed.size + forgiven >= link.size && [...needed].every((id) => link.has(id));
    })
    .toSorted(
      (a, b) =>
        Number(run.insightIds.includes(a.id)) - Number(run.insightIds.includes(b.id)) ||
        Math.abs(new Set(a.clueIds).size - link.size) - Math.abs(new Set(b.clueIds).size - link.size),
    );
  const match = held[0];
  if (!match) {
    const sizes = [...new Set(openLinkSizes(run))];
    if (!sizes.some((size) => link.size >= size && link.size <= size + forgiven)) {
      return refuse('wrong-link-size', wrongSizeMessage(sizes));
    }
    const linked = recordLink(run, [...link], 'nothing');
    const warm =
      run.rulesetVersion >= WARM_LINKS_RULESET_VERSION &&
      run.case.deductions.some(
        ({ id, clueIds }) => !run.insightIds.includes(id) && clueIds.some((clueId) => link.has(clueId)),
      );
    // A link that leads nowhere frays the nerves, up to the day's cap.
    const frayed = strainByAction(linked);
    const strained = frayed.condition.nerves < linked.condition.nerves;
    return {
      ok: true,
      run: endTurn(spendTime(frayed, FAILED_DEDUCTION_MINUTES), rng),
      outcome: {
        kind: 'deduce',
        result: 'nothing',
        ...(warm ? { warm: true as const } : {}),
        minutes: FAILED_DEDUCTION_MINUTES,
        consequences: strained ? ['time-lost', 'nerves-lost'] : ['time-lost'],
      },
    };
  }
  const known = run.insightIds.includes(match.id);
  const linked = recordLink(run, [...link], known ? 'already-known' : 'insight');
  const next = endTurn(spendTime(known ? linked : addInsight(linked, match.id), DEDUCE_MINUTES), rng);
  return {
    ok: true,
    run: next,
    outcome: {
      kind: 'deduce',
      result: known ? 'already-known' : 'insight',
      deductionId: match.id,
      ...(match.clears === undefined ? {} : { clears: match.clears }),
      minutes: DEDUCE_MINUTES,
    },
  };
}

/** What an unproven accusation lacked: see `Shortfall`. The chain nearest to whole is the one told, the first on a tie. */
function shortfallOf(
  run: DetectiveRunState,
  proof: {
    readonly motiveRight: boolean;
    readonly motiveInsightId: string | null;
    readonly meansRight: boolean | undefined;
    readonly meansInsightId: string | null | undefined;
    readonly evidenceComplete: boolean;
    readonly laidOut: ReadonlySet<string>;
  },
): Shortfall {
  const { solution } = run.case;
  const missing = (chain: readonly string[]): number => chain.filter((id) => !proof.laidOut.has(id)).length;
  // A case with no chain has nothing to come near; the validator wants two, so this is only a fallback.
  const [nearest = []] = solution.evidenceChains.toSorted((a, b) => missing(a) - missing(b));
  return {
    motive: {
      held: proof.motiveRight,
      offered: proof.motiveInsightId !== null,
      drawn: run.insightIds.includes(solution.motiveDeductionId),
    },
    ...(solution.meansDeductionId === undefined || proof.meansRight === undefined
      ? {}
      : {
          means: {
            held: proof.meansRight,
            offered: proof.meansInsightId !== null && proof.meansInsightId !== undefined,
            drawn: run.insightIds.includes(solution.meansDeductionId),
          },
        }),
    ...(solution.whereaboutsDeductionId === undefined
      ? {}
      : { place: { drawn: run.insightIds.includes(solution.whereaboutsDeductionId) } }),
    evidence: {
      held: proof.evidenceComplete,
      clues: run.case.clues
        .filter(({ id }) => nearest.includes(id))
        .map(({ id, description }) => {
          const found = run.foundClueIds.includes(id);
          return {
            clueId: id,
            state: proof.laidOut.has(id)
              ? ('laid-out' as const)
              : found
                ? ('found' as const)
                : ('never-found' as const),
            description,
            number: found ? clueNumber(run.hero.name, run.foundClueIds.indexOf(id)) : null,
          };
        }),
    },
  };
}

/**
 * The final accusation: who did it, why (an insight the hero has made) and the clues that prove it.
 * - `proven`: the culprit is right, the motive is the one in the solution and the evidence holds a whole
 *   evidence chain;
 * - `unproven`: the culprit is right but the proof falls short;
 * - `wrong`: someone else did it.
 * In an abduction the hero names the place where the victim is kept
 * as well, and the culprit and the place must both be right to prove or to fall short of proof: one of them wrong is
 * a `wrong` verdict. In a homicide the hero names what it was done with as well, as a conclusion like the motive: a right
 * culprit with the wrong means, or none, falls short of proof. The verdict ends the run (`won` only for a proven case) and only then does the outcome show the truth.
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
  const { culpritId, whereaboutsId, motiveInsightId, meansInsightId, evidenceClueIds } = parsed.data;
  if (!run.case.suspects.some(({ id }) => id === culpritId)) {
    return refuse('unknown-suspect', `"${culpritId}" is not a suspect.`);
  }
  const abduction = run.case.truth.abduction;
  if (abduction === undefined && whereaboutsId !== undefined) {
    return refuse('place-unwanted', 'Only an abduction asks where the victim is.');
  }
  if (abduction !== undefined) {
    if (whereaboutsId === undefined) {
      return refuse('place-needed', 'An abduction needs the place where the victim is kept.');
    }
    if (!run.case.locations.some(({ id }) => id === whereaboutsId)) {
      return refuse('unknown-location', `"${whereaboutsId}" is not a place of this case.`);
    }
  }
  // A homicide names what it was done with, or says it has none to name; no other form asks (a null a host sends is nothing).
  const homicide = run.case.truth.homicide;
  if (homicide === undefined && meansInsightId !== undefined && meansInsightId !== null) {
    return refuse('means-unwanted', 'Only a homicide asks what it was done with.');
  }
  if (homicide !== undefined && meansInsightId === undefined) {
    return refuse('means-needed', 'A homicide needs the insight of what it was done with, or null for none.');
  }
  if (evidenceClueIds.some((id) => !run.foundClueIds.includes(id))) {
    return refuse('not-found', 'Only clues the hero has found can be laid out as evidence.');
  }
  if (anyGarbled(run, evidenceClueIds)) return refuse('garbled-clue', GARBLED_REFUSAL_MESSAGE);
  if (motiveInsightId !== null && !run.insightIds.includes(motiveInsightId)) {
    return refuse('no-insight', 'The hero has made no such deduction.');
  }
  if (meansInsightId !== undefined && meansInsightId !== null && !run.insightIds.includes(meansInsightId)) {
    return refuse('no-insight', 'The hero has made no such deduction.');
  }

  const { truth, solution } = run.case;
  const placeRight = abduction === undefined ? undefined : whereaboutsId === abduction.whereabouts;
  const culpritRight = culpritId === truth.culpritId;
  const motiveRight = motiveInsightId === solution.motiveDeductionId;
  // The means is a conclusion as the motive is: a homicide whose case asks for none is judged without it, as before it existed.
  const meansRight =
    homicide === undefined || solution.meansDeductionId === undefined
      ? undefined
      : meansInsightId === solution.meansDeductionId;
  const laidOut = new Set(evidenceClueIds);
  const evidenceComplete = solution.evidenceChains.some((chain) => chain.every((id) => laidOut.has(id)));
  // The place has to be reasoned to, as the motive is: a right place that was only picked proves nothing. A case that
  // asks for no such conclusion (every case before it) is judged by the culprit, the motive and the proof alone.
  const placeConcluded =
    solution.whereaboutsDeductionId === undefined || run.insightIds.includes(solution.whereaboutsDeductionId);
  const verdict: Verdict =
    !culpritRight || placeRight === false
      ? 'wrong'
      : motiveRight && meansRight !== false && evidenceComplete && placeConcluded
        ? 'proven'
        : 'unproven';
  const shortfall =
    verdict === 'unproven'
      ? shortfallOf(run, {
          motiveRight,
          motiveInsightId,
          meansRight,
          meansInsightId,
          evidenceComplete,
          laidOut,
        })
      : undefined;

  return {
    ok: true,
    run: endRun(endTurn(run, rng), statusOfEndReason(verdict), verdict),
    outcome: {
      kind: 'accuse',
      verdict,
      culpritRight,
      ...(placeRight === undefined ? {} : { placeRight }),
      motiveRight,
      ...(meansRight === undefined ? {} : { meansRight }),
      evidenceComplete,
      ...(shortfall === undefined ? {} : { shortfall }),
      epilogue: epilogueOf(run, culpritId, shortfall),
      truth: {
        culpritId: truth.culpritId,
        motive: truth.motive,
        method: truth.method,
        crimeLocationId: truth.crimeLocationId,
        ...(abduction === undefined ? {} : { whereaboutsId: abduction.whereabouts }),
        ...(homicide === undefined ? {} : { homicide }),
      },
    },
  };
}
