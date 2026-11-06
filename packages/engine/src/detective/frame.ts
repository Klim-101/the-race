// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { z } from 'zod';
import { jsonPointerOf } from '../json-patch.js';
import type { CaseIssue } from './case-issue.js';
import { schemaIssues } from './case-validator.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';

// A case is written in two stages. The frame comes first: every id, link, number and choice, with each narrative text
// left as an empty string. Once the frame is accepted, the texts are written into it with a patch. No schema of its own
// is needed for that: the case schema already says where a text is missing (a string that is too short), so a frame is a
// case whose only problems are blank texts.

/** What stands in a blank text while the frame is judged: the checks that run then never read it. */
export const BLANK_TEXT_PLACEHOLDER = '(to be written)';

/**
 * How a submitted document reads:
 * - `whole`: a complete case, with every text written;
 * - `frame`: a case but for blank texts, with their JSON Pointers in `blanks`; `detectiveCase` holds a placeholder in each;
 * - `invalid`: the schema found something else wrong (the issues leave out the blank texts, which a frame has by
 *   design); `blanks` lists the texts that are blank all the same.
 */
export type CaseReading =
  | { readonly kind: 'whole'; readonly detectiveCase: DetectiveCase }
  | { readonly kind: 'frame'; readonly detectiveCase: DetectiveCase; readonly blanks: readonly string[] }
  | { readonly kind: 'invalid'; readonly issues: readonly CaseIssue[]; readonly blanks: readonly string[] };

/** A blank text: the only string in the schema with a minimum length is a narrative text (ids fail their pattern). */
const isBlank = (issue: z.core.$ZodIssue): boolean => issue.code === 'too_small' && issue.origin === 'string';

/** A copy of the document with a placeholder in each place named. The places come from the schema, so they exist. */
function fillBlanks(document: unknown, places: readonly (readonly PropertyKey[])[]): unknown {
  const copy: unknown = structuredClone(document);
  for (const place of places) {
    const parent = place.slice(0, -1).reduce((node, key) => Reflect.get(node, key) as object, copy as object);
    // The last key of a path of the schema is a name or an index, and an index is as good as a name for a list.
    Reflect.set(parent, String(place.at(-1)), BLANK_TEXT_PLACEHOLDER);
  }
  return copy;
}

/** Reads a submitted document as a whole case or as a frame, or says what is wrong with it. */
export function readCaseOrFrame(document: unknown): CaseReading {
  const parsed = DetectiveCaseSchema.safeParse(document);
  if (parsed.success) return { kind: 'whole', detectiveCase: parsed.data };
  const blanks = parsed.error.issues.filter(isBlank);
  const pointers = blanks.map(({ path }) => jsonPointerOf(path));
  const others = parsed.error.issues.filter((issue) => !isBlank(issue));
  if (others.length > 0) return { kind: 'invalid', issues: schemaIssues(others), blanks: pointers };
  // Every rule of the schema speaks in the first pass (a refinement does too), so with the blanks filled it passes.
  const detectiveCase = DetectiveCaseSchema.parse(
    fillBlanks(
      document,
      blanks.map(({ path }) => path),
    ),
  );
  return { kind: 'frame', detectiveCase, blanks: pointers };
}
