// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { z } from 'zod';

/**
 * One reason a case was rejected; the message is written for the generator that has to fix it. The codes are an
 * archetype's own (see `ScenarioKind`), but the shape is the same for all.
 */
export interface Issue<Code extends string = string> {
  readonly code: Code;
  readonly path: string;
  readonly message: string;
}

/**
 * The codes every archetype's issues share: a case that does not parse, a patch that did not apply, a text still blank,
 * an id used twice, a reference to nothing, the wrong language or script, a real name. The checks that give them are
 * shared too. Each archetype has an order of its own (the detective's mixes these with its own codes), and every one
 * must hold all of these.
 */
export const SHARED_ISSUE_CODES = [
  'patch-failed',
  'schema',
  'text-missing',
  'duplicate-id',
  'unknown-reference',
  'locale-mismatch',
  'wrong-language',
  'wrong-script',
  'real-name',
] as const;
export type SharedIssueCode = (typeof SHARED_ISSUE_CODES)[number];

/**
 * The issues in the order of an archetype's list of codes, the most fundamental first. Issues of one code keep the order
 * they came in, and the list given is left as it is.
 */
export function sortIssuesBy<Found extends { readonly code: string }>(
  order: readonly string[],
  issues: readonly Found[],
): Found[] {
  return issues.toSorted((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
}

/** The problems the schema found, in the form of the other issues. */
export function schemaIssues(issues: readonly z.core.$ZodIssue[]): Issue<'schema'>[] {
  return issues.map((issue) => ({
    code: 'schema',
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
