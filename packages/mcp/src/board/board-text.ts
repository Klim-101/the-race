// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { ClimateZone, Hazard, Locale, Season, Weather } from '@the-race/engine';

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
    climate: {
      title: 'Climate',
      setIn: 'The case is set in',
      zone: 'Zone',
      seasons: 'Seasons',
      hazards: 'Weather to plan around',
      noHazards: 'nothing to speak of',
      zones: {
        polar: 'polar',
        subarctic: 'subarctic',
        oceanic: 'oceanic, mild and damp',
        continental: 'continental, cold winters and warm summers',
        mediterranean: 'mediterranean, wet winters and dry summers',
        subtropical: 'subtropical',
        'tropical-wet': 'tropical, wet',
        'tropical-dry': 'tropical, with a dry season',
        arid: 'arid',
        highland: 'highland',
      },
      seasonNames: {
        winter: 'winter',
        spring: 'spring',
        summer: 'summer',
        autumn: 'autumn',
        'dry-season': 'dry season',
        'wet-season': 'wet season',
      },
      weathers: {
        frost: 'hard frost',
        snow: 'snow',
        'cold-rain': 'cold rain',
        mild: 'mild',
        warm: 'warm',
        hot: 'hot',
        humid: 'humid',
        storms: 'storms',
        'dry-heat': 'dry heat',
        windy: 'windy',
        fog: 'fog',
      },
      hazardNames: {
        blizzard: 'blizzards',
        ice: 'ice on the roads',
        'heavy-rain': 'heavy rain',
        heatwave: 'heatwaves',
        drought: 'drought',
        gale: 'gales',
        fog: 'thick fog',
        'dust-wind': 'dust winds',
      },
    },
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
    climate: {
      title: 'Климат',
      setIn: 'Действие происходит в стране',
      zone: 'Пояс',
      seasons: 'Времена года',
      hazards: 'Погода, с которой придётся считаться',
      noHazards: 'ничего особенного',
      zones: {
        polar: 'полярный',
        subarctic: 'субарктический',
        oceanic: 'океанический, мягкий и сырой',
        continental: 'континентальный, холодные зимы и тёплое лето',
        mediterranean: 'средиземноморский, влажные зимы и сухое лето',
        subtropical: 'субтропический',
        'tropical-wet': 'тропический влажный',
        'tropical-dry': 'тропический, с сухим сезоном',
        arid: 'засушливый',
        highland: 'горный',
      },
      seasonNames: {
        winter: 'зима',
        spring: 'весна',
        summer: 'лето',
        autumn: 'осень',
        'dry-season': 'сухой сезон',
        'wet-season': 'сезон дождей',
      },
      weathers: {
        frost: 'сильный мороз',
        snow: 'снег',
        'cold-rain': 'холодные дожди',
        mild: 'мягкая погода',
        warm: 'тепло',
        hot: 'жара',
        humid: 'влажно',
        storms: 'грозы и бури',
        'dry-heat': 'сухая жара',
        windy: 'ветрено',
        fog: 'туманы',
      },
      hazardNames: {
        blizzard: 'метели',
        ice: 'гололёд',
        'heavy-rain': 'ливни',
        heatwave: 'волны жары',
        drought: 'засуха',
        gale: 'штормовой ветер',
        fog: 'густой туман',
        'dust-wind': 'пыльные ветры',
      },
    },
  },
};
