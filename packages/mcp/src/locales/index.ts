// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '@the-race/engine';
import type { BoardText } from '../board/board-text.js';
import type { TabText } from '../board/tab-text.js';
import en from './en.json' with { type: 'json' };
import ru from './ru.json' with { type: 'json' };

/** Everything the server says to the player that is not the case's own text, one file per language. */
export interface LocaleText {
  readonly board: BoardText;
  readonly tabs: TabText;
}

// Assigning the files to `LocaleText` is the completeness check at compile time: a key missing from either
// file, or an id of the engine without a word, does not build. `locales.test.ts` repeats it for the files as data.
export const LOCALE_TEXT: Record<Locale, LocaleText> = { en, ru };
