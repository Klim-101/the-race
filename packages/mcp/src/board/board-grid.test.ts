// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SCRIPT, renderEvidenceBoard } from './render-board.js';

type View = DetectiveRunView;

const clue = (id: string, number: string, locationId: string, garbled = false) => ({
  id,
  locationId,
  description: `Text of ${id}.`,
  garbled,
  number,
});

const suspect = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  persona: 'Someone',
  mood: 'calm',
  closed: false,
  talksAgain: null,
  place: null,
  statements: [],
  ...extra,
});

function viewOf(overrides: Record<string, unknown> = {}): View {
  return {
    title: 'The Vanishing Wheel',
    premise: 'A wheel of cheese is gone.',
    locale: 'en',
    turn: 9,
    status: 'active',
    clock: { day: 2, minute: 545, totalDays: 3 },
    reputation: 7,
    condition: { nerves: 8, maxNerves: 10, sleepDebt: 1, maxSleepDebt: 10, conditions: [] },
    kit: [],
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
    news: [],
    location: { id: 'market', name: 'Market', description: '', exits: [] },
    map: {
      current: 'market',
      places: [
        { id: 'market', name: 'Market', visited: true, blocked: null, lead: null },
        { id: 'stall', name: 'Stall', visited: true, blocked: null, lead: null },
      ],
      links: [{ from: 'market', to: 'stall' }],
    },
    leads: [],
    openLinks: [],
    chronicle: { activeMinutesLeft: 600, events: [] },
    insights: [],
    clues: [],
    suspects: [],
    history: { finds: [], shown: [], links: [] },
    ...overrides,
  } as unknown as View;
}

/** A view with a clue of every kind: found in two places, shown to two people, garbled, linked and unlinked. */
const PLAYED = viewOf({
  clues: [
    clue('key', 'MIRA-01', 'stall', true),
    clue('flour', 'MIRA-02', 'market'),
    clue('glove', 'MIRA-03', 'market'),
  ],
  suspects: [
    suspect('a', 'Anna', {
      mood: 'cornered',
      closed: true,
      talksAgain: { day: 3, minute: 125 },
      place: { id: 'market', name: 'Market' },
      statements: [
        { day: 1, kind: 'alibi', text: 'I never left the oven.' },
        { day: 2, kind: 'conceded', text: 'I left at nine.' },
      ],
    }),
    suspect('b', 'Boris', { mood: 'broken' }),
    suspect('c', 'Cora'),
  ],
  history: {
    finds: [
      { clueId: 'key', locationId: 'stall', turn: 2 },
      { clueId: 'flour', locationId: 'market', turn: 3 },
      { clueId: 'glove', locationId: 'market', turn: 4 },
    ],
    shown: [
      { suspectId: 'a', clueId: 'flour', effect: 'breaks-lie', turn: 6 },
      { suspectId: 'b', clueId: 'key', effect: 'implicates', turn: 7 },
      { suspectId: 'b', clueId: 'flour', effect: 'confirms', turn: 8 },
    ],
    links: [{ clueIds: ['key', 'flour'], result: 'nothing', turn: 9 }],
  },
});

const tab = (page: string, id: string): string =>
  new RegExp(`<section class="tab(?: notebook)?" id="${id}">([\\s\\S]*?)</section>`).exec(page)?.[1] ?? '';

describe('a suspect card', () => {
  const suspects = tab(renderEvidenceBoard(PLAYED), 'suspects');
  const card = (id: string): string =>
    new RegExp(`<div class="card suspect" data-pick="suspect:${id}"[\\s\\S]*?\\n</div>`).exec(
      suspects,
    )?.[0] ?? '';

  it('has a drawn portrait with the initial, the same one every time, and nothing from the case', () => {
    const again = tab(renderEvidenceBoard(PLAYED), 'suspects');

    expect(again).toBe(suspects);
    expect(card('a')).toMatch(/<svg class="portrait p\d"[^>]*>[\s\S]*<text[^>]*>A<\/text>/);
    expect(card('b')).toMatch(/<text[^>]*>B<\/text>/);
  });

  it('shows the mood as a gauge of four steps and a word', () => {
    expect(card('a')).toContain('class="gauge mood-cornered"');
    expect(card('a').match(/<span class="step on">/g)).toHaveLength(3);
    expect(card('b').match(/<span class="step on">/g)).toHaveLength(4);
    expect(card('c').match(/<span class="step on">/g)).toHaveLength(1);
    expect(card('a')).toContain('Mood: cornered');
  });

  it('says from what day and hour a closed person talks again, and says nothing for one who does', () => {
    expect(card('a')).toContain('will not talk until day 3, 02:05');
    expect(card('b')).not.toContain('will not talk');
  });

  it('strikes through a lie that fell and ties it to the clue that broke it; the alibi stands', () => {
    expect(card('a')).toContain('<s>I left at nine.</s>');
    expect(card('a')).not.toContain('<s>I never');
    expect(card('a')).toMatch(/broken by:<\/span> <span class="chip fx-breaks-lie" data-pick="clue:flour"/);
  });

  it('shows what they were shown as chips by effect, each tied to its clue', () => {
    expect(card('b')).toContain('class="chip fx-implicates" data-pick="clue:key"');
    expect(card('b')).toContain('class="chip fx-confirms" data-pick="clue:flour"');
    expect(card('b')).toContain('confirmed a fallen lie · turn 8');
    expect(card('c')).toContain('Nothing shown yet.');
  });

  it('lights the place and the clues on the other tabs when the person is picked', () => {
    expect(card('a')).toContain('data-rel="suspect:a place:market clue:flour"');
    const page = renderEvidenceBoard(PLAYED);
    expect(tab(page, 'map')).toContain('data-rel="place:market suspect:a clue:flour clue:glove"');
  });

  it('is told in Russian', () => {
    const ru = tab(renderEvidenceBoard({ ...PLAYED, locale: 'ru' }), 'suspects');

    expect(ru).toContain('не заговорит до 3-го дня, 02:05');
    expect(ru).toContain('Настроение');
  });

  it('matches its snapshot', () => {
    expect(suspects).toMatchSnapshot();
  });
});

describe('the clue grid', () => {
  const page = renderEvidenceBoard(PLAYED);
  const clues = tab(page, 'clues');

  it('shows what was done with each clue: where, shown to whom, used in a link, to be read again', () => {
    expect(clues.match(/class="card clue-card"/g)).toHaveLength(3);
    expect(clues).toContain('found at Stall · turn 2');
    expect(clues).toContain('Shown to: Anna (broke a lie), Boris (confirmed a fallen lie)');
    expect(clues).toContain('used in 1 links: MIRA-01 + MIRA-02');
    expect(clues).toContain('not used in any link');
    expect(clues).toContain('read badly');
  });

  it('carries the pick to the corkboard and the map by link, and by the shared selection', () => {
    expect(clues).toContain('<a href="#board">On the corkboard</a> · <a href="#map">On the map</a>');
    expect(clues).toContain('data-rel="clue:flour place:market suspect:a suspect:b"');
  });

  it('opens the card of the picked clue in full, with a rule only for ids a selector can hold', () => {
    expect(page).toContain('main[data-sel="clue:key"] #card-key .text{display:block;overflow:visible}');
    const hostile = renderEvidenceBoard(viewOf({ clues: [clue('x"] body{', 'MIRA-09', 'market')] }));
    expect(hostile).not.toContain('body{ #card');
    expect(/<style>([\s\S]*?)<\/style>/.exec(hostile)?.[1]).not.toContain('card-x');
  });

  it('has no controls when there is no clue, and offers the places and people that matter', () => {
    expect(tab(renderEvidenceBoard(viewOf()), 'clues')).not.toContain('class="filters"');
    expect(clues).toContain('<option value="stall">Stall</option>');
    expect(clues).toContain('<option value="b">Boris</option>');
    // Cora was shown nothing, so she is no reason to filter.
    expect(clues).not.toContain('<option value="c">');
  });

  /** The page's own script, run against the cards the page holds, with the controls set as given. */
  function filtered(controls: {
    place?: string;
    suspect?: string;
    garbled?: boolean;
    unused?: boolean;
    q?: string;
  }) {
    const cards = [...clues.matchAll(/<div class="card clue-card" ([^>]*)>/g)].map((match) => {
      const attrs = new Map(
        [...(match[1] ?? '').matchAll(/(data-[a-z]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
      );
      return {
        hidden: false,
        getAttribute: (name: string) => attrs.get(name) ?? null,
        id: attrs.get('data-number'),
      };
    });
    const values: Record<string, unknown> = {
      'f-place': { value: controls.place ?? '' },
      'f-suspect': { value: controls.suspect ?? '' },
      'f-garbled': { checked: controls.garbled ?? false },
      'f-unused': { checked: controls.unused ?? false },
      'f-number': { value: controls.q ?? '' },
      'clue-none': { hidden: true },
    };
    const listeners = new Map<string, () => void>();
    runInNewContext(SCRIPT, {
      document: {
        querySelector: () => ({ getAttribute: () => null }),
        querySelectorAll: () => cards,
        getElementById: (id: string) => values[id] ?? null,
        addEventListener: (type: string, handler: () => void) => void listeners.set(type, handler),
      },
    });
    listeners.get('input')?.();
    return {
      shown: cards.filter(({ hidden }) => !hidden).map(({ id }) => id),
      none: (values['clue-none'] as { hidden: boolean }).hidden,
    };
  }

  it('shows every clue while no filter is set', () => {
    expect(filtered({})).toEqual({ shown: ['MIRA-01', 'MIRA-02', 'MIRA-03'], none: true });
  });

  it('filters by place', () => {
    expect(filtered({ place: 'market' }).shown).toEqual(['MIRA-02', 'MIRA-03']);
    expect(filtered({ place: 'stall' }).shown).toEqual(['MIRA-01']);
  });

  it('filters by the person a clue was shown to', () => {
    expect(filtered({ suspect: 'a' }).shown).toEqual(['MIRA-02']);
    expect(filtered({ suspect: 'b' }).shown).toEqual(['MIRA-01', 'MIRA-02']);
  });

  it('filters the garbled clues and the clues not yet used in a link', () => {
    expect(filtered({ garbled: true }).shown).toEqual(['MIRA-01']);
    expect(filtered({ unused: true }).shown).toEqual(['MIRA-03']);
  });

  it('searches by the number, without regard to case, and combines the filters', () => {
    expect(filtered({ q: ' mira-02 ' }).shown).toEqual(['MIRA-02']);
    expect(filtered({ place: 'market', unused: true }).shown).toEqual(['MIRA-03']);
    expect(filtered({ place: 'stall', unused: true })).toEqual({ shown: [], none: false });
  });

  it('does nothing on a page without the controls', () => {
    const listeners = new Map<string, () => void>();
    runInNewContext(SCRIPT, {
      document: {
        querySelector: () => ({ getAttribute: () => null }),
        getElementById: () => null,
        addEventListener: (type: string, handler: () => void) => void listeners.set(type, handler),
      },
    });

    expect(() => listeners.get('change')?.()).not.toThrow();
  });

  it('matches its snapshot', () => {
    expect(clues).toMatchSnapshot();
  });
});

describe('a link inside a pickable card', () => {
  it('keeps the card picked instead of toggling it off, and a click on the filters keeps the pick', () => {
    const attrs = new Map<string, string>([['data-sel', 'clue:key']]);
    const main = {
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => void attrs.set(name, value),
      removeAttribute: (name: string) => void attrs.delete(name),
    };
    const listeners = new Map<string, (event: unknown) => void>();
    runInNewContext(SCRIPT, {
      document: {
        querySelector: () => main,
        getElementById: () => null,
        addEventListener: (type: string, handler: (event: unknown) => void) =>
          void listeners.set(type, handler),
      },
    });
    const card = { getAttribute: (name: string) => (name === 'data-pick' ? 'clue:key' : null) };

    listeners.get('click')?.({
      target: {
        closest: (selector: string) => (selector === '[data-pick]' ? card : selector === 'a' ? {} : null),
      },
    });
    expect(attrs.get('data-sel')).toBe('clue:key');

    listeners.get('click')?.({
      target: { closest: (selector: string) => (selector === '.filters' ? {} : null) },
    });
    expect(attrs.get('data-sel')).toBe('clue:key');
  });
});
