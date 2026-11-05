// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { absoluteMinute } from './condition.js';
import type { DetectiveRunState, SuspectMood } from './run-state.js';

// How the talks leave a suspect. A fallen lie pushes the suspect one step: calm, shaken, cornered, broken, each
// a word the narrator can play and the next talk can feel. A pressure that had nothing to stand on closes the
// suspect for a while. It all comes from what the hero did, and it names no hidden trait and nothing true.

/** The first ruleset in which a suspect has a state, a shown clue can confirm or implicate, and a conclusion can be put. */
export const TALKS_RULESET_VERSION = 15;

/** From this ruleset a show that only confirms what a suspect has already given up is refused, unspent. */
export const STALE_SHOWS_RULESET_VERSION = 26;

export const SUSPECT_MOODS = ['calm', 'shaken', 'cornered', 'broken'] as const;
export type SuspectMoodWord = (typeof SUSPECT_MOODS)[number];
export const MAX_MOOD_STEP = SUSPECT_MOODS.length - 1;

/** A suspect who is shaken or worse is easier to move: the check of the next talk is this much lower. */
export const SHAKEN_EASE = 2;
/** How long a suspect stays closed after a pressure that had nothing to stand on, in minutes. */
export const HOSTILE_MINUTES = 120;

const CALM: SuspectMood = { suspectId: '', step: 0, closedUntil: null };

/** How the talks have left a suspect; a suspect not yet talked to is calm. */
export function moodOf(run: DetectiveRunState, suspectId: string): SuspectMood {
  return run.suspectMoods.find((mood) => mood.suspectId === suspectId) ?? { ...CALM, suspectId };
}

/** Whether the suspect will not talk for now. */
export function isClosed(run: DetectiveRunState, suspectId: string): boolean {
  const { closedUntil } = moodOf(run, suspectId);
  return closedUntil !== null && absoluteMinute(run.clock) < closedUntil;
}

/** The word for a step; a step is 0 to 3 by the schema of the state, so there is always one. */
export function moodWord(step: number): SuspectMoodWord {
  return SUSPECT_MOODS.slice(step, step + 1).join('') as SuspectMoodWord;
}
