// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { MINUTES_PER_DAY, type RunClock } from '../run.js';
import type { DetectiveCase } from './case-schema.js';

/** The first ruleset in which an abduction has a deadline that ends the run, and an accusation names a place. */
export const ABDUCTION_RULESET_VERSION = 28;

/** The clock as one number: minutes since midnight of day 1, the unit of `deadlineMinute`. */
export function runMinuteOf(clock: RunClock): number {
  return (clock.day - 1) * MINUTES_PER_DAY + clock.minute;
}

/**
 * The minutes left before an abduction's deadline, or `null` for a case with none (or a run of a ruleset before it).
 * It is `0` once the deadline is reached: the victim is not found in time.
 */
export function minutesToDeadline(run: {
  readonly case: DetectiveCase;
  readonly clock: RunClock;
  readonly rulesetVersion: number;
}): number | null {
  const { abduction } = run.case.truth;
  if (abduction === undefined || run.rulesetVersion < ABDUCTION_RULESET_VERSION) return null;
  return Math.max(0, abduction.deadlineMinute - runMinuteOf(run.clock));
}
