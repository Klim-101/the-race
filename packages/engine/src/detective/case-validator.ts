// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Hero } from '../hero.js';
import type { Locale } from '../locale.js';
import type { CaseIssue } from './case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { checkLies } from './checks/lies.js';
import { checkReachability } from './checks/reachability.js';
import { checkRedHerrings } from './checks/red-herrings.js';
import { checkReferences } from './checks/references.js';
import { checkSolution } from './checks/solution.js';
import { checkTexts } from './checks/texts.js';
import { checkTimeline } from './checks/timeline.js';
import { canEverPass, computeObtainable } from './obtainability.js';

export interface CaseValidationContext {
  /** The hero the case is generated for: solvability depends on their skills. */
  readonly hero: Hero;
  readonly locale: Locale;
  /** Names taken from the source headlines; none of them may survive into the mirror world. */
  readonly realNames: ReadonlyArray<string>;
}

export type CaseValidationResult =
  | { readonly isValid: true; readonly detectiveCase: DetectiveCase }
  | { readonly isValid: false; readonly issues: ReadonlyArray<CaseIssue> };

/** Accepts a generated case only when this hero can actually solve it; otherwise lists every issue. */
export function validateCase(input: unknown, context: CaseValidationContext): CaseValidationResult {
  const parsed = DetectiveCaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      isValid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'schema',
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }
  const detectiveCase = parsed.data;

  // The graph checks below look entities up by id, so they only make sense once every id resolves.
  const referenceIssues = checkReferences(detectiveCase);
  if (referenceIssues.length > 0) return { isValid: false, issues: referenceIssues };

  const obtainable = computeObtainable(detectiveCase, canEverPass(context.hero));
  const issues = [
    ...checkReachability(detectiveCase, obtainable),
    ...checkSolution(detectiveCase, context.hero, obtainable),
    ...checkLies(detectiveCase, obtainable),
    ...checkTimeline(detectiveCase),
    ...checkRedHerrings(detectiveCase),
    ...checkTexts(detectiveCase, context.locale, context.realNames),
  ];
  return issues.length === 0 ? { isValid: true, detectiveCase } : { isValid: false, issues };
}
