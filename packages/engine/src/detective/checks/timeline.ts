// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

/** The culprit was at the scene when the crime happened, and nobody is in two places at once. */
export function checkTimeline(detectiveCase: DetectiveCase): CaseIssue[] {
  const { truth } = detectiveCase;
  const issues: CaseIssue[] = [];

  const isCulpritAtCrime = truth.timeline.some(
    (entry) =>
      entry.actorId === truth.culpritId &&
      entry.locationId === truth.crimeLocationId &&
      entry.atMinute === truth.crimeAtMinute,
  );
  if (!isCulpritAtCrime) {
    issues.push({
      code: 'culprit-not-at-crime',
      path: 'truth.timeline',
      message: `The timeline must place "${truth.culpritId}" at "${truth.crimeLocationId}" at minute ${String(truth.crimeAtMinute)}.`,
    });
  }

  const locationIdByMoment = new Map<string, string>();
  truth.timeline.forEach((entry, index) => {
    const moment = `${entry.actorId}@${String(entry.atMinute)}`;
    const knownLocationId = locationIdByMoment.get(moment);
    if (knownLocationId !== undefined && knownLocationId !== entry.locationId) {
      issues.push({
        code: 'actor-in-two-places',
        path: `truth.timeline[${String(index)}]`,
        message: `"${entry.actorId}" is at "${knownLocationId}" and "${entry.locationId}" at minute ${String(entry.atMinute)}.`,
      });
    }
    locationIdByMoment.set(moment, entry.locationId);
  });
  return issues;
}
