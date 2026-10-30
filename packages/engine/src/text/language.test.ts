// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { LOCALES } from '../locale.js';
import { isClearlyOtherLanguage, localeStopwords } from './language.js';

const ENGLISH = [
  'On the morning of the harvest fair, the giant cheese wheel is gone from its stall.',
  'Inspector Hale found 3 muddy boots by the east door, and "nobody saw a thing," the mayor insisted.',
  'She told Orla Brenn that the ledger had been signed on 14 March, long before the fair began.',
  'Lord Hargrove Ashworth visited Elmwick Manor yesterday.',
  'Round tracks of something heavy rolled into the cellar.',
];

const RUSSIAN = [
  'Утром в день ярмарки огромный круг сыра исчез с прилавка.',
  'Инспектор Хейл нашёл у восточной двери 3 грязных сапога, а «никто ничего не видел», как заявил мэр.',
  'Она сказала Орле Бренн, что книга была подписана 14 марта, задолго до начала ярмарки.',
  'Лорд Харгроув Эшворт вчера посетил усадьбу Элмвик.',
];

describe('isClearlyOtherLanguage', () => {
  it('has a profile for every locale', () => {
    for (const locale of LOCALES) {
      expect(localeStopwords(locale).length).toBeGreaterThanOrEqual(30);
    }
  });

  it('accepts genuine English and Russian paragraphs', () => {
    for (const text of ENGLISH) expect(isClearlyOtherLanguage(text, 'en')).toBe(false);
    for (const text of RUSSIAN) expect(isClearlyOtherLanguage(text, 'ru')).toBe(false);
  });

  it('rejects Spanish, German, French and Italian prose in an English run', () => {
    const foreign = [
      'El queso desapareció de la feria antes de que nadie lo viera por la noche.',
      'Der Käse ist in der Nacht von dem Markt verschwunden, und niemand hat etwas gesehen.',
      "Le fromage a disparu de la foire pendant la nuit et personne n'a rien vu.",
      'Il formaggio è sparito dalla fiera durante la notte e nessuno ha visto niente.',
    ];
    for (const text of foreign) expect(isClearlyOtherLanguage(text, 'en')).toBe(true);
  });

  it('rejects one locale text in the other locale', () => {
    expect(isClearlyOtherLanguage(ENGLISH[0] ?? '', 'ru')).toBe(true);
    expect(isClearlyOtherLanguage(RUSSIAN[2] ?? '', 'en')).toBe(true);
  });

  it('does not judge short texts, even in another language', () => {
    expect(isClearlyOtherLanguage('El queso de la feria', 'en')).toBe(false);
    expect(isClearlyOtherLanguage('', 'en')).toBe(false);
  });

  it('is not tripped by fictional proper nouns', () => {
    expect(isClearlyOtherLanguage('Zorbia Nordell Quillfeather Ashworth Brenn Holm Elmwick', 'en')).toBe(
      false,
    );
  });
});
