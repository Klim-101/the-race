// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { conditionWords } from './board-header.js';
import { freshSince } from './board-new.js';
import { leadTokens, pickableTokens, placeTokens } from './board-relations.js';
import { TAB_TEXT } from './tab-text.js';
import { SCRIPT, renderEvidenceBoard } from './render-board.js';

type View = DetectiveRunView;

const clue = (id: string, number: string, locationId = 'market') => ({
  id,
  locationId,
  description: `Text of ${id}.`,
  garbled: false,
  number,
});

const kitItem = (id: string, state: string, charges: number | null) => ({
  id,
  nameKey: id,
  state,
  removes: [],
  charges,
  lawful: true,
  suitcase: true,
  study: false,
});

function viewOf(overrides: Record<string, unknown> = {}): View {
  return {
    title: 'The Vanishing Wheel',
    premise: 'A wheel of cheese is gone.',
    locale: 'en',
    turn: 4,
    status: 'active',
    clock: { day: 2, minute: 545, totalDays: 3 },
    reputation: 8,
    condition: { nerves: 9, maxNerves: 10, sleepDebt: 1, maxSleepDebt: 10, conditions: [] },
    kit: [],
    supplies: [],
    pending: [],
    warnings: [],
    hero: { name: 'Mira', gender: 'female', archetype: 'detective', skills: {}, background: 'police' },
    weather: null,
    history: { finds: [], shown: [], links: [] },
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
        {
          id: 'market',
          name: 'Market',
          visited: true,
          blocked: null,
          lead: null,
          exposure: 'outdoor',
          building: null,
        },
        {
          id: 'archive',
          name: 'Archive',
          visited: false,
          blocked: null,
          lead: 'A cat points the way.',
          exposure: 'outdoor',
          building: null,
        },
      ],
      links: [{ from: 'market', to: 'archive' }],
    },
    suspects: [
      { id: 'a', name: 'Anna', persona: 'Baker', mood: 'calm', closed: false, place: null, statements: [] },
    ],
    clues: [],
    openLinks: [],
    insights: [],
    leads: [],
    chronicle: { activeMinutesLeft: 600, events: [] },
    ...overrides,
  } as unknown as View;
}

const LEAD = {
  id: 'cat',
  reason: 'A cat points the way.',
  source: null,
  window: null,
  openNow: true,
  opens: [{ kind: 'place', id: 'archive', name: 'Archive' }],
};

/** The turn after: a clue, a lead, a broken lie, a calm suspect gone shaken and a tool that lost a use. */
const BEFORE = viewOf({ turn: 3, kit: [kitItem('lockpicks', 'owned', 3)] });
const AFTER = viewOf({
  clues: [clue('key', 'MIRA-01')],
  leads: [LEAD],
  history: {
    finds: [{ clueId: 'key', locationId: 'market', turn: 4 }],
    shown: [{ suspectId: 'a', clueId: 'key', effect: 'breaks-lie', turn: 4 }],
    links: [],
  },
  suspects: [
    { id: 'a', name: 'Anna', persona: 'Baker', mood: 'shaken', closed: false, place: null, statements: [] },
  ],
  kit: [kitItem('lockpicks', 'owned', 2)],
});

const sizes = (view: View, previous: View | undefined): number[] => {
  const fresh = freshSince(view, previous);
  return [fresh.clueIds, fresh.leadIds, fresh.lieSuspectIds, fresh.moods, fresh.tools].map((s) => s.size);
};

describe('what the last turn changed', () => {
  it('is nothing without the view before it', () => {
    expect(sizes(AFTER, undefined)).toEqual([0, 0, 0, 0, 0]);
  });

  it('is only what the turn did: a clue, a lead, a lie, a mood and a tool', () => {
    const fresh = freshSince(AFTER, BEFORE);

    expect([...fresh.clueIds]).toEqual(['key']);
    expect([...fresh.leadIds]).toEqual(['cat']);
    expect([...fresh.lieSuspectIds]).toEqual(['a']);
    expect([...fresh.moods]).toEqual([['a', 'shaken']]);
    expect([...fresh.tools.keys()]).toEqual(['lockpicks']);
  });

  it('forgets everything on the next turn, so a mark is never about what was seen before', () => {
    expect(sizes(viewOf({ ...AFTER, turn: 5 }), AFTER)).toEqual([0, 0, 0, 0, 0]);
  });

  it('counts a tool that broke, and ignores one that is untouched or only new', () => {
    const was = viewOf({ kit: [kitItem('lockpicks', 'owned', null), kitItem('torch', 'owned', 1)] });
    const now = viewOf({
      kit: [
        kitItem('lockpicks', 'broken', null),
        kitItem('torch', 'owned', 1),
        kitItem('rope', 'owned', null),
      ],
    });

    expect([...freshSince(now, was).tools.keys()]).toEqual(['lockpicks']);
  });
});

describe('the header', () => {
  const page = renderEvidenceBoard(AFTER, [], BEFORE);
  const header = /<header class="head">([\s\S]*?)<\/header>/.exec(page)?.[1] ?? '';

  it('is above every tab, once, so it shows the same facts on each', () => {
    expect(page.match(/<header class="head">/g)).toHaveLength(1);
    expect(page.indexOf('<header class="head">')).toBeLessThan(page.indexOf('<nav class="tabs"'));
    expect(header).toContain('The Vanishing Wheel');
    expect(header).toContain('Turn 4');
    expect(header).toContain('Day 2 of 3, 09:05');
    expect(header).toContain('Working time left: <strong>10 h 0 min</strong>');
  });

  it('gives the hero as words and never as a number or the name of a meter', () => {
    expect(header).toContain('steady nerves, rested, good name');
    expect(header).not.toMatch(/sleep debt|reputation/i);
    const plain = header.replace(/<[^>]*>/g, ' ').split('New in the last turn')[0] ?? '';
    expect(plain.replace(/Turn 4|Day 2 of 3, 09:05|10 h 0 min/g, '')).not.toMatch(/\d/);
  });

  it('puts the hero in words by thirds', () => {
    const text = TAB_TEXT.en;
    const worn = viewOf({
      reputation: 1,
      condition: {
        nerves: 2,
        maxNerves: 10,
        sleepDebt: 9,
        maxSleepDebt: 10,
        conditions: [{ id: 'hungover', minutesLeft: null }],
      },
    });
    const middling = viewOf({
      reputation: 5,
      condition: { nerves: 5, maxNerves: 10, sleepDebt: 5, maxSleepDebt: 10, conditions: [] },
    });
    const empty = viewOf({
      condition: { nerves: 0, maxNerves: 0, sleepDebt: 0, maxSleepDebt: 0, conditions: [] },
    });

    expect(conditionWords(worn, text)).toEqual([
      'nerves frayed',
      'exhausted',
      expect.any(String) as unknown,
      'name in tatters',
    ]);
    expect(conditionWords(middling, text)).toEqual(['nerves on edge', 'tired', 'name in doubt']);
    expect(conditionWords(empty, text)[0]).toBe('nerves frayed');
  });

  it('lists what is new in the turn, and marks it on the cards', () => {
    expect(header).toContain('New in the last turn');
    for (const line of [
      'Clue found: MIRA-01',
      'Lead earned: A cat points the way.',
      'A lie fell: Anna',
      'Anna is now shaken',
    ]) {
      expect(header).toContain(line);
    }
    expect(header).toContain('(left: 2)');
    // The clue, the suspect, the lead and the tool each carry one mark.
    expect(page.match(/<span class="new">new<\/span>/g)).toHaveLength(4);
  });

  it('says that a tool broke, was used up or was lost, in the words of the hero tab', () => {
    const was = viewOf({ kit: [kitItem('lockpicks', 'owned', null)] });
    const now = (state: string) => viewOf({ kit: [kitItem('lockpicks', state, null)] });

    const lines = ['broken', 'spent', 'lost'].map(
      (state) => /<li>(lockpicks[^<]*)<\/li>/.exec(renderEvidenceBoard(now(state), [], was))?.[1],
    );

    expect(lines).toEqual(['lockpicks (broken)', 'lockpicks (used up)', 'lockpicks (lost)']);
  });

  it('is told in Russian, and marks nothing without a previous turn', () => {
    const ru = renderEvidenceBoard({ ...AFTER, locale: 'ru' }, [], BEFORE);
    const quiet = renderEvidenceBoard(AFTER);

    expect(ru).toContain('Ход 4');
    expect(ru).toContain('Новое за последний ход');
    expect(quiet).not.toContain('class="fresh"');
    expect(quiet).not.toContain('<span class="new">');
  });

  it('matches its snapshot', () => {
    expect(header).toMatchSnapshot();
  });
});

describe('picking across the tabs', () => {
  it('ties a lead to the place it opens, and the place to the lead', () => {
    expect(leadTokens(AFTER, 'cat')).toEqual(['lead:cat', 'place:archive']);
    expect(leadTokens(AFTER, 'unknown')).toEqual(['lead:unknown']);
    expect(placeTokens(AFTER, 'archive')).toEqual(['place:archive', 'lead:cat']);
    expect(pickableTokens(AFTER)).toContain('lead:cat');
  });

  it('lights things on the map and the chronicle from one token', () => {
    const page = renderEvidenceBoard(AFTER, [], BEFORE);

    expect(page).toContain('main[data-sel="lead:cat"][data-sel] [data-rel~="lead:cat"][data-rel]');
    const map = /id="map">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';
    expect(map).toContain('data-pick="place:archive" data-rel="place:archive lead:cat"');
    const chronicle = /id="chronicle">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';
    expect(chronicle).toContain('data-pick="lead:cat" data-rel="lead:cat place:archive"');
    expect(chronicle).toContain('data-pick="place:archive" data-rel="place:archive lead:cat"');
    expect(chronicle).toContain('data-pick="suspect:a"');
  });

  it('lights the conclusion drawn from a clue when the clue is picked', () => {
    const page = renderEvidenceBoard(
      viewOf({
        clues: [clue('key', 'MIRA-01'), clue('flour', 'MIRA-02')],
        insights: [{ id: 'liar', insight: 'The baker lied.', clueIds: ['key', 'flour'] }],
      }),
    );

    expect(page).toContain('<div class="card" data-rel="clue:key clue:flour"><p>The baker lied.</p>');
  });

  it('writes no rule for an id that could break out of a selector', () => {
    const hostile = viewOf({ leads: [{ ...LEAD, id: 'x"] , body{display:none} [y="' }] });

    const style = /<style>([\s\S]*?)<\/style>/.exec(renderEvidenceBoard(hostile))?.[1] ?? '';

    expect(style).not.toContain('body{display:none}');
    expect(pickableTokens(hostile).join(' ')).not.toContain('body{');
  });

  it('carries the pick to the next tab: a click on a tab only shuts an opened card', () => {
    const attrs = new Map<string, string>([
      ['data-sel', 'lead:cat'],
      ['data-open', 'key'],
    ]);
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

    listeners.get('click')?.({
      target: { closest: (selector: string) => (selector === 'nav.tabs' ? {} : null) },
    });

    expect(attrs.get('data-sel')).toBe('lead:cat');
    expect(attrs.has('data-open')).toBe(false);
  });
});
