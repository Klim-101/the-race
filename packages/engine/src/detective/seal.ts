// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { canonicalJson, sha256Hex } from '../canonical-json.js';
import type { DetectiveCase } from './case-schema.js';

export const CASE_SEAL_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Seals a case at the moment the validator accepts it: the SHA-256 of its canonical JSON, whole, so the
 * truth and the solution are covered along with every clue and lie that points at them. A case that is
 * read back from a save has the same seal whatever order its keys were stored in.
 *
 * This is tamper evidence: it catches a case that was edited by accident or carelessly, or swapped for
 * another. It does not stop someone who can write the save file from recomputing the seal, so the
 * save must stay out of the narrator's reach.
 */
export function sealCase(detectiveCase: DetectiveCase): string {
  return sha256Hex(canonicalJson(detectiveCase));
}

/** Whether a case is still exactly the one that was sealed. */
export function isCaseSealIntact(run: { readonly case: DetectiveCase; readonly caseSeal: string }): boolean {
  return sealCase(run.case) === run.caseSeal;
}

/** Checked again at the verdict: a verdict on a case that was changed after acceptance is refused. */
export function assertCaseSealIntact(run: { readonly case: DetectiveCase; readonly caseSeal: string }): void {
  if (!isCaseSealIntact(run)) {
    throw new Error('The case no longer matches the seal it was accepted under.');
  }
}
