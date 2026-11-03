// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { leadSourceTokens, leadTokens } from './board-relations.js';
import { renderEvidenceBoard } from './render-board.js';

type View = DetectiveRunView;

const clue = (id: string, number: string) => ({
  id,
  locationId: 'market',
  description: `Text of ${id}.`,
  garbled: false,
  number,
});

const lead = (id: string, source: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  reason: `Reason of ${id}.`,
  source,
  window: null,
  openNow: true,
  opens: [{ kind: 'place', id: 'archive', name: 'Archive' }],
  ...extra,
});

const PLAYED = {
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
        lead: 'Reason of by-clue.',
        exposure: 'outdoor',
        building: null,
      },
    ],
    links: [{ from: 'market', to: 'archive' }],
  },
  openLinks: [],
  chronicle: { activeMinutesLeft: 600, events: [] },
  clues: [clue('key', 'MIRA-01'), clue('flour', 'MIRA-02')],
  insights: [{ id: 'liar', insight: 'The baker lied.', clueIds: ['key', 'flour'] }],
  suspects: [
    {
      id: 'a',
      name: 'Anna',
      persona: 'Baker',
      mood: 'calm',
      closed: false,
      talksAgain: null,
      place: null,
      statements: [],
    },
  ],
  history: { finds: [], shown: [], links: [] },
  leads: [
    lead('by-clue', { kind: 'clue', clueId: 'key' }),
    lead('by-talk', { kind: 'talk', suspectId: 'a' }, { opens: [] }),
    lead('by-lie', { kind: 'lie', suspectId: 'a' }),
    lead('by-lie-of-nobody', { kind: 'lie', suspectId: null }),
    lead('by-conclusion', { kind: 'deduction', insightId: 'liar' }),
    lead('by-rumour', { kind: 'locals', locationId: 'market' }),
    lead('by-study', { kind: 'study', clueId: 'flour', tool: null }),
    lead('by-lens', { kind: 'study', clueId: 'flour', tool: 'magnifier' }),
    lead('by-old-save', null, { window: { fromMinute: 22 * 60, untilMinute: 5 * 60 + 30 }, openNow: false }),
  ],
} as unknown as View;

const page = renderEvidenceBoard(PLAYED);
const board = /<svg class="board"[\s\S]*?<\/svg>/.exec(page)?.[0] ?? '';
const pin = (id: string): string =>
  new RegExp(`<g class="lead-pin[^"]*"[^>]*data-pick="lead:${id}"[\\s\\S]*?</g>`).exec(board)?.[0] ?? '';

describe('the leads on the corkboard', () => {
  it('stand in a column of their own beside the clues, and widen the board only when there are leads', () => {
    const bare = renderEvidenceBoard({ ...PLAYED, leads: [] });

    expect(board.match(/class="lead-pin/g)).toHaveLength(9);
    expect(board).toMatch(/viewBox="0 0 1234 /);
    expect(/<svg class="board" viewBox="0 0 (\d+)/.exec(bare)?.[1]).toBe('990');
    expect(bare).not.toContain('class="lead-pin');
  });

  it('pin each lead with its reason, what earned it, what it opens and the hours it holds', () => {
    expect(pin('by-clue')).toContain('Reason of by-clue.');
    expect(pin('by-clue')).toContain('from clue MIRA-01');
    expect(pin('by-clue')).toContain('Opens: Archive');
    expect(pin('by-talk')).toContain('from a talk with Anna');
    expect(pin('by-lie')).toContain('Anna&#39;s lie fell');
    expect(pin('by-conclusion')).toContain('from a conclusion');
    expect(pin('by-rumour')).toContain('from asking the locals at Market');
    expect(pin('by-study')).toContain('from studying MIRA-02');
    expect(pin('by-lens')).toMatch(/from studying MIRA-02 with/);
    expect(pin('by-old-save')).toContain('what earned it is not recorded');
    expect(pin('by-lie-of-nobody')).toContain('what earned it is not recorded');
    expect(pin('by-old-save')).toContain('only from 22:00 to 05:30');
  });

  it('look different when they have opened nothing yet and when the hour shuts them', () => {
    expect(pin('by-clue')).toContain('can be followed now');
    expect(pin('by-clue')).toMatch(/class="lead-pin"/);
    expect(pin('by-talk')).toMatch(/class="lead-pin idle"/);
    expect(pin('by-talk')).toContain('has opened nothing yet');
    expect(pin('by-old-save')).toMatch(/class="lead-pin shut"/);
    expect(pin('by-old-save')).toContain('shut at this hour');
  });

  it('are tied by a green thread to the clue, the person or the clues of the conclusion that earned them', () => {
    const threads = [...board.matchAll(/<path class="thread earned"[^>]*data-rel="([^"]*)"/g)].map(
      (match) => match[1],
    );

    expect(threads).toContain('lead:by-clue clue:key');
    expect(threads).toContain('lead:by-talk suspect:a');
    expect(threads).toContain('lead:by-lie suspect:a');
    expect(threads).toContain('lead:by-conclusion clue:key');
    expect(threads).toContain('lead:by-conclusion clue:flour');
    expect(threads).toContain('lead:by-study clue:flour');
    // A rumour, a lie of nobody and a lead of an old save have nothing on the board to be tied to.
    expect(threads.some((rel) => rel?.startsWith('lead:by-rumour'))).toBe(false);
    expect(threads.some((rel) => rel?.startsWith('lead:by-old-save'))).toBe(false);
    expect(threads.some((rel) => rel?.startsWith('lead:by-lie-of-nobody'))).toBe(false);
  });

  it('light with what earned them and what they open, from either end', () => {
    expect(leadTokens(PLAYED, 'by-clue')).toEqual(['lead:by-clue', 'place:archive', 'clue:key']);
    expect(leadTokens(PLAYED, 'by-conclusion')).toEqual([
      'lead:by-conclusion',
      'place:archive',
      'clue:key',
      'clue:flour',
    ]);
    expect(leadSourceTokens(PLAYED, PLAYED.leads[3] as never)).toEqual([]);
    const lost = lead('lost', { kind: 'deduction', insightId: 'gone' });
    expect(leadSourceTokens(PLAYED, lost as never)).toEqual([]);
    const key = /<g class="card-pin"[^>]*data-pick="clue:key" data-rel="([^"]*)"/.exec(board)?.[1] ?? '';
    expect(key).toContain('lead:by-clue');
    expect(key).toContain('lead:by-conclusion');
    expect(key).not.toContain('lead:by-talk');
    const anna = /<g class="photo"[^>]*data-pick="suspect:a" data-rel="([^"]*)"/.exec(board)?.[1] ?? '';
    expect(anna).toContain('lead:by-talk');
    expect(anna).toContain('lead:by-lie');
    expect(pin('by-clue')).toContain('data-rel="lead:by-clue place:archive clue:key"');
    const market = /data-pick="place:market" data-rel="([^"]*)"/.exec(page)?.[1] ?? '';
    expect(market).toContain('lead:by-rumour');
  });

  it('name an id the view does not know by the id itself', () => {
    const odd = renderEvidenceBoard({
      ...PLAYED,
      leads: [
        lead('ghost-talk', { kind: 'talk', suspectId: 'nobody' }),
        lead('ghost-clue', { kind: 'clue', clueId: 'gone' }),
      ],
    } as unknown as View);

    expect(odd).toContain('from a talk with nobody');
    expect(odd).toContain('from clue gone');
  });

  it('are told in Russian', () => {
    const ru = renderEvidenceBoard({ ...PLAYED, locale: 'ru' });

    expect(ru).toContain('ЗАЦЕПКА');
    expect(ru).toContain('из улики MIRA-01');
    expect(ru).toContain('Зелёная нить');
  });

  it('match their snapshot', () => {
    expect(board).toMatchSnapshot();
  });
});
