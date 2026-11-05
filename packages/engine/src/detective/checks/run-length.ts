// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

/**
 * How many days a case may give the hero. The case chooses (the plot decides how long a trail takes), within these
 * bounds, so that a run is neither over before it begins nor longer than the hero's nerves and the player's patience.
 */
export interface DayRules {
  readonly min: number;
  readonly max: number;
}

/** What a generated case must bring. Left out, the validator accepts any length the schema allows, as the cases of before did. */
export const GENERATED_DAYS: DayRules = { min: 3, max: 10 };

export function checkRunLength(detectiveCase: DetectiveCase, rules: DayRules): CaseIssue[] {
  const { days } = detectiveCase.clock;
  if (days >= rules.min && days <= rules.max) return [];
  return [
    {
      code: 'run-length-out-of-range',
      path: 'clock.days',
      message: `The case gives ${String(days)} days; a run lasts from ${String(rules.min)} to ${String(rules.max)}, so set "clock.days" in that range.`,
    },
  ];
}
