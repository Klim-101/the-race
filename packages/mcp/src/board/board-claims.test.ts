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

const person = (
  claims: { day: number; text: string; broken: { clueIds: string[] } | null }[],
  statements: { day: number; kind: 'alibi' | 'conceded' | 'secret'; text: string; refuted?: true }[] = [],
) => ({
  suspects: [
    {
      id: 'a',
      name: 'Anna',
      persona: 'Baker',
      mood: 'calm' as const,
      closed: false,
      talksAgain: null,
      place: null,
      cleared: false,
      statements,
      claims,
    },
  ],
});

const tabOf = (view: View): string =>
  /id="suspects">([\s\S]*?)<\/section>/.exec(renderEvidenceBoard(view))?.[1] ?? '';

describe('what a suspect claims, on the suspects tab', () => {
  it('lists every claim in the order it was said, with nothing to tell the true from a lie that stands', () => {
    const tab = tabOf(
      viewOf(
        person([
          { day: 1, text: 'I bake for the whole town.', broken: null },
          { day: 1, text: 'I never left my house.', broken: null },
        ]),
      ),
    );

    expect(tab).toContain('What they claim');
    expect(tab.match(/class="claim"/g)).toHaveLength(2);
    expect(tab.indexOf('I bake for the whole town.')).toBeLessThan(tab.indexOf('I never left my house.'));
    expect(tab).not.toContain('class="claim fell"');
    expect(tab).not.toContain('<s>');
  });

  it('strikes through a claim that was a lie and has fallen, and ties it to the clues that broke it', () => {
    const tab = tabOf(
      viewOf(
        person([
          { day: 1, text: 'I bake for the whole town.', broken: null },
          { day: 1, text: 'I never left my house.', broken: { clueIds: ['key'] } },
        ]),
      ),
    );

    expect(tab.match(/class="claim fell"/g)).toHaveLength(1);
    expect(tab).toContain('<s>I never left my house.</s>');
    expect(tab).toContain('data-pick="clue:key"');
    expect(tab).not.toContain('<s>I bake for the whole town.</s>');
  });

  it('strikes through a claim that only a conclusion broke, with no clue to tie it to', () => {
    const tab = tabOf(viewOf(person([{ day: 1, text: 'I owe nobody.', broken: { clueIds: [] } }])));

    expect(tab).toContain('<s>I owe nobody.</s>');
    expect(tab).not.toContain('data-pick="clue:key"');
  });

  it('puts what the suspect admitted in the statements, not struck through, once there are claims', () => {
    const statements = [{ day: 1, kind: 'conceded' as const, text: 'Fine, I went to the cellar.' }];
    const withClaims = tabOf(
      viewOf(person([{ day: 1, text: 'I never left my house.', broken: { clueIds: [] } }], statements)),
    );
    const without = tabOf(viewOf(person([], statements)));

    expect(withClaims).toContain('Fine, I went to the cellar.');
    expect(withClaims).not.toContain('<s>Fine, I went to the cellar.</s>');
    expect(without).toContain('<s>Fine, I went to the cellar.</s>');
    expect(without).not.toContain('What they claim');
  });

  it('is said in the language of the run', () => {
    const tab = tabOf(viewOf({ ...person([{ day: 1, text: 'Я пеку.', broken: null }]), locale: 'ru' }));

    expect(tab).toContain('Что они утверждают');
  });
});

describe('an alibi that a fallen lie has taken away, on the suspects tab', () => {
  const statements = [
    { day: 1, kind: 'alibi' as const, text: 'I was at the oven all evening.', refuted: true as const },
    { day: 1, kind: 'conceded' as const, text: 'I went down to the mill at nine.' },
  ];

  it('is struck through and marked, beside what the person says now', () => {
    const tab = tabOf(viewOf(person([], statements)));

    expect(tab).toContain('<s>I was at the oven all evening.</s>');
    expect(tab).toContain('no longer stands');
    expect(tab).toContain('I went down to the mill at nine.');
  });

  it('stands as it was said while nothing has taken it away', () => {
    const tab = tabOf(
      viewOf(person([], [{ day: 1, kind: 'alibi', text: 'I was at the oven all evening.' }])),
    );

    expect(tab).toContain('I was at the oven all evening.');
    expect(tab).not.toContain('<s>I was at the oven all evening.</s>');
    expect(tab).not.toContain('no longer stands');
  });
});
