// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEvidenceBoard } from './render-board.js';

function viewOf(overrides: Partial<DetectiveRunView> = {}): DetectiveRunView {
  return {
    title: 'The Vanishing Wheel',
    premise: 'A wheel of cheese is gone.',
    locale: 'en',
    turn: 3,
    status: 'active',
    clock: { day: 2, minute: 545, totalDays: 3 },
    hero: { name: 'Mira', gender: 'female', archetype: 'detective', skills: {}, background: 'police' },
    news: [],
    location: {
      id: 'market',
      name: 'Market',
      description: '',
      exits: [
        { id: 'stall', name: 'Stall', visited: true },
        { id: 'cellar', name: 'Cellar', visited: false },
      ],
    },
    suspects: [
      { id: 'a', name: 'Anna', persona: 'Baker', place: { id: 'market', name: 'Market' } },
      { id: 'b', name: 'Boris', persona: 'Rival', place: { id: 'stall', name: 'Stall' } },
      { id: 'c', name: 'Cora', persona: 'Mayor', place: null },
    ],
    clues: [],
    insights: [],
    setting: null,
    ...overrides,
  } as unknown as DetectiveRunView;
}

describe('escapeHtml', () => {
  it('escapes every character that could open markup', () => {
    expect(escapeHtml(`<b onclick="x">&'`)).toBe('&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('the climate summary', () => {
  const setting = {
    name: 'Val<script>dmark',
    climate: {
      zone: 'subarctic',
      seasons: [
        { id: 'winter', weather: 'snow' },
        { id: 'summer', weather: 'mild' },
      ],
      hazards: ['blizzard', 'ice'],
    },
  };

  it('says nothing when the case is set nowhere in particular', () => {
    expect(renderEvidenceBoard(viewOf(), new Map())).not.toContain('Climate');
  });

  it('gives the country, the zone, each season with its weather and the hazards', () => {
    const page = renderEvidenceBoard(viewOf({ setting } as Partial<DetectiveRunView>), new Map());

    expect(page).toContain('<h2>Climate</h2>');
    expect(page).toContain('The case is set in: <strong>Val&lt;script&gt;dmark</strong>');
    expect(page).toContain('Zone: subarctic');
    expect(page).toContain('<li>winter: snow</li>');
    expect(page).toContain('<li>summer: mild</li>');
    expect(page).toContain('Weather to plan around: blizzards, ice on the roads');
    expect(page).not.toContain('<script>');
  });

  it('is written in the language of the run, and says so when there is no hazard', () => {
    const calm = { ...setting, climate: { ...setting.climate, hazards: [] } };
    const page = renderEvidenceBoard(
      viewOf({ locale: 'ru', setting: calm } as Partial<DetectiveRunView>),
      new Map(),
    );

    expect(page).toContain('<h2>Климат</h2>');
    expect(page).toContain('<li>зима: снег</li>');
    expect(page).toContain('Погода, с которой придётся считаться: ничего особенного');
  });
});

describe('renderEvidenceBoard', () => {
  it('shows the case, the clock, where each suspect is and a bare wall', () => {
    const page = renderEvidenceBoard(viewOf(), new Map());

    expect(page).toContain('<title>Evidence board: The Vanishing Wheel</title>');
    expect(page).toContain('Day 2 of 3, 09:05');
    expect(page).toContain('Last seen: right here');
    expect(page).toContain('Last seen: Stall');
    expect(page).toContain('Last seen: anywhere, apparently');
    expect(page).toContain('not yet visited');
    expect(page).toContain('Nothing on the board yet');
    expect(page).toContain('No conclusions yet');
    expect(page).not.toContain('Meanwhile');
  });

  it('lists clues by the place they were found, flags a badly read one and names the insights', () => {
    const page = renderEvidenceBoard(
      viewOf({
        clues: [
          { id: 'k', locationId: 'stall', description: 'A rusty key.', garbled: true },
          { id: 'u', locationId: 'gone', description: 'Flour.', garbled: false },
        ],
        insights: [{ id: 'i', insight: 'The baker lied.' }],
        news: ['Prices rise.'],
      }),
      new Map([['stall', 'Stall']]),
    );

    expect(page).toContain('Stall</span>');
    expect(page).toContain('gone</span>');
    expect(page).toContain('read badly');
    expect(page).toContain('The baker lied.');
    expect(page).toContain('Prices rise.');
  });

  it('speaks Russian when the run does', () => {
    const page = renderEvidenceBoard(viewOf({ locale: 'ru', status: 'won' }), new Map());

    expect(page).toContain('<html lang="ru">');
    expect(page).toContain('Доска улик');
    expect(page).toContain('раскрыто');
  });

  it('never lets case text become markup', () => {
    const page = renderEvidenceBoard(
      viewOf({
        title: '<script>alert(1)</script>',
        news: ['<img src=x onerror=alert(1)>'],
        clues: [{ id: 'k', locationId: 'stall', description: '</p><script>x</script>', garbled: false }],
      }),
      new Map(),
    );

    expect(page).not.toContain('<script>');
    expect(page).not.toContain('<img');
    expect(page).toContain("default-src 'none'");
  });
});
