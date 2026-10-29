// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import type { Hero } from '../hero.js';
import type { DetectiveCase, Location, LocationAccess, SkillCheck } from './case-schema.js';

export const D20_MAX = 20;

/** Decides whether the hero can pass a skill check at all, under some assumption about luck. */
export type CheckPolicy = (check: SkillCheck) => boolean;

/** A natural 20 plus the skill level reaches the difficulty. */
export function canEverPass(hero: Hero): CheckPolicy {
  return (check) => hero.skills[check.skill] + D20_MAX >= check.difficulty;
}

// A check the hero can only pass on pure luck is a poor sole route to the solution, so the
// "comfortable" policy also demands at least one point in the skill.
export function canPassWithTrainedSkill(hero: Hero): CheckPolicy {
  const isPossible = canEverPass(hero);
  return (check) => hero.skills[check.skill] >= 1 && isPossible(check);
}

export interface Obtainable {
  readonly locationIds: ReadonlySet<string>;
  readonly clueIds: ReadonlySet<string>;
}

/** Everything the hero can reach from the start, given which checks the policy lets through. */
export function computeObtainable(detectiveCase: DetectiveCase, canPass: CheckPolicy): Obtainable {
  const neighborsById = buildNeighbors(detectiveCase.locations);
  const locationIds = new Set<string>([detectiveCase.startLocationId]);
  const clueIds = new Set<string>();

  // Clues open locations and locations hold clues, so expand both until nothing new appears.
  let hasChanged = true;
  while (hasChanged) {
    hasChanged = false;
    for (const location of detectiveCase.locations) {
      if (locationIds.has(location.id)) continue;
      const isAdjacent = [...(neighborsById.get(location.id) ?? [])].some((id) => locationIds.has(id));
      if (isAdjacent && canEnter(location.access, canPass, clueIds)) {
        locationIds.add(location.id);
        hasChanged = true;
      }
    }
    for (const clue of detectiveCase.clues) {
      if (clueIds.has(clue.id) || !locationIds.has(clue.locationId)) continue;
      if (clue.discovery === null || canPass(clue.discovery)) {
        clueIds.add(clue.id);
        hasChanged = true;
      }
    }
  }
  return { locationIds, clueIds };
}

function canEnter(access: LocationAccess, canPass: CheckPolicy, clueIds: ReadonlySet<string>): boolean {
  switch (access.kind) {
    case 'open':
      return true;
    case 'skill':
      return canPass(access.check);
    case 'clue':
      return clueIds.has(access.clueId);
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(access);
  }
}

function buildNeighbors(locations: readonly Location[]): Map<string, Set<string>> {
  const neighborsById = new Map<string, Set<string>>();
  const link = (fromId: string, toId: string): void => {
    const neighbors = neighborsById.get(fromId) ?? new Set<string>();
    neighbors.add(toId);
    neighborsById.set(fromId, neighbors);
  };
  for (const location of locations) {
    for (const connectedId of location.connections) {
      link(location.id, connectedId);
      link(connectedId, location.id);
    }
  }
  return neighborsById;
}
