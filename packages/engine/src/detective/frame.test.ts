// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { applyPatch, toJsonPointer, type PatchOp } from '../json-patch.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { validateCase, type CaseValidationContext } from './case-validator.js';
import { collectNarrativeTexts } from './checks/texts.js';
import { BLANK_TEXT_PLACEHOLDER, readCaseOrFrame } from './frame.js';

const slots = (): { path: string; text: string }[] =>
  collectNarrativeTexts(DetectiveCaseSchema.parse(buildCheeseCase()));

const replace = (path: string, value: string): PatchOp => ({
  op: 'replace',
  path: toJsonPointer(path),
  value,
});

/** The cheese case with every narrative text blank, as a generator writes a frame. */
function frameOfCheese(): unknown {
  const result = applyPatch(
    buildCheeseCase(),
    slots().map(({ path }) => replace(path, '')),
  );
  if (!result.ok) throw new Error('The sample could not be blanked.');
  return result.document;
}

/** The patch a generator sends once the frame is accepted: every text, written. */
const textsOfCheese = (): PatchOp[] => slots().map(({ path, text }) => replace(path, text));

function context(overrides: Partial<CaseValidationContext> = {}): CaseValidationContext {
  return { hero: buildHero(), traits: [], locale: 'en', realNames: [], ...overrides };
}

const codesOf = (input: unknown, validationContext: CaseValidationContext): string[] => {
  const result = validateCase(input, validationContext);
  return result.isValid ? [] : result.issues.map(({ code }) => code);
};

describe('reading a document as a case or a frame', () => {
  it('reads a case with every text written as a whole case', () => {
    const reading = readCaseOrFrame(buildCheeseCase());

    expect(reading.kind).toBe('whole');
  });

  it('reads a case with every text blank as a frame, and lists exactly the places of the texts', () => {
    const reading = readCaseOrFrame(frameOfCheese());

    expect(reading.kind).toBe('frame');
    if (reading.kind !== 'frame') return;
    expect([...reading.blanks].sort()).toEqual(
      slots()
        .map(({ path }) => toJsonPointer(path))
        .sort(),
    );
    // The schema and the list of texts the checks read agree, so a new text of the schema cannot be left out of a frame.
    expect(reading.blanks.length).toBeGreaterThan(20);
  });

  it('puts a placeholder in each blank of the case it hands back, and leaves everything else as it was', () => {
    const reading = readCaseOrFrame(frameOfCheese());
    if (reading.kind !== 'frame') throw new Error('Not a frame.');
    const whole = DetectiveCaseSchema.parse(buildCheeseCase());

    expect(reading.detectiveCase.title).toBe(BLANK_TEXT_PLACEHOLDER);
    expect(reading.detectiveCase.truth.motive).toBe(BLANK_TEXT_PLACEHOLDER);
    expect(reading.detectiveCase.locations.map(({ id, connections }) => [id, connections])).toEqual(
      whole.locations.map(({ id, connections }) => [id, connections]),
    );
    expect(reading.detectiveCase.truth.timeline.map(({ atMinute, actorId }) => [atMinute, actorId])).toEqual(
      whole.truth.timeline.map(({ atMinute, actorId }) => [atMinute, actorId]),
    );
  });

  it('never changes the document it was given', () => {
    const document = frameOfCheese();
    const before = structuredClone(document);

    readCaseOrFrame(document);

    expect(document).toEqual(before);
  });

  it('reads a case with one text blank, or only blanks of spaces, as a frame too', () => {
    const one = buildCheeseCase();
    one.title = '';
    const spaces = buildCheeseCase();
    spaces.suspects[0]!.persona = '   ';

    expect(readCaseOrFrame(one)).toMatchObject({ kind: 'frame', blanks: ['/title'] });
    expect(readCaseOrFrame(spaces)).toMatchObject({ kind: 'frame', blanks: ['/suspects/0/persona'] });
  });

  it('says what else is wrong, and leaves the blanks out of it, which a frame has by design', () => {
    const document = frameOfCheese() as ReturnType<typeof buildCheeseCase>;
    document.locations[0]!.id = 'Not An Id';

    const reading = readCaseOrFrame(document);

    expect(reading).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'schema', path: 'locations.0.id' }],
    });
    // The blanks are still listed, for the stage that writes the texts.
    expect(reading.kind === 'invalid' && reading.blanks.length).toBeGreaterThan(20);
  });

  it('reads a rule of an event that fails beside a blank text as what is wrong, in the same pass', () => {
    const document = frameOfCheese() as ReturnType<typeof buildCheeseCase>;
    document.randomEvents = [
      {
        id: 'fair-music',
        description: '',
        weight: 2,
        effect: { kind: 'flavor' },
        duration: { kind: 'permanent' },
      },
    ];

    const reading = readCaseOrFrame(document);

    expect(reading).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'schema', path: 'randomEvents.0.duration' }],
    });
  });

  it.each([[undefined], ['a case'], [[]], [null], [42]])('reads %j as invalid, with no blank', (document) => {
    const reading = readCaseOrFrame(document);

    expect(reading).toMatchObject({ kind: 'invalid', blanks: [] });
    expect(reading.kind === 'invalid' && reading.issues.length).toBeGreaterThan(0);
  });
});

describe('a frame in the validator', () => {
  it('passes as a frame, and then as a whole case once the texts are patched into it', () => {
    const reading = readCaseOrFrame(frameOfCheese());
    if (reading.kind !== 'frame') throw new Error('Not a frame.');

    expect(validateCase(reading.detectiveCase, context({ frame: true })).isValid).toBe(true);

    const patched = applyPatch(frameOfCheese(), textsOfCheese());
    expect(patched.ok).toBe(true);
    expect(readCaseOrFrame(patched.ok ? patched.document : undefined).kind).toBe('whole');
    expect(validateCase(patched.ok ? patched.document : undefined, context()).isValid).toBe(true);
  });

  it('is judged on its structure: a reference to nothing, or a broken chain, is an issue of the frame', () => {
    const document = frameOfCheese() as ReturnType<typeof buildCheeseCase>;
    document.clues[1]!.pointsTo = ['ghost'];
    const reading = readCaseOrFrame(document);
    if (reading.kind !== 'frame') throw new Error('Not a frame.');

    expect(codesOf(reading.detectiveCase, context({ frame: true }))).toEqual(['unknown-reference']);
  });

  it('is judged on the language of the case, which is a fact of the frame and not of a text', () => {
    const reading = readCaseOrFrame(frameOfCheese());
    if (reading.kind !== 'frame') throw new Error('Not a frame.');

    expect(codesOf(reading.detectiveCase, context({ frame: true, locale: 'ru' }))).toEqual([
      'locale-mismatch',
    ]);
  });

  describe('what the texts say', () => {
    const withTexts = () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.truth.method = 'Sold the wheel to a buyer from Norway.';
      detectiveCase.clues[0]!.description = 'Clearly the lock was forced.';
      detectiveCase.suspects[0]!.alibi = 'Все должны всем.';
      return detectiveCase;
    };
    const full = { requireObservations: true, realNames: ['Norway'] };

    it('is judged when the case is complete: names, language and what a clue claims to mean', () => {
      expect(codesOf(withTexts(), context(full)).sort()).toEqual([
        'clue-draws-conclusion',
        'real-name',
        'wrong-script',
      ]);
    });

    it('is left to that stage in a frame, which is judged on its structure alone', () => {
      expect(codesOf(withTexts(), context({ ...full, frame: true }))).toEqual([]);
    });
  });
});
