// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

export type CaseIssueCode =
  | 'schema'
  | 'duplicate-id'
  | 'unknown-reference'
  | 'locale-mismatch'
  | 'unreachable-location'
  | 'unobtainable-clue'
  | 'too-few-evidence-chains'
  | 'overlapping-evidence-chains'
  | 'red-herring-in-evidence-chain'
  | 'unobtainable-evidence'
  | 'evidence-chain-misses-culprit'
  | 'no-chain-without-untrained-skill'
  | 'unobtainable-motive'
  | 'unbreakable-lie'
  | 'culprit-not-at-crime'
  | 'actor-in-two-places'
  | 'too-many-red-herrings'
  | 'real-name'
  | 'wrong-script'
  | 'wrong-language';

/** One reason a case was rejected; the message is written for the generator that has to fix it. */
export interface CaseIssue {
  readonly code: CaseIssueCode;
  readonly path: string;
  readonly message: string;
}
