// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BLANK_TEXT_PLACEHOLDER, readFrame } from './frame.js';

// A schema that is no archetype's: a title, steps with an id and a text, and a rule across two fields. That reading a
// frame needs nothing of what is in the schema is what the tests are for.
const Toy = z
  .object({
    title: z.string().trim().min(1),
    steps: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z-]*$/),
          text: z.string().trim().min(1),
          weight: z.int().min(1),
        }),
      )
      .min(1),
    note: z.string().trim().min(1).optional(),
    range: z.object({ from: z.int(), until: z.int() }),
  })
  .superRefine((toy, context) => {
    if (toy.range.until < toy.range.from) {
      context.addIssue({ code: 'custom', path: ['range', 'until'], message: 'Ends before it starts.' });
    }
  });

const whole = () => ({
  title: 'A title',
  steps: [
    { id: 'one', text: 'First', weight: 1 },
    { id: 'two', text: 'Second', weight: 2 },
  ],
  range: { from: 1, until: 3 },
});

describe('reading a document as a case or a frame of any schema', () => {
  it('reads a complete document as a whole case', () => {
    expect(readFrame(Toy, whole())).toMatchObject({ kind: 'whole', scenario: { title: 'A title' } });
  });

  it('reads a document with some texts blank as a frame, and lists them by JSON Pointer, nested ones included', () => {
    const document = whole();
    document.title = '';
    document.steps[1]!.text = '   ';

    const reading = readFrame(Toy, document);

    expect(reading).toMatchObject({ kind: 'frame', blanks: ['/title', '/steps/1/text'] });
    expect(reading.kind === 'frame' && reading.scenario.title).toBe(BLANK_TEXT_PLACEHOLDER);
    expect(reading.kind === 'frame' && reading.scenario.steps[1]?.text).toBe(BLANK_TEXT_PLACEHOLDER);
    // What is not blank is as it was written.
    expect(reading.kind === 'frame' && reading.scenario.steps[0]?.text).toBe('First');
  });

  it('never changes the document it was given', () => {
    const document = { ...whole(), title: '' };
    const before = structuredClone(document);

    readFrame(Toy, document);

    expect(document).toEqual(before);
  });

  it('says what else is wrong, and leaves the blank texts out of it, which a frame has by design', () => {
    const document = whole();
    document.title = '';
    document.steps[0]!.id = 'Not An Id';

    const reading = readFrame(Toy, document);

    expect(reading).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'schema', path: 'steps.0.id' }],
      blanks: ['/title'],
    });
  });

  it('reads a rule across fields that fails beside a blank text as what is wrong, in the same pass', () => {
    const document = { ...whole(), title: '', range: { from: 5, until: 2 } };

    expect(readFrame(Toy, document)).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'schema', path: 'range.until' }],
      blanks: ['/title'],
    });
  });

  it('reads an optional text that is given blank as blank, and one that is left out as nothing', () => {
    expect(readFrame(Toy, { ...whole(), note: '' })).toMatchObject({ kind: 'frame', blanks: ['/note'] });
    expect(readFrame(Toy, whole()).kind).toBe('whole');
  });

  it('is a frame only of what is a string with a minimum length: a number that is too small is not a blank', () => {
    const document = whole();
    document.steps[0]!.weight = 0;

    expect(readFrame(Toy, document)).toMatchObject({
      kind: 'invalid',
      issues: [{ code: 'schema', path: 'steps.0.weight' }],
      blanks: [],
    });
  });

  it.each([[undefined], ['a case'], [[]], [null], [42]])('reads %j as invalid, with no blank', (document) => {
    const reading = readFrame(Toy, document);

    expect(reading).toMatchObject({ kind: 'invalid', blanks: [] });
    expect(reading.kind === 'invalid' && reading.issues.length).toBeGreaterThan(0);
  });
});
