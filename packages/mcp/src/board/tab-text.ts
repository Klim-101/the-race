// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '@the-race/engine';
import { LOCALE_TEXT } from '../locales/index.js';

/** What the tabs of the evidence board say. The case's own text is never here. */
export interface TabText {
  readonly tabs: {
    readonly board: string;
    readonly map: string;
    readonly suspects: string;
    readonly clues: string;
    readonly chronicle: string;
    readonly hero: string;
  };
  readonly nav: string;
  /** The corkboard and the history the notebooks tell: where a clue was found, to whom it was shown, the links tried. */
  readonly corkboard: {
    readonly title: string;
    readonly hint: string;
    readonly empty: string;
    readonly foundAt: string;
    /** One turn of the run ({n}). */
    readonly step: string;
    readonly shownTo: string;
    /** The heading, on a person's notebook page, of the clues they were shown. */
    readonly shownHere: string;
    /** The heading, on a conclusion, of the clues it was drawn from. */
    readonly drawnFrom: string;
    readonly nobody: string;
    readonly tried: string;
    readonly noneTried: string;
    readonly results: Record<'insight' | 'already-known' | 'nothing', string>;
    readonly effects: Record<'breaks-lie' | 'no-effect', string>;
    readonly legend: string;
  };
  readonly map: {
    readonly title: string;
    readonly empty: string;
    readonly you: string;
    readonly unvisited: string;
    readonly locked: string;
    readonly closed: string;
    readonly cluesHere: string;
    readonly legend: string;
  };
  readonly statements: {
    readonly title: string;
    readonly none: string;
    readonly day: string;
    readonly kinds: Record<'alibi' | 'conceded' | 'secret', string>;
  };
  readonly links: {
    readonly title: string;
    readonly none: string;
    /** The links still to be made by the number of clues each takes: the heading, one link ({n}) and the end. */
    readonly open: string;
    readonly size: string;
    /** Links of one size, grouped: {count} links of {size}. */
    readonly group: string;
    readonly allDrawn: string;
  };
  readonly chronicle: {
    readonly now: string;
    /** The weather of today, and the plain name of each weather. */
    readonly weatherToday: string;
    readonly weathers: Readonly<Record<string, string>>;
    readonly day: string;
    readonly left: string;
    readonly hours: string;
    readonly minutes: string;
    /** The heading of what the case grew from, the line when it grew from nothing, and the kinds of trouble. */
    readonly inspired: string;
    readonly inspiredNone: string;
    readonly seedKinds: Readonly<Record<string, string>>;
    readonly events: string;
    readonly noEvents: string;
    readonly open: string;
    readonly nothingOpen: string;
    readonly unvisited: string;
    readonly locked: string;
    readonly closed: string;
    readonly unquestioned: string;
    readonly reread: string;
    readonly turns: string;
    readonly noTurns: string;
    /** One line for each kind of turn; {name}, {n}, {approach} and {text} are filled in. */
    readonly turn: {
      readonly look: string;
      readonly move: string;
      readonly moveFailed: string;
      readonly search: string;
      readonly rest: string;
      readonly interrogate: string;
      readonly insight: string;
      readonly alreadyKnown: string;
      readonly nothing: string;
      readonly reread: string;
      readonly use: string;
      readonly accuse: string;
    };
    readonly approaches: Readonly<Record<string, string>>;
  };
  readonly hero: {
    readonly profile: string;
    readonly background: string;
    readonly lifeState: string;
    readonly lifeStates: Readonly<Record<string, string>>;
    readonly signal: string;
    readonly skills: string;
    readonly condition: string;
    readonly reputation: string;
    readonly nerves: string;
    readonly sleepDebt: string;
    readonly conditions: string;
    readonly none: string;
    readonly untilNight: string;
    readonly minutes: string;
    readonly warnings: string;
    readonly kit: string;
    readonly lost: string;
    readonly supplies: string;
    readonly nothing: string;
    readonly pending: string;
    readonly atNight: string;
    readonly inMinutes: string;
    readonly traits: string;
    readonly noTraits: string;
    readonly hidden: string;
    readonly backgrounds: Readonly<Record<string, string>>;
    readonly signals: Readonly<Record<string, string>>;
    /** The gift and the cost of each signal, in words, and the labels of the two. */
    readonly gift: string;
    readonly cost: string;
    readonly signalNotes: Readonly<Record<string, { readonly gift: string; readonly cost: string }>>;
    readonly skillNames: Readonly<Record<string, string>>;
    readonly conditionNames: Readonly<Record<string, string>>;
    readonly gear: Readonly<Record<string, string>>;
    readonly consumables: Readonly<Record<string, string>>;
    readonly meters: Readonly<Record<string, string>>;
    readonly warningNames: Readonly<Record<string, string>>;
    readonly traitNames: Readonly<Record<string, string>>;
  };
}

/** The word for an id, or the id itself when the table has no word for it, so a new id never breaks the page. */
export const named = (words: Readonly<Record<string, string>>, id: string): string => words[id] ?? id;

export const TAB_TEXT: Record<Locale, TabText> = {
  en: LOCALE_TEXT.en.tabs,
  ru: LOCALE_TEXT.ru.tabs,
};
