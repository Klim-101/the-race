// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView, StripTurn, TurnView } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { STRIP_SYMBOLS, renderStrips, turnRules } from './board-strip.js';
import { renderEvidenceBoard } from './render-board.js';
import { TAB_TEXT } from './tab-text.js';

type View = DetectiveRunView;

function viewOf(overrides: Record<string, unknown> = {}): View {
  return {
    title: 'The Vanishing Wheel',
    premise: 'A wheel of cheese is gone.',
    locale: 'en',
    turn: 5,
    status: 'active',
    clock: { day: 2, minute: 600, totalDays: 3 },
    reputation: 7,
    condition: { nerves: 8, maxNerves: 10, sleepDebt: 1, maxSleepDebt: 10, conditions: [] },
    kit: [],
    placeParts: [],
    toolSlots: { total: 1, used: 0 },
    supplies: [],
    pending: [],
    warnings: [],
    hero: { name: 'Mira', gender: 'female', archetype: 'detective', skills: {}, background: 'police' },
    weather: null,
    signal: null,
    signalEvents: [],
    hiddenTraitCount: 0,
    revealedTraits: [],
    setting: null,
    inspiration: null,
    remembers: null,
    news: [],
    location: { id: 'market', name: 'Market', description: '', exits: [] },
    map: {
      current: 'market',
      places: [
        {
          id: 'market',
          name: 'Market',
          visited: true,
          blocked: null,
          hours: null,
          lead: null,
          exposure: 'outdoor',
          building: null,
        },
        {
          id: 'stall',
          name: 'Stall',
          visited: true,
          blocked: null,
          hours: null,
          lead: null,
          exposure: 'outdoor',
          building: null,
        },
      ],
      links: [{ from: 'market', to: 'stall' }],
    },
    openLinks: [],
    chronicle: {
      activeMinutesLeft: 900,
      minutesToDeadline: null,
      deadline: null,
      events: [
        { day: 1, text: 'The market opens.' },
        { day: 2, text: 'A storm closes the road.' },
      ],
    },
    clues: [
      {
        id: 'key',
        locationId: 'stall',
        description: 'A key.',
        garbled: false,
        witness: null,
        bearsOn: [],
        number: 'MIRA-01',
      },
    ],
    insights: [],
    suspects: [
      {
        id: 'a',
        name: 'Anna',
        persona: 'Baker',
        mood: 'calm',
        closed: false,
        talksAgain: null,
        claims: [],
        place: null,
        statements: [],
      },
    ],
    history: { finds: [], shown: [], links: [] },
    leads: [
      {
        id: 'cat',
        reason: 'A cat points the way.',
        source: null,
        window: { fromMinute: 600, untilMinute: 900 },
        openNow: true,
        opens: [],
      },
      {
        id: 'owl',
        reason: 'The archive is watched by day.',
        source: null,
        window: { fromMinute: 1320, untilMinute: 330 },
        openNow: false,
        opens: [],
      },
      { id: 'dog', reason: 'A dog barks.', source: null, window: null, openNow: true, opens: [] },
    ],
    ...overrides,
  } as unknown as View;
}

const bar = (
  turn: number,
  kind: StripTurn['kind'],
  day: number,
  startMinute: number,
  endMinute: number,
  extra: Partial<StripTurn> = {},
): StripTurn => ({
  turn,
  kind,
  day,
  startMinute,
  endMinute,
  crossedMidnight: false,
  endedInNight: false,
  detainedMinutes: null,
  touched: { clueIds: [], placeId: null, suspectId: null },
  ...extra,
});

const STRIP: StripTurn[] = [
  bar(1, 'look', 1, 480, 500, { touched: { clueIds: ['key'], placeId: 'stall', suspectId: null } }),
  bar(2, 'search', 1, 500, 680, { detainedMinutes: 120 }),
  bar(3, 'talk', 1, 1400, 1440, {
    crossedMidnight: true,
    endedInNight: true,
    touched: { clueIds: ['key'], placeId: 'market', suspectId: 'a' },
  }),
  bar(4, 'move', 2, 480, 490),
  bar(5, 'rest', 2, 490, 1440, { endedInNight: true }),
];

const TURNS: TurnView[] = [
  { turn: 5, day: 3, minute: 480, kind: 'rest' },
  { turn: 4, day: 2, minute: 490, kind: 'move', to: 'Stall', entered: true },
  { turn: 3, day: 2, minute: 480, kind: 'interrogate', suspect: 'Anna', approach: 'social', showed: 1 },
  { turn: 2, day: 1, minute: 680, kind: 'search', found: 1 },
  { turn: 1, day: 1, minute: 500, kind: 'look', found: 1 },
];

const text = TAB_TEXT.en;
const strips = renderStrips(viewOf(), STRIP, TURNS, text);
const day = (n: number): string =>
  new RegExp(`<details class="day-strip"[^>]*>\\n<summary>Day ${String(n)}[\\s\\S]*?</details>`).exec(
    strips,
  )?.[0] ?? '';

describe('the strips of the days', () => {
  it('give each day lived a strip, the current one open and the earlier ones folded', () => {
    expect(strips.match(/<details class="day-strip"/g)).toHaveLength(2);
    expect(day(1)).toMatch(/^<details class="day-strip">/);
    expect(day(2)).toMatch(/^<details class="day-strip" open>/);
    expect(day(2)).toContain('Day 2</summary>'.replace('</summary>', ' · today</summary>'));
  });

  it('lay each turn on the hours it took, with its symbol where it ended', () => {
    const look = /<g class="turn k-look"[\s\S]*?<\/g>/.exec(day(1))?.[0] ?? '';

    expect(look).toContain('data-pick="turn:1" data-rel="turn:1"');
    expect(look).toContain(STRIP_SYMBOLS.look);
    // 480 minutes of 1440 across 912 units, plus the margin; the bar ends 20 minutes later.
    expect(look).toMatch(/<rect class="bar" x="340" [^>]*width="13"/);
    expect(day(1).match(/<g class="turn /g)).toHaveLength(3);
    expect(day(2).match(/<g class="turn /g)).toHaveLength(2);
  });

  it('draw a detention as a wide stretch at the end of its turn', () => {
    const search = /<g class="turn k-search held"[\s\S]*?<\/g>/.exec(day(1))?.[0] ?? '';

    expect(search).toContain('class="detention"');
    expect(search).toContain('held by the police');
  });

  it('cut a turn that ran past midnight at the edge of the day and say that the night followed', () => {
    const talk = /<g class="turn k-talk[^"]*"[\s\S]*?<\/g>/.exec(day(1))?.[0] ?? '';

    expect(talk).toContain('class="turn k-talk crossed night-after"');
    expect(talk).toContain('ran into the night; the night followed');
    expect(day(2)).toContain('class="turn k-rest night-after"');
    expect(day(2)).not.toContain('crossed');
  });

  it('shade the night and show the working time left on the current day only', () => {
    expect(day(1)).toContain('class="night-shade"');
    expect(day(2)).toContain('class="night-shade"');
    expect(day(2)).toContain('class="time-left"');
    expect(day(2)).toContain('class="now"');
    expect(day(1)).not.toContain('time-left');
  });

  it('show the hours of a lead with a window, across midnight too, and none for a lead without one', () => {
    expect(day(1).match(/class="lead-hours"/g)).toHaveLength(3);
    expect(day(1)).toContain('data-pick="lead:cat"');
    expect(day(1)).toContain('data-pick="lead:owl"');
    expect(day(1)).not.toContain('lead:dog');
    expect(day(1)).toContain('class="lead-band shut"');
    expect(day(1)).toContain('only from 22:00 to 05:30');
  });

  it('flag what the world did on each day', () => {
    expect(day(1)).toContain('In the world: The market opens.');
    expect(day(1)).not.toContain('A storm');
    expect(day(2)).toContain('In the world: A storm closes the road.');
  });

  it('list the turns of a day oldest first on the day their bar is drawn, each tied to its bar', () => {
    const list = /<ol class="day-turns">[\s\S]*?<\/ol>/.exec(day(1))?.[0] ?? '';

    expect(list.indexOf('Looked around')).toBeLessThan(list.indexOf('Searched the place'));
    expect(list).toContain('data-pick="turn:2" data-rel="turn:2"');
    // The night's rest ended on day 3 but is drawn, and listed, on day 2.
    expect(day(2)).toContain('Rested for the night');
    expect(day(1)).toContain('Questioned Anna');
  });

  it('put a turn the strip does not know on the day it ended, and draw no bar for it', () => {
    const odd = renderStrips(viewOf({ clock: { day: 3, minute: 480, totalDays: 3 } }), [], TURNS, text);

    expect(odd).toContain('Rested for the night');
    expect(odd).not.toContain('<g class="turn');
    expect(renderStrips(viewOf(), STRIP, [], text)).toContain('aria-label="look around: "');
  });

  it('are told in Russian', () => {
    const ru = renderStrips(viewOf({ locale: 'ru' }), STRIP, TURNS, TAB_TEXT.ru);

    expect(ru).toContain('День 2');
    expect(ru).toContain('сегодня');
    expect(ru).toContain('осмотр');
  });

  it('match their snapshot', () => {
    expect(strips).toMatchSnapshot();
  });
});

describe('picking a turn', () => {
  it('lights the clues, the place and the person it touched, and itself', () => {
    const rules = turnRules(STRIP);

    expect(rules).toContain('main[data-sel="turn:3"][data-sel] [data-rel~="turn:3"][data-rel]');
    expect(rules).toContain('main[data-sel="turn:3"][data-sel] [data-pick="clue:key"][data-rel]');
    expect(rules).toContain('main[data-sel="turn:3"][data-sel] [data-pick="place:market"][data-rel]');
    expect(rules).toContain('main[data-sel="turn:3"][data-sel] [data-pick="suspect:a"][data-rel]');
    expect(rules).not.toContain('[data-sel="turn:4"][data-sel] [data-pick=');
  });

  it('writes no rule for an id that could break out of a selector', () => {
    const rules = turnRules([
      bar(1, 'look', 1, 480, 500, {
        touched: { clueIds: ['x"] body{', 'ok'], placeId: 'a b', suspectId: null },
      }),
    ]);

    expect(rules).toContain('[data-pick="clue:ok"]');
    expect(rules).not.toContain('body{');
    expect(rules).not.toContain('place:a b');
  });

  it('is part of the page, beside the rest of the lighting', () => {
    const page = renderEvidenceBoard(viewOf(), TURNS, undefined, STRIP);

    expect(page).toContain('main[data-sel="turn:1"][data-sel] [data-pick="place:stall"][data-rel]');
    expect(/id="chronicle">([\s\S]*?)<\/section>/.exec(page)?.[1]).toContain('class="day-strip"');
  });
});
