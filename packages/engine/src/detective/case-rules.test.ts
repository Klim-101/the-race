// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import type { CaseIssueCode } from './case-issue.js';
import { GENERATED_RULES, LEGACY_RULES, type CaseRules } from './case-rules.js';
import { MIN_RANDOM_EVENTS } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { GENERATED_MAP } from './checks/map-shape.js';
import { GENERATED_DAYS } from './checks/run-length.js';

/**
 * One code that only that rule gives, for each field of the rules. A record of every field, so a rule added to
 * `CaseRules` without a line here does not compile: a new rule is a field, a line in `GENERATED_RULES` and a line here.
 */
const CODE_OF: Record<keyof CaseRules, CaseIssueCode> = {
  parts: 'parts-missing',
  ties: 'clue-not-tied',
  admissions: 'lie-without-admission',
  linkable: 'chain-without-deduction',
  clearing: 'suspect-cannot-be-cleared',
  claims: 'suspect-without-true-claim',
  publicLife: 'empty-public-place',
  observations: 'clue-draws-conclusion',
  minRandomEvents: 'too-few-random-events',
  map: 'map-too-small',
  days: 'run-length-out-of-range',
};
const FIELDS = Object.keys(CODE_OF) as (keyof CaseRules)[];

/** One field of the rules set to a value, the rest as they were. */
const setting = <Key extends keyof CaseRules>(
  rules: CaseRules,
  key: Key,
  value: CaseRules[Key],
): CaseRules => ({ ...rules, [key]: value });

/**
 * The cheese case, made to break every rule there is. It already has no parts, no events, a small map, lies with no
 * admission and so on; this adds a clue that says what it means, a run of two days, and a lie that is broken by a clue
 * that is about no one.
 */
function breakingEveryRule() {
  const detectiveCase = buildCheeseCase();
  detectiveCase.clock.days = 2;
  const clue = detectiveCase.clues[0];
  if (clue !== undefined) clue.description = 'Clearly the lock was forced.';
  const lie = detectiveCase.suspects[1]?.lies[0];
  if (lie !== undefined) lie.brokenBy = ['cellar-key'];
  return detectiveCase;
}

function codes(rules: CaseRules): CaseIssueCode[] {
  const result = validateCase(breakingEveryRule(), {
    hero: buildHero(),
    traits: [],
    locale: 'en',
    realNames: [],
    rules,
  });
  return result.isValid ? [] : result.issues.map(({ code }) => code);
}

describe('the rules of the cases from before the generator', () => {
  it('ask nothing: every switch off, no events, any map, any length', () => {
    expect(LEGACY_RULES).toEqual({
      parts: false,
      ties: false,
      admissions: false,
      linkable: false,
      clearing: false,
      claims: false,
      publicLife: false,
      observations: false,
      minRandomEvents: 0,
      map: null,
      days: null,
    });
  });

  it('let a case that breaks every other rule pass', () => {
    expect(codes(LEGACY_RULES)).toEqual([]);
  });

  it('are what a validator uses when no rules are given', () => {
    const result = validateCase(breakingEveryRule(), {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
    });

    expect(result.isValid).toBe(true);
  });
});

describe('the rules of a generated case', () => {
  it('turn every switch on, and ask what the generator is told: the events, the map and the length', () => {
    expect(GENERATED_RULES).toEqual({
      parts: true,
      ties: true,
      admissions: true,
      linkable: true,
      clearing: true,
      claims: true,
      publicLife: true,
      observations: true,
      minRandomEvents: MIN_RANDOM_EVENTS,
      map: GENERATED_MAP,
      days: GENERATED_DAYS,
    });
  });

  it('have the same fields as the rules of before, and as the table of this test', () => {
    expect(Object.keys(GENERATED_RULES).sort()).toEqual(Object.keys(LEGACY_RULES).sort());
    expect(Object.keys(GENERATED_RULES).sort()).toEqual([...FIELDS].sort());
  });

  it('ask every rule at once of a case that breaks them all', () => {
    const asked = codes(GENERATED_RULES);

    for (const field of FIELDS) expect(asked, field).toContain(CODE_OF[field]);
  });

  it('are fixed: neither the rules nor the map and the length in them can be changed', () => {
    expect(Object.isFrozen(GENERATED_RULES)).toBe(true);
    expect(Object.isFrozen(LEGACY_RULES)).toBe(true);
    expect(Object.isFrozen(GENERATED_RULES.map)).toBe(true);
    expect(Object.isFrozen(GENERATED_RULES.days)).toBe(true);
    expect(() => {
      (GENERATED_RULES as { parts: boolean }).parts = false;
    }).toThrow(TypeError);
  });
});

describe('each rule of the profile', () => {
  it.each(FIELDS)('%s turns on its own check and no other', (field) => {
    const others = FIELDS.filter((other) => other !== field);

    // On alone, from the rules of before: its code comes, and the code of no other rule.
    const alone = codes(setting(LEGACY_RULES, field, GENERATED_RULES[field]));
    expect(alone).toContain(CODE_OF[field]);
    for (const other of others) expect(alone, `${field} alone gave ${other}`).not.toContain(CODE_OF[other]);

    // Off alone, from the rules of a generated case: its code goes, and the code of every other stays.
    const without = codes(setting(GENERATED_RULES, field, LEGACY_RULES[field]));
    expect(without).not.toContain(CODE_OF[field]);
    for (const other of others) expect(without, `without ${field}, ${other} went`).toContain(CODE_OF[other]);
  });
});
