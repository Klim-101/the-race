// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView, Shortfall, TurnView } from '@the-race/engine';
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
      events: [
        { day: 1, text: 'The market opens.' },
        { day: 2, text: 'A storm closes the road.' },
      ],
    },
    clues: [{ id: 'key', locationId: 'stall', description: 'A key.', garbled: false, number: 'MIRA-01' }],
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

const clue = (clueId: string, state: 'laid-out' | 'found' | 'never-found', number: string | null) => ({
  clueId,
  state,
  description: `Description of ${clueId}.`,
  number,
});

const accused = (shortfall: Shortfall | null): TurnView[] => [
  { turn: 9, day: 2, minute: 700, kind: 'accuse', shortfall },
];

const chronicleOf = (page: string): string => /id="chronicle">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';

describe('how the proof fell short, on the chronicle of a finished run', () => {
  const lacking: Shortfall = {
    motive: { held: false, offered: false, drawn: true },
    evidence: {
      held: false,
      clues: [
        clue('door-log', 'laid-out', 'MIRA-03'),
        clue('hatbox', 'found', 'MIRA-05'),
        clue('card', 'never-found', null),
      ],
    },
  };

  it('names the clues of the nearest chain, each with where it stood, and the number of the ones found', () => {
    const chronicle = chronicleOf(renderEvidenceBoard(viewOf(), accused(lacking)));

    expect(chronicle).toContain('How the proof fell short');
    expect(chronicle).toContain(
      'No motive was put forward, though the conclusion that explains it had been drawn.',
    );
    expect(chronicle).toContain('<span class="tag">laid out</span> MIRA-03: Description of door-log.');
    expect(chronicle).toContain(
      '<span class="tag">found, but left out</span> MIRA-05: Description of hatbox.',
    );
    expect(chronicle).toContain('<span class="tag">never found</span> Description of card.');
  });

  it('tells each way the motive can fall short, and the evidence that held', () => {
    const line = (motive: Shortfall['motive']): string =>
      chronicleOf(renderEvidenceBoard(viewOf(), accused({ motive, evidence: { held: true, clues: [] } })));

    expect(line({ held: true, offered: true, drawn: true })).toContain('The motive held.');
    expect(line({ held: false, offered: false, drawn: false })).toContain(
      'the conclusion that explains it was never drawn.',
    );
    expect(line({ held: false, offered: true, drawn: true })).toContain(
      'Another conclusion was put forward as the motive; the right one had been drawn.',
    );
    expect(line({ held: false, offered: true, drawn: false })).toContain(
      'Another conclusion was put forward as the motive; the right one was never drawn.',
    );
    expect(line({ held: true, offered: true, drawn: true })).toContain('The evidence held.');
  });

  it('is in the language of the run', () => {
    const chronicle = chronicleOf(renderEvidenceBoard(viewOf({ locale: 'ru' }), accused(lacking)));

    expect(chronicle).toContain('Чего не хватило доказательствам');
    expect(chronicle).toContain('найдена, но не выложена');
  });

  it('is not on the page when nothing fell short, or there was no accusation', () => {
    expect(chronicleOf(renderEvidenceBoard(viewOf(), accused(null)))).not.toContain(
      'How the proof fell short',
    );
    expect(chronicleOf(renderEvidenceBoard(viewOf(), []))).not.toContain('How the proof fell short');
  });
});
