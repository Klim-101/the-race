// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Issue } from '../issues.js';
import type { Locale } from '../locale.js';
import { isClearlyOtherLanguage } from './language.js';
import { findRealName } from './real-names.js';
import { isInLocaleScript } from './script.js';

/** A narrative text of a case with the path it is at, as the generator is told of it and a patch names it. */
export interface NarrativeText {
  readonly path: string;
  readonly text: string;
}

/** The case is in the language of the run. It is a fact of the frame, whatever the texts say. */
export function checkLocale(caseLocale: Locale, locale: Locale): Issue<'locale-mismatch'>[] {
  return caseLocale === locale
    ? []
    : [
        {
          code: 'locale-mismatch',
          path: 'locale',
          message: `The case is in "${caseLocale}", but the run is in "${locale}".`,
        },
      ];
}

/**
 * Every narrative text is in the run's language and names nothing from the real world. It belongs to no archetype: each
 * says which of its texts there are, and what is checked is the same.
 */
export function checkNarrativeTexts(
  texts: readonly NarrativeText[],
  locale: Locale,
  realNames: readonly string[],
): Issue<'real-name' | 'wrong-script' | 'wrong-language'>[] {
  const issues: Issue<'real-name' | 'wrong-script' | 'wrong-language'>[] = [];
  for (const { path, text } of texts) {
    const realName = findRealName(text, realNames);
    if (realName !== undefined) {
      issues.push({
        code: 'real-name',
        path,
        message: `Replace the real-world name "${realName}" with its mirror-world name.`,
      });
    }
    if (!isInLocaleScript(text, locale)) {
      issues.push({ code: 'wrong-script', path, message: `Write this text in "${locale}".` });
    } else if (isClearlyOtherLanguage(text, locale)) {
      // Only when the script is right: a wrong script is already reported, and once is enough.
      issues.push({ code: 'wrong-language', path, message: `Write this text in the language "${locale}".` });
    }
  }
  return issues;
}
