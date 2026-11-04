// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveCase, Witness } from './case-schema.js';
import { inWindow } from './leads.js';
import type { DetectiveRunState } from './run-state.js';

/** The first ruleset in which the hero can ask the people of a place what they saw. */
export const WITNESS_RULESET_VERSION = 19;

/** Minutes in a day: the timeline counts from the start of the crime day, and a witness keeps the hours of a day. */
const MINUTES_IN_DAY = 1440;

/** Asking after a person the hero holds a clue about (a description, a photograph, a thing that was theirs) is easier. */
export const WITNESS_NAMED_EASE = 2;

/** One thing a witness saw: who was at their place, and when in the day. */
export interface Sighting {
  readonly suspectId: string;
  /** Minutes into the day (0 to 1439); the day itself is the evening of the crime. */
  readonly minuteOfDay: number;
}

/** The witness the case names; the state of a run is checked on load, so a sighting never names another. */
export function requireWitness(detectiveCase: DetectiveCase, witnessId: string): Witness {
  const found = (detectiveCase.witnesses ?? []).find(({ id }) => id === witnessId);
  if (found === undefined) throw new Error(`The case has no witness "${witnessId}".`);
  return found;
}

/** The witnesses of the hero's place who are there now. A run from before the witnesses has none. */
export function witnessesHere(run: DetectiveRunState): Witness[] {
  if (run.rulesetVersion < WITNESS_RULESET_VERSION) return [];
  return (run.case.witnesses ?? []).filter(
    ({ locationId, hours }) => locationId === run.locationId && inWindow(hours, run.clock.minute),
  );
}

/**
 * What a witness saw, by a deterministic rule: the people of the sealed timeline at the witness's place in the
 * witness's hours, and nothing else. Only suspects are named, and no action or purpose is ever given: a passer-by
 * sees who walked by, not why.
 */
export function sightingsOf(
  detectiveCase: DetectiveCase,
  witness: Witness,
  aboutSuspectId?: string,
): Sighting[] {
  const suspectIds = new Set(detectiveCase.suspects.map(({ id }) => id));
  return detectiveCase.truth.timeline
    .filter(
      ({ actorId, locationId, atMinute }) =>
        locationId === witness.locationId &&
        suspectIds.has(actorId) &&
        (aboutSuspectId === undefined || actorId === aboutSuspectId) &&
        inWindow(witness.hours, atMinute % MINUTES_IN_DAY),
    )
    .map(({ actorId, atMinute }) => ({ suspectId: actorId, minuteOfDay: atMinute % MINUTES_IN_DAY }));
}

/** Whether the hero holds a clue that bears on the suspect: something to describe them by when asking after them. */
export function holdsClueAbout(run: DetectiveRunState, suspectId: string): boolean {
  return run.case.clues.some(
    (clue) =>
      run.foundClueIds.includes(clue.id) && [...(clue.about ?? []), ...clue.pointsTo].includes(suspectId),
  );
}

/** Writes down what a witness told, once: the same sighting told again adds nothing. */
export function recordSightings(
  run: DetectiveRunState,
  witness: Witness,
  sightings: readonly Sighting[],
): DetectiveRunState {
  const fresh = sightings.filter(
    ({ suspectId, minuteOfDay }) =>
      !run.sightings.some(
        (known) =>
          known.witnessId === witness.id &&
          known.suspectId === suspectId &&
          known.minuteOfDay === minuteOfDay,
      ),
  );
  return {
    ...run,
    sightings: [
      ...run.sightings,
      ...fresh.map(({ suspectId, minuteOfDay }) => ({
        witnessId: witness.id,
        suspectId,
        minuteOfDay,
        day: run.clock.day,
      })),
    ],
  };
}
