// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { StockEntry } from './case-schema.js';
import { withSupplyAdded } from './consumables.js';
import type { GearId } from './gear.js';
import { partsOfPlace } from './search-parts.js';
import type { DetectiveRunState } from './run-state.js';
import { takeTool } from './suitcase.js';

// A place may keep something for the hero: a tool or a supply that is found when the place has been searched (a
// crowbar on a farm), or one that is sold there and is had for the asking (a sedative in a shop). The case says
// what each place holds, and nothing in it is ever needed to solve the case: the validator judges the hero's own
// kit alone. Money is not modelled; what a purchase costs is time, and what it takes is a slot or a pocket.

/** What it costs, in minutes, to pick up what a search turned up. */
export const FIND_MINUTES = 5;
/** What it costs, in minutes, to buy: the queue, the asking, the change. */
export const BUY_MINUTES = 15;

export type StockRefusal =
  'unknown-stock' | 'stock-taken' | 'already-carried' | 'no-slot' | 'not-in-suitcase' | 'pockets-full';

const MESSAGES: Readonly<Record<StockRefusal, string>> = {
  'unknown-stock': 'There is nothing like that on offer here.',
  'stock-taken': 'The hero has already taken that.',
  'already-carried': 'The hero already carries that tool.',
  'no-slot': 'The suitcase is full: name a tool to drop.',
  'not-in-suitcase': 'The tool to drop is not in the suitcase.',
  'pockets-full': 'The pockets hold all of that they can.',
};

export type TakeStockResult =
  | {
      readonly ok: true;
      readonly run: DetectiveRunState;
      readonly entry: StockEntry;
      readonly minutes: number;
    }
  | { readonly ok: false; readonly code: StockRefusal; readonly message: string };

const refused = (code: StockRefusal): TakeStockResult => ({ ok: false, code, message: MESSAGES[code] });

/** Whether the hero has searched the place: the whole of it, or any part of it. */
function searchedHere(run: DetectiveRunState, locationId: string): boolean {
  return (
    run.searchedLocationIds.includes(locationId) ||
    partsOfPlace(run, locationId).some(({ id }) => run.searchedParts.some(({ partId }) => partId === id))
  );
}

/**
 * What the place the hero stands in offers now: what is sold there, always, and what a search turns up, once the place
 * has been searched. What was taken is gone. A thing that lies undiscovered is never listed, so the list cannot hint
 * at it.
 */
export function offeredHere(run: DetectiveRunState): StockEntry[] {
  const place = run.case.locations.find(({ id }) => id === run.locationId);
  const searched = searchedHere(run, run.locationId);
  return (place?.stock ?? []).filter(
    ({ id, how }) => !run.takenStockIds.includes(id) && (how === 'sold' || searched),
  );
}

/**
 * Takes what the place offers: a tool goes in the suitcase (dropping `dropId` when it is full), a supply in the
 * pockets. Refused, with nothing spent, for what is not on offer here now (an id that names nothing, one of another
 * place and one not yet found are refused alike, so that asking tells nothing), what was taken already, a tool the
 * hero carries, a full suitcase with nothing dropped, a tool to drop that is not in it, and full pockets.
 */
export function takeStock(run: DetectiveRunState, stockId: string, dropId?: GearId): TakeStockResult {
  const entry = offeredHere(run).find(({ id }) => id === stockId);
  if (entry === undefined) {
    const taken = run.takenStockIds.includes(stockId);
    return refused(taken ? 'stock-taken' : 'unknown-stock');
  }
  const minutes = entry.how === 'sold' ? BUY_MINUTES : FIND_MINUTES;
  if (entry.kind === 'tool') {
    const result = takeTool(run, entry.itemId, dropId);
    if (!result.ok) return refused(result.code);
    return {
      ok: true,
      run: { ...result.run, takenStockIds: [...run.takenStockIds, entry.id] },
      entry,
      minutes,
    };
  }
  const { supplies, taken } = withSupplyAdded(run.supplies, entry.itemId, 1);
  if (taken === 0) return refused('pockets-full');
  return {
    ok: true,
    run: { ...run, supplies, takenStockIds: [...run.takenStockIds, entry.id] },
    entry,
    minutes,
  };
}
