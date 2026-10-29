// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '../locale.js';

const LETTER = /\p{L}/gu;
const SCRIPT_LETTER_BY_LOCALE: Readonly<Record<Locale, RegExp>> = {
  ru: /\p{Script=Cyrillic}/gu,
  en: /\p{Script=Latin}/gu,
};

// Fictional brands and abbreviations legitimately use another script, so a text only has to be
// mostly in the locale's script; very short texts carry too little signal to judge.
const MIN_LETTERS_TO_JUDGE = 3;
const MIN_SCRIPT_SHARE = 0.6;

/** Whether the text is written mostly in the script of the locale. */
export function isInLocaleScript(text: string, locale: Locale): boolean {
  const letterCount = countMatches(text, LETTER);
  if (letterCount < MIN_LETTERS_TO_JUDGE) return true;
  return countMatches(text, SCRIPT_LETTER_BY_LOCALE[locale]) / letterCount >= MIN_SCRIPT_SHARE;
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}
