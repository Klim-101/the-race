// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { z } from 'zod';
import type { DetectiveHero } from './archetype.js';
import type { Locale } from '../locale.js';
import type { Trait } from '../traits.js';
import type { CaseIssue } from './case-issue.js';
import { LEGACY_RULES, type CaseRules } from './case-rules.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { checkFleeDeadline } from './checks/flee-deadline.js';
import { checkLies } from './checks/lies.js';
import { checkClearing } from './checks/clearing.js';
import { checkRunLength } from './checks/run-length.js';
import { checkLinkable } from './checks/links.js';
import { checkReactions } from './checks/reactions.js';
import { checkObservations } from './checks/observations.js';
import { checkPublicPlaces } from './checks/public-places.js';
import { checkWitnesses } from './checks/witnesses.js';
import { checkMapShape } from './checks/map-shape.js';
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
   * The rules the case is judged by beyond the checks every case passes (see `CaseRules`): `GENERATED_RULES` for a case
   * the generator wrote. Left out, the rules of the cases from before the generator's, `LEGACY_RULES`.
   */
  readonly rules?: CaseRules;
  /**
   * Whether the case is a frame: its narrative texts are not written yet (see `readCaseOrFrame`), so only what does
   * not depend on what they say is judged. Left out, every check runs.
   */
  readonly frame?: boolean;
}

export type CaseValidationResult =
  | { readonly isValid: true; readonly detectiveCase: DetectiveCase }
  | { readonly isValid: false; readonly issues: readonly CaseIssue[] };

/** The problems the schema found, in the form of the other issues. */
export function schemaIssues(issues: readonly z.core.$ZodIssue[]): CaseIssue[] {
  return issues.map((issue) => ({
    code: 'schema',
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/**
 * Accepts a generated case only when this hero can actually solve it; otherwise lists every issue. A frame is judged
 * by the checks that do not read what a text says, and a case that is complete by all of them.
 */
export function validateCase(input: unknown, context: CaseValidationContext): CaseValidationResult {
  const parsed = DetectiveCaseSchema.safeParse(input);
  if (!parsed.success) return { isValid: false, issues: schemaIssues(parsed.error.issues) };
  const detectiveCase = parsed.data;
  // What a text says is judged once it is written.
  const content = context.frame !== true;
  const rules = context.rules ?? LEGACY_RULES;

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
    ...checkParts(detectiveCase, obtainable, rules.parts),
    ...checkSolution(detectiveCase, context.hero, context.traits, obtainable),
    ...checkSolveChance(detectiveCase, context.hero, context.traits, obtainable),
    ...checkLies(detectiveCase, obtainable, rules.ties, rules.admissions, rules.claims),
    ...checkTimeline(detectiveCase),
    ...checkWitnesses(detectiveCase),
    ...(rules.publicLife ? checkPublicPlaces(detectiveCase) : []),
    ...(rules.observations && content ? checkObservations(detectiveCase) : []),
    ...(rules.linkable ? checkLinkable(detectiveCase) : []),
    ...checkClearing(detectiveCase, obtainable, rules.clearing),
    ...checkReactions(detectiveCase, context.traits, content),
    ...checkWorldEvents(detectiveCase, context.hero, context.traits),
    ...checkRandomEvents(
      detectiveCase,
      context.hero,
      context.traits,
      context.locale,
      rules.minRandomEvents,
      content,
    ),
    ...(rules.map === null ? [] : checkMapShape(detectiveCase, rules.map)),
    ...(rules.days === null ? [] : checkRunLength(detectiveCase, rules.days)),
    ...checkFleeDeadline(detectiveCase, context.hero, context.traits),
    ...checkRedHerrings(detectiveCase),
    ...checkTexts(detectiveCase, context.locale, context.realNames, content),
  ];
  return issues.length === 0 ? { isValid: true, detectiveCase } : { isValid: false, issues };
}
