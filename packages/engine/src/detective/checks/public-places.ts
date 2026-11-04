// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

/**
 * A public place, out of doors or where the hero can sit down, is somewhere the hero will stand and ask: it needs
 * something to ask. A place with nothing to look at, nobody to ask what they saw and no rumour to be had is a scenery
 * the hero walks through and gets nothing from, and the player is left to feel the case has no leads.
 */
export function checkPublicPlaces(detectiveCase: DetectiveCase): CaseIssue[] {
  const witnessed = new Set((detectiveCase.witnesses ?? []).map(({ locationId }) => locationId));
  const rumoured = new Set(
    (detectiveCase.leads ?? []).flatMap(({ earnedBy }) =>
      earnedBy.kind === 'locals' ? [earnedBy.locationId] : [],
    ),
  );
  return detectiveCase.locations.flatMap((location, index) =>
    (location.exposure === 'outdoor' || location.venue !== undefined) &&
    (location.parts ?? []).length === 0 &&
    !witnessed.has(location.id) &&
    !rumoured.has(location.id)
      ? [
          {
            code: 'empty-public-place' as const,
            path: `locations[${String(index)}]`,
            message: `"${location.id}" is a public place with nothing in it: give it a part to search, a witness (in "witnesses") or a "locals" lead.`,
          },
        ]
      : [],
  );
}
