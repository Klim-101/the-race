// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';

type Mood = DetectiveRunView['suspects'][number]['mood'];
type KitItem = DetectiveRunView['kit'][number];

/**
 * What the last turn changed, read from two public views of the run. A mark is about that turn alone: the page
 * says nothing of what the hero has not yet looked at, so a player who reloads after three turns sees only
 * what the third one did.
 */
export interface Fresh {
  readonly clueIds: ReadonlySet<string>;
  readonly leadIds: ReadonlySet<string>;
  /** The people whose lie was broken by a clue shown in the turn. */
  readonly lieSuspectIds: ReadonlySet<string>;
  /** The people whose mood changed, with the mood they have now. */
  readonly moods: ReadonlyMap<string, Mood>;
  /** The tools that wore out or lost a use. */
  readonly tools: ReadonlyMap<string, KitItem>;
}

export const NOTHING_NEW: Fresh = {
  clueIds: new Set(),
  leadIds: new Set(),
  lieSuspectIds: new Set(),
  moods: new Map(),
  tools: new Map(),
};

const wornOut = (before: KitItem, now: KitItem): boolean =>
  before.state !== now.state ||
  (before.charges !== null && now.charges !== null && now.charges < before.charges);

/** What `view` has that `previous`, the view before the last turn, did not. Without a previous view, nothing. */
export function freshSince(view: DetectiveRunView, previous: DetectiveRunView | undefined): Fresh {
  if (previous === undefined) return NOTHING_NEW;
  const knownClues = new Set(previous.clues.map(({ id }) => id));
  const knownLeads = new Set(previous.leads.map(({ id }) => id));
  const moodBefore = new Map(previous.suspects.map(({ id, mood }) => [id, mood]));
  const kitBefore = new Map(previous.kit.map((item) => [item.id, item]));
  return {
    clueIds: new Set(view.clues.filter(({ id }) => !knownClues.has(id)).map(({ id }) => id)),
    leadIds: new Set(view.leads.filter(({ id }) => !knownLeads.has(id)).map(({ id }) => id)),
    lieSuspectIds: new Set(
      view.history.shown
        .slice(previous.history.shown.length)
        .filter(({ effect }) => effect === 'breaks-lie')
        .map(({ suspectId }) => suspectId),
    ),
    moods: new Map(
      view.suspects.filter(({ id, mood }) => moodBefore.get(id) !== mood).map(({ id, mood }) => [id, mood]),
    ),
    tools: new Map(
      view.kit.flatMap((item) => {
        const before = kitBefore.get(item.id);
        return before !== undefined && wornOut(before, item) ? [[item.id, item] as const] : [];
      }),
    ),
  };
}
