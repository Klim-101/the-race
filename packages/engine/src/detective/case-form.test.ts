// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { DetectiveCaseSchema, formOf, type Abduction } from './case-schema.js';
import { validateCase } from './case-validator.js';

const ABDUCTION: Abduction = {
  victim: { kind: 'pet', name: 'Gouda, the cheese-shop cat' },
  whereabouts: 'cellar',
  deadlineMinute: 2460,
};

function issuesOf(input: unknown): { code: string; path: string; message: string }[] {
  const result = validateCase(input, { hero: buildHero(), traits: [], locale: 'en', realNames: [] });
  return result.isValid ? [] : result.issues.map(({ code, path, message }) => ({ code, path, message }));
}

/** An abduction of the cheese case; a `null` leaves the form or the block out, a value replaces or merges into it. */
function abduction(
  options: { form?: string | null; block?: Record<string, unknown> | null } = {},
): Record<string, unknown> {
  const built = buildCheeseCase();
  const result: Record<string, unknown> = { ...built };
  if (options.form !== null) result.form = options.form ?? 'abduction';
  const truth: Record<string, unknown> = { ...built.truth };
  if (options.block !== null) {
    truth.abduction = { ...ABDUCTION, whereabouts: built.locations[0]?.id, ...options.block };
  }
  result.truth = truth;
  return result;
}

describe('the form of a case', () => {
  it('reads a case with no form as a whodunit', () => {
    const built = DetectiveCaseSchema.parse(buildCheeseCase());

    expect(built.form).toBeUndefined();
    expect(formOf(built)).toBe('whodunit');
  });

  it('leaves the form out of a case that did not have one, so its seal holds', () => {
    expect(JSON.stringify(DetectiveCaseSchema.parse(buildCheeseCase()))).not.toContain('"form"');
  });

  it('accepts a whodunit that says so', () => {
    const built = { ...buildCheeseCase(), form: 'whodunit' };

    expect(DetectiveCaseSchema.safeParse(built).success).toBe(true);
    expect(formOf(DetectiveCaseSchema.parse(built))).toBe('whodunit');
  });

  it('accepts an abduction with its victim, whereabouts and deadline', () => {
    const parsed = DetectiveCaseSchema.parse(abduction());

    expect(formOf(parsed)).toBe('abduction');
    expect(parsed.truth.abduction?.deadlineMinute).toBe(2460);
  });

  it('accepts a person as the victim', () => {
    const built = abduction({ block: { victim: { kind: 'person', name: 'The cheesemonger' } } });

    expect(DetectiveCaseSchema.safeParse(built).success).toBe(true);
  });

  it('rejects a form that is not one', () => {
    expect(DetectiveCaseSchema.safeParse(abduction({ form: 'heist' })).success).toBe(false);
  });

  it('rejects an abduction without its block', () => {
    const built = abduction({ block: null });

    expect(issuesOf(built)).toMatchObject([{ code: 'schema', path: 'truth.abduction' }]);
  });

  it('rejects the block in a whodunit, said or unsaid', () => {
    const said = abduction({ form: 'whodunit' });
    const unsaid = abduction({ form: null });

    expect(issuesOf(said)).toMatchObject([{ code: 'schema', path: 'truth.abduction' }]);
    expect(issuesOf(unsaid)).toMatchObject([{ code: 'schema', path: 'truth.abduction' }]);
  });

  it('rejects a victim that is neither a person nor a pet, or has no name', () => {
    const kind = abduction({ block: { victim: { kind: 'heirloom', name: 'The ring' } } });
    const name = abduction({ block: { victim: { kind: 'pet', name: ' ' } } });

    expect(issuesOf(kind)).toMatchObject([{ code: 'schema' }]);
    expect(issuesOf(name)).toMatchObject([{ code: 'schema' }]);
  });

  it('rejects a deadline that is not a whole minute after the start', () => {
    for (const deadlineMinute of [0, -5, 1.5]) {
      const built = abduction({ block: { deadlineMinute } });

      expect(issuesOf(built)).toMatchObject([{ code: 'schema', path: 'truth.abduction.deadlineMinute' }]);
    }
  });

  it('takes a deadline past the first day, which is no minute of the day', () => {
    const built = abduction({ block: { deadlineMinute: 3 * 1440 + 60 } });

    expect(DetectiveCaseSchema.safeParse(built).success).toBe(true);
  });

  it('rejects a whereabouts that is not a place of the case', () => {
    const built = abduction({ block: { whereabouts: 'nowhere' } });

    expect(issuesOf(built)).toMatchObject([
      { code: 'unknown-reference', path: 'truth.abduction.whereabouts' },
    ]);
  });

  it('accepts an abduction whose whereabouts is a place of the case', () => {
    expect(issuesOf(abduction())).toEqual([]);
  });
});
