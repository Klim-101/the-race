// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { LOCALES } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { LOCALE_TEXT } from './index.js';

/** Every path to a string in a locale, such as `tabs.map.title`, with the string. */
function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  return Object.entries(node as object).flatMap(([key, child]) =>
    leaves(child, path === '' ? key : `${path}.${key}`),
  );
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name ?? '');

describe('locale files', () => {
  const english = leaves(LOCALE_TEXT.en);

  it('hold a text for every language the engine knows', () => {
    expect(Object.keys(LOCALE_TEXT).sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)('%s has exactly the keys of en, no more and no fewer', (locale) => {
    expect(leaves(LOCALE_TEXT[locale]).map(([path]) => path)).toEqual(english.map(([path]) => path));
  });

  it.each(LOCALES)('%s leaves no text empty', (locale) => {
    expect(leaves(LOCALE_TEXT[locale]).filter(([, text]) => text.trim() === '')).toEqual([]);
  });

  it.each(LOCALES)('%s fills in the same placeholders as en', (locale) => {
    const own = new Map(leaves(LOCALE_TEXT[locale]));
    for (const [path, text] of english) {
      expect([path, placeholders(own.get(path) ?? '').sort()]).toEqual([path, placeholders(text).sort()]);
    }
  });
});
