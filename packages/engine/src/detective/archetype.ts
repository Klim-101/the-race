// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { createHeroSchema, defineArchetype } from '../archetype.js';
import { defineMeter } from '../meters.js';
import { MAX_REPUTATION } from '../run.js';
import { BackgroundSchema, DEFAULT_BACKGROUND } from './gear.js';
import { DETECTIVE_SIGNALS } from './signals.js';
import { DETECTIVE_TRAITS } from './traits.js';

export const DETECTIVE_REPUTATION = defineMeter({
  id: 'reputation',
  max: MAX_REPUTATION,
  start: MAX_REPUTATION,
  drain: { amount: 1, per: 'failure' },
  // Below 3 the public is warned: a hero at the edge of breakdown has little reputation to lose.
  thresholds: [{ below: 3, effects: { warning: 'low-reputation' } }],
});

// Nerves are spent as time passes (see `passTime`) and on a failure; the night gives back only a part.
// Below a threshold the hero is clumsy; `fatigue.ts` reads the mishap chance and the garble level.
export const DETECTIVE_NERVES = defineMeter({
  id: 'nerves',
  max: 10,
  start: 10,
  drain: { amount: 1, per: 'failure' },
  recovery: { amount: 3, per: 'night' },
  thresholds: [
    { below: 6, effects: { modifiers: [{ skills: 'all', amount: -1 }] } },
    { below: 3, effects: { modifiers: [{ skills: 'all', amount: -1 }], mishapChance: 15, garbleLevel: 2 } },
    // Nerves gone with little reputation behind the hero is a breakdown. With reputation of 3 or more it is
    // a collapse instead, which forces the night (P1-18) and does not end the run, so it is not here.
    { below: 1, when: [{ meter: 'reputation', below: 3 }], effects: { endsRun: { reason: 'breakdown' } } },
  ],
});

// Sleep debt counts up, so its bands are `atLeast`; a full night takes one point off.
export const DETECTIVE_SLEEP_DEBT = defineMeter({
  id: 'sleep-debt',
  max: 10,
  start: 0,
  drain: { amount: 1, per: 'night' },
  thresholds: [
    { atLeast: 4, effects: { modifiers: [{ skills: 'all', amount: -1 }], garbleLevel: 1 } },
    { atLeast: 7, effects: { modifiers: [{ skills: 'all', amount: -1 }], mishapChance: 10, garbleLevel: 2 } },
  ],
});

export const DETECTIVE = defineArchetype({
  id: 'detective',
  ownSkills: ['pressure', 'tech', 'contacts'],
  skillPoints: 10,
  maxSkillLevel: 5,
  traits: DETECTIVE_TRAITS,
  meters: [DETECTIVE_REPUTATION, DETECTIVE_NERVES, DETECTIVE_SLEEP_DEBT],
  signals: DETECTIVE_SIGNALS,
});

export const DetectiveSkillSchema = z.enum(DETECTIVE.skills);
export type DetectiveSkill = z.infer<typeof DetectiveSkillSchema>;

/** Who the hero was before: it decides the starting kit (see `gear.ts`). Old saves without one are policemen. */
export const DetectiveHeroSchema = createHeroSchema(DETECTIVE).extend({
  background: BackgroundSchema.default(DEFAULT_BACKGROUND),
});
export type DetectiveHero = z.infer<typeof DetectiveHeroSchema>;
export type DetectiveSkillLevels = DetectiveHero['skills'];
