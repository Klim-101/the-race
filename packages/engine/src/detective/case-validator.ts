// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveHero } from './archetype.js';
import type { Locale } from '../locale.js';
import type { Trait } from '../traits.js';
import type { CaseIssue } from './case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { checkFleeDeadline } from './checks/flee-deadline.js';
import { checkLies } from './checks/lies.js';
import { checkClearing } from './checks/clearing.js';
import { checkLinkable } from './checks/links.js';
import { checkReactions } from './checks/reactions.js';
import { checkWitnesses } from './checks/witnesses.js';
import { checkMapShape, type MapRules } from './checks/map-shape.js';
import { checkLeads } from './checks/leads.js';
import { checkParts } from './checks/parts.js';
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
  /**
   * Whether every place that holds a clue must be split into parts (a generated case must). Left out, a place
   * may stay whole, as the places of the cases before the parts did.
   */
  readonly requireParts?: boolean;
  /** Whether a clue that breaks a lie must be about the one who told it (a generated case must). */
  readonly requireTies?: boolean;
  /** Whether every lie must say what the suspect admits once it is caught (a generated case must). */
  readonly requireAdmissions?: boolean;
  /** Whether every evidence chain of two clues or more must have a conclusion that takes some two of them (a generated case must). */
  readonly requireLinkable?: boolean;
  /** Whether every innocent suspect must be clearable, and every red herring explained (a generated case must). */
  readonly requireClearing?: boolean;
  /** Whether every suspect who lies must also have a true claim to say beside it (a generated case must). */
  readonly requireClaims?: boolean;
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
    ...checkLeads(detectiveCase, obtainable),
    ...checkParts(detectiveCase, obtainable, context.requireParts ?? false),
    ...checkSolution(detectiveCase, context.hero, context.traits, obtainable),
    ...checkSolveChance(detectiveCase, context.hero, context.traits, obtainable),
    ...checkLies(
      detectiveCase,
      obtainable,
      context.requireTies ?? false,
      context.requireAdmissions ?? false,
      context.requireClaims ?? false,
    ),
    ...checkTimeline(detectiveCase),
    ...checkWitnesses(detectiveCase),
    ...(context.requireLinkable ? checkLinkable(detectiveCase) : []),
    ...checkClearing(detectiveCase, obtainable, context.requireClearing ?? false),
    ...checkReactions(detectiveCase, context.traits),
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
