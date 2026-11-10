// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readdirSync } from 'node:fs';
import { BACKGROUNDS, DETECTIVE, LIFE_STATES, LOCALES } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { LOCALE_TEXT } from './index.js';
import { compareLocale } from './locale-check.js';

describe('locale files', () => {
  it('hold a text for every language the engine knows', () => {
    expect(Object.keys(LOCALE_TEXT).sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)('%s has exactly the keys of en, none empty, and the same placeholders', (locale) => {
    expect(compareLocale(LOCALE_TEXT.en, LOCALE_TEXT[locale])).toEqual([]);
  });

  it('has a file for every language and no file for a language the engine does not know', () => {
    // A file dropped into the folder but never added to LOCALES would be checked by nothing; say so here.
    const files = readdirSync(new URL('.', import.meta.url))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));

    expect(files.sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)('%s has a word for every background and every life state of the engine', (locale) => {
    const { backgrounds, lifeStates } = LOCALE_TEXT[locale].tabs.hero;
    expect(Object.keys(backgrounds).sort()).toEqual([...BACKGROUNDS].sort());
    expect(Object.keys(lifeStates).sort()).toEqual([...LIFE_STATES].sort());
  });

  it.each(LOCALES)('%s names every signal of the engine and says its gift and its cost', (locale) => {
    const { signals, signalNotes } = LOCALE_TEXT[locale].tabs.hero;
    const ids = DETECTIVE.signals.map(({ id }) => id).sort();
    expect(Object.keys(signals).sort()).toEqual(ids);
    expect(Object.keys(signalNotes).sort()).toEqual(ids);
  });
});
