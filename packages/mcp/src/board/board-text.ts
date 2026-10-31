// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '@the-race/engine';

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
}

export const BOARD_TEXT: Record<Locale, BoardText> = {
  en: {
    pageTitle: 'Evidence board',
    day: 'Day',
    of: 'of',
    clues: 'Evidence',
    noClues: 'Nothing on the board yet. The wall is embarrassingly bare.',
    garbled: 'read badly: read it again before it counts',
    insights: 'Conclusions',
    noInsights: 'No conclusions yet. Do try to have one.',
    suspects: 'The cast',
    whereabouts: 'Last seen',
    anywhere: 'anywhere, apparently',
    here: 'right here',
    news: 'Meanwhile, in the Draft',
    premise: 'The case',
    nowAt: 'Now at',
    exits: 'Ways out',
    unvisited: 'not yet visited',
    detective: 'Detective',
    status: { active: 'in progress', won: 'solved', lost: 'lost', 'gave-up': 'given up' },
  },
  ru: {
    pageTitle: 'Доска улик',
    day: 'День',
    of: 'из',
    clues: 'Улики',
    noClues: 'На доске пока пусто. Зрелище, честно говоря, жалкое.',
    garbled: 'прочитано плохо: перечитайте, иначе в счёт не пойдёт',
    insights: 'Выводы',
    noInsights: 'Выводов пока нет. Постарайтесь обзавестись хотя бы одним.',
    suspects: 'Действующие лица',
    whereabouts: 'Замечен',
    anywhere: 'где угодно, судя по всему',
    here: 'прямо здесь',
    news: 'Тем временем в Черновике',
    premise: 'Дело',
    nowAt: 'Сейчас в',
    exits: 'Выходы',
    unvisited: 'ещё не заходили',
    detective: 'Детектив',
    status: { active: 'идёт', won: 'раскрыто', lost: 'провалено', 'gave-up': 'брошено' },
  },
};
