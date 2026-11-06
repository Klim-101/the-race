// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunResult } from '@the-race/saves';

/** What the page of all the runs says, in the words of one language (see `locales/`). */
export interface StatsText {
  readonly title: string;
  readonly updated: string;
  readonly none: string;
  /** A run whose state could not be read: it is left as it is on disk. */
  readonly unreadable: string;
  readonly openBoard: string;
  readonly columns: {
    readonly date: string;
    readonly title: string;
    readonly hero: string;
    readonly result: string;
    readonly days: string;
    readonly turns: string;
    readonly board: string;
  };
  readonly totals: {
    readonly runs: string;
    readonly wins: string;
    readonly longest: string;
    readonly streak: string;
  };
  readonly results: Readonly<Record<RunResult, string>>;
  /** How a run ended, by the id of the reason; an id without a word is shown as it is. */
  readonly reasons: Readonly<Record<string, string>>;
  /** The part of the page about the cases the generator wrote (see `generation-log.ts` in the saves). */
  readonly generation: {
    readonly title: string;
    readonly none: string;
    readonly accepted: string;
    readonly failed: string;
    readonly share: string;
    readonly attempt: string;
    readonly acceptedOnIt: string;
    readonly mostOften: string;
    readonly code: string;
    readonly rejections: string;
  };
}
