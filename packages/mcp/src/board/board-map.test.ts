// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { layoutTown, renderMap, type Block, type Street, type TownLayout } from './board-map.js';
import { renderEvidenceBoard } from './render-board.js';
import { TAB_TEXT } from './tab-text.js';

type View = DetectiveRunView;
type Map = View['map'];

const place = (
  id: string,
  exposure: 'indoor' | 'outdoor',
  building: string | null = null,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name: `Place ${id}`,
  visited: true,
  blocked: null,
  hours: null,
  lead: null,
  exposure,
  building,
  ...extra,
});

/** The town of the larkspur case: a harbour street with a teahouse, a press room and a hall, a plaza, an alley. */
const TOWN: Map = {
  current: 'harbour',
  places: [
    place('harbour', 'outdoor', null, { name: 'Harbour Street' }),
    place('exchange', 'indoor', 'exchange', { name: 'Exchange floor' }),
    place('press', 'indoor', 'press', { name: 'Press room' }),
    place('tea', 'indoor', 'tea', { name: 'The Copper Kettle Teahouse', visited: false }),
    place('plaza', 'outdoor', null, { name: 'Larkspur Plaza' }),
    place('hq', 'indoor', 'hq', { name: 'Larkspur HQ', blocked: 'locked' }),
    place('vault', 'indoor', 'hq', { name: 'Records vault' }),
    place('alley', 'outdoor', null, { name: 'Ink Alley', visited: false }),
    place('shop', 'indoor', 'shop', { name: 'Print shop', visited: false, blocked: 'closed' }),
    place('annex', 'indoor', 'annex', { name: 'Annex', visited: false, lead: 'A cat points the way.' }),
  ],
  links: [
    { from: 'harbour', to: 'exchange' },
    { from: 'harbour', to: 'press' },
    { from: 'harbour', to: 'tea' },
    { from: 'harbour', to: 'plaza' },
    { from: 'plaza', to: 'hq' },
    { from: 'hq', to: 'vault' },
    { from: 'press', to: 'alley' },
    { from: 'alley', to: 'shop' },
  ],
};

const ONE: Map = {
  current: 'street',
  places: [place('street', 'outdoor'), place('house', 'indoor', 'house')],
  links: [{ from: 'street', to: 'house' }],
};

function viewOf(map: Map, extra: Record<string, unknown> = {}): View {
  return {
    title: 'The Vanishing Wheel',
    premise: 'A wheel of cheese is gone.',
    locale: 'en',
    turn: 1,
    status: 'active',
    clock: { day: 1, minute: 500, totalDays: 3 },
    reputation: 7,
    condition: { nerves: 8, maxNerves: 10, sleepDebt: 1, maxSleepDebt: 10, conditions: [] },
    kit: [],
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
    location: { id: map.current, name: 'Here', description: '', exits: [] },
    map,
    openLinks: [],
    chronicle: { activeMinutesLeft: 900, minutesToDeadline: null, deadline: null, events: [] },
    clues: [],
    insights: [],
    suspects: [],
    placeParts: [],
    history: { finds: [], shown: [], links: [] },
    leads: [],
    ...extra,
  } as unknown as View;
}

const BLOCK_W = 84;
const BLOCK_H = 56;
const STREET_W = 176;
const STREET_H = 30;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const boxes = (layout: TownLayout): Box[] => [
  ...layout.streets.map(({ x, y }: Street) => ({ x, y, w: STREET_W, h: STREET_H })),
  ...layout.blocks.map(({ x, y }: Block) => ({ x, y, w: BLOCK_W, h: BLOCK_H })),
];
const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const anyOverlap = (layout: TownLayout): boolean =>
  boxes(layout).some((a, i) => boxes(layout).some((b, j) => i < j && overlap(a, b)));

describe('layoutTown', () => {
  const layout = layoutTown(TOWN);

  it('lays the streets in rows, each walked on from the one before, the first branch of a street in its row', () => {
    const at = (id: string): Street | undefined => layout.streets.find(({ place: p }) => p.id === id);

    expect(layout.streets.map(({ place: p }) => p.id)).toEqual(['harbour', 'plaza', 'alley']);
    expect(at('plaza')?.y).toBe(at('harbour')?.y);
    expect(at('plaza')?.x).toBeGreaterThan((at('harbour')?.x ?? 0) + STREET_W);
    // The alley is reached from the press room, not from a street: a street of its own, a row of its own.
    expect(at('alley')?.x).toBe(24);
  });

  it('stands a building along the street it opens onto, above it and below it in turn', () => {
    const harbour = layout.streets.find(({ place: p }) => p.id === 'harbour');
    const standing = layout.blocks.filter(({ street }) => street?.place.id === 'harbour');

    expect(standing.map(({ rooms }) => rooms[0]?.id)).toEqual(['exchange', 'press', 'tea']);
    expect(standing[0]?.y).toBeLessThan(harbour?.y ?? 0);
    expect(standing[1]?.y).toBeGreaterThan(harbour?.y ?? 0);
    expect(standing[2]?.y).toBeLessThan(harbour?.y ?? 0);
    expect(standing[0]?.x).not.toBe(standing[2]?.x);
  });

  it('draws the rooms of one building as one block, the one that opens onto the street first', () => {
    const hq = layout.blocks.find(({ rooms }) => rooms.some(({ id }) => id === 'vault'));

    expect(hq?.rooms.map(({ id }) => id)).toEqual(['hq', 'vault']);
    expect(layout.blocks).toHaveLength(6);
  });

  it('is the same picture for the same view, and puts nothing on top of anything else', () => {
    expect(layoutTown(TOWN)).toEqual(layout);
    expect(anyOverlap(layout)).toBe(false);
    expect(anyOverlap(layoutTown(ONE))).toBe(false);
    expect(layoutTown(ONE).blocks).toHaveLength(1);
  });

  it('stands many buildings along one street in tiers without overlap', () => {
    const many: Map = {
      current: 'street',
      places: [
        place('street', 'outdoor'),
        ...Array.from({ length: 9 }, (_, index) => place(`b${String(index)}`, 'indoor', `b${String(index)}`)),
      ],
      links: Array.from({ length: 9 }, (_, index) => ({ from: 'street', to: `b${String(index)}` })),
    };

    const crowded = layoutTown(many);

    expect(crowded.blocks).toHaveLength(9);
    expect(anyOverlap(crowded)).toBe(false);
    expect(crowded.height).toBeGreaterThan(layoutTown(ONE).height);
  });

  it('puts a building whose street the hero does not know below the town, and says so', () => {
    const lost: Map = {
      current: 'house',
      places: [place('house', 'indoor', 'house'), place('shed', 'indoor', 'shed', { visited: false })],
      links: [],
    };

    const town = layoutTown(lost);

    expect(town.streets).toEqual([]);
    expect(town.blocks.map(({ street }) => street)).toEqual([null, null]);
    expect(town.elsewhere).not.toBeNull();
    expect(anyOverlap(town)).toBe(false);
    expect(layoutTown(ONE).elsewhere).toBeNull();
  });

  it('wraps the unattached buildings into rows', () => {
    const lost: Map = {
      current: 'h0',
      places: Array.from({ length: 8 }, (_, index) =>
        place(`h${String(index)}`, 'indoor', `h${String(index)}`),
      ),
      links: [],
    };

    const town = layoutTown(lost);

    expect(new Set(town.blocks.map(({ y }) => y)).size).toBe(2);
    expect(anyOverlap(town)).toBe(false);
  });

  it('joins streets that are not walked on from each other by a lane across, and lays several apart', () => {
    const ring: Map = {
      current: 'a',
      places: [place('a', 'outdoor'), place('b', 'outdoor'), place('c', 'outdoor'), place('far', 'outdoor')],
      links: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    };

    const town = layoutTown(ring);

    expect(town.lanes.map(({ kind }) => kind)).toEqual(['walked', 'walked', 'across']);
    expect(town.streets.map(({ place: p }) => p.id)).toEqual(['a', 'b', 'c', 'far']);
    expect(anyOverlap(town)).toBe(false);
  });

  it('draws a map of nothing but out-of-doors places, as the cases of before were', () => {
    const old: Map = {
      current: 'a',
      places: [place('a', 'outdoor'), place('b', 'outdoor')],
      links: [{ from: 'a', to: 'b' }],
    };

    expect(layoutTown(old).blocks).toEqual([]);
    expect(layoutTown(old).streets).toHaveLength(2);
  });
});

describe('the paper map', () => {
  const html = renderMap(viewOf(TOWN), TAB_TEXT.en);

  it('draws the streets as bands and the buildings as blocks, with the hero marked', () => {
    expect(html.match(/<g class="street[^"]*"/g)).toHaveLength(3);
    expect(html.match(/<g class="block[^"]*"/g)).toHaveLength(6);
    expect(html).toContain('<g class="street visited current"');
    expect(html).toContain('class="here"');
    expect(html).toContain('<g class="compass"');
    expect(html).not.toContain('<line class="node');
  });

  it('shows a shut way as a sign, a closed one differently, and nothing on an open one', () => {
    expect(html).toContain('class="block visited locked"');
    expect(html).toContain('class="sign locked"');
    expect(html).toContain('class="block unvisited closed"');
    expect(html).toContain('class="sign closed"');
    expect(html.match(/class="sign /g)).toHaveLength(2);
  });

  it('draws a building of several rooms as one block with its name and how many rooms it holds', () => {
    expect(html).toContain('2 rooms');
    expect(html).toContain('Larkspur HQ');
    const drawn = /<svg class="map"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? '';
    expect(drawn).not.toContain('>Records vault<');
    expect(html).toContain('Larkspur HQ, Records vault');
  });

  it('marks a place a lead named, with the reason, and an unknown place is absent', () => {
    expect(html).toContain('class="lead-mark"');
    expect(html).toContain('A cat points the way.');
    expect(html).not.toContain('Nowhere');
    expect(renderMap(viewOf(ONE), TAB_TEXT.en)).not.toContain('lead-mark');
  });

  it('counts the clues found in a building over all its rooms, and on a street', () => {
    const clue = (id: string, locationId: string) => ({
      id,
      locationId,
      description: id,
      garbled: false,
      witness: null,
      bearsOn: [],
      number: id,
    });
    const found = renderMap(
      viewOf(TOWN, { clues: [clue('a', 'hq'), clue('b', 'vault'), clue('c', 'harbour')] }),
      TAB_TEXT.en,
    );

    expect(found).toContain('clues found here: 2');
    expect(found).toContain('clues found here: 1');
    expect(found.match(/class="badge"/g)).toHaveLength(2);
  });

  it('is picked by a building or a street, and lights what ties to every room of the building', () => {
    const clue = (id: string, locationId: string) => ({
      id,
      locationId,
      description: id,
      garbled: false,
      witness: null,
      bearsOn: [],
      number: id,
    });
    const found = renderMap(viewOf(TOWN, { clues: [clue('b', 'vault')] }), TAB_TEXT.en);

    expect(found).toContain('data-pick="place:hq" data-rel="place:hq place:vault clue:b"');
    expect(found).toContain('data-pick="place:harbour"');
  });

  it('cuts a long street name on the picture and wraps a long building name, and keeps both whole in the tooltip', () => {
    const name = 'The Extremely Long-Named Municipal Archive Of Records';
    const long: Map = {
      current: 'a',
      places: [
        place('a', 'outdoor', null, { name }),
        place('b', 'indoor', 'b', { name: 'The Extremely Long-Named Municipal Archive' }),
      ],
      links: [{ from: 'a', to: 'b' }],
    };

    const drawn = renderMap(viewOf(long), TAB_TEXT.en);

    expect(drawn).toContain(`<title>${name} (you are here)</title>`);
    expect(drawn).toContain('The Extremely Long-Name…');
    expect(drawn).toContain('The Extremely');
    expect(drawn).toContain('Long-Named …');
    expect(drawn).toContain('<title>The Extremely Long-Named Municipal Archive</title>');
  });

  it('says so when nothing is known', () => {
    expect(renderMap(viewOf({ current: 'x', places: [], links: [] }), TAB_TEXT.en)).toContain(
      'Nowhere known yet.',
    );
  });

  it('puts the hero inside a building in the building, and is told in Russian', () => {
    const inside = renderMap(viewOf({ ...TOWN, current: 'vault' }), TAB_TEXT.ru);

    expect(inside).toContain('class="block visited current locked"');
    expect(inside).toContain('комнат: 2');
    expect(inside).toContain('С</text>');
  });

  it('joins the streets that are walked on from each other by a lane, and no lane to a building', () => {
    expect(html.match(/<path class="lane walked"/g)).toHaveLength(1);
    expect(html).not.toContain('class="lane across"');
  });

  it('draws a way between streets that are not walked on from each other as a lane across', () => {
    const ring: Map = {
      current: 'a',
      places: [place('a', 'outdoor'), place('b', 'outdoor'), place('c', 'outdoor')],
      links: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    };

    const drawn = renderMap(viewOf(ring), TAB_TEXT.en);

    expect(drawn.match(/class="lane walked"/g)).toHaveLength(2);
    expect(drawn.match(/class="lane across"/g)).toHaveLength(1);
  });

  it('is part of the map tab, with the news below it', () => {
    const page = renderEvidenceBoard(viewOf(TOWN, { news: ['Prices rise.'] }));
    const tab = /id="map">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';

    expect(tab).toContain('class="graph paper-map"');
    expect(tab).toContain('Prices rise.');
  });

  it('matches its snapshot', () => {
    expect(html).toMatchSnapshot();
  });
});

describe('a place with hours, on the map', () => {
  const NIGHT = { fromMinute: 22 * 60, untilMinute: 2 * 60 };
  const EVENING = { fromMinute: 18 * 60, untilMinute: 23 * 60 };
  const HOURS: Map = {
    current: 'street',
    places: [
      place('street', 'outdoor'),
      place('bar', 'outdoor', null, {
        name: 'The Night Bar',
        visited: false,
        blocked: 'closed-hours',
        hours: NIGHT,
      }),
      place('market', 'outdoor', null, { name: 'Evening Market', hours: EVENING }),
    ],
    links: [
      { from: 'street', to: 'bar' },
      { from: 'street', to: 'market' },
    ],
  };

  it('marks a place that is shut at this hour with a sign, and says the hours in words', () => {
    const html = renderMap(viewOf(HOURS), TAB_TEXT.en);

    expect(html).toContain('class="street unvisited closed-hours"');
    expect(html).toContain('class="sign closed"');
    expect(html).toContain('The Night Bar (shut at this hour, only from 22:00 to 02:00)');
  });

  it('says the hours of a place that is open now, and draws no sign for it', () => {
    const html = renderMap(viewOf(HOURS), TAB_TEXT.en);

    expect(html).toContain('Evening Market (only from 18:00 to 23:00)');
    expect(html.match(/class="sign /g)).toHaveLength(1);
  });

  it('is told in the language of the run', () => {
    const html = renderMap(viewOf(HOURS), TAB_TEXT.ru);

    expect(html).toContain('закрыто в этот час');
    expect(html).toContain('только с 22:00 до 02:00');
  });
});
