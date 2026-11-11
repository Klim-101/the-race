// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import {
  CASE_FORMS,
  CRIME_TYPES,
  DetectiveCaseSchema,
  GENERAL_CRIME_TYPES,
  HOMICIDE_FATES,
  HOMICIDE_THEMES,
  formFor,
  formOf,
  type Abduction,
} from './case-schema.js';
import { validateCase } from './case-validator.js';
import { DETECTIVE_SCENARIO } from './scenario.js';

const ABDUCTION: Abduction = {
  victim: { kind: 'pet', name: 'Gouda, the cheese-shop cat' },
  whereabouts: 'cellar',
  deadlineMinute: 4260,
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
  // A clue of a chain, found outside the stall, names it: this is how the hero is led to the victim.
  (built.clues.find(({ id }) => id === 'cart-tracks') as { description: string }).description +=
    ' Cheese rinds in the tracks, from the cheese stall.';
  // The place is deduced: a message that is a sign of the victim, linked to a detail found at the stall. Only a case that
  // is an abduction in full has them: a whodunit may have neither the message nor the conclusion.
  const full = options.block !== null && (options.form === undefined || options.form === 'abduction');
  if (full)
    built.clues.push({
      id: 'ransom-text',
      locationId: 'market-square',
      description: 'A text from an unknown number: "She is cold, but she is fine."',
      discovery: null,
      pointsTo: [],
      isRedHerring: false,
      message: { channel: 'text', arrivesAtMinute: 1600 },
    });
  if (full) {
    built.deductions.push({
      id: 'where-gouda',
      clueIds: ['ransom-text', 'flour-crumbs'],
      insight: 'The cat is kept at the cheese stall.',
    });
    (built.solution as { whereaboutsDeductionId?: string }).whereaboutsDeductionId = 'where-gouda';
  }
  const result: Record<string, unknown> = { ...built };
  if (options.form !== null) result.form = options.form ?? 'abduction';
  const truth: Record<string, unknown> = { ...built.truth };
  if (options.block !== null) {
    truth.abduction = { ...ABDUCTION, whereabouts: 'cheese-stall', ...options.block };
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
    expect(parsed.truth.abduction?.deadlineMinute).toBe(4260);
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

  it('rejects a conclusion about the place that is no deduction of the case, and one in a whodunit', () => {
    const unknown = abduction() as { solution: Record<string, unknown> };
    unknown.solution = { ...unknown.solution, whereaboutsDeductionId: 'nowhere' };
    const whodunit = buildCheeseCase() as unknown as { solution: Record<string, unknown> };
    whodunit.solution = { ...whodunit.solution, whereaboutsDeductionId: 'motive-debt' };

    expect(issuesOf(unknown)).toMatchObject([
      { code: 'unknown-reference', path: 'solution.whereaboutsDeductionId' },
    ]);
    expect(issuesOf(whodunit)).toMatchObject([{ code: 'schema', path: 'solution.whereaboutsDeductionId' }]);
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

describe('the form the engine names', () => {
  it('always gives a disappearance the form of an abduction', () => {
    for (let n = 0; n < 200; n += 1) {
      expect(formFor('missing-person', `seed-${String(n)}`)).toBe('abduction');
    }
  });

  it('gives every other crime an abduction one time in four, and the same form for the same seed', () => {
    const runs = 4000;
    for (const theme of [
      'financial',
      'cyber',
      'political-leak',
      'forgery',
      'corporate-espionage',
      'curious-theft',
    ]) {
      let abductions = 0;
      for (let n = 0; n < runs; n += 1) {
        const form = formFor(theme, `seed-${String(n)}`);
        expect(formFor(theme, `seed-${String(n)}`)).toBe(form);
        if (form === 'abduction') abductions += 1;
      }
      expect(abductions / runs).toBeGreaterThan(0.22);
      expect(abductions / runs).toBeLessThan(0.28);
    }
  });

  it('rejects a case of another form than the one named, and says which is asked', () => {
    const named = (form: 'abduction' | 'whodunit', input: unknown) =>
      validateCase(input, { hero: buildHero(), traits: [], locale: 'en', realNames: [], form });

    expect(named('whodunit', buildCheeseCase())).toMatchObject({ isValid: true });
    expect(named('abduction', abduction())).toMatchObject({ isValid: true });
    expect(named('abduction', buildCheeseCase())).toMatchObject({
      isValid: false,
      issues: [
        { code: 'form-mismatch', path: 'form', message: expect.stringContaining('abduction') as unknown },
      ],
    });
    expect(named('whodunit', abduction())).toMatchObject({
      isValid: false,
      issues: [{ code: 'form-mismatch', message: expect.stringContaining('whodunit') as unknown }],
    });
  });

  it('is asked of a case by its scenario when the brief names a form, and by name only', () => {
    // The scenario reads the form as a name: one it does not know asks for nothing.
    const check = (form: string | undefined) =>
      DETECTIVE_SCENARIO.check(
        DetectiveCaseSchema.parse(buildCheeseCase()),
        {
          hero: buildHero(),
          traits: [],
          locale: 'en',
          realNames: [],
          frame: false,
          ...(form === undefined ? {} : { form }),
        },
        () => 'x',
      );

    expect(check('abduction')).toMatchObject({ isValid: false });
    expect(check('whodunit')).not.toMatchObject({ issues: [{ code: 'form-mismatch' }] });
    expect(check('murder')).not.toMatchObject({ issues: [{ code: 'form-mismatch' }] });
    expect(check(undefined)).not.toMatchObject({ issues: [{ code: 'form-mismatch' }] });
  });
});

const HOMICIDE = { victim: { name: 'Pieter Vane, the stallholder' }, fate: 'attempt' } as const;

/** The cheese case as a homicide; a `null` leaves the form or the block out. */
function homicide(options: { form?: string | null; block?: Record<string, unknown> | null } = {}) {
  const built = buildCheeseCase();
  const result: Record<string, unknown> = { ...built };
  if (options.form !== null) result.form = options.form ?? 'homicide';
  const truth: Record<string, unknown> = { ...built.truth };
  if (options.block !== null) truth.homicide = { ...HOMICIDE, ...options.block };
  result.truth = truth;
  return result;
}

describe('the form homicide', () => {
  it('is one of the forms, with two fates, and the themes that ask for it are crime types', () => {
    expect(CASE_FORMS).toContain('homicide');
    expect([...HOMICIDE_FATES]).toEqual(['attempt', 'death']);
    expect([...HOMICIDE_THEMES]).toEqual(['attempted-murder', 'murder']);
    for (const theme of HOMICIDE_THEMES) expect(CRIME_TYPES).toContain(theme);
    for (const theme of HOMICIDE_THEMES) expect(GENERAL_CRIME_TYPES).not.toContain(theme);
    expect(GENERAL_CRIME_TYPES).toHaveLength(CRIME_TYPES.length - HOMICIDE_THEMES.length);
  });

  it('is chosen by the engine from the theme, on every seed, and by no other theme', () => {
    for (let index = 0; index < 60; index += 1) {
      const seed = `homicide-${String(index)}`;
      expect(formFor('attempted-murder', seed)).toBe('homicide');
      expect(formFor('murder', seed)).toBe('homicide');
      expect(formFor('forgery', seed)).not.toBe('homicide');
      expect(formFor('missing-person', seed)).toBe('abduction');
    }
  });

  it('is what a run with no seed never falls back on: the scenario names only the ordinary themes', () => {
    for (const theme of HOMICIDE_THEMES) expect(DETECTIVE_SCENARIO.themes).not.toContain(theme);
  });

  it('is accepted with its victim and what became of them, whichever fate', () => {
    for (const fate of HOMICIDE_FATES) {
      const parsed = DetectiveCaseSchema.parse(homicide({ block: { fate } }));

      expect(formOf(parsed)).toBe('homicide');
      expect(parsed.truth.homicide).toEqual({ ...HOMICIDE, fate });
    }
  });

  it('needs its victim and fate, and the schema refuses a fate it does not know', () => {
    expect(DetectiveCaseSchema.safeParse(homicide({ block: null })).success).toBe(false);
    expect(DetectiveCaseSchema.safeParse(homicide({ block: { fate: 'unknown' } })).success).toBe(false);
    expect(DetectiveCaseSchema.safeParse(homicide({ block: { victim: { name: ' ' } } })).success).toBe(false);
  });

  it('is only in a case of that form: no other form has the block, and a case with none is as it was', () => {
    for (const form of [null, 'whodunit']) {
      expect(DetectiveCaseSchema.safeParse(homicide({ form })).success).toBe(false);
    }
    expect(DetectiveCaseSchema.safeParse(homicide({ form: 'abduction' })).success).toBe(false);
    expect(JSON.stringify(DetectiveCaseSchema.parse(buildCheeseCase()))).not.toContain('homicide');
  });

  it('is refused for an abduction that also says it is one, since a case has a single form', () => {
    const both = homicide();
    (both.truth as Record<string, unknown>).abduction = ABDUCTION;

    expect(DetectiveCaseSchema.safeParse(both).success).toBe(false);
  });

  it('is told apart from a whodunit when the brief asks for it, in a message the generator can act on', () => {
    const asked = validateCase(buildCheeseCase(), {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      form: 'homicide',
    });

    expect(!asked.isValid && asked.issues).toEqual([
      expect.objectContaining({
        code: 'form-mismatch',
        message: expect.stringContaining('truth.homicide') as unknown,
      }),
    ]);
    const other = validateCase(homicide(), {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      form: 'whodunit',
    });
    expect(!other.isValid && other.issues[0]?.message).toContain('truth.homicide');
  });
});
