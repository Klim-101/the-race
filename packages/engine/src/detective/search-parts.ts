// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { ObstacleKind, PlacePart } from './case-schema.js';
import type { DetectiveRunState } from './run-state.js';

/** The first ruleset in which a place made of parts is searched part by part. */
export const SEARCH_BY_PART_RULESET_VERSION = 12;

/** The parts the hero can work with in a place: none for a run of an older ruleset and for a place left whole. */
export function partsOfPlace(run: DetectiveRunState, locationId: string): readonly PlacePart[] {
  if (run.rulesetVersion < SEARCH_BY_PART_RULESET_VERSION) return [];
  return run.case.locations.find(({ id }) => id === locationId)?.parts ?? [];
}

/**
 * What the hero has to get past an obstacle. The kit is yet to come, so for now it is the phone alone, and
 * its torch is for the dark; every other obstacle is for a tool the hero does not carry, and the case gives
 * a way round it (`fallbackOf`).
 */
const OBSTACLES_THE_PHONE_CLEARS: ReadonlySet<ObstacleKind> = new Set(['dark']);

export function canClear(obstacle: ObstacleKind | null): boolean {
  return obstacle === null || OBSTACLES_THE_PHONE_CLEARS.has(obstacle);
}
