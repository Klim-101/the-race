// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale, SightingDescription } from '@the-race/engine';
import { LOCALE_TEXT } from './locales/index.js';

/** The words of the clue in which a witness tells that they saw a suspect: a template and the word that joins times. */
export interface SightingText {
  /** With {witness}, {suspect}, {place} and {times}. */
  readonly clue: string;
  /** The word between the last two times of a list. */
  readonly and: string;
}

/** A minute of the day as a clock time. */
function clockTime(minuteOfDay: number): string {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

/** Clock times in a list a person would say: one, two with "and", more with commas and "and" before the last. */
function timesIn(minutesOfDay: readonly number[], and: string): string {
  const times = minutesOfDay.map(clockTime);
  return times.length <= 1
    ? times.join('')
    : `${times.slice(0, -1).join(', ')} ${and} ${times.slice(-1).join('')}`;
}

/** The words of a sighting in the language of the case, for the engine to make a clue of it. */
export function describeSighting(locale: Locale): (description: SightingDescription) => string {
  const text = LOCALE_TEXT[locale].sighting;
  return ({ witnessName, suspectName, placeName, minutesOfDay }) =>
    text.clue
      .replace('{witness}', witnessName)
      .replace('{suspect}', suspectName)
      .replace('{place}', placeName)
      .replace('{times}', timesIn(minutesOfDay, text.and));
}
