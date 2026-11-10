// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildWorkFile, flatten, readWorkFile, unflatten } from './locale-keys.mjs';

const english = { a: { title: 'Hello {name}', note: 'Plain' }, b: 'Day {n} of {total}' };
const filled = (overrides = {}) => {
  const work = buildWorkFile('de', english, undefined);
  const texts = { 'a.title': 'Hallo {name}', 'a.note': 'Einfach', b: 'Tag {n} von {total}' };
  for (const [path, text] of Object.entries({ ...texts, ...overrides })) work.keys[path].text = text;
  return work;
};

describe('flatten and unflatten', () => {
  it('turn a nested locale into paths and back, in the order of the shape', () => {
    const flat = flatten(english);
    const back = unflatten(english, new Map(flat.toReversed()));

    expect(flat).toEqual([
      ['a.title', 'Hello {name}'],
      ['a.note', 'Plain'],
      ['b', 'Day {n} of {total}'],
    ]);
    expect(back).toEqual(english);
    expect(Object.keys(back.a)).toEqual(['title', 'note']);
  });

  it('leaves a text empty when the map has none', () => {
    expect(unflatten({ a: 'x' }, new Map())).toEqual({ a: '' });
  });
});

describe('buildWorkFile', () => {
  it('lists every English key with an empty translation that nobody has reviewed', () => {
    const work = buildWorkFile('de', english, undefined);

    expect(work.locale).toBe('de');
    expect(work.keys['a.title']).toEqual({ en: 'Hello {name}', text: '', reviewed: false });
    expect(Object.keys(work.keys)).toEqual(['a.title', 'a.note', 'b']);
  });

  it('carries over what a committed language already says, as reviewed, so only the new keys are left to do', () => {
    const work = buildWorkFile('de', english, { a: { title: 'Hallo {name}' } });

    expect(work.keys['a.title']).toEqual({ en: 'Hello {name}', text: 'Hallo {name}', reviewed: true });
    expect(work.keys['a.note']).toEqual({ en: 'Plain', text: '', reviewed: false });
  });
});

describe('readWorkFile', () => {
  it('brings back the nested locale, and lists every text no person has reviewed', () => {
    const work = filled();
    work.keys['a.note'].reviewed = true;

    const { locale, unreviewed, problems } = readWorkFile(work, english);

    expect(problems).toEqual([]);
    expect(locale).toEqual({ a: { title: 'Hallo {name}', note: 'Einfach' }, b: 'Tag {n} von {total}' });
    expect(unreviewed).toEqual(['a.title', 'b']);
  });

  it('has nothing unreviewed when a person has checked every text', () => {
    const work = filled();
    for (const entry of Object.values(work.keys)) entry.reviewed = true;

    expect(readWorkFile(work, english).unreviewed).toEqual([]);
  });

  it('names a key left empty, a key removed, a key that is not English, and changed placeholders', () => {
    const work = filled({ 'a.note': '  ', b: 'Tag {n}' });
    delete work.keys['a.title'];
    work.keys.extra = { en: '', text: 'x', reviewed: false };

    expect(readWorkFile(work, english).problems).toEqual([
      'extra: not a key of the English locale',
      'a.title: missing from the work file',
      'a.note: no translation',
      'b: the placeholders differ from the English text',
    ]);
  });
});
