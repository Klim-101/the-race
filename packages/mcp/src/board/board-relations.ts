// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';

// What lights up when the player picks something on the board. Every element that can be picked or lit carries
// `data-rel`, the tokens of everything that should light it (`clue:ID`, `suspect:ID`, `place:ID`), and the page
// holds one CSS rule for each token. The page's script only sets which token is picked, so what is related to
// what is decided here, in plain code, from the public view alone, and the page still reads whole without the
// script. The relations are the player's own doing: where they found a clue and whom they showed it to.

export type Entity = 'clue' | 'suspect' | 'place';

export const token = (entity: Entity, id: string): string => `${entity}:${id}`;

/** Ids are kebab-case by the schema; anything else never becomes a selector, so no id can break out of a rule. */
const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const safe = (id: string): boolean => SAFE.test(id);

/** Whom each clue was shown to, and what the showing did; a clue shown twice to one person counts once. */
export function shownPairs(
  view: DetectiveRunView,
): { clueId: string; suspectId: string; effect: 'breaks-lie' | 'no-effect' }[] {
  const pairs = new Map<string, { clueId: string; suspectId: string; effect: 'breaks-lie' | 'no-effect' }>();
  for (const { clueId, suspectId, effect } of view.history.shown) {
    const key = `${clueId}\n${suspectId}`;
    const before = pairs.get(key);
    pairs.set(key, { clueId, suspectId, effect: before?.effect === 'breaks-lie' ? 'breaks-lie' : effect });
  }
  return [...pairs.values()];
}

const unique = (tokens: readonly string[]): string[] => [...new Set(tokens)];

/** The place a found clue was found at: where the hero found it, which is the clue's own. */
function foundAt(view: DetectiveRunView, clueId: string): string | undefined {
  return view.history.finds.find((find) => find.clueId === clueId)?.locationId;
}

/** What lights a clue: itself, the place it was found at and every person it was shown to. */
export function clueTokens(view: DetectiveRunView, clueId: string): string[] {
  const place = foundAt(view, clueId) ?? view.clues.find(({ id }) => id === clueId)?.locationId;
  return unique([
    token('clue', clueId),
    ...(place === undefined ? [] : [token('place', place)]),
    ...shownPairs(view)
      .filter((pair) => pair.clueId === clueId)
      .map(({ suspectId }) => token('suspect', suspectId)),
  ]);
}

/** What lights a person: themselves and every clue they were shown. */
export function suspectTokens(view: DetectiveRunView, suspectId: string): string[] {
  return unique([
    token('suspect', suspectId),
    ...shownPairs(view)
      .filter((pair) => pair.suspectId === suspectId)
      .map(({ clueId }) => token('clue', clueId)),
  ]);
}

/** What lights a place: itself and every clue found there. */
export function placeTokens(view: DetectiveRunView, placeId: string): string[] {
  return unique([
    token('place', placeId),
    ...view.clues
      .filter(({ id, locationId }) => (foundAt(view, id) ?? locationId) === placeId)
      .map(({ id }) => token('clue', id)),
  ]);
}

/** What lights a thread: the clues it joins, and for a thread to a person, that person too. */
export function threadTokens(clueIds: readonly string[], suspectId?: string): string[] {
  return unique([
    ...clueIds.map((id) => token('clue', id)),
    ...(suspectId === undefined ? [] : [token('suspect', suspectId)]),
  ]);
}

/** The `data-rel` of an element: its tokens, space separated. */
export const rel = (tokens: readonly string[]): string => tokens.join(' ');

/** Every token that can be picked on this board, whose id is safe to put in a selector. */
export function pickableTokens(view: DetectiveRunView): string[] {
  return unique([
    ...view.clues.map(({ id }) => token('clue', id)),
    ...view.suspects.map(({ id }) => token('suspect', id)),
    ...view.map.places.map(({ id }) => token('place', id)),
  ]).filter((entry) => safe(entry.slice(entry.indexOf(':') + 1)));
}

/**
 * The CSS that lights what is related to the picked token, one rule for each token that can be picked: the
 * related elements come back to full strength, an outline or a heavier stroke marks them, and the page's own
 * style sheet dims everything else while something is picked (`main[data-sel] [data-rel]`). These rules must
 * come after that one, since they have the same weight.
 */
export function highlightRules(view: DetectiveRunView): string {
  return pickableTokens(view)
    .map((entry) => {
      const lit = `main[data-sel="${entry}"] [data-rel~="${entry}"]`;
      return `${lit}{opacity:1;filter:none;outline:2px solid var(--accent);outline-offset:2px}
${lit} > rect{stroke:var(--accent);stroke-width:3}
${lit}:is(path,line){stroke-width:4;outline:0}`;
    })
    .join('\n');
}
