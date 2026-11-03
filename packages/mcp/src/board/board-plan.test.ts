// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { planId, planKey, planRules } from './board-plan.js';
import { isSafeId } from './board-relations.js';
import { SCRIPT, renderEvidenceBoard } from './render-board.js';

type View = DetectiveRunView;

const place = (
  id: string,
  exposure: 'indoor' | 'outdoor',
  building: string | null,
  extra: Record<string, unknown> = {},
) => ({ id, name: `Room ${id}`, visited: true, blocked: null, lead: null, exposure, building, ...extra });

const gear = (id: string, removes: string[], state = 'owned') => ({
  id,
  nameKey: id,
  state,
  removes,
  charges: null,
  lawful: true,
  suitcase: true,
  study: false,
});

/** A street with one building of three rooms: a hall the hero has searched, a vault they have not entered, a loft. */
const VIEW = {
  title: 'The Vanishing Wheel',
  premise: 'A wheel of cheese is gone.',
  locale: 'en',
  turn: 5,
  status: 'active',
  clock: { day: 1, minute: 600, totalDays: 3 },
  reputation: 7,
  condition: { nerves: 8, maxNerves: 10, sleepDebt: 1, maxSleepDebt: 10, conditions: [] },
  kit: [gear('picks', ['locked']), gear('mirror', ['dark'], 'lost'), gear('torch', ['dark'], 'broken')],
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
  location: { id: 'hall', name: 'Room hall', description: '', exits: [] },
  map: {
    current: 'hall',
    places: [
      place('street', 'outdoor', null, { name: 'Elm Street' }),
      place('hall', 'indoor', 'hall'),
      place('vault', 'indoor', 'hall', { visited: false }),
      place('loft', 'indoor', 'hall', { visited: false, lead: 'A cat points the way.' }),
    ],
    links: [
      { from: 'street', to: 'hall' },
      { from: 'hall', to: 'vault' },
      { from: 'vault', to: 'loft' },
    ],
  },
  placeParts: [
    {
      placeId: 'hall',
      parts: [
        { id: 'desk', name: 'The oak desk', obstacle: null, searched: true, gave: ['key', 'flour'] },
        { id: 'drawer', name: 'A locked drawer', obstacle: 'locked', searched: false, gave: [] },
        { id: 'corner', name: 'The dark corner', obstacle: 'dark', searched: false, gave: [] },
        { id: 'shelf', name: 'The empty shelf', obstacle: null, searched: true, gave: [] },
        { id: 'plate', name: 'A plain plate', obstacle: null, searched: false, gave: [] },
        { id: 'safe', name: 'The wall safe', obstacle: 'sealed', searched: false, gave: [] },
      ],
    },
  ],
  openLinks: [],
  chronicle: { activeMinutesLeft: 900, events: [] },
  clues: [
    { id: 'key', locationId: 'hall', description: 'A key.', garbled: false, number: 'MIRA-01' },
    { id: 'flour', locationId: 'hall', description: 'Flour.', garbled: false, number: 'MIRA-02' },
  ],
  insights: [],
  suspects: [],
  history: { finds: [], shown: [], links: [] },
  leads: [],
} as unknown as View;

const page = renderEvidenceBoard(VIEW);
const plan = /<div class="plan"[\s\S]*?<\/div>\n<p class="note">[\s\S]*?<\/div>/.exec(page)?.[0] ?? '';

describe('the plan of a building', () => {
  it('stands beside the map, shut until its block is clicked, and the block says which plan it opens', () => {
    expect(page.match(/<div class="plan"/g)).toHaveLength(1);
    expect(plan).toContain(`id="${planId('hall')}"`);
    expect(page).toContain(`data-open="${planKey('hall')}" aria-controls="${planId('hall')}"`);
    expect(page).toContain('main[data-open="plan-hall"] #open-plan-hall{display:block}');
    expect(page).toContain('.plan{display:none;');
  });

  it('draws the rooms as boxes with a door between each two, the way in first', () => {
    expect(plan.match(/<g class="room /g)).toHaveLength(3);
    expect(plan.match(/<g class="door-way">/g)).toHaveLength(2);
    expect(plan).toContain('door between Room hall and Room vault');
    expect(plan).toContain('Plan of Room hall · Opens onto: Elm Street');
    const hall = plan.indexOf('class="room visited current"');
    expect(hall).toBeGreaterThan(-1);
    expect(plan.indexOf('class="room unvisited"')).toBeGreaterThan(hall);
  });

  it('draws a room not entered as a plain box, and marks one named by a lead like a place on the map', () => {
    expect(plan).toContain('class="room unvisited"');
    expect(plan).toContain('not entered yet');
    expect(plan).toContain('A cat points the way.');
    expect(plan).toContain('class="lead-mark"');
    expect(plan.match(/<g class="part[ "]/g)).toHaveLength(6);
  });

  it('shows the noticed parts of the open room with what stands in the way and the tool the kit has', () => {
    expect(plan).toContain('The oak desk');
    expect(plan).toContain('locked · tool in the kit: lock picks');
    expect(plan).toContain('class="part locked"');
    // The mirror is lost and the torch broken: a lost or broken tool is no tool.
    expect(plan).toContain('dark · no tool for it in the kit');
    expect(plan).toContain('sealed · no tool for it in the kit');
    expect(plan.match(/class="mark open"/g)).toHaveLength(1);
    expect(plan.match(/class="mark done"/g)).toHaveLength(2);
    expect(plan.match(/class="mark shut"/g)).toHaveLength(3);
  });

  it('ties a searched part to the clues it gave, each picked like a card, and says so when it found nothing', () => {
    expect(plan).toContain('searched · gave');
    expect(plan).toContain('searched · found nothing');
    expect(plan).toMatch(
      /<g class="clue-chip" data-pick="clue:key" data-rel="clue:key place:hall"[^>]*><text[^>]*>MIRA-01/,
    );
    expect(plan).toContain('data-pick="clue:flour"');
  });

  it('says so when a room that was entered has no part noticed yet', () => {
    const bare = renderEvidenceBoard({ ...VIEW, placeParts: [] });

    expect(bare).toContain('nothing noticed here yet');
  });

  it('is written for the rooms of every building, and none for a building whose id is not safe', () => {
    const hostile = 'x"] body{';
    const odd = renderEvidenceBoard({
      ...VIEW,
      map: {
        ...VIEW.map,
        places: [place('street', 'outdoor', null), place(hostile, 'indoor', hostile)],
        links: [{ from: 'street', to: hostile }],
      },
    });

    expect(odd).not.toContain('class="plan"');
    expect(planRules({ ...VIEW, map: { ...VIEW.map, places: [] } })).toBe('');
    expect(odd).not.toContain('open-plan-x');
    expect(odd).not.toContain('data-open="plan-');
  });

  it('puts a room the doors do not reach beyond the others, and a building with one room in one column', () => {
    const lonely = renderEvidenceBoard({
      ...VIEW,
      map: {
        ...VIEW.map,
        places: [
          place('street', 'outdoor', null),
          place('hall', 'indoor', 'hall'),
          place('annex', 'indoor', 'hall', { visited: false }),
        ],
        links: [{ from: 'street', to: 'hall' }],
      },
    });

    expect(lonely.match(/<g class="room /g)).toHaveLength(2);
    expect(lonely).not.toContain('class="door-way"');
  });

  it('draws the doors whichever way the map lists them, and none to the street', () => {
    const reversed = renderEvidenceBoard({
      ...VIEW,
      map: {
        ...VIEW.map,
        links: [
          { from: 'hall', to: 'street' },
          { from: 'hall', to: 'vault' },
          { from: 'loft', to: 'vault' },
        ],
      },
    });

    expect(reversed.match(/class="door-way"/g)).toHaveLength(2);
  });

  it('takes no id that is not safe, and none that is not there', () => {
    expect(isSafeId(null)).toBe(false);
    expect(isSafeId('hall')).toBe(true);
    expect(isSafeId('x"] body{')).toBe(false);
  });

  it('draws a door between two rooms in one column as a vertical way', () => {
    const stacked = renderEvidenceBoard({
      ...VIEW,
      map: {
        ...VIEW.map,
        places: [
          place('street', 'outdoor', null),
          place('hall', 'indoor', 'hall'),
          place('a', 'indoor', 'hall', { visited: false }),
          place('b', 'indoor', 'hall', { visited: false }),
        ],
        links: [
          { from: 'street', to: 'hall' },
          { from: 'hall', to: 'a' },
          { from: 'hall', to: 'b' },
          { from: 'a', to: 'b' },
        ],
      },
    });

    expect(stacked.match(/class="door-way"/g)).toHaveLength(3);
  });

  it('names no building street when the hero does not know it, and is told in Russian', () => {
    const ru = renderEvidenceBoard({ ...VIEW, locale: 'ru' } as unknown as View);

    expect(ru).toContain('План: Room hall');
    expect(ru).toContain('Выходит на: Elm Street');
    expect(ru).toContain('заперто · в наборе есть: отмычки');
  });

  it('matches its snapshot', () => {
    expect(plan).toMatchSnapshot();
  });
});

describe('opening a plan', () => {
  function run(opened?: string) {
    const attrs = new Map<string, string>(opened === undefined ? [] : [['data-open', opened]]);
    const main = {
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => void attrs.set(name, value),
      removeAttribute: (name: string) => void attrs.delete(name),
    };
    const listeners = new Map<string, (event: unknown) => void>();
    const focused: string[] = [];
    runInNewContext(SCRIPT, {
      document: {
        querySelector: () => main,
        getElementById: (id: string) => ({ focus: () => void focused.push(id) }),
        addEventListener: (type: string, handler: (event: unknown) => void) =>
          void listeners.set(type, handler),
      },
    });
    const block = {
      focus: () => undefined,
      getAttribute: (name: string) =>
        name === 'data-pick' ? 'place:hall' : name === 'data-open' ? 'plan-hall' : null,
      closest: () => null,
    };
    const chip = {
      getAttribute: (name: string) => (name === 'data-pick' ? 'clue:key' : null),
      closest: (selector: string) => (selector === '.plan' ? {} : null),
    };
    const through = (el: unknown) => ({
      closest: (selector: string) =>
        selector === '[data-pick]' ? el : selector === '.plan' ? (el === chip ? {} : null) : null,
    });
    return {
      attrs,
      focused,
      block,
      chip,
      through,
      click: (target: unknown) => listeners.get('click')?.({ target }),
    };
  }

  it('opens on a click on the building, and puts the plan away on a second click', () => {
    const page = run();

    page.click(page.through(page.block));
    expect(page.attrs.get('data-open')).toBe('plan-hall');
    expect(page.attrs.get('data-sel')).toBe('place:hall');
    expect(page.focused).toEqual(['open-plan-hall']);

    page.click(page.through(page.block));
    expect(page.attrs.has('data-open')).toBe(false);
  });

  it('keeps the plan open when a clue in it is picked, and carries the pick on', () => {
    const page = run('plan-hall');

    page.click(page.through(page.chip));

    expect(page.attrs.get('data-sel')).toBe('clue:key');
    expect(page.attrs.get('data-open')).toBe('plan-hall');
  });

  it('is not put away by a click inside the plan that picks nothing', () => {
    const page = run('plan-hall');
    page.attrs.set('data-sel', 'place:hall');

    page.click({ closest: (selector: string) => (selector === '.plan' ? {} : null) });

    expect(page.attrs.get('data-open')).toBe('plan-hall');
    expect(page.attrs.get('data-sel')).toBe('place:hall');
  });
});
