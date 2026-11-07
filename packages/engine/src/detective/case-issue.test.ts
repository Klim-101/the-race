// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ISSUE_ORDER, sortIssues, type CaseIssue, type CaseIssueCode } from './case-issue.js';

/**
 * The priorities the generator's issues had before the order was a list: a lower number came first, and equal numbers
 * kept the order of the checks. A record of every code, so a code that is not here is a compile error, and the order
 * of the list is held to it.
 */
const PRIORITY_BEFORE: Record<CaseIssueCode, number> = {
  'patch-failed': -1,
  schema: 0,
  'form-mismatch': 0.1,
  'text-missing': 0.5,
  'duplicate-id': 1,
  'unknown-reference': 2,
  'locale-mismatch': 3,
  'wrong-language': 4,
  'wrong-script': 5,
  'real-name': 6,
  'map-too-small': 6.2,
  'map-too-large': 6.2,
  'too-few-outdoor-places': 6.4,
  'single-building': 6.6,
  'hidden-start': 6.7,
  'suspect-in-hidden-place': 6.7,
  'empty-public-place': 6.9,
  'parts-missing': 6.8,
  'part-in-wrong-place': 6.8,
  'clue-in-two-parts': 6.8,
  'clue-without-part': 6.8,
  'part-never-shown': 6.8,
  'unreachable-location': 7,
  'unobtainable-clue': 8,
  'unreachable-suspect': 9,
  'clue-not-tied': 9.05,
  'lie-without-admission': 9.06,
  'lie-chain-broken': 9.07,
  'alibi-replaced-twice': 9.075,
  'witness-saw-the-crime': 18.5,
  'chain-without-deduction': 17.5,
  'culprit-cleared': 17.6,
  'suspect-without-true-claim': 17.62,
  'reaction-not-tied': 17.65,
  'reaction-names-trait': 17.66,
  'suspect-cannot-be-cleared': 17.7,
  'red-herring-unexplained': 17.8,
  'red-herring-without-thread': 17.85,
  'unearnable-lead': 9.1,
  'unused-lead': 9.1,
  'false-lead-holds-clue': 9.1,
  'part-without-fallback': 9.2,
  'fallback-unreachable': 9.4,
  'too-few-evidence-chains': 10,
  'overlapping-evidence-chains': 11,
  'red-herring-in-evidence-chain': 12,
  'unobtainable-evidence': 13,
  'evidence-chain-misses-culprit': 14,
  'no-chain-without-untrained-skill': 15,
  'unobtainable-motive': 16,
  'unlikely-solution': 17,
  'unbreakable-lie': 18,
  'culprit-not-at-crime': 19,
  'actor-in-two-places': 20,
  'too-many-red-herrings': 21,
  'world-event-out-of-range': 22,
  'event-cuts-solution': 23,
  'random-event-out-of-range': 24,
  'random-event-cuts-solution': 25,
  'random-event-violence': 26,
  'too-few-random-events': 27,
  'random-events-miss-a-day': 27.5,
  'run-length-out-of-range': 27.6,
  'solution-after-culprit-flees': 28,
  'deadline-out-of-range': 28.1,
  'victim-place-unreachable': 28.2,
  'deadline-too-short': 28.3,
  'message-after-deadline': 28.4,
  'victim-place-unled': 28.5,
  'message-names-culprit': 28.6,
  'message-names-trait': 28.7,
  'clue-draws-conclusion': 29,
};

const issue = (code: CaseIssueCode, path = 'p'): CaseIssue => ({ code, path, message: 'm' });

describe('the order of the issues', () => {
  it('names no code twice', () => {
    expect(new Set(ISSUE_ORDER).size).toBe(ISSUE_ORDER.length);
  });

  it('names exactly the codes there are: the type is made from the list, and the record of old priorities has no other', () => {
    expect([...ISSUE_ORDER].sort()).toEqual(Object.keys(PRIORITY_BEFORE).sort());
  });

  it('is the order the issues had before it was a list: every code after those with a lower number', () => {
    const numbers = ISSUE_ORDER.map((code) => PRIORITY_BEFORE[code]);

    expect(numbers).toEqual(numbers.toSorted((a, b) => a - b));
  });

  it('puts the codes that were not told apart in the order of the list, which now says it', () => {
    const tied = (number: number) => ISSUE_ORDER.filter((code) => PRIORITY_BEFORE[code] === number);

    expect(tied(6.2)).toEqual(['map-too-small', 'map-too-large']);
    expect(tied(6.8)).toEqual([
      'parts-missing',
      'part-in-wrong-place',
      'clue-in-two-parts',
      'clue-without-part',
      'part-never-shown',
    ]);
    expect(tied(9.1)).toEqual(['unearnable-lead', 'unused-lead', 'false-lead-holds-clue']);
  });
});

describe('sorting the issues', () => {
  it('puts the most fundamental first, whatever order they came in', () => {
    const sorted = sortIssues([
      issue('clue-draws-conclusion'),
      issue('unreachable-location'),
      issue('schema'),
      issue('real-name'),
      issue('patch-failed'),
    ]);

    expect(sorted.map(({ code }) => code)).toEqual([
      'patch-failed',
      'schema',
      'real-name',
      'unreachable-location',
      'clue-draws-conclusion',
    ]);
  });

  it('keeps the issues of one code in the order they came in', () => {
    const sorted = sortIssues([issue('real-name', 'b'), issue('schema', 'x'), issue('real-name', 'a')]);

    expect(sorted.map(({ code, path }) => `${code} ${path}`)).toEqual([
      'schema x',
      'real-name b',
      'real-name a',
    ]);
  });

  it('leaves the list it was given as it was, and gives nothing for nothing', () => {
    const given = [issue('clue-draws-conclusion'), issue('schema')];

    sortIssues(given);

    expect(given.map(({ code }) => code)).toEqual(['clue-draws-conclusion', 'schema']);
    expect(sortIssues([])).toEqual([]);
  });

  it('puts a blank text after the schema and before the references', () => {
    const sorted = sortIssues([issue('unknown-reference'), issue('text-missing'), issue('schema')]);

    expect(sorted.map(({ code }) => code)).toEqual(['schema', 'text-missing', 'unknown-reference']);
  });
});
