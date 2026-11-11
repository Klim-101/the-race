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
          id: 'stall',
          name: 'Stall',
          visited: true,
          blocked: null,
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

const SHOWN = {
  history: {
    finds: [],
    links: [],
    shown: [
      { suspectId: 'a', clueId: 'key', effect: 'implicates', turn: 3, reaction: 'Half the town owns a key.' },
      { suspectId: 'a', clueId: 'key', effect: 'no-effect', turn: 4 },
    ],
  },
};

describe('what a suspect said about a clue shown to them', () => {
  it('stands beside the clue on the suspects tab, and only where the suspect said something', () => {
    const page = renderEvidenceBoard(viewOf(SHOWN));
    const tab = /id="suspects">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';

    expect(tab.match(/class="reaction"/g)).toHaveLength(1);
    expect(tab).toContain('<span class="reaction">Half the town owns a key.</span>');
  });

  it('is escaped like any other text', () => {
    const page = renderEvidenceBoard(
      viewOf({
        history: {
          finds: [],
          links: [],
          shown: [{ suspectId: 'a', clueId: 'key', effect: 'implicates', turn: 3, reaction: '<b>Mine!</b>' }],
        },
      }),
    );

    expect(page).toContain('&lt;b&gt;Mine!&lt;/b&gt;');
    expect(page).not.toContain('<b>Mine!</b>');
  });
});
