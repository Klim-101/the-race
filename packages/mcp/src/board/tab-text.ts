// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '@the-race/engine';

/** What the tabs of the evidence board say. The case's own text is never here. */
export interface TabText {
  readonly tabs: {
    readonly map: string;
    readonly suspects: string;
    readonly clues: string;
    readonly chronicle: string;
    readonly hero: string;
  };
  readonly nav: string;
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
    readonly conclusions: string;
    readonly evidence: string;
    readonly places: string;
    readonly none: string;
  };
  readonly chronicle: {
    readonly now: string;
    readonly day: string;
    readonly left: string;
    readonly hours: string;
    readonly minutes: string;
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
  en: {
    tabs: {
      map: 'Map',
      suspects: 'Suspects',
      clues: 'Clues and links',
      chronicle: 'Chronicle',
      hero: 'Hero and kit',
    },
    nav: 'Sections of the board',
    map: {
      title: 'Known places',
      empty: 'Nowhere known yet.',
      you: 'you are here',
      unvisited: 'not yet visited',
      locked: 'locked',
      closed: 'closed',
      cluesHere: 'clues found here',
      legend: 'Only what the detective has seen is on the map.',
    },
    statements: {
      title: 'What they said',
      none: 'Nothing said yet.',
      day: 'day',
      kinds: { alibi: 'alibi', conceded: 'gave ground', secret: 'let a secret out' },
    },
    links: {
      title: 'How it hangs together',
      conclusions: 'Conclusions',
      evidence: 'Evidence',
      places: 'Where it was found',
      none: 'Nothing to connect yet.',
    },
    chronicle: {
      now: 'Now',
      day: 'Day',
      left: 'Working time left',
      hours: 'h',
      minutes: 'min',
      events: 'What has happened in the world',
      noEvents: 'Nothing yet. The world is holding its breath.',
      open: 'Still open',
      nothingOpen: 'Every door tried, everyone asked. Suspicious.',
      unvisited: 'Not yet visited',
      locked: 'Locked',
      closed: 'Closed for now',
      unquestioned: 'Not yet questioned',
      reread: 'To be read again',
      turns: 'Latest turns',
      noTurns: 'No turns yet.',
      turn: {
        look: 'Looked around: found {n}',
        move: 'Went to {name}',
        moveFailed: 'Tried to get into {name} and could not',
        search: 'Searched the place: found {n}',
        rest: 'Rested for the night',
        interrogate: 'Questioned {name}, {approach}, showing {n} clues',
        insight: 'Concluded: {text}',
        alreadyKnown: 'Reached a conclusion that was already drawn',
        nothing: 'Linked clues that led nowhere',
        reread: 'Read again: {text}',
        use: 'Took {name}',
        accuse: 'Made the accusation',
      },
      approaches: { social: 'in a friendly way', pressure: 'with pressure' },
    },
    hero: {
      profile: 'The detective',
      background: 'Was once',
      signal: 'Character',
      skills: 'Skills',
      condition: 'Condition',
      reputation: 'Reputation',
      nerves: 'Nerves',
      sleepDebt: 'Sleep debt',
      conditions: 'Now',
      none: 'nothing in particular',
      untilNight: 'until the night',
      minutes: 'min left',
      warnings: 'Mind this',
      kit: 'Kit',
      lost: 'lost',
      supplies: 'Supplies',
      nothing: 'nothing',
      pending: 'On its way',
      atNight: 'at night',
      inMinutes: 'in {n} min',
      traits: 'Known traits',
      noTraits: 'None revealed yet.',
      hidden: 'Still hidden',
      backgrounds: {
        police: 'a police officer',
        journalist: 'a journalist',
        locksmith: 'a locksmith',
        analyst: 'an analyst',
      },
      signals: { 'in-love': 'in love', 'burnt-out': 'burnt out', 'feeling-low': 'feeling low' },
      skillNames: {
        perception: 'perception',
        reasoning: 'reasoning',
        social: 'social',
        pressure: 'pressure',
        tech: 'tech',
        contacts: 'contacts',
      },
      conditionNames: {
        drunk: 'drunk',
        injured: 'hurt',
        exhausted: 'exhausted',
        shaken: 'shaken',
        sedated: 'sedated',
        'ill-equipped': 'ill-equipped',
        emboldened: 'emboldened',
      },
      gear: { phone: 'phone', notebook: 'notebook', laptop: 'laptop', picks: 'lock picks' },
      consumables: { coffee: 'coffee', alcohol: 'a drink', sedative: 'a sedative' },
      meters: { nerves: 'nerves', sleepDebt: 'sleep debt' },
      warningNames: { 'low-reputation': 'reputation is low: people will not open up' },
      traitNames: {
        'former-accountant': 'a former accountant',
        'photographic-memory': 'photographic memory',
        'ex-hacker': 'an ex-hacker',
        'well-connected': 'well connected',
        'night-owl': 'a night owl',
        'people-reader': 'reads people',
        debtor: 'in debt',
        claustrophobe: 'claustrophobic',
        'old-enemy-in-the-police': 'an old enemy in the police',
        technophobe: 'distrusts machines',
        'stage-fright': 'stage fright',
        'sloppy-with-paperwork': 'sloppy with paperwork',
        hothead: 'a hothead',
        insomniac: 'an insomniac',
        showman: 'a showman',
      },
    },
  },
  ru: {
    tabs: {
      map: 'Карта',
      suspects: 'Подозреваемые',
      clues: 'Улики и связи',
      chronicle: 'Хроника',
      hero: 'Герой и снаряжение',
    },
    nav: 'Разделы доски',
    map: {
      title: 'Известные места',
      empty: 'Пока ничего не известно.',
      you: 'вы здесь',
      unvisited: 'ещё не заходили',
      locked: 'заперто',
      closed: 'закрыто',
      cluesHere: 'найдено улик',
      legend: 'На карте только то, что детектив уже видел.',
    },
    statements: {
      title: 'Что они сказали',
      none: 'Пока ничего не сказано.',
      day: 'день',
      kinds: { alibi: 'алиби', conceded: 'уступил', secret: 'выдал секрет' },
    },
    links: {
      title: 'Как всё связано',
      conclusions: 'Выводы',
      evidence: 'Улики',
      places: 'Где найдено',
      none: 'Связывать пока нечего.',
    },
    chronicle: {
      now: 'Сейчас',
      day: 'День',
      left: 'Осталось рабочего времени',
      hours: 'ч',
      minutes: 'мин',
      events: 'Что случилось в мире',
      noEvents: 'Пока ничего. Мир затаил дыхание.',
      open: 'Ещё открыто',
      nothingOpen: 'Все двери опробованы, все опрошены. Подозрительно.',
      unvisited: 'Ещё не заходили',
      locked: 'Заперто',
      closed: 'Пока закрыто',
      unquestioned: 'Ещё не опрошены',
      reread: 'Перечитать',
      turns: 'Последние ходы',
      noTurns: 'Ходов пока не было.',
      turn: {
        look: 'Осмотрелись: найдено {n}',
        move: 'Пошли в {name}',
        moveFailed: 'Пытались попасть в {name}, но не вышло',
        search: 'Обыскали место: найдено {n}',
        rest: 'Заснули до утра',
        interrogate: 'Опросили: {name}, {approach}, показано улик: {n}',
        insight: 'Сделали вывод: {text}',
        alreadyKnown: 'Пришли к выводу, который уже был',
        nothing: 'Связали улики, но никуда не пришли',
        reread: 'Перечитали: {text}',
        use: 'Приняли: {name}',
        accuse: 'Выдвинули обвинение',
      },
      approaches: { social: 'по-доброму', pressure: 'нажимом' },
    },
    hero: {
      profile: 'Детектив',
      background: 'Раньше',
      signal: 'Характер',
      skills: 'Навыки',
      condition: 'Состояние',
      reputation: 'Репутация',
      nerves: 'Нервы',
      sleepDebt: 'Недосып',
      conditions: 'Сейчас',
      none: 'ничего особенного',
      untilNight: 'до ночи',
      minutes: 'мин осталось',
      warnings: 'Обратите внимание',
      kit: 'Снаряжение',
      lost: 'потеряно',
      supplies: 'Запасы',
      nothing: 'ничего',
      pending: 'Скоро подействует',
      atNight: 'ночью',
      inMinutes: 'через {n} мин',
      traits: 'Известные черты',
      noTraits: 'Пока ни одна не раскрылась.',
      hidden: 'Ещё скрыто',
      backgrounds: {
        police: 'полицейский',
        journalist: 'журналист',
        locksmith: 'слесарь-взломщик',
        analyst: 'аналитик',
      },
      signals: { 'in-love': 'влюблён', 'burnt-out': 'выгорел', 'feeling-low': 'на нуле' },
      skillNames: {
        perception: 'внимательность',
        reasoning: 'логика',
        social: 'общение',
        pressure: 'давление',
        tech: 'техника',
        contacts: 'связи',
      },
      conditionNames: {
        drunk: 'пьян',
        injured: 'ранен',
        exhausted: 'вымотан',
        shaken: 'потрясён',
        sedated: 'под успокоительным',
        'ill-equipped': 'без нужных вещей',
        emboldened: 'воодушевлён',
      },
      gear: { phone: 'телефон', notebook: 'блокнот', laptop: 'ноутбук', picks: 'отмычки' },
      consumables: { coffee: 'кофе', alcohol: 'выпивка', sedative: 'успокоительное' },
      meters: { nerves: 'нервы', sleepDebt: 'недосып' },
      warningNames: { 'low-reputation': 'репутация низкая: люди не станут откровенничать' },
      traitNames: {
        'former-accountant': 'бывший бухгалтер',
        'photographic-memory': 'фотографическая память',
        'ex-hacker': 'бывший хакер',
        'well-connected': 'с хорошими связями',
        'night-owl': 'сова',
        'people-reader': 'читает людей',
        debtor: 'в долгах',
        claustrophobe: 'боится замкнутых пространств',
        'old-enemy-in-the-police': 'старый враг в полиции',
        technophobe: 'не доверяет технике',
        'stage-fright': 'боится публики',
        'sloppy-with-paperwork': 'небрежен с бумагами',
        hothead: 'вспыльчив',
        insomniac: 'страдает бессонницей',
        showman: 'любит быть в центре внимания',
      },
    },
  },
};
