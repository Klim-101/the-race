// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { actingReveals, sceneSituations } from './trait-reveal.js';
import { z } from 'zod';
import { rollCheck, type Rng, type SkillCheckResult } from '../dice.js';
import { collectModifier } from '../modifiers.js';
import { feltModifier, feltShield } from '../signals.js';
import type { CheckDetail, Consequence, Resolution } from './actions.js';
import { modifierSources } from './condition.js';
import { EntityIdSchema, type Lie, type Suspect } from './case-schema.js';
import { suspectPlace } from './random-events.js';
import {
  changeReputation,
  endTurn,
  signalOfRun,
  spendTime,
  strainNerves,
  type DetectiveRunState,
  type Statement,
} from './run-state.js';

// This file depends on `actions.ts` for types only: `actions.ts` imports the intent schema from here.

export const INTERROGATION_APPROACHES = ['pressure', 'social'] as const;
export const InterrogationApproachSchema = z.enum(INTERROGATION_APPROACHES);
export type InterrogationApproach = z.infer<typeof InterrogationApproachSchema>;

/** Talk to a suspect of the place, showing clues the hero has found; with none shown it is only a talk. */
export const InterrogateIntentSchema = z.object({
  kind: z.literal('interrogate'),
  suspectId: EntityIdSchema,
  approach: InterrogationApproachSchema,
  clueIds: z.array(EntityIdSchema).max(20).default([]),
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

/** What a shown clue did. It is the same for a clue that is beside the point and one that was brushed off. */
export type ClueEffect = 'breaks-lie' | 'no-effect';

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
  readonly presented: readonly { readonly clueId: string; readonly effect: ClueEffect }[];
  /** Lies that fell in this talk, as the suspect told them. */
  readonly conceded: readonly { readonly lieId: string; readonly statement: string }[];
  /** Only on a natural 20, and only when a lie fell with it. */
  readonly secret: string | null;
  readonly reputationChange: number;
  readonly consequences: readonly Consequence[];
}

function refuse(
  code: 'unknown-suspect' | 'suspect-elsewhere' | 'clue-not-found',
  message: string,
): Resolution {
  return { ok: false, refusal: { code, message } };
}

/** The suspect's standing lies that one of the shown clues breaks. */
function brokenLies(run: DetectiveRunState, suspect: Suspect, shown: readonly string[]): Lie[] {
  return suspect.lies.filter(
    (lie) => !run.concededLieIds.includes(lie.id) && lie.brokenBy.some((clueId) => shown.includes(clueId)),
  );
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
  // An id that names no clue and one the hero has not found are refused alike, so that asking cannot
  // reveal what is still hidden.
  const shown = [...new Set(intent.clueIds)];
  if (shown.some((clueId) => !run.foundClueIds.includes(clueId))) {
    return refuse('clue-not-found', 'The hero can only show clues they have found.');
  }

  const rules = APPROACH_RULES[intent.approach];
  const breakable = brokenLies(run, suspect, shown);
  const difficulty = Math.max(
    MIN_INTERROGATION_DIFFICULTY,
    rules.difficulty - rules.easePerBrokenLie * breakable.length,
  );
  const situations = sceneSituations(run, [
    'interrogation' as const,
    ...run.case.locations.flatMap(({ id, situations }) => (id === run.locationId ? situations : [])),
  ]);
  const result: SkillCheckResult = rollCheck(
    rng,
    run.hero.skills,
    { skill: rules.skill, difficulty },
    collectModifier(modifierSources(run), rules.skill, situations),
  );

  // Evidence is evidence: a success makes the suspect give up every lie it breaks, a failure only the
  // first, and a blunder none.
  const fallen = result.success ? breakable : result.critical === 'failure' ? [] : breakable.slice(0, 1);
  const secret = result.critical === 'success' && fallen.length > 0 ? suspect.secret : null;

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
  // What the suspect said aloud, in the order they said it: the alibi the first time, then each lie that fell,
  // then the secret a perfect roll won. The lies that still hold are never written down.
  const said = (kind: Statement['kind'], text: string): Statement => ({
    suspectId: suspect.id,
    day: run.clock.day,
    kind,
    text,
  });
  const toldAlibi = run.statements.some(
    ({ suspectId, kind }) => suspectId === suspect.id && kind === 'alibi',
  );
  const statements = [
    ...(toldAlibi ? [] : [said('alibi', suspect.alibi)]),
    ...fallen.map(({ statement }) => said('conceded', statement)),
    ...(secret === null ? [] : [said('secret', secret)]),
  ];
  const withLies: DetectiveRunState = {
    ...run,
    concededLieIds: [...run.concededLieIds, ...fallen.map(({ id }) => id)],
    statements: [...run.statements, ...statements],
  };
  const strained = result.critical === 'failure' ? strainNerves(withLies) : withLies;
  const next = endTurn(spendTime(changeReputation(strained, reputationChange), minutes), rng);
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
      presented: shown.map((clueId) => ({
        clueId,
        effect: fallen.some((lie) => lie.brokenBy.includes(clueId)) ? 'breaks-lie' : 'no-effect',
      })),
      conceded: fallen.map(({ id, statement }) => ({ lieId: id, statement })),
      secret,
      reputationChange,
      consequences,
    },
    details,
  };
}
