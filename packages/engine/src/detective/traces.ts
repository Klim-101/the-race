// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunState } from './run-state.js';

// A trace is a small true thing that a look or a search with no clue shows, so that finding something never means finding
// the thing. It is the text of an empty part (`trace`) or of a place (`litter`), written into the case, and it is shown once
// for each. It takes no dice and changes nothing in the case: the run only remembers that it has been shown.

/** The key a trace is remembered by: a part of the case, or a place for its litter. Ids are unique in the case. */
export const traceKey = (kind: 'part' | 'place', id: string): string => `${kind}:${id}`;

/**
 * The trace to tell, if there is one that has not been shown, and the run with it remembered. A part or a place with
 * no text, and one whose text was shown before, shows nothing.
 */
export function showTrace(
  run: DetectiveRunState,
  key: string,
  text: string | undefined,
): { readonly run: DetectiveRunState; readonly trace: string | undefined } {
  if (text === undefined || run.tracesSeen.includes(key)) return { run, trace: undefined };
  return { run: { ...run, tracesSeen: [...run.tracesSeen, key] }, trace: text };
}
