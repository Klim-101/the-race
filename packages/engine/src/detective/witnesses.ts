// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveCase, Witness } from './case-schema.js';
import { inWindow } from './leads.js';
import type { DetectiveRunState } from './run-state.js';

/** The first ruleset in which the hero can ask the people of a place what they saw. */
export const WITNESS_RULESET_VERSION = 19;
/** The first ruleset in which what a witness tells is a clue the hero holds. */
export const SIGHTING_CLUES_RULESET_VERSION = 22;

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
 * sees who walked by, not why. The victim of an attempt did not see who did it: the culprit is never among what they saw.
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
        (witness.victim !== true || actorId !== detectiveCase.truth.culpritId) &&
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
  // Written once: not again if the hero was told before, nor twice if the timeline has the same moment twice.
  const fresh = sightings.filter(
    ({ suspectId, minuteOfDay }, index) =>
      !run.sightings.some(
        (known) =>
          known.witnessId === witness.id &&
          known.suspectId === suspectId &&
          known.minuteOfDay === minuteOfDay,
      ) &&
      sightings.findIndex((other) => other.suspectId === suspectId && other.minuteOfDay === minuteOfDay) ===
        index,
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

/** The id of the clue in which a witness tells that they saw a suspect. Kebab-case, so a case can name it. */
export function sightingClueId(witnessId: string, suspectId: string): string {
  return `seen-${witnessId}-${suspectId}`;
}

/** What a describer is told to write a sighting in words: who saw whom, where, and at which times of the day. */
export interface SightingDescription {
  readonly witnessName: string;
  readonly suspectName: string;
  readonly placeName: string;
  /** Minutes into the day, smallest first, without repeats. */
  readonly minutesOfDay: readonly number[];
}

/**
 * Makes a clue of every sighting the timeline gives a witness: one for each witness and suspect, whatever the number of
 * times, set at the witness's place and about the suspect. The words come from the caller, since the engine holds no
 * text for the player; a case that names such a clue, in a lie, a conclusion or a chain, names it by `sightingClueId`.
 * A clue the case already has under that id is left as it is, so the case can be derived again and stay the same.
 */
export function deriveSightingClues(
  detectiveCase: DetectiveCase,
  describe: (description: SightingDescription) => string,
): DetectiveCase {
  const known = new Set(detectiveCase.clues.map(({ id }) => id));
  const derived = (detectiveCase.witnesses ?? []).flatMap((witness) => {
    const place = detectiveCase.locations.find(({ id }) => id === witness.locationId);
    const seen = sightingsOf(detectiveCase, witness);
    return detectiveCase.suspects.flatMap((suspect) => {
      const minutes = [
        ...new Set(
          seen.filter(({ suspectId }) => suspectId === suspect.id).map(({ minuteOfDay }) => minuteOfDay),
        ),
      ].toSorted((a, b) => a - b);
      const id = sightingClueId(witness.id, suspect.id);
      if (minutes.length === 0 || known.has(id) || place === undefined) return [];
      return [
        {
          id,
          locationId: witness.locationId,
          description: describe({
            witnessName: witness.name,
            suspectName: suspect.name,
            placeName: place.name,
            minutesOfDay: minutes,
          }),
          discovery: null,
          situations: [],
          source: null,
          pointsTo: [],
          about: [suspect.id],
          sightingOf: { witnessId: witness.id, suspectId: suspect.id },
          isRedHerring: false,
        },
      ];
    });
  });
  return derived.length === 0
    ? detectiveCase
    : { ...detectiveCase, clues: [...detectiveCase.clues, ...derived] };
}
