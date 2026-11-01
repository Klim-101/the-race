// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveHero } from './archetype.js';
import type { Locale } from '../locale.js';
import type { Trait } from '../traits.js';
import type { CaseIssue } from './case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { checkFleeDeadline } from './checks/flee-deadline.js';
import { checkLies } from './checks/lies.js';
import { checkMapShape, type MapRules } from './checks/map-shape.js';
import { checkRandomEvents } from './checks/random-events.js';
import { checkReachability } from './checks/reachability.js';
import { checkRedHerrings } from './checks/red-herrings.js';
import { checkReferences } from './checks/references.js';
import { checkSuspectReachability } from './checks/suspect-reachability.js';
import { checkSolution } from './checks/solution.js';
import { checkSolveChance } from './checks/solve-chance.js';
import { checkTexts } from './checks/texts.js';
import { checkTimeline } from './checks/timeline.js';
import { checkWorldEvents } from './checks/world-events.js';
import { canEverPass, closedSources, computeObtainable } from './obtainability.js';

export interface CaseValidationContext {
  /** The hero the case is generated for: solvability depends on their skills. */
  readonly hero: DetectiveHero;
  /**
   * The traits rolled for the hero. Only the validator sees them: the generator and the narrator must not,
   * so no issue below may name a trait.
   */
  readonly traits: readonly Trait[];
  readonly locale: Locale;
  /** Names taken from the source headlines; none of them may survive into the mirror world. */
  readonly realNames: readonly string[];
  /**
   * The fewest random events the pool must hold; a generated case must bring `MIN_RANDOM_EVENTS`. Left out, a
   * case without a pool is accepted, as the cases of before the pool were.
   */
  readonly minRandomEvents?: number;
  /**
   * The shape of the map the case must have (`GENERATED_MAP` for a generated one): enough places, streets or
   * squares between the buildings, and more than one building. Left out, any map is accepted.
   */
  readonly map?: MapRules;
}

export type CaseValidationResult =
  | { readonly isValid: true; readonly detectiveCase: DetectiveCase }
  | { readonly isValid: false; readonly issues: readonly CaseIssue[] };

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

  const obtainable = computeObtainable(
    detectiveCase,
    canEverPass(context.hero, context.traits),
    closedSources(context.traits),
  );
  const issues = [
    ...checkReachability(detectiveCase, obtainable),
    ...checkSuspectReachability(detectiveCase, obtainable),
    ...checkSolution(detectiveCase, context.hero, context.traits, obtainable),
    ...checkSolveChance(detectiveCase, context.hero, context.traits, obtainable),
    ...checkLies(detectiveCase, obtainable),
    ...checkTimeline(detectiveCase),
    ...checkWorldEvents(detectiveCase, context.hero, context.traits),
    ...checkRandomEvents(
      detectiveCase,
      context.hero,
      context.traits,
      context.locale,
      context.minRandomEvents ?? 0,
    ),
    ...(context.map === undefined ? [] : checkMapShape(detectiveCase, context.map)),
    ...checkFleeDeadline(detectiveCase, context.hero, context.traits),
    ...checkRedHerrings(detectiveCase),
    ...checkTexts(detectiveCase, context.locale, context.realNames),
  ];
  return issues.length === 0 ? { isValid: true, detectiveCase } : { isValid: false, issues };
}
