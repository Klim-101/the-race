// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';
import { inWindow } from '../leads.js';

const MINUTES_IN_DAY = 1440;

/**
 * A witness sees who walked by, so one who stood where the crime was done, at the minute it was done, would name the
 * culprit outright and leave nothing to find out. Such a witness is a different case, and this is not it.
 */
export function checkWitnesses(detectiveCase: DetectiveCase): CaseIssue[] {
  const { truth } = detectiveCase;
  return (detectiveCase.witnesses ?? []).flatMap((witness, index) =>
    witness.locationId === truth.crimeLocationId &&
    inWindow(witness.hours, truth.crimeAtMinute % MINUTES_IN_DAY)
      ? [
          {
            code: 'witness-saw-the-crime' as const,
            path: `witnesses[${String(index)}].hours`,
            message: `Witness "${witness.id}" stands at the scene of the crime when it happens: move their hours off that minute, or their place off the scene.`,
          },
        ]
      : [],
  );
}
