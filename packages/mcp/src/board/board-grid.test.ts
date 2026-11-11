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
  witness: null,
  bearsOn: [],
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
  claims: [],
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
    awake: null,
    victim: null,
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
    leads: [],
    openLinks: [],
    chronicle: { activeMinutesLeft: 600, minutesToDeadline: null, deadline: null, events: [] },
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
      claims: [],
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

  it('shows each clue on a short card: where, and a mark for what is left to do with it', () => {
    const cards = clues.split('<div class="card clue-card"').slice(1);

    expect(cards).toHaveLength(3);
    expect(cards[0]).toContain('found at Stall · turn 2');
    expect(cards[0]).toContain('read badly');
    // The key was shown and is in a link; the glove was shown to nobody and is in no link.
    expect(cards[0]).not.toContain('class="marks"');
    expect(cards[1]).not.toContain('class="marks"');
    expect(cards[2]).toContain('<span class="mk">shown to nobody</span> <span class="mk">in no link</span>');
    expect(clues).not.toContain('Shown to:');
  });

  it('lights the place and the people on the other tabs when a clue card is picked', () => {
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

describe('the matching table', () => {
  const table = tab(renderEvidenceBoard(PLAYED), 'clues');
  const rowIn = (page: string, id: string): string =>
    new RegExp('<th scope="row" class="who" data-pick="suspect:' + id + '"[\\s\\S]*?</tr>').exec(page)?.[0] ??
    '';
  const row = (id: string): string => rowIn(table, id);

  it('groups the clues by the place they were found at, under one heading for each place', () => {
    expect(table).toContain(
      '<th colspan="1" scope="colgroup">Stall</th><th colspan="2" scope="colgroup">Market</th>',
    );
    expect(table.indexOf('MIRA-01</span>')).toBeLessThan(table.indexOf('MIRA-02</span>'));
  });

  it('puts what each showing did in the cell of the person and the clue', () => {
    expect(row('a').match(/class="cell /g)).toHaveLength(1);
    expect(row('a')).toContain('class="cell c-breaks" role="img" aria-label="broke a lie"');
    expect(row('b')).toContain('c-impl');
    expect(row('b')).toContain('c-conf');
    expect(row('c')).not.toContain('class="cell');
  });

  it('ties a clue heading and a person to what they light, so a pick reaches the cards below', () => {
    expect(table).toContain(
      '<th scope="col" class="clue" data-pick="clue:flour" data-rel="clue:flour place:market suspect:a suspect:b"',
    );
    expect(row('a')).toContain('data-rel="suspect:a place:market clue:flour"');
  });

  it('marks a clue that bears on a person and was never shown to them, and only that', () => {
    const bearing = viewOf({
      ...PLAYED,
      clues: [
        { ...clue('key', 'MIRA-01', 'stall'), bearsOn: ['a', 'b'] },
        { ...clue('flour', 'MIRA-02', 'market'), bearsOn: ['a'] },
      ],
    });
    const page = tab(renderEvidenceBoard(bearing), 'clues');

    // Anna was shown the flour but not the key; Boris was shown the key, and the flour does not bear on him.
    expect(rowIn(page, 'a').match(/c-todo/g)).toHaveLength(1);
    expect(rowIn(page, 'b')).not.toContain('c-todo');
    expect(rowIn(page, 'c')).not.toContain('c-todo');
  });

  it('says in the last row which links each clue is in, and marks a clue that is in none', () => {
    expect(table.match(/<td class="used">1<\/td>/g)).toHaveLength(2);
    expect(table.match(/<td class="unused"/g)).toHaveLength(1);
  });

  it('marks a clue a witness told, and dims a person who is cleared', () => {
    const told = viewOf({
      ...PLAYED,
      clues: [{ ...clue('key', 'MIRA-01', 'stall'), witness: 'Pip' }],
      suspects: [suspect('a', 'Anna', { cleared: true })],
    });
    const page = tab(renderEvidenceBoard(told), 'clues');

    expect(page).toContain('<span class="mk w" title="Told by Pip">witness</span>');
    expect(page).toContain('<tr class="cleared">');
  });

  it('says where each person is, and falls back to the id of a place the map lacks', () => {
    expect(row('a')).toContain('Last seen: right here');
    expect(row('b')).toContain('Last seen: anywhere, apparently');
    const far = viewOf({
      ...PLAYED,
      clues: [clue('key', 'MIRA-01', 'nowhere')],
      suspects: [suspect('a', 'Anna', { place: { id: 'stall', name: 'Stall' } })],
      history: { finds: [], shown: [], links: [] },
    });
    const page = tab(renderEvidenceBoard(far), 'clues');

    expect(page).toContain('scope="colgroup">nowhere</th>');
    expect(page).toContain('Last seen: Stall');
  });

  it('is told in Russian', () => {
    const ru = tab(renderEvidenceBoard({ ...PLAYED, locale: 'ru' }), 'clues');

    expect(ru).toContain('Кому что показано');
    expect(ru).toContain('сломала ложь');
  });

  it('matches its snapshot', () => {
    expect(table).toMatchSnapshot();
  });
});

describe('the conclusions tab', () => {
  const lead = (id: string, source: unknown, extra: Record<string, unknown> = {}) => ({
    id,
    reason: `Reason of ${id}.`,
    source,
    window: null,
    openNow: true,
    done: false,
    opens: [{ kind: 'place', id: 'stall', name: 'Stall' }],
    ...extra,
  });
  const drawn = viewOf({
    ...PLAYED,
    openLinks: [2, 2, 3],
    insights: [
      { id: 'i1', insight: 'The flour was moved.', clueIds: ['flour', 'key'], clears: null },
      { id: 'i2', insight: 'The glove was left on purpose.', clueIds: ['glove'], clears: null },
    ],
    leads: [
      lead('l1', { kind: 'deduction', insightId: 'i1' }),
      lead('l2', { kind: 'deduction', insightId: 'i1' }, { done: true }),
      lead('l3', { kind: 'deduction', insightId: 'i1' }, { openNow: false }),
      lead('l4', { kind: 'deduction', insightId: 'i1' }, { opens: [] }),
      lead('l5', { kind: 'clue', clueId: 'key' }),
      lead('l6', null),
    ],
    history: {
      ...PLAYED.history,
      links: [
        { clueIds: ['key', 'flour'], result: 'insight', turn: 9 },
        { clueIds: ['glove', 'flour'], result: 'nothing', turn: 10 },
        { clueIds: ['key', 'glove'], result: 'already-known', turn: 11 },
      ],
    },
  });
  const tree = tab(renderEvidenceBoard(drawn), 'insights');

  it('draws each tried link as a branch from its clues, oldest first, with its number and turn', () => {
    expect(tree.match(/<div class="branch/g)).toHaveLength(4);
    expect(tree.indexOf('Link 1 · turn 9')).toBeLessThan(tree.indexOf('Link 2 · turn 10'));
    expect(tree.indexOf('Link 2 · turn 10')).toBeLessThan(tree.indexOf('Link 3 · turn 11'));
    expect(tree).toContain('<span class="num">MIRA-01</span><span class="t">Text of key.</span>');
    expect(tree).toContain('led nowhere');
    expect(tree).toContain('already known');
  });

  it('puts the conclusion of a link after it, with the leads it earned, and nothing after a link that gave none', () => {
    const first = tree.slice(tree.indexOf('Link 1'), tree.indexOf('Link 2'));

    expect(first).toContain('The flour was moved.');
    expect(first).toContain('Reason of l1.');
    expect(first).toContain('can be followed now');
    expect(first).toContain('followed to the end');
    expect(first).toContain('shut at this hour');
    expect(first).toContain('has opened nothing yet');
    expect(first).not.toContain('Reason of l5.');
    const cold = tree.slice(tree.indexOf('<div class="branch cold"'), tree.indexOf('Link 3'));

    expect(cold).toContain('<div class="insight">—</div>');
    expect(cold).not.toContain('class="lead ');
  });

  it('keeps a conclusion that has no link in the history, by its clues alone', () => {
    const last = tree.slice(tree.lastIndexOf('<div class="branch'));

    expect(last).toContain('The glove was left on purpose.');
    expect(last).not.toContain('class="linkbox"');
  });

  it('shows the links still to be made as empty slots of their size, and never which clues', () => {
    expect(tree).toContain('<span class="open-slot"><i></i><i></i> 2 × a link of 2</span>');
    expect(tree).toContain('<span class="open-slot"><i></i><i></i><i></i> 1 × a link of 3</span>');
  });

  it('says that every conclusion is drawn once none is open, and that no link was tried yet', () => {
    const none = tab(renderEvidenceBoard(viewOf()), 'insights');

    expect(none).toContain('No link has been tried yet.');
    expect(none).toContain('Every conclusion has been drawn.');
    expect(none).not.toContain('class="branch');
  });

  it('is told in Russian', () => {
    const ru = tab(renderEvidenceBoard({ ...drawn, locale: 'ru' }), 'insights');

    expect(ru).toContain('Связка 1 · ход 9');
    expect(ru).toContain('Ещё не связано');
  });

  it('matches its snapshot', () => {
    expect(tree).toMatchSnapshot();
  });
});

describe('the tabs', () => {
  it('are the corkboard, the files, the matching, the conclusions, then the rest', () => {
    const page = renderEvidenceBoard(PLAYED);
    const nav = /<nav class="tabs"[^>]*>([\s\S]*?)<\/nav>/.exec(page)?.[1] ?? '';

    expect([...nav.matchAll(/href="#(\w+)"/g)].map((match) => match[1])).toEqual([
      'board',
      'suspects',
      'clues',
      'insights',
      'map',
      'chronicle',
      'hero',
    ]);
    expect(nav).toContain(
      '<a href="#suspects">Files</a><a href="#clues">Matching</a><a href="#insights">Conclusions</a>',
    );
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
