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

/**
 * The case as it was before a place could say whether it is indoors or out: a place that is out of doors says
 * nothing, as every place of an older case did. A case sealed in those days was sealed without the field, and it
 * parses today with the default filled in, so its seal is looked for in this form as well.
 */
function withoutDefaultExposure(detectiveCase: DetectiveCase): DetectiveCase {
  return {
    ...detectiveCase,
    locations: detectiveCase.locations.map((location) => {
      const { exposure, ...rest } = location;
      return (exposure === 'outdoor' ? rest : location) as typeof location;
    }),
  };
}

/**
 * Whether a case is still exactly the one that was sealed, whether it was sealed as it is now or as it was
 * before places said where they are (the defaults a later version fills in must never make a save look edited).
 */
export function isCaseSealIntact(run: { readonly case: DetectiveCase; readonly caseSeal: string }): boolean {
  return sealCase(run.case) === run.caseSeal || sealCase(withoutDefaultExposure(run.case)) === run.caseSeal;
}

/** Checked again at the verdict: a verdict on a case that was changed after acceptance is refused. */
export function assertCaseSealIntact(run: { readonly case: DetectiveCase; readonly caseSeal: string }): void {
  if (!isCaseSealIntact(run)) {
    throw new Error('The case no longer matches the seal it was accepted under.');
  }
}
