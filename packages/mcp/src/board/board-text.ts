// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { ClimateZone, Hazard, Locale, Season, Weather } from '@the-race/engine';
import { LOCALE_TEXT } from '../locales/index.js';

/** Everything the evidence board says that is not the case's own text. */
export interface BoardText {
  readonly pageTitle: string;
  readonly day: string;
  readonly of: string;
  readonly clues: string;
  readonly noClues: string;
  readonly garbled: string;
  readonly insights: string;
  readonly noInsights: string;
  readonly suspects: string;
  readonly whereabouts: string;
  readonly anywhere: string;
  readonly here: string;
  readonly news: string;
  readonly premise: string;
  readonly nowAt: string;
  readonly exits: string;
  readonly unvisited: string;
  readonly detective: string;
  readonly status: Record<'active' | 'won' | 'lost' | 'gave-up', string>;
  /** The climate summary of the country the case is set in. */
  readonly climate: {
    readonly title: string;
    readonly setIn: string;
    readonly zone: string;
    readonly seasons: string;
    readonly hazards: string;
    readonly noHazards: string;
    readonly zones: Record<ClimateZone, string>;
    readonly seasonNames: Record<Season, string>;
    readonly weathers: Record<Weather, string>;
    readonly hazardNames: Record<Hazard, string>;
  };
}

export const BOARD_TEXT: Record<Locale, BoardText> = {
  en: LOCALE_TEXT.en.board,
  ru: LOCALE_TEXT.ru.board,
};
