// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import type { CaseIssueCode } from '../case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from '../case-schema.js';
import { validateCase } from '../case-validator.js';
import { LEGACY_RULES } from '../case-rules.js';
import { checkObservations, conclusionMarkerIn } from './observations.js';

function withDescription(description: string, locale: 'en' | 'ru' = 'en'): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  detectiveCase.locale = locale;
  const clue = detectiveCase.clues[0];
  if (clue !== undefined) clue.description = description;
  return detectiveCase;
}

function codes(detectiveCase: DetectiveCase, requireObservations = true): CaseIssueCode[] {
  const result = validateCase(detectiveCase, {
    hero: buildHero(),
    traits: [],
    locale: 'en',
    realNames: [],
    rules: { ...LEGACY_RULES, observations: requireObservations },
  });
  return result.isValid ? [] : result.issues.map(({ code }) => code);
}

describe('a clue that says what it means', () => {
  it('is refused, with the words that gave it away, and what it should do instead', () => {
    const detectiveCase = withDescription(
      'A small server with no inventory number, plugged into the bureau network. Looks like a secret channel out.',
    );

    expect(codes(detectiveCase)).toEqual(['clue-draws-conclusion']);
    const [issue] = checkObservations(detectiveCase);
    expect(issue).toMatchObject({ code: 'clue-draws-conclusion', path: 'clues[0].description' });
    expect(issue?.message).toContain('looks like');
    expect(issue?.message).toContain('let the hero conclude');
  });

  it('is not asked for when the case is not a generated one', () => {
    expect(codes(withDescription('It must have been the baker.'), false)).toEqual([]);
  });

  it('is accepted when it only says what is seen, read or measured', () => {
    expect(
      codes(
        withDescription(
          'A small server with no inventory number stands under the duty desk, plugged into the bureau network.',
        ),
      ),
    ).toEqual([]);
  });
});

describe('the words of a conclusion', () => {
  it('are found whole, in any case', () => {
    expect(conclusionMarkerIn('It LOOKS LIKE a hurry.', 'en')).toBe('looks like');
    expect(conclusionMarkerIn('Apparently, the door was open.', 'en')).toBe('apparently');
    expect(conclusionMarkerIn('Someone must have carried it.', 'en')).toBe('must have');
    expect(conclusionMarkerIn('The goose left in a hurry, as if carried.', 'en')).toBe('as if');
  });

  it('are not found inside another word', () => {
    expect(conclusionMarkerIn('An unclearly written label, a seamstress, a classic.', 'en')).toBeUndefined();
    expect(conclusionMarkerIn('Feathers, a ledger, a receipt for an oven.', 'en')).toBeUndefined();
  });

  it('are found in Russian too, by whole words', () => {
    expect(conclusionMarkerIn('Похоже на тайный канал наружу.', 'ru')).toBe('похоже');
    expect(conclusionMarkerIn('Судя по всему, его выдают всем.', 'ru')).toBe('судя по всему');
    expect(conclusionMarkerIn('Это непохожие друг на друга перья.', 'ru')).toBeUndefined();
    expect(conclusionMarkerIn('Крошки и сахар на ступенях музея.', 'ru')).toBeUndefined();
  });

  it('are those of the language of the case', () => {
    expect(checkObservations(withDescription('Похоже, это ключ от подвала.', 'ru'))).toMatchObject([
      { code: 'clue-draws-conclusion' },
    ]);
    expect(checkObservations(withDescription('Похоже, это ключ от подвала.', 'en'))).toEqual([]);
  });
});
