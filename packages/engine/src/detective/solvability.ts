// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { InformationSource, Trait } from '../traits.js';
import type { DetectiveHero } from './archetype.js';
import type { DetectiveCase, RandomEventEffect } from './case-schema.js';
import { canEverPass, canPassWithTrainedSkill, closedSources, computeObtainable } from './obtainability.js';

/** What stands in the hero's way at some moment: places shut, sources closed, suspects moved. */
export interface Standing {
  readonly closedLocationIds: ReadonlySet<string>;
  readonly closedSources: ReadonlySet<InformationSource>;
  /** Where a suspect can now be found, for those who were moved. */
  readonly suspectPlaces: ReadonlyMap<string, string>;
}

/** The same standing with one more lasting effect on it; the effects that happen once change nothing. */
export function withEffect(standing: Standing, effect: RandomEventEffect): Standing {
  switch (effect.kind) {
    case 'location-closes':
      return { ...standing, closedLocationIds: new Set([...standing.closedLocationIds, effect.locationId]) };
    case 'source-closes':
      return { ...standing, closedSources: new Set([...standing.closedSources, effect.source]) };
    case 'suspect-moves':
      return {
        ...standing,
        suspectPlaces: new Map([...standing.suspectPlaces, [effect.suspectId, effect.locationId]]),
      };
    default:
      return standing;
  }
}

/**
 * Whether this hero can still prove the case under `standing`. It is pessimistic the same way the check of
 * scheduled events is: everything that stands is taken as if it had happened before the hero moved. The
 * hero must still be able to reach a whole evidence chain and the motive, to find every suspect where they
 * now are, and to break every lie. Luck is ignored, as everywhere in the validator.
 */
export function isSolvable(
  detectiveCase: DetectiveCase,
  hero: DetectiveHero,
  traits: readonly Trait[],
  standing: Standing,
): boolean {
  // The place the hero starts in cannot close: it is where they come back to.
  if (standing.closedLocationIds.has(detectiveCase.startLocationId)) return false;
  const open = {
    ...detectiveCase,
    locations: detectiveCase.locations.filter(({ id }) => !standing.closedLocationIds.has(id)),
  };
  const closed = new Set([...closedSources(traits), ...standing.closedSources]);
  const trained = computeObtainable(open, canPassWithTrainedSkill(hero, traits), closed);
  const possible = computeObtainable(open, canEverPass(hero, traits), closed);
  const { evidenceChains, motiveDeductionId } = detectiveCase.solution;
  const motiveClueIds = detectiveCase.deductions
    .filter(({ id }) => id === motiveDeductionId)
    .flatMap(({ clueIds }) => clueIds);
  return (
    evidenceChains.some((chain) => chain.every((id) => trained.clueIds.has(id))) &&
    motiveClueIds.every((id) => possible.clueIds.has(id)) &&
    detectiveCase.suspects.every((suspect) => {
      const place = standing.suspectPlaces.get(suspect.id) ?? suspect.locationId;
      return place === undefined || possible.locationIds.has(place);
    }) &&
    detectiveCase.suspects.every(({ lies }) =>
      lies.every((lie) => lie.brokenBy.some((id) => possible.clueIds.has(id))),
    )
  );
}

/** The places that scheduled events close, all of them: the pessimistic view the validator takes. */
export function scheduledClosures(detectiveCase: DetectiveCase): ReadonlySet<string> {
  return new Set(
    detectiveCase.clock.worldEvents.flatMap(({ effect }) =>
      effect?.kind === 'location-closes' ? [effect.locationId] : [],
    ),
  );
}
