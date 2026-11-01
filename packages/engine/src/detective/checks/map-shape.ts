// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { buildNeighbors } from '../obtainability.js';

/** The shape of the map a generated case must have: a town, not a floor plan. */
export interface MapRules {
  readonly minLocations: number;
  readonly maxLocations: number;
  /** Places out of doors: the streets, squares and yards that join the buildings. */
  readonly minOutdoor: number;
  /** Separate buildings: groups of indoor places that touch each other and nothing indoor outside the group. */
  readonly minBuildings: number;
}

/** What a generated case must bring. Left out, the validator accepts any map, as the cases of before did. */
export const GENERATED_MAP: MapRules = { minLocations: 8, maxLocations: 12, minOutdoor: 3, minBuildings: 2 };

/** The groups of indoor places that touch each other: the rooms of one building are one group. */
function buildings(detectiveCase: DetectiveCase): number {
  const indoor = new Set(
    detectiveCase.locations.filter(({ exposure }) => exposure === 'indoor').map(({ id }) => id),
  );
  const neighbors = buildNeighbors(detectiveCase.locations);
  const seen = new Set<string>();
  let groups = 0;
  for (const start of indoor) {
    if (seen.has(start)) continue;
    groups += 1;
    const queue = [start];
    seen.add(start);
    for (const id of queue) {
      for (const next of neighbors.get(id) ?? []) {
        if (indoor.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  return groups;
}

/**
 * The map of a generated case is a town: enough places, not too many, streets or squares between the buildings,
 * and more than one building. Two buildings never touch each other directly: rooms that touch are one building,
 * so a second building is a group of rooms that is reached through an outdoor place. A case from before this was
 * asked for is accepted, since no rules are given for it.
 */
export function checkMapShape(detectiveCase: DetectiveCase, rules: MapRules): CaseIssue[] {
  const count = detectiveCase.locations.length;
  const outdoor = detectiveCase.locations.filter(({ exposure }) => exposure === 'outdoor').length;
  const issues: CaseIssue[] = [];
  if (count < rules.minLocations) {
    issues.push({
      code: 'map-too-small',
      path: 'locations',
      message: `The map has ${String(count)} places; it needs at least ${String(rules.minLocations)}: a town with streets between its buildings, not a floor plan.`,
    });
  }
  if (count > rules.maxLocations) {
    issues.push({
      code: 'map-too-large',
      path: 'locations',
      message: `The map has ${String(count)} places; it may have at most ${String(rules.maxLocations)}.`,
    });
  }
  if (outdoor < rules.minOutdoor) {
    issues.push({
      code: 'too-few-outdoor-places',
      path: 'locations',
      message: `Only ${String(outdoor)} places are out of doors (exposure "outdoor"); at least ${String(rules.minOutdoor)} must be: a street, a square or a yard that joins the buildings.`,
    });
  }
  if (buildings(detectiveCase) < rules.minBuildings) {
    issues.push({
      code: 'single-building',
      path: 'locations',
      message: `The indoor places make fewer than ${String(rules.minBuildings)} separate buildings. Rooms of one building connect to each other; two buildings must connect only through an outdoor place, never directly.`,
    });
  }
  return issues;
}
