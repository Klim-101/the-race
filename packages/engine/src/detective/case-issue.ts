// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { sortIssuesBy } from '../issues.js';

/**
 * Every reason a case may be rejected, the most fundamental first: a case that does not parse has nothing else to fix
 * yet, a place that cannot be reached makes the clues in it unobtainable, and so on up to the finer points of the
 * text. It is both the list of the codes and the order in which a generator is shown its issues (a code's priority is
 * its place in it), so a new code is added here, once, at the place where it belongs. The type of a code is made from
 * it, so a code that an issue carries is always in it; that no code is in it twice is a test of this module.
 */
export const ISSUE_ORDER = [
  // A patch that did not apply leaves nothing else to judge.
  'patch-failed',
  'schema',
  // The case is not of the form the brief named; nothing else can be judged by the rules of the wrong one.
  'form-mismatch',
  // A blank text is the next thing to fix once the schema is satisfied.
  'text-missing',
  'duplicate-id',
  'unknown-reference',
  'locale-mismatch',
  'wrong-language',
  'wrong-script',
  'real-name',
  'map-too-small',
  'map-too-large',
  'too-few-outdoor-places',
  'single-building',
  'hidden-start',
  'suspect-in-hidden-place',
  'parts-missing',
  'part-in-wrong-place',
  'clue-in-two-parts',
  'clue-without-part',
  'part-never-shown',
  'empty-public-place',
  'unreachable-location',
  'unobtainable-clue',
  'unreachable-suspect',
  'clue-not-tied',
  'lie-without-admission',
  'lie-chain-broken',
  'alibi-replaced-twice',
  'unearnable-lead',
  'unused-lead',
  'false-lead-holds-clue',
  'part-without-fallback',
  'fallback-unreachable',
  'too-few-evidence-chains',
  'overlapping-evidence-chains',
  'red-herring-in-evidence-chain',
  'unobtainable-evidence',
  'evidence-chain-misses-culprit',
  'no-chain-without-untrained-skill',
  'unobtainable-motive',
  'unlikely-solution',
  'chain-without-deduction',
  'culprit-cleared',
  'suspect-without-true-claim',
  'reaction-not-tied',
  'reaction-names-trait',
  'suspect-cannot-be-cleared',
  'red-herring-unexplained',
  'red-herring-without-thread',
  'unbreakable-lie',
  'witness-saw-the-crime',
  'culprit-not-at-crime',
  'actor-in-two-places',
  'too-many-red-herrings',
  'world-event-out-of-range',
  'event-cuts-solution',
  'random-event-out-of-range',
  'random-event-cuts-solution',
  'random-event-violence',
  'too-few-random-events',
  'random-events-miss-a-day',
  'run-length-out-of-range',
  'solution-after-culprit-flees',
  'deadline-out-of-range',
  'victim-place-unreachable',
  'deadline-too-short',
  'message-after-deadline',
  'victim-place-unled',
  'message-names-culprit',
  'message-names-trait',
  'clue-draws-conclusion',
] as const;

export type CaseIssueCode = (typeof ISSUE_ORDER)[number];

/** One reason a case was rejected; the message is written for the generator that has to fix it. */
export interface CaseIssue {
  readonly code: CaseIssueCode;
  readonly path: string;
  readonly message: string;
}

/**
 * The issues, the most fundamental first (see `ISSUE_ORDER`). Issues of one code keep the order they came in, and the
 * list given is left as it is.
 */
export function sortIssues(issues: readonly CaseIssue[]): CaseIssue[] {
  return sortIssuesBy(ISSUE_ORDER, issues);
}
