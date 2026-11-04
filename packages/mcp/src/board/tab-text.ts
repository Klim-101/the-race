// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale, ObstacleKind, StripKind } from '@the-race/engine';
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
  /** The header over every tab: the turn, the day, the time left, and the hero in words and never in numbers. */
  readonly header: {
    /** One turn ({n}) and the day ({day}, {total}, {time}). */
    readonly turn: string;
    readonly day: string;
    readonly timeLeft: string;
    readonly condition: string;
    readonly reputationBands: Record<'good' | 'middling' | 'poor', string>;
    readonly nervesBands: Record<'steady' | 'strained' | 'frayed', string>;
    readonly sleepBands: Record<'rested' | 'tired' | 'exhausted', string>;
  };
  /** What the last turn changed: the heading, the small mark, and one line for each kind of change. */
  readonly fresh: {
    readonly title: string;
    readonly mark: string;
    readonly clue: string;
    readonly lead: string;
    readonly lie: string;
    readonly mood: string;
    readonly tool: string;
  };
  /** The corkboard and the history the notebooks tell: where a clue was found, to whom it was shown, the links tried. */
  readonly corkboard: {
    readonly title: string;
    readonly hint: string;
    readonly empty: string;
    readonly foundAt: string;
    /** One turn of the run ({n}). */
    readonly step: string;
    readonly shownTo: string;
    /** The heading, on a conclusion, of the clues it was drawn from. */
    readonly drawnFrom: string;
    /** On an opened clue card: the heading of the links it took part in, the line when none, how to close it. */
    readonly linksOf: string;
    readonly noLinks: string;
    readonly closeHint: string;
    /** The one click that opens the full text of the clues in a link tried. */
    readonly fullText: string;
    readonly nobody: string;
    readonly tried: string;
    readonly noneTried: string;
    readonly results: Record<'insight' | 'already-known' | 'nothing', string>;
    readonly effects: Record<'breaks-lie' | 'confirms' | 'implicates' | 'no-effect', string>;
    readonly legend: string;
  };
  /** The leads pinned on the corkboard: what each says, what earned it and whether it can be followed now. */
  readonly leadPins: {
    readonly tag: string;
    readonly opens: string;
    readonly opensNothing: string;
    readonly followNow: string;
    readonly shutNow: string;
    /** What earned a lead: {n} a clue number, {name} a person, {place} a place, {tool} a tool. */
    readonly from: Record<
      'clue' | 'study' | 'studyWith' | 'talk' | 'lie' | 'deduction' | 'locals' | 'unknown',
      string
    >;
    readonly legend: string;
  };
  /** The strip of each day on the chronicle tab: its words, and the name of each kind of turn. */
  readonly strip: {
    readonly title: string;
    /** A day ({n}), and the words for the current day, the night and the working time left. */
    readonly day: string;
    readonly today: string;
    readonly night: string;
    readonly timeLeft: string;
    readonly legend: string;
    readonly held: string;
    readonly intoNight: string;
    readonly nightFollowed: string;
    readonly leadHours: string;
    readonly world: string;
    readonly kinds: Record<StripKind, string>;
  };
  /** The plan of a building: its rooms, the doors between them and the parts noticed in each. */
  readonly plan: {
    /** The heading ({name}) and the street the building opens onto. */
    readonly title: string;
    readonly opensOnto: string;
    readonly closeHint: string;
    readonly notEntered: string;
    readonly noParts: string;
    readonly searched: string;
    readonly gave: string;
    readonly gaveNothing: string;
    /** The tool the kit has for an obstacle ({tool}), and the line when it has none. */
    readonly tool: string;
    readonly noTool: string;
    /** A door between two rooms ({a}, {b}). */
    readonly doorTo: string;
    readonly obstacles: Record<ObstacleKind, string>;
  };
  /** The grid of clue cards: its filters and what a card says about a clue. */
  readonly clueGrid: {
    /** A clue that a witness told: whose words it is ({name}). */
    readonly heardFrom: string;
    readonly filters: string;
    readonly place: string;
    readonly suspect: string;
    readonly any: string;
    readonly garbled: string;
    readonly unused: string;
    readonly number: string;
    /** A hint for the number box ({example}). */
    readonly numberHint: string;
    readonly none: string;
    /** A clue used in links ({n}), and one used in none. */
    readonly usedIn: string;
    readonly notUsed: string;
    readonly toBoard: string;
    readonly toMap: string;
  };
  readonly map: {
    readonly title: string;
    readonly empty: string;
    readonly you: string;
    readonly unvisited: string;
    readonly locked: string;
    /** A place the hero knows of from a lead and has not seen yet. */
    readonly lead: string;
    readonly closed: string;
    readonly cluesHere: string;
    /** The letter at the north of the compass, the rooms of a building ({n}) and the caption of places with no street. */
    readonly north: string;
    readonly rooms: string;
    readonly elsewhere: string;
    readonly legend: string;
  };
  readonly statements: {
    readonly title: string;
    readonly none: string;
    readonly day: string;
    readonly kinds: Record<'alibi' | 'conceded' | 'secret', string>;
    /** How the talks have left a person, and the line for one who will not talk for now. */
    readonly moods: Record<'calm' | 'shaken' | 'cornered' | 'broken', string>;
    /** A closed person: the day ({day}) and the time ({time}) from which they talk again. */
    readonly closedUntil: string;
    /** A person the hero has cleared with a conclusion: they could not have done it. */
    readonly cleared: string;
    /** The heading of what the person claims. */
    readonly claims: string;
    readonly mood: string;
    readonly lieFell: string;
    readonly brokenBy: string;
    readonly shown: string;
    readonly noneShown: string;
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
    /** The heading of the leads, the line when there are none, and the hours of a lead with a window ({from}, {until}). */
    readonly leads: string;
    readonly noLeads: string;
    readonly window: string;
    readonly open: string;
    readonly nothingOpen: string;
    readonly unvisited: string;
    readonly locked: string;
    readonly closed: string;
    readonly unquestioned: string;
    readonly reread: string;
    readonly noTurns: string;
    /** After an accusation of the right person whose proof fell short: what it lacked. */
    readonly shortfall: {
      readonly title: string;
      readonly motiveHeld: string;
      /** The motive that was not put forward or was the wrong conclusion, with the right one drawn or never drawn. */
      readonly motiveNoneDrawn: string;
      readonly motiveNoneUndrawn: string;
      readonly motiveWrongDrawn: string;
      readonly motiveWrongUndrawn: string;
      readonly evidenceHeld: string;
      readonly evidenceNearest: string;
      /** Where a clue of that chain stood: laid out, found and left out, never found. */
      readonly states: Readonly<Record<string, string>>;
    };
    /** One line for each kind of turn; {name}, {n}, {approach} and {text} are filled in. */
    readonly turn: {
      readonly look: string;
      readonly move: string;
      readonly moveFailed: string;
      readonly search: string;
      readonly rest: string;
      readonly sit: string;
      readonly ask: string;
      readonly study: string;
      /** What came of an asking or a studying ({result}): something to go on, or nothing. */
      readonly gotSomething: string;
      readonly gotNothing: string;
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
    /** A tool that is used up or broken, and the uses left of one that is used up ({n}). */
    readonly spent: string;
    readonly broken: string;
    readonly chargesLeft: string;
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
