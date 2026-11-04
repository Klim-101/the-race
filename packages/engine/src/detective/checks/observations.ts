// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '../../locale.js';
import type { CaseIssue } from '../case-issue.js';
import type { DetectiveCase } from '../case-schema.js';

/**
 * Words with which a description says what a thing means instead of what it is. Only the plain markers of a
 * conclusion are here, so that a good description is never refused: a figure of speech does not have them, and one
 * that does is easily written without. A clue shows what was seen, read or measured; the hero concludes.
 */
const CONCLUSION_MARKERS: Readonly<Record<Locale, readonly string[]>> = {
  en: [
    'looks like',
    'looks as if',
    'looks as though',
    'as if',
    'must have',
    'must be',
    'clearly',
    'obviously',
    'evidently',
    'apparently',
    'seems',
    'appears to',
    'which proves',
    'proves that',
    'suggests',
    'indicating',
    'shows that',
    'which means',
  ],
  ru: [
    'похоже',
    'очевидно',
    'наверняка',
    'видимо',
    'по-видимому',
    'судя по всему',
    'явно',
    'должно быть',
    'как будто',
    'доказывает',
    'свидетельствует',
    'что значит',
    'выходит, что',
  ],
};

/** The marker a description uses, whole words only, or `undefined`. The markers are plain words, with nothing to escape. */
export function conclusionMarkerIn(text: string, locale: Locale): string | undefined {
  const lower = text.toLowerCase();
  return CONCLUSION_MARKERS[locale].find((marker) =>
    new RegExp(String.raw`(?<![\p{L}\p{N}])${marker}(?![\p{L}\p{N}])`, 'u').test(lower),
  );
}

/** A clue says what is seen, read or measured and leaves the meaning to the hero. */
export function checkObservations(detectiveCase: DetectiveCase): CaseIssue[] {
  return detectiveCase.clues.flatMap((clue, index) => {
    const marker = conclusionMarkerIn(clue.description, detectiveCase.locale);
    return marker === undefined
      ? []
      : [
          {
            code: 'clue-draws-conclusion' as const,
            path: `clues[${String(index)}].description`,
            message: `Clue "${clue.id}" says what it means ("${marker}"): describe only what is seen, read or measured, and let the hero conclude.`,
          },
        ];
  });
}
