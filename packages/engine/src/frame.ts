// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { z } from 'zod';
import { jsonPointerOf } from './json-patch.js';
import { schemaIssues, type Issue } from './issues.js';

// A case is written in two stages. The frame comes first: every id, link, number and choice, with each narrative text
// left as an empty string. Once the frame is accepted, the texts are written into it with a patch. No schema of its own
// is needed for that: the schema of a case already says where a text is missing (a string that is too short), so a
// frame is a case whose only problems are blank texts. That holds for the schema of any archetype, which is why reading
// a frame takes the schema and knows nothing of what is in it.

/** What stands in a blank text while the frame is judged: the checks that run then never read it. */
export const BLANK_TEXT_PLACEHOLDER = '(to be written)';

/**
 * How a submitted document reads:
 * - `whole`: a complete case, with every text written;
 * - `frame`: a case but for blank texts, with their JSON Pointers in `blanks`; `scenario` holds a placeholder in each;
 * - `invalid`: the schema found something else wrong (the issues leave out the blank texts, which a frame has by
 *   design); `blanks` lists the texts that are blank all the same.
 */
export type ScenarioReading<Case> =
  | { readonly kind: 'whole'; readonly scenario: Case }
  | { readonly kind: 'frame'; readonly scenario: Case; readonly blanks: readonly string[] }
  | {
      readonly kind: 'invalid';
      readonly issues: readonly Issue<'schema'>[];
      readonly blanks: readonly string[];
    };

/** A blank text: the only string in a schema with a minimum length is a narrative text (ids fail their pattern). */
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

/** Reads a submitted document as a whole case or as a frame of the schema, or says what is wrong with it. */
export function readFrame<Case>(schema: z.ZodType<Case>, document: unknown): ScenarioReading<Case> {
  const parsed = schema.safeParse(document);
  if (parsed.success) return { kind: 'whole', scenario: parsed.data };
  const blanks = parsed.error.issues.filter(isBlank);
  const pointers = blanks.map(({ path }) => jsonPointerOf(path));
  const others = parsed.error.issues.filter((issue) => !isBlank(issue));
  if (others.length > 0) return { kind: 'invalid', issues: schemaIssues(others), blanks: pointers };
  // Every rule of a schema speaks in the first pass (a refinement does too), so with the blanks filled it passes.
  const scenario = schema.parse(
    fillBlanks(
      document,
      blanks.map(({ path }) => path),
    ),
  );
  return { kind: 'frame', scenario, blanks: pointers };
}
