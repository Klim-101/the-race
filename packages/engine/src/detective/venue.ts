// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Location } from './case-schema.js';
import { isLocationClosed } from './random-events.js';
import type { DetectiveRunState } from './run-state.js';

// A place where one can sit (a teahouse, a cafe) gives back a little of the nerves the day wears down. It is a
// choice and not a free refill: it costs time, it is only for a hero who is frayed, there are only so many sittings
// a day, and a place that is shut, or unsafe to sit in, gives nothing. The case marks the places; the engine never
// guesses from a name.

/** The first ruleset in which the hero can sit down at a venue. */
export const VENUE_RULESET_VERSION = 17;

export const SIT_MINUTES = 40;
export const SIT_NERVES = 1;
export const MAX_SITS_PER_DAY = 2;

/** How many sittings the hero has left today. */
export function sitsLeft(run: DetectiveRunState): number {
  const spent = run.sitting.day === run.clock.day ? run.sitting.count : 0;
  return Math.max(0, MAX_SITS_PER_DAY - spent);
}

/** Why the hero cannot sit down here, or `null` when they can. */
export type SitRefusal = 'no-venue' | 'venue-closed' | 'venue-unsafe' | 'not-frayed' | 'sat-enough';

export function sitRefusal(run: DetectiveRunState, location: Location, nervesMax: number): SitRefusal | null {
  if (run.rulesetVersion < VENUE_RULESET_VERSION || location.venue === undefined) return 'no-venue';
  if (isLocationClosed(run, location.id)) return 'venue-closed';
  // A place a night there would be risky in is no place to sit and calm down either.
  if (location.lodging === 'risky') return 'venue-unsafe';
  if (run.condition.nerves >= nervesMax) return 'not-frayed';
  return sitsLeft(run) === 0 ? 'sat-enough' : null;
}
