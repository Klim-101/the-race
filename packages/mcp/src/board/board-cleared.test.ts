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

const person = (id: string, name: string, cleared: boolean) => ({
  id,
  name,
  persona: 'A person.',
  mood: 'calm' as const,
  closed: false,
  talksAgain: null,
  place: null,
  statements: [],
  cleared,
  claims: [],
});

const TWO = { suspects: [person('a', 'Anna', true), person('b', 'Boris', false)] };

describe('a suspect the hero has cleared', () => {
  it('is marked on the suspects tab, and only the one who is cleared', () => {
    const page = renderEvidenceBoard(viewOf(TWO));
    const tab = /id="suspects">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';
    const cards = tab.split('<div class="card suspect');

    expect(cards[1]).toContain(' cleared"');
    expect(cards[1]).toContain('Cleared: could not have done it');
    expect(cards[2]).not.toContain('cleared');
    expect(cards[2]).not.toContain('Cleared: could not have done it');
  });

  it('has a faded photograph on the corkboard, and only the one who is cleared', () => {
    const page = renderEvidenceBoard(viewOf(TWO));

    expect(page.match(/class="photo cleared"/g)).toHaveLength(1);
    expect(page.match(/class="photo"/g)).toHaveLength(1);
  });

  it('is said in the language of the run', () => {
    const page = renderEvidenceBoard(viewOf({ ...TWO, locale: 'ru' }));

    expect(page).toContain('Исключён: не мог этого сделать');
  });
});
