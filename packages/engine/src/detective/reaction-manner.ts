// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

/** From this ruleset a clue or conclusion that did something, and has no line of the suspect's, carries a `manner`. */
export const REACTION_MANNER_RULESET_VERSION = 30;

/**
 * How a suspect meets a thing that bears on them when the case gives them no words for it: they turn it aside
 * (`deflect`), refuse to move (`dig-in`) or say nothing and let the silence answer (`go-quiet`). It is a way to play
 * the moment, not a fact: it says nothing of whether the suspect is guilty.
 */
export const MANNERS = ['deflect', 'dig-in', 'go-quiet'] as const;
export type Manner = (typeof MANNERS)[number];

/**
 * The manner of one suspect before one thing shown, the same every time it is asked for. It comes from the ids alone,
 * never from the dice or the clock, so a replay of the run tells the same story and the dice stay where they were.
 */
export function mannerOf(suspectId: string, shownId: string): Manner {
  let hash = 2166136261;
  for (const char of `${suspectId}:${shownId}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  /* v8 ignore next -- unreachable: the index is always inside the list; the fallback only satisfies the compiler */
  return MANNERS[hash % MANNERS.length] ?? 'deflect';
}
