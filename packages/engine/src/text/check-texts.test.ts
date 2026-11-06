// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { checkLocale, checkNarrativeTexts } from './check-texts.js';

describe('the language of a case', () => {
  it('is no issue when it is the language of the run', () => {
    expect(checkLocale('en', 'en')).toEqual([]);
    expect(checkLocale('ru', 'ru')).toEqual([]);
  });

  it('is one issue, that names both, when it is not', () => {
    expect(checkLocale('en', 'ru')).toEqual([
      {
        code: 'locale-mismatch',
        path: 'locale',
        message: 'The case is in "en", but the run is in "ru".',
      },
    ]);
  });
});

describe('the narrative texts of a case', () => {
  it('give no issue when each is in the language and names nothing real', () => {
    expect(
      checkNarrativeTexts(
        [
          { path: 'title', text: 'The Vanishing Wheel of Elmwick' },
          { path: 'premise', text: 'A wheel of cheese is gone from the market.' },
        ],
        'en',
        ['Norway'],
      ),
    ).toEqual([]);
    expect(checkNarrativeTexts([], 'en', [])).toEqual([]);
  });

  it('name a real name, with the path of the text and what to put in its place', () => {
    expect(
      checkNarrativeTexts([{ path: 'truth.method', text: 'Sold it to a buyer from Norway.' }], 'en', [
        'Norway',
      ]),
    ).toEqual([
      {
        code: 'real-name',
        path: 'truth.method',
        message: 'Replace the real-world name "Norway" with its mirror-world name.',
      },
    ]);
  });

  it('name a text in the wrong script, and only that, not also the wrong language', () => {
    const issues = checkNarrativeTexts([{ path: 'title', text: 'Все должны всем.' }], 'en', []);

    expect(issues.map(({ code }) => code)).toEqual(['wrong-script']);
  });

  it('name a text in the right script that is clearly another language', () => {
    const issues = checkNarrativeTexts(
      [{ path: 'title', text: 'Le fromage a disparu du marché avant que personne ne le remarque.' }],
      'en',
      [],
    );

    expect(issues.map(({ code }) => code)).toEqual(['wrong-language']);
  });

  it('give an issue for each text that has one, in the order of the texts, and a text can have two', () => {
    const issues = checkNarrativeTexts(
      [
        { path: 'a', text: 'Fine.' },
        { path: 'b', text: 'Привет, Norway.' },
        { path: 'c', text: 'Norway again.' },
      ],
      'en',
      ['Norway'],
    );

    expect(issues.map(({ code, path }) => `${code} ${path}`)).toEqual([
      'real-name b',
      'wrong-script b',
      'real-name c',
    ]);
  });
});
