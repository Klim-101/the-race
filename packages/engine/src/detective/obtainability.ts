// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever } from '../assert-never.js';
import type { InformationSource, Trait, TraitTrigger } from '../traits.js';
import { traitModifier } from '../traits.js';
import type { DetectiveHero } from './archetype.js';
import type { DetectiveCase, Location, LocationAccess, SkillCheck } from './case-schema.js';

export const D20_MAX = 20;

/**
 * Decides whether the hero can pass a skill check at all, under some assumption about luck.
 * The situations are those of the scene, which is what the hero's traits react to.
 */
export type CheckPolicy = (check: SkillCheck, situations: readonly TraitTrigger[]) => boolean;

// Two rules of the dice are deliberately left out. A natural 20 always succeeds at the table, but a case
// may not lean on a lucky roll, so only the best total counts. The auto-discovery of a photographic
// memory needs a failed first look, so a case may not lean on that either.
/** A natural 20 plus the skill level and the traits' modifier reaches the difficulty. */
export function canEverPass(hero: DetectiveHero, traits: readonly Trait[]): CheckPolicy {
  return (check, situations) =>
    hero.skills[check.skill] + traitModifier(traits, situations, check.skill) + D20_MAX >= check.difficulty;
}

/** The sources the hero's traits close to them. */
export function closedSources(traits: readonly Trait[]): ReadonlySet<InformationSource> {
  return new Set(
    traits.flatMap(({ effects }) =>
      effects.flatMap((effect) => (effect.kind === 'lock-out' ? [effect.source] : [])),
    ),
  );
}

// A check the hero can only pass on pure luck is a poor sole route to the solution, so the
// "comfortable" policy also demands at least one point in the skill.
export function canPassWithTrainedSkill(hero: DetectiveHero, traits: readonly Trait[]): CheckPolicy {
  const isPossible = canEverPass(hero, traits);
  return (check, situations) => hero.skills[check.skill] >= 1 && isPossible(check, situations);
}

export interface Obtainable {
  readonly locationIds: ReadonlySet<string>;
  readonly clueIds: ReadonlySet<string>;
}

/** Everything the hero can reach from the start, given which checks the policy lets through. */
export function computeObtainable(
  detectiveCase: DetectiveCase,
  canPass: CheckPolicy,
  closed: ReadonlySet<InformationSource> = new Set(),
): Obtainable {
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
      if (isAdjacent && canEnter(location.access, (check) => canPass(check, location.situations), clueIds)) {
        locationIds.add(location.id);
        hasChanged = true;
      }
    }
    for (const location of detectiveCase.locations) {
      if (!locationIds.has(location.id)) continue;
      for (const clue of detectiveCase.clues) {
        if (clue.locationId !== location.id || clueIds.has(clue.id)) continue;
        if (clue.source !== null && closed.has(clue.source)) continue;
        const situations = [...location.situations, ...clue.situations];
        if (clue.discovery === null || canPass(clue.discovery, situations)) {
          clueIds.add(clue.id);
          hasChanged = true;
        }
      }
    }
  }
  return { locationIds, clueIds };
}

function canEnter(
  access: LocationAccess,
  canPass: (check: SkillCheck) => boolean,
  clueIds: ReadonlySet<string>,
): boolean {
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
