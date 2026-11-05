// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { D20_SIDES, type Rng } from '../dice.js';
import { collectModifier } from '../modifiers.js';
import type { Location } from './case-schema.js';
import { modifierSources } from './condition.js';
import type { Consequence } from './actions.js';
import { changeReputation, strainNerves, type DetectiveRunState } from './run-state.js';
import { actingReveals, sceneSituations, type Revealed } from './trait-reveal.js';
import { locationScene } from './trait-scenes.js';

// Using a tool that is not lawful (a lockpick, a knife, a crowbar) risks being seen. How well the hero keeps their
// head is a die and their social skill, and what weighs on it: a calm trait, and how worn they are. A hero
// who is seen loses reputation and nerves; one who is badly seen is detained by the police, which costs hours,
// since the police must find out that the hero is a detective and may act, and a good name and good contacts
// shorten that. The rules never touch the case and they name no trait.

/** The first ruleset in which an unlawful tool carries a risk. */
export const RISK_RULESET_VERSION = 16;

/** The skill the hero keeps their head with: talking their way past whoever looks. */
export const DISCRETION = 'social';
/** A die plus the skill and the modifier of this much or more goes unseen. */
export const UNSEEN_AT = 7;
/** Below this the hero is not only seen but detained. */
export const DETAINED_BELOW = 4;
export const SEEN_REPUTATION = 1;
/** A detention lasts this long for a hero with no name and no contacts, in minutes. */
export const DETENTION_MINUTES = 240;
/** The least a detention takes, whatever the hero's name and contacts. */
export const MIN_DETENTION_MINUTES = 60;
/** What a point of reputation, and a level of contacts, take off a detention, in minutes. */
export const DETENTION_SHORTENED_BY_REPUTATION = 12;
export const DETENTION_SHORTENED_BY_CONTACTS = 10;

export interface Risk {
  readonly run: DetectiveRunState;
  /** The minutes a detention takes; none when the hero was not detained. */
  readonly detentionMinutes: number;
  readonly consequences: readonly Consequence[];
  readonly revealed: readonly Revealed[];
}

/** How long the police hold a hero of this name and these contacts. */
export function detentionMinutes(reputation: number, contacts: number): number {
  return Math.max(
    MIN_DETENTION_MINUTES,
    DETENTION_MINUTES -
      DETENTION_SHORTENED_BY_REPUTATION * reputation -
      DETENTION_SHORTENED_BY_CONTACTS * contacts,
  );
}

/** Whether a run plays by these rules. */
export const risks = (run: Pick<DetectiveRunState, 'rulesetVersion'>): boolean =>
  run.rulesetVersion >= RISK_RULESET_VERSION;

/** The risk of one use of an unlawful tool in a place: a die, and what it costs the hero if they are seen. */
export function unlawfulRisk(run: DetectiveRunState, rng: Rng, location: Location): Risk {
  const scene = sceneSituations(run, ['unlawful-act' as const, ...locationScene(run, location)]);
  const total =
    rng.roll(D20_SIDES) +
    run.hero.skills[DISCRETION] +
    collectModifier(modifierSources(run), DISCRETION, scene);
  const revealed = actingReveals(run, scene, DISCRETION);
  if (total >= UNSEEN_AT) return { run, detentionMinutes: 0, consequences: [], revealed };

  const detained = total < DETAINED_BELOW;
  const seen = strainNerves(changeReputation(run, -SEEN_REPUTATION));
  return {
    run: seen,
    detentionMinutes: detained ? detentionMinutes(run.reputation, run.hero.skills.contacts) : 0,
    consequences: [
      'spotted',
      ...(seen.reputation < run.reputation ? (['reputation-lost'] as const) : []),
      ...(seen.condition.nerves < run.condition.nerves ? (['nerves-lost'] as const) : []),
      ...(detained ? (['detained'] as const) : []),
    ],
    revealed,
  };
}
