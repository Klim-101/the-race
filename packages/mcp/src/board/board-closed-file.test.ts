// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { ClosedFile, DetectiveRunView, TurnView } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { renderEvidenceBoard } from './render-board.js';

type View = DetectiveRunView;

function viewOf(overrides: Record<string, unknown> = {}): View {
  return {
    title: 'The Vanishing Wheel',
    premise: 'A wheel of cheese is gone.',
    locale: 'en',
    turn: 9,
    status: 'lost',
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
    map: { current: 'market', places: [], links: [] },
    openLinks: [],
    chronicle: { activeMinutesLeft: 900, events: [] },
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
        id: 'glove',
        locationId: 'stall',
        description: 'A blue glove.',
        garbled: false,
        witness: null,
        bearsOn: [],
        number: 'MIRA-02',
      },
    ],
    insights: [],
    suspects: [],
    history: { finds: [], shown: [], links: [] },
    leads: [],
    ...overrides,
  } as unknown as View;
}

const FILE: ClosedFile = {
  verdict: 'unproven',
  culprit: 'Orla Brenn',
  motive: 'Debt to the miller.',
  method: 'Rolled the wheel into the cellar.',
  place: 'Cheese stall',
  course: [
    { atMinute: 100, actor: 'Orla Brenn', place: 'Storage cellar', action: 'Opens the cellar.' },
    { atMinute: 125, actor: 'Gustav Holm', place: 'Market square', action: 'Tastes a sample.' },
  ],
  missed: [{ description: 'Round tracks in the cellar.', place: 'Storage cellar', obstacle: 'dark' }],
  misled: [],
};

const accused = (file: ClosedFile | null | undefined): TurnView[] => [
  { turn: 9, day: 2, minute: 700, kind: 'accuse', shortfall: null, ...(file === undefined ? {} : { file }) },
];

const pageOf = (turns: TurnView[], view: View = viewOf()): string => renderEvidenceBoard(view, turns);
const navOf = (page: string): string => /<nav class="tabs"[^>]*>([\s\S]*?)<\/nav>/.exec(page)?.[1] ?? '';
const fileTab = (page: string): string => /id="file">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';

describe('the closed file, on the board of a finished run', () => {
  it('is not there while the run is on: no tab, no link and none of the truth', () => {
    const page = pageOf(
      [{ turn: 3, day: 1, minute: 500, kind: 'look', found: 1 }],
      viewOf({ status: 'active' }),
    );

    expect(page).not.toContain('id="file"');
    expect(navOf(page)).not.toContain('#file');
    expect(page).not.toContain('Debt to the miller.');
  });

  it('is not there for an accusation with nothing to tell, as a log from before the file was kept', () => {
    expect(pageOf(accused(undefined))).not.toContain('id="file"');
    expect(pageOf(accused(null))).not.toContain('id="file"');
  });

  it('has a tab, and tells the truth, the course in order, the pinned clues and an empty card', () => {
    const page = pageOf(accused(FILE));
    const tab = fileTab(page);

    expect(navOf(page)).toContain('href="#file">Closed file<');
    expect(tab).toContain('Unproven');
    expect(tab).toContain('Orla Brenn');
    expect(tab).toContain('Debt to the miller.');
    expect(tab.indexOf('Opens the cellar.')).toBeLessThan(tab.indexOf('Tastes a sample.'));
    expect(tab).toContain('01:40 · Storage cellar');
    expect(tab).toContain('MIRA-01');
    expect(tab).toContain('A key.');
    expect(tab).toContain('class="card empty-card"');
    expect(tab).toContain('never found · Storage cellar · in the dark');
    expect(tab).toMatchSnapshot();
  });

  it('marks the false clue that led astray, for a wrong accusation', () => {
    const wrong: ClosedFile = {
      ...FILE,
      verdict: 'wrong',
      missed: [],
      misled: [{ number: 'MIRA-02', description: 'A blue glove.' }],
    };
    const tab = fileTab(pageOf(accused(wrong)));

    expect(tab).toContain('Wrong person');
    expect(tab).toContain('class="card led-astray"');
    expect(tab.match(/led-astray/g)).toHaveLength(1);
    expect(tab).not.toContain('empty-card');
    expect(tab).toMatchSnapshot();
  });

  it('is short for a proven case: the truth and the course, nothing missed', () => {
    const tab = fileTab(pageOf(accused({ ...FILE, verdict: 'proven', missed: [], misled: [] })));

    expect(tab).toContain('Proven');
    expect(tab).not.toContain('What was never found');
    expect(tab).toMatchSnapshot();
  });

  it('shows what an old log has: the truth and the pinned clues, with no course', () => {
    const tab = fileTab(pageOf(accused({ ...FILE, course: [], missed: [], misled: [] })));

    expect(tab).toContain('Debt to the miller.');
    expect(tab).not.toContain('How it really went');
    expect(tab).not.toContain('class="course"');
  });

  it('says so when no clue was found, and has no empty cards when none was missed', () => {
    const tab = fileTab(pageOf(accused({ ...FILE, missed: [] }), viewOf({ clues: [] })));

    expect(tab).toContain('Not a single clue was found.');
    expect(tab).not.toContain('empty-card');
  });

  it('tells an obstacle the table has no word for by its name, and none when nothing stood in the way', () => {
    const tab = fileTab(
      pageOf(
        accused({
          ...FILE,
          missed: [
            { description: 'A.', place: 'Cellar', obstacle: 'unheard-of' as never },
            { description: 'B.', place: 'Loft', obstacle: null },
          ],
        }),
      ),
    );

    expect(tab).toContain('never found · Cellar · unheard-of');
    expect(tab).toContain('never found · Loft<');
  });

  it('is told in the language of the run, and escaped like any text', () => {
    const page = pageOf(
      accused({ ...FILE, motive: '<script>alert(1)</script>', verdict: 'unproven' }),
      viewOf({ locale: 'ru' }),
    );
    const tab = fileTab(page);

    expect(tab).toContain('Не доказано');
    expect(tab).toContain('Как всё было на самом деле');
    expect(tab).toContain('не найдена · Storage cellar · в темноте');
    expect(tab).not.toContain('<script>alert(1)</script>');
    expect(tab).toContain('&lt;script&gt;');
  });
});
