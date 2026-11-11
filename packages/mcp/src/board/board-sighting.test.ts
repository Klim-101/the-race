// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { renderEvidenceBoard } from './render-board.js';

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
    awake: null,
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

const CLUES = {
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
    {
      id: 'seen-pip-anna',
      locationId: 'stall',
      description: 'Pip saw Anna at the stall around 02:30.',
      garbled: false,
      witness: 'Pip the vendor',
      bearsOn: ['a'],
      number: 'MIRA-02',
    },
  ],
};

const sectionOf = (page: string, id: string): string =>
  new RegExp(`id="${id}">([\\s\\S]*?)</section>`).exec(page)?.[1] ?? '';

describe('a clue that a witness told, on the board', () => {
  it('has a card on the clues tab that says whose words it is, and no other card does', () => {
    const tab = sectionOf(renderEvidenceBoard(viewOf(CLUES)), 'clues');
    const cards = tab.split('<div class="card clue-card');

    expect(cards).toHaveLength(3);
    expect(cards[1]).not.toContain('sighting');
    expect(cards[1]).not.toContain('Told by');
    expect(cards[2]).toContain('sighting');
    expect(cards[2]).toContain('<span class="mk">Told by Pip the vendor</span>');
  });

  it('is pinned on the corkboard as a card of its own kind', () => {
    const page = renderEvidenceBoard(viewOf(CLUES));

    expect(page.match(/class="card-pin sighting"/g)).toHaveLength(1);
    expect(page.match(/class="card-pin"/g)).toHaveLength(1);
  });

  it('is said in the language of the run, and escaped like any text', () => {
    const russian = renderEvidenceBoard(viewOf({ ...CLUES, locale: 'ru' }));
    expect(russian).toContain('Со слов свидетеля: Pip the vendor');

    const evil = renderEvidenceBoard(
      viewOf({
        clues: [{ ...CLUES.clues[1]!, witness: '<b>Pip</b>' }],
      }),
    );
    expect(evil).toContain('Told by &lt;b&gt;Pip&lt;/b&gt;');
    expect(evil).not.toContain('<b>Pip</b>');
  });
});

describe('the people a clue bears on, in the matching table and on their files', () => {
  const page = (clues: Record<string, unknown>[]): string => renderEvidenceBoard(viewOf({ clues }));
  const section = (html: string, id: string): string =>
    new RegExp(`id="${id}">([\\s\\S]*?)</section>`).exec(html)?.[1] ?? '';
  const clue = (bearsOn: string[]) => ({
    id: 'key',
    locationId: 'stall',
    description: 'A key.',
    garbled: false,
    witness: null,
    bearsOn,
    number: 'MIRA-01',
  });

  it('marks the cell of a person it bears on and was never shown to, and names the clue on their file', () => {
    const html = page([clue(['a'])]);

    expect(section(html, 'clues')).toContain('c-todo" role="img"');
    expect(section(html, 'suspects')).toContain('Not shown, but bears on them: MIRA-01');
  });

  it('says nothing for a clue nobody is tied to', () => {
    const html = page([clue([])]);

    expect(section(html, 'clues')).not.toContain('c-todo" role="img"');
    expect(section(html, 'suspects')).not.toContain('Not shown');
  });

  it('draws no cell for a person the view does not list', () => {
    const html = page([clue(['ghost'])]);

    expect(section(html, 'clues')).not.toContain('c-todo" role="img"');
    expect(section(html, 'suspects')).not.toContain('ghost');
  });
});
