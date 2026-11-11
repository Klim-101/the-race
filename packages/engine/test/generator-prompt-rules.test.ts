// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ISSUE_ORDER, type CaseIssueCode } from '../src/detective/case-issue.js';

// The rules of a case are taught by the prompt of the generator, and every code of the detective's issues is accounted
// for here (ADR 0010): either the prompt has the sentence that teaches it, which the pattern finds, or the code is left
// to the rejection, and the table says why. The table is typed by the codes, so a check added without a line here does
// not compile: teaching its rule or leaving it is decided when the check is written. A pattern shows that a rule is
// said, not that it is said well; that stays a judgment, and the log of the submissions shows where it was not.

const PROMPT = readFileSync(
  new URL('../../../agents/subagents/case-generator.md', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

/** A pattern the prompt must match, or the reason the code is left to the rejection, whose message says the rule. */
type Taught = RegExp | { readonly learned: string };

const RULES: Record<CaseIssueCode, Taught> = {
  // The shared codes: a patch, a text still blank, the shape of the document, the language and the names.
  'patch-failed': /a patch with an operation that names a place that is not there is refused whole/,
  schema: /ids in kebab-case Latin/,
  'text-missing': /If texts are still blank, or an issue comes back/,
  'duplicate-id': /Every id is unique and every reference resolves/,
  'unknown-reference': /every reference resolves/,
  'locale-mismatch': /in the brief's language \(`en` or `ru`/,
  'wrong-language': /text of the stated language only/,
  'wrong-script': /the right script for the language/,
  'real-name': /the engine rejects real names/,
  // The map: a town and not a floor plan.
  'map-too-small': /the engine rejects fewer than 8, more than 12/,
  'map-too-large': /fewer than 8, more than 12/,
  'too-few-outdoor-places': /fewer than 3 places `outdoor`/,
  'single-building': /fewer than 2 separate buildings/,
  'hidden-start': /it cannot be the place the hero starts in/,
  'suspect-in-hidden-place': /the place the hero starts in or the place of a suspect/,
  // The parts of a place.
  'parts-missing': /the engine rejects a clue in a place without them/,
  'part-in-wrong-place': /Every clue lies in exactly one part of its own place/,
  'clue-in-two-parts': /Every clue lies in exactly one part of its own place/,
  'clue-without-part': /Every clue lies in exactly one part of its own place/,
  'part-never-shown': {
    learned:
      'the prompt describes `inQuickLook` and `requiresLead` but never says that a part needs one of the two to be shown',
  },
  'empty-public-place': /every public place, outdoors or a venue, needs something in it/,
  // Reachability.
  'unreachable-location': /Every location can be reached from the start/,
  'unobtainable-clue': /Every clue is obtainable/,
  'unreachable-suspect': /every suspect can be found/,
  'solution-needs-night': /or the engine rejects the case as one that needs the night/,
  // Lies, claims and reactions.
  'clue-not-tied': /must be about the one who told it/,
  'lie-without-admission': /`admission`\*\* \(required/,
  'lie-chain-broken': /comes later in the list than the one it follows/,
  'alibi-replaced-twice': /never on more than one lie of a suspect/,
  // Leads.
  'unearnable-lead': /the hero must be able to earn it/,
  'unused-lead': /Every lead must open something/,
  'false-lead-holds-clue': /may open only a part or a place with nothing in it/,
  'part-without-fallback': /A clue behind an obstacle needs a `fallback` that needs no tool/,
  'fallback-unreachable': /for a suspect the hero can reach/,
  // The evidence chains and the solution.
  'too-few-evidence-chains': /At least two independent evidence chains/,
  'overlapping-evidence-chains': /Chains share no clue/,
  'red-herring-in-evidence-chain': /plausible but never in a chain/,
  'unobtainable-evidence': /ends at clues obtainable by a fair route/,
  'evidence-chain-misses-culprit': /each proves the culprit on its own/,
  'no-chain-without-untrained-skill': /doable without a skill the hero is untrained in/,
  'unobtainable-motive': /uses obtainable clues/,
  'unlikely-solution': /Do not set every check above what the hero's skills can reach/,
  'chain-without-deduction': /needs a deduction that takes at least two of its clues/,
  // Deductions: who is cleared, and the red herrings.
  'culprit-cleared': /The culprit is never cleared/,
  'suspect-without-true-claim': /a suspect who has a lie needs at least one/,
  'reaction-not-tied': /the clue must be about the suspect, by `about` or `pointsTo`/,
  'reaction-names-trait': /never write anything about the hero's own traits/,
  'suspect-cannot-be-cleared': /Every suspect who is not the culprit has a deduction with `clears`/,
  'red-herring-unexplained':
    /every red herring that points at a suspect is a clue of the deduction that clears that suspect/,
  'red-herring-without-thread': /has a thread of their own/,
  'unbreakable-lie': /A lie broken by a clue in a gated place needs that place passable/,
  // The timeline and the witnesses.
  'witness-saw-the-crime': /A witness may not stand at the scene of the crime at the minute of it/,
  'culprit-not-at-crime': /the culprit is at the crime place at `crimeAtMinute`/,
  'actor-in-two-places': /nobody is in two places at one minute/,
  'too-many-red-herrings': /not more than a third/,
  // The clock and the events.
  'world-event-out-of-range': /\*\*World events\*\* fall within `clock.days`/,
  'event-cuts-solution': /must not cut the solution/,
  'random-event-out-of-range': {
    learned:
      'the prompt gives the days of an event (`fromDay`, `untilDay`) and the least day of a lasting one, but never says that an event must fall inside the days of the case',
  },
  'random-event-cuts-solution': /A random event may never close a place or source the solution needs/,
  'empty-part-without-trace': /needs a `trace`, or the engine rejects the case/,
  'trace-draws-conclusion': /the same words are rejected as in a clue/,
  'trace-names-someone': /it names no suspect and no witness/,
  'trace-violence': /it never speaks of violence or death/,
  'event-opens-nothing':
    /it names a place that has `hours`, or the engine rejects it as an event that opens nothing/,
  'random-event-violence': /No violence or death in the plot or in any event/,
  'too-few-random-events': /randomEvents\*\* \(\*\*required\*\*: at least four/,
  'random-events-miss-a-day': /every day of the case must be covered by some event's/,
  'run-length-out-of-range': /`days` \(3 to 10/,
  // The abduction form (see "The abduction form" in the prompt).
  'form-mismatch': /The engine rejects a case of another form than the brief's/,
  'deadline-out-of-range': /`deadlineMinute` may not pass `clock.days` × 1440/,
  'victim-place-unreachable': /`whereabouts` must be a place the hero can enter/,
  'deadline-too-short': /must leave the hero time to walk to `whereabouts`/,
  'message-after-deadline': /every message arrives before `deadlineMinute`/,
  'victim-place-unled': /some evidence chain must lead to `whereabouts`/,
  'place-conclusion-missing': /`solution.whereaboutsDeductionId` names a deduction/,
  'place-without-decoy': /another place or two are shown by a lead of the same kind/,
  'message-names-culprit': /a message never names the culprit/,
  'homicide-death-not-ready': {
    learned:
      'the prompt does not teach the form homicide yet (P4a-06, #530): no case is of it until it does, and the rejection says the rule',
  },
  'homicide-without-means': {
    learned:
      'the prompt does not teach the form homicide yet (P4a-06, #530): no case is of it until it does, and the rejection says the rule',
  },
  'attempt-without-victim-witness': {
    learned:
      'the prompt does not teach the form homicide yet (P4a-06, #530): no case is of it until it does, and the rejection says the rule',
  },
  'victim-place-without-hours': {
    learned:
      'the prompt does not teach the form homicide yet (P4a-06, #530): no case is of it until it does, and the rejection says the rule',
  },
  'homicide-opportunity-single': {
    learned:
      'the prompt does not teach the form homicide yet (P4a-06, #530): no case is of it until it does, and the rejection says the rule',
  },
  'message-names-trait': /never names a trait of the hero, nor does it/,
  'weekday-named': /No text of the case names a weekday/,
  'solution-after-culprit-flees': /a `culprit-flees` must come after the solution is reachable/,
  'clue-draws-conclusion': /what is seen, read or measured, and never what it means/,
};

const entries = Object.entries(RULES) as [CaseIssueCode, Taught][];
const taught = entries.filter((entry): entry is [CaseIssueCode, RegExp] => entry[1] instanceof RegExp);
const learned = entries.filter(
  (entry): entry is [CaseIssueCode, { learned: string }] => !(entry[1] instanceof RegExp),
);

describe("the rules of a case in the generator's prompt", () => {
  it("account for every code of the detective's issues, and for no other", () => {
    expect(Object.keys(RULES).sort()).toEqual([...ISSUE_ORDER].sort());
  });

  it.each(taught)('teach %s: the prompt has the sentence the pattern finds', (_code, pattern) => {
    expect(PROMPT).toMatch(pattern);
  });

  it.each(learned)('leave %s to the rejection, and say why', (_code, { learned: reason }) => {
    expect(reason.trim().length).toBeGreaterThan(20);
  });

  it('use patterns that name a sentence and not a word that happens to be there', () => {
    for (const [code, pattern] of taught) expect(pattern.source.length, code).toBeGreaterThanOrEqual(12);
  });

  it('fail when the sentence is no longer in the prompt: a pattern that cannot fail teaches nothing', () => {
    for (const [code, pattern] of taught) {
      expect(PROMPT.replace(pattern, ''), code).not.toMatch(pattern);
    }
  });

  it('leave only a few codes to the rejection, and the list is the one reported with the change that made it', () => {
    // The codes of the homicide are here until the prompt teaches the form (P4a-06, #530), which will take them out.
    expect(learned.map(([code]) => code)).toEqual([
      'part-never-shown',
      'random-event-out-of-range',
      'homicide-death-not-ready',
      'homicide-without-means',
      'attempt-without-victim-witness',
      'victim-place-without-hours',
      'homicide-opportunity-single',
    ]);
  });
});
