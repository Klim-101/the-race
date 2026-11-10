// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { SEARCH_BY_PART_RULESET_VERSION } from './search-parts.js';
import { CLAIMS_RULESET_VERSION, followUpClaims, openingClaims } from './claims.js';
import { findToldClue, grantLeads, recordShown, setSuspectMood, type ShownEffect } from './run-state.js';
import {
  HOSTILE_MINUTES,
  MAX_MOOD_STEP,
  SHAKEN_EASE,
  STALE_SHOWS_RULESET_VERSION,
  moodWord,
  TALKS_RULESET_VERSION,
  isClosed,
  moodOf,
  type SuspectMoodWord,
} from './suspect-mood.js';
import { actingReveals, sceneSituations } from './trait-reveal.js';
import { locationScene } from './trait-scenes.js';
import { z } from 'zod';
import { rollCheck, type Rng, type SkillCheckResult } from '../dice.js';
import { collectModifier } from '../modifiers.js';
import { feltModifier, feltShield } from '../signals.js';
import type { CheckDetail, Consequence, Resolution } from './actions.js';
import { absoluteMinute, modifierSources } from './condition.js';
import { EntityIdSchema, type DetectiveCase, type Lie, type Suspect } from './case-schema.js';
import { closedSourcesOf, suspectPlace } from './random-events.js';
import {
  changeReputation,
  endTurn,
  signalOfRun,
  spendTime,
  strainByAction,
  strainNerves,
  type DetectiveRunState,
  type Statement,
} from './run-state.js';

// This file depends on `actions.ts` for types only: `actions.ts` imports the intent schema from here.

export const INTERROGATION_APPROACHES = ['pressure', 'social'] as const;
export const InterrogationApproachSchema = z.enum(INTERROGATION_APPROACHES);
export type InterrogationApproach = z.infer<typeof InterrogationApproachSchema>;

/**
 * Talk to a suspect of the place, showing clues the hero has found and putting to them the conclusions the hero has
 * drawn; with none shown it is only a talk.
 */
export const InterrogateIntentSchema = z.object({
  kind: z.literal('interrogate'),
  suspectId: EntityIdSchema,
  approach: InterrogationApproachSchema,
  clueIds: z.array(EntityIdSchema).max(20).default([]),
  /** Conclusions the hero has drawn, put to the suspect as a question (from the ruleset of talks on). */
  insightIds: z.array(EntityIdSchema).max(10).optional(),
  /** Spend a luck token to roll the check again if it fails (see `LuckSchema` in `actions.ts`). */
  luck: z.boolean().optional(),
});
export type InterrogateIntent = z.infer<typeof InterrogateIntentSchema>;

export const INTERROGATE_MINUTES = 20;
/** Extra time lost when the suspect is not moved, so that a failure is never "nothing happens". */
export const FAILED_INTERROGATION_MINUTES = 10;
/** Reputation lost by a hero who leans on a suspect and gets nowhere: word of the bullying spreads. */
export const FAILED_PRESSURE_REPUTATION = 1;
/** A natural 1 costs reputation whatever the approach, on top of any other loss. */
export const BLUNDER_REPUTATION = 1;
/** A natural 20 by charm wins the suspect over, and word of it spreads. */
export const CHARM_REPUTATION = 1;
/** A conclusion put to a suspect eases the check twice as much as a clue does. */
export const INSIGHT_EASE_FACTOR = 2;
/** However many lies a clue breaks, the check never becomes trivial. */
export const MIN_INTERROGATION_DIFFICULTY = 4;

interface ApproachRules {
  readonly skill: 'pressure' | 'social';
  /** The difficulty of a talk that shows nothing that breaks a lie. */
  readonly difficulty: number;
  /** How much easier each lie broken by a shown clue makes the check. */
  readonly easePerBrokenLie: number;
}

/** Pressure is harder to start but a clue in hand makes it bite; charm is easier and gentler. */
export const APPROACH_RULES: Readonly<Record<InterrogationApproach, ApproachRules>> = {
  pressure: { skill: 'pressure', difficulty: 14, easePerBrokenLie: 4 },
  social: { skill: 'social', difficulty: 11, easePerBrokenLie: 2 },
};

/**
 * What a shown clue or conclusion did: it broke a lie (`breaks-lie`), contradicted one that had already fallen
 * (`confirms`: the suspect cannot go back), is about the suspect but breaks no open lie (`implicates`: they dig
 * in or deflect), or is not about them. A clue that was brushed off reads like one that was beside the point.
 */
export type ClueEffect = ShownEffect;

/**
 * What the narrator may reveal about a talk with a suspect. It carries only what the suspect has said
 * (their alibi) and what the hero has just broken: never the lies that still hold, never the secret unless
 * a perfect roll earned it, never the truth.
 */
export interface InterrogationOutcome {
  readonly kind: 'interrogate';
  readonly suspectId: string;
  readonly approach: InterrogationApproach;
  readonly minutes: number;
  readonly succeeded: boolean;
  /** `gives-ground`: a lie fell this turn. `holds`: the suspect kept to their story. */
  readonly stance: 'holds' | 'gives-ground';
  readonly alibi: string;
  readonly presented: readonly {
    readonly clueId: string;
    readonly effect: ClueEffect;
    /** What the suspect says about the clue, in their own voice, when the case gives them a line for it. */
    readonly reaction?: string;
  }[];
  /** The conclusions put to the suspect, with what each did; absent when none was. */
  readonly presentedInsights?: readonly { readonly insightId: string; readonly effect: ClueEffect }[];
  /** How the talks have left the suspect, from the ruleset of talks on. */
  readonly mood?: SuspectMoodWord;
  /** Set when a pressure with nothing to stand on has closed the suspect for a while. */
  readonly closed?: true;
  /** Lies that fell in this talk, as the suspect told them. */
  readonly claimed?: readonly string[];
  readonly conceded: readonly {
    readonly lieId: string;
    readonly statement: string;
    /** What the suspect says instead, when the case gives it. */
    readonly admission?: string;
  }[];
  /** Only on a natural 20, and only when a lie fell with it. */
  readonly secret: string | null;
  /**
   * Clues the suspect told because the case names asking them as the way round an obstacle. Only on a success,
   * from the ruleset of parts on, and absent when there are none.
   */
  readonly told?: readonly string[];
  readonly reputationChange: number;
  readonly consequences: readonly Consequence[];
}

type TalkRefusal =
  | 'unknown-suspect'
  | 'suspect-elsewhere'
  | 'clue-not-found'
  | 'insight-not-found'
  | 'suspect-closed'
  | 'nothing-new';

function refuse(code: TalkRefusal, message: string): Resolution {
  return { ok: false, refusal: { code, message } };
}

/** A lie of the suspect that the shown clues or conclusions break, and whether a conclusion is among them. */
interface Breakable {
  readonly lie: Lie;
  readonly byInsight: boolean;
}

/**
 * The lies the suspect still tells: those not fallen, and, for a lie that follows another, only once that one has
 * fallen. A lie that has not been told yet cannot be broken, nor slip out.
 */
function standingLies(run: DetectiveRunState, suspect: Suspect): Lie[] {
  return suspect.lies.filter(
    (lie) =>
      !run.concededLieIds.includes(lie.id) &&
      (lie.after === undefined || run.concededLieIds.includes(lie.after)),
  );
}

/** The suspect's standing lies that one of the shown clues, or one of the conclusions put to them, breaks. */
function brokenLies(
  run: DetectiveRunState,
  suspect: Suspect,
  clueIds: readonly string[],
  insightIds: readonly string[],
): Breakable[] {
  return standingLies(run, suspect).flatMap((lie) => {
    const byInsight = (lie.brokenByInsights ?? []).some((id) => insightIds.includes(id));
    return byInsight || lie.brokenBy.some((clueId) => clueIds.includes(clueId)) ? [{ lie, byInsight }] : [];
  });
}

/** Whether a clue (or, put to the suspect, a conclusion) is one that breaks the lie. */
const fellBy = (lie: Lie, kind: 'clue' | 'insight', id: string): boolean =>
  (kind === 'clue' ? lie.brokenBy : (lie.brokenByInsights ?? [])).includes(id);

/** Whether a clue bears on a suspect: it points at them, or the case says it is about them. */
function isAbout(detectiveCase: DetectiveCase, clueId: string, suspectId: string): boolean {
  const clue = detectiveCase.clues.find(({ id }) => id === clueId);
  return clue !== undefined && [...(clue.about ?? []), ...clue.pointsTo].includes(suspectId);
}

/**
 * What a shown clue or conclusion did. Before the ruleset of talks only a lie that fell counts; from it, one that
 * contradicts a lie that had already fallen confirms it, and one about the suspect implicates them.
 */
function effectOf(fell: boolean, confirms: boolean, implicates: boolean, modern: boolean): ShownEffect {
  if (fell) return 'breaks-lie';
  if (modern && confirms) return 'confirms';
  return modern && implicates ? 'implicates' : 'no-effect';
}

/**
 * Clues that a person tells, because the way round the obstacle that guards them is to ask that person. Only a
 * run of the ruleset of parts is told anything, and a clue already found is not told again.
 */
function cluesToldBy(run: DetectiveRunState, detectiveCase: DetectiveCase, suspectId: string): string[] {
  if (run.rulesetVersion < SEARCH_BY_PART_RULESET_VERSION) return [];
  const closed = closedSourcesOf(run);
  return detectiveCase.locations
    .flatMap(({ parts }) => parts ?? [])
    .flatMap((part) => {
      const clue = detectiveCase.clues.find(({ id }) => id === part.holds);
      return clue !== undefined &&
        part.fallback?.kind === 'ask' &&
        part.fallback.suspectId === suspectId &&
        !run.foundClueIds.includes(clue.id) &&
        (clue.source === null || !closed.has(clue.source))
        ? [clue.id]
        : [];
    });
}

export function resolveInterrogate(run: DetectiveRunState, intent: InterrogateIntent, rng: Rng): Resolution {
  const suspect = run.case.suspects.find(({ id }) => id === intent.suspectId);
  if (!suspect) {
    return refuse('unknown-suspect', `There is no suspect "${intent.suspectId}".`);
  }
  // The public location, never the sealed timeline, which may hint at the crime scene.
  const place = suspectPlace(run, suspect);
  if (place !== undefined && place !== run.locationId) {
    return refuse('suspect-elsewhere', `"${suspect.id}" is not at the hero's place.`);
  }
  const modern = run.rulesetVersion >= TALKS_RULESET_VERSION;
  if (modern && isClosed(run, suspect.id)) {
    return refuse('suspect-closed', `"${suspect.id}" will not talk for now.`);
  }
  // An id that names no clue and one the hero has not found are refused alike, so that asking cannot
  // reveal what is still hidden. A conclusion is refused the same way.
  const shown = [...new Set(intent.clueIds)];
  if (shown.some((clueId) => !run.foundClueIds.includes(clueId))) {
    return refuse('clue-not-found', 'The hero can only show clues they have found.');
  }
  const putInsights = [...new Set(intent.insightIds ?? [])];
  if (!modern ? putInsights.length > 0 : putInsights.some((id) => !run.insightIds.includes(id))) {
    return refuse('insight-not-found', 'The hero can only put to a suspect a conclusion they have drawn.');
  }

  const rules = APPROACH_RULES[intent.approach];
  const mood = moodOf(run, suspect.id);
  const breakable = brokenLies(run, suspect, shown, putInsights);
  // A show that can change nothing is not made: everything put to the suspect only confirms what they have
  // already given up. It is public (the lie is in the statements), so saying so tells the player nothing hidden.
  const confirming = (kind: 'clue' | 'insight', id: string): boolean =>
    suspect.lies.some((lie) => run.concededLieIds.includes(lie.id) && fellBy(lie, kind, id));
  const offered = [
    ...shown.map((id) => confirming('clue', id)),
    ...putInsights.map((id) => confirming('insight', id)),
  ];
  if (
    run.rulesetVersion >= STALE_SHOWS_RULESET_VERSION &&
    breakable.length === 0 &&
    offered.length > 0 &&
    offered.every(Boolean)
  ) {
    return refuse(
      'nothing-new',
      `"${suspect.id}" has already given up everything that is shown; it changes nothing.`,
    );
  }
  const eased = breakable.reduce(
    (total, { byInsight }) => total + rules.easePerBrokenLie * (byInsight ? INSIGHT_EASE_FACTOR : 1),
    0,
  );
  // A suspect who has been shaken is easier to move at the next talk.
  const shaken = modern && mood.step >= 1 ? SHAKEN_EASE : 0;
  const difficulty = Math.max(MIN_INTERROGATION_DIFFICULTY, rules.difficulty - eased - shaken);
  const situations = sceneSituations(run, [
    'interrogation' as const,
    ...run.case.locations.flatMap((place) => (place.id === run.locationId ? locationScene(run, place) : [])),
  ]);
  const result: SkillCheckResult = rollCheck(
    rng,
    run.hero.skills,
    { skill: rules.skill, difficulty },
    collectModifier(modifierSources(run), rules.skill, situations),
  );

  // Evidence is evidence: a success makes the suspect give up every lie it breaks, a failure only the
  // first, and a blunder none.
  const lies = breakable.map(({ lie }) => lie);
  const fallen = result.success ? lies : result.critical === 'failure' ? [] : lies.slice(0, 1);
  // A perfect roll wins the secret with a fallen lie; a suspect who is broken gives it to any success.
  const secret =
    (result.critical === 'success' && fallen.length > 0) ||
    (modern && mood.step === MAX_MOOD_STEP && result.success)
      ? suspect.secret
      : null;

  let reputationChange = 0;
  const consequences: Consequence[] = [];
  if (!result.success) {
    consequences.push('time-lost');
    if (intent.approach === 'pressure') reputationChange -= FAILED_PRESSURE_REPUTATION;
  }
  if (result.critical === 'failure') reputationChange -= BLUNDER_REPUTATION;
  if (result.critical === 'success' && intent.approach === 'social') reputationChange += CHARM_REPUTATION;
  if (reputationChange < 0) consequences.push('reputation-lost');

  const minutes = INTERROGATE_MINUTES + (result.success ? 0 : FAILED_INTERROGATION_MINUTES);

  // What each thing shown did, by what fell in this talk and by what had fallen before.
  const effectOfShown = (kind: 'clue' | 'insight', id: string, implicates: boolean): ShownEffect =>
    effectOf(
      fallen.some((lie) => fellBy(lie, kind, id)),
      suspect.lies.some((lie) => run.concededLieIds.includes(lie.id) && fellBy(lie, kind, id)),
      implicates,
      modern,
    );
  // A clue that is not about the suspect gets no line from them, so a reaction never tells that it was about them.
  const presented = shown.map((clueId) => {
    const effect = effectOfShown('clue', clueId, isAbout(run.case, clueId, suspect.id));
    const reaction =
      effect === 'no-effect' ? undefined : suspect.reactions?.find((line) => line.clueId === clueId)?.text;
    return { clueId, effect, ...(reaction === undefined ? {} : { reaction }) };
  });
  const presentedInsights = putInsights.map((insightId) => ({
    insightId,
    effect: effectOfShown(
      'insight',
      insightId,
      run.case.deductions
        .filter(({ id }) => id === insightId)
        .some(({ clueIds }) => clueIds.some((clueId) => isAbout(run.case, clueId, suspect.id))),
    ),
  }));

  // What the suspect said aloud, in the order they said it: the alibi the first time, then each lie that fell,
  // then the secret. The lies that still hold are never written down.
  const said = (kind: Statement['kind'], text: string): Statement => ({
    suspectId: suspect.id,
    day: run.clock.day,
    kind,
    text,
  });
  const toldAlibi = run.statements.some(
    ({ suspectId, kind }) => suspectId === suspect.id && kind === 'alibi',
  );
  // What the suspect claims aloud: at the first talk their story, the true and the false alike, and, as a lie falls,
  // the lie that follows it. Nothing tells the hero which are which.
  const claimed =
    run.rulesetVersion < CLAIMS_RULESET_VERSION
      ? []
      : [
          ...(toldAlibi ? [] : openingClaims(suspect)),
          ...followUpClaims(
            suspect,
            fallen.map(({ id }) => id),
          ),
        ].filter(
          (text) => !run.claims.some((known) => known.suspectId === suspect.id && known.text === text),
        );
  const statements = [
    ...(toldAlibi ? [] : [said('alibi', suspect.alibi)]),
    ...fallen.map(({ statement, admission }) => said('conceded', admission ?? statement)),
    ...(secret === null ? [] : [said('secret', secret)]),
  ];
  // A lie that falls can hand over testimony, success or not; a part that falls back on asking needs a success.
  const given = fallen.flatMap(({ gives }) => (gives === undefined ? [] : [gives]));
  const told = [
    ...new Set([...(result.success ? cluesToldBy(run, run.case, suspect.id) : []), ...given]),
  ].filter((clueId) => !run.foundClueIds.includes(clueId));
  const withLies: DetectiveRunState = recordShown(
    {
      ...told.reduce(findToldClue, run),
      concededLieIds: [...run.concededLieIds, ...fallen.map(({ id }) => id)],
      claims: [
        ...run.claims,
        ...claimed.map((text) => ({ suspectId: suspect.id, day: run.clock.day, text })),
      ],
      statements: [...run.statements, ...statements],
    },
    suspect.id,
    presented,
  );
  // What the talk earned: a lead for a talk that went well, and one for each lie that fell. A suspect who is
  // cornered lets slip, to any success, the leads their other lies hold.
  const slipped =
    modern && mood.step >= 2 && result.success
      ? standingLies(run, suspect).filter((lie) => !fallen.includes(lie))
      : [];
  const granted = grantLeads(withLies, [
    ...(result.success ? [{ kind: 'talk' as const, suspectId: suspect.id }] : []),
    ...[...fallen, ...slipped].map(({ id }) => ({ kind: 'lie' as const, lieId: id })),
  ]);
  // A blunder costs its own point; any other failed pressure talk costs one more, up to the day's cap.
  const strained =
    result.critical === 'failure'
      ? strainNerves(granted)
      : !result.success && intent.approach === 'pressure'
        ? strainByAction(granted)
        : granted;
  if (strained.condition.nerves < run.condition.nerves && result.critical !== 'failure') {
    consequences.push('nerves-lost');
  }
  const spent = endTurn(spendTime(changeReputation(strained, reputationChange), minutes), rng);

  // How the talk leaves the suspect: each lie that fell pushes them a step; a pressure with nothing to stand on
  // (no clue or conclusion that breaks, confirms or implicates) leaves them hostile and closed for a while.
  const hostile =
    modern &&
    intent.approach === 'pressure' &&
    ![...presented, ...presentedInsights].some(({ effect }) => effect !== 'no-effect');
  const step = modern ? Math.min(MAX_MOOD_STEP, mood.step + fallen.length) : mood.step;
  const next = modern
    ? setSuspectMood(spent, {
        suspectId: suspect.id,
        step,
        closedUntil: hostile ? absoluteMinute(spent.clock) + HOSTILE_MINUTES : null,
      })
    : spent;
  const details: CheckDetail[] = [{ subject: { kind: 'suspect', id: suspect.id }, result }];
  // What the signal did: the gift or cost on the roll, and the nerves it spared on a blunder.
  const signal = signalOfRun(run);
  const felt = [
    ...feltModifier(signal, situations, rules.skill),
    ...(result.critical === 'failure' ? feltShield(signal, 'nerves', 'failure') : []),
  ];

  return {
    ok: true,
    run: next,
    felt,
    revealed: actingReveals(run, situations, rules.skill),
    outcome: {
      kind: 'interrogate',
      suspectId: suspect.id,
      approach: intent.approach,
      minutes,
      succeeded: result.success,
      stance: fallen.length > 0 ? 'gives-ground' : 'holds',
      alibi: suspect.alibi,
      presented,
      ...(putInsights.length === 0 ? {} : { presentedInsights }),
      ...(claimed.length === 0 ? {} : { claimed }),
      conceded: fallen.map(({ id, statement, admission }) => ({
        lieId: id,
        statement,
        ...(admission === undefined ? {} : { admission }),
      })),
      secret,
      ...(told.length === 0 ? {} : { told }),
      ...(modern ? { mood: moodWord(step) } : {}),
      ...(hostile ? { closed: true as const } : {}),
      reputationChange,
      consequences,
    },
    details,
  };
}
