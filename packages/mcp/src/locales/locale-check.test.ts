// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { compareLocale, leaves } from './locale-check.js';

const reference = { a: { title: 'Hello {name}', note: 'Plain' }, b: 'Day {n} of {total}' };

describe('leaves', () => {
  it('lists every text with its path, in the order of the file', () => {
    expect(leaves(reference)).toEqual([
      ['a.title', 'Hello {name}'],
      ['a.note', 'Plain'],
      ['b', 'Day {n} of {total}'],
    ]);
  });
});

describe('compareLocale', () => {
  it('has nothing to say about a complete language, whatever order its keys are in', () => {
    const own = { b: 'Jour {total}, {n}', a: { note: 'Simple', title: 'Salut {name}' } };

    expect(compareLocale(reference, own)).toEqual([]);
  });

  it('names a key the language lacks, which is what a new key in the reference leaves behind', () => {
    expect(compareLocale(reference, { a: { title: 'Salut {name}' }, b: 'Jour {n}, {total}' })).toEqual([
      { kind: 'missing', path: 'a.note' },
    ]);
  });

  it('names a key only the language has, which is what a key removed from the reference leaves behind', () => {
    const withoutNote = { ...reference, a: { title: reference.a.title } };

    expect(compareLocale(withoutNote, reference)).toEqual([{ kind: 'extra', path: 'a.note' }]);
  });

  it('names a text left empty or blank', () => {
    expect(
      compareLocale(reference, { a: { title: 'Salut {name}', note: '  ' }, b: 'Jour {n}, {total}' }),
    ).toEqual([{ kind: 'empty', path: 'a.note' }]);
  });

  it('names a text that fills in other places than the reference does', () => {
    expect(
      compareLocale(reference, { a: { title: 'Salut', note: 'Simple' }, b: 'Jour {n}, {total}, {x}' }),
    ).toEqual([
      { kind: 'placeholders', path: 'a.title' },
      { kind: 'placeholders', path: 'b' },
    ]);
  });
});
