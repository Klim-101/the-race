// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

/** What the hall of heroes says, in the words of one language (see `locales/`). */
export interface HallText {
  readonly title: string;
  readonly updated: string;
  readonly none: string;
  readonly openBoard: string;
  readonly totals: {
    readonly runs: string;
    readonly wins: string;
    readonly streak: string;
    readonly longest: string;
  };
  /** The heading of the part of the hall for each kind of game. */
  readonly archetypes: Readonly<Record<string, string>>;
  readonly columns: {
    readonly hero: string;
    readonly case: string;
    readonly country: string;
    readonly result: string;
    readonly days: string;
    readonly time: string;
    readonly clues: string;
    readonly traits: string;
    readonly board: string;
  };
  /** How a run stands in the hall; a record that was a win is `won`, one given up `gave-up`, any other end `lost`. */
  readonly results: Readonly<Record<'won' | 'lost' | 'gave-up', string>>;
  /** The kind of crime of a case, by its id; an id without a word is shown as it is. */
  readonly themes: Readonly<Record<string, string>>;
  /** Play time: `{h}` hours and `{m}` minutes of the game's clock. */
  readonly duration: string;
  readonly minutesOnly: string;
}
