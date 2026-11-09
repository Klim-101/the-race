// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// The engine counts days (day 3 of 3), and the world of a case has no calendar: a name of a weekday in a text is a
// date the hero's clock cannot show, and the player is left to guess how many days it means. "Wednesday" is not
// searched for in Russian by the bare word, since "среда" is also a surrounding; only after a preposition of time.

const ENGLISH = /(?<![\p{L}])(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?![\p{L}])/iu;
const RUSSIAN =
  /(?<![\p{L}])(?:понедельник|вторник|четверг|пятниц|суббот|воскресень)[\p{L}]*|(?<![\p{L}])(?:в|во|на|до|по|к|ко|с|со|от|за|перед|после|через)\s+сред(?:а|у|ы|е|ам|ами)(?![\p{L}])/iu;

/** The weekday a text names, as it is written there, or `undefined` for a text that names none. */
export function findWeekday(text: string): string | undefined {
  return ENGLISH.exec(text)?.[0] ?? RUSSIAN.exec(text)?.[0];
}
