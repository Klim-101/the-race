// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView, TurnView } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { layoutMap } from './board-map.js';
import { escapeHtml, renderEvidenceBoard } from './render-board.js';
import { truncate } from './escape-html.js';

type View = DetectiveRunView;

function viewOf(overrides: Partial<View> = {}): View {
  return {
    title: 'The Vanishing Wheel',
    premise: 'A wheel of cheese is gone.',
    locale: 'en',
    turn: 3,
    status: 'active',
    clock: { day: 2, minute: 545, totalDays: 3 },
    reputation: 7,
    condition: { nerves: 8, maxNerves: 10, sleepDebt: 1, maxSleepDebt: 10, conditions: [] },
    kit: [],
    supplies: [],
    pending: [],
    warnings: [],
    hero: {
      name: 'Mira',
      gender: 'female',
      archetype: 'detective',
      skills: { perception: 4, reasoning: 3 },
      background: 'police',
    },
    signal: null,
    signalEvents: [],
    hiddenTraitCount: 2,
    revealedTraits: [],
    setting: null,
    news: [],
    location: { id: 'market', name: 'Market', description: '', exits: [] },
    map: {
      current: 'market',
      places: [
        { id: 'market', name: 'Market', visited: true, blocked: null },
        { id: 'stall', name: 'Stall', visited: true, blocked: null },
        { id: 'cellar', name: 'Cellar', visited: false, blocked: 'locked' },
        { id: 'chapel', name: 'Chapel', visited: false, blocked: 'closed' },
      ],
      links: [
        { from: 'market', to: 'stall' },
        { from: 'market', to: 'cellar' },
        { from: 'stall', to: 'chapel' },
      ],
    },
    suspects: [
      { id: 'a', name: 'Anna', persona: 'Baker', place: { id: 'market', name: 'Market' }, statements: [] },
      { id: 'b', name: 'Boris', persona: 'Rival', place: { id: 'stall', name: 'Stall' }, statements: [] },
      { id: 'c', name: 'Cora', persona: 'Mayor', place: null, statements: [] },
    ],
    clues: [],
    insights: [],
    chronicle: { activeMinutesLeft: 600, events: [] },
    ...overrides,
  } as unknown as View;
}

/** The markup of one tab, to be read by itself. */
function tab(page: string, id: string): string {
  const match = new RegExp(`<section class="tab" id="${id}">([\\s\\S]*?)</section>`).exec(page);
  if (match?.[1] === undefined) throw new Error(`No tab ${id}.`);
  return match[1];
}

const FOUND = {
  clues: [
    { id: 'key', locationId: 'stall', description: 'A rusty key under the counter.', garbled: true },
    { id: 'flour', locationId: 'market', description: 'Flour on the cellar steps.', garbled: false },
  ],
  insights: [{ id: 'liar', insight: 'The baker lied about the flour.', clueIds: ['key', 'flour'] }],
};

describe('escapeHtml and truncate', () => {
  it('escapes every character that could open markup', () => {
    expect(escapeHtml(`<b onclick="x">&'`)).toBe('&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('cuts by characters, not by code units, and only when the text is too long', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('😀😀😀😀', 3)).toBe('😀😀…');
  });
});

describe('the page', () => {
  it('is one document with five tabs and a header, in a locked-down frame', () => {
    const page = renderEvidenceBoard(viewOf());

    expect(page).toContain('<title>Evidence board: The Vanishing Wheel</title>');
    expect(page).toContain('Day 2 of 3, 09:05');
    expect(page).toContain('Now at: <strong>Market</strong>');
    expect(page).toContain("default-src 'none'");
    for (const id of ['map', 'suspects', 'clues', 'chronicle', 'hero']) {
      expect(page).toContain(`<a href="#${id}">`);
      expect(page).toContain(`<section class="tab" id="${id}">`);
    }
    expect(page).not.toMatch(/<script|<link|<img|src=|url\(/);
  });

  it('keeps the tab through a reload with the address alone, shows the first by default and all when printed', () => {
    const page = renderEvidenceBoard(viewOf());

    expect(page).toContain('.tab:target{display:block}');
    expect(page).toContain('main:not(:has(.tab:target)) #map{display:block}');
    expect(page).toContain('main:has(#hero:target) nav a[href="#hero"]');
    expect(page).toContain('@media print{');
    expect(page).toContain('@media (prefers-color-scheme:dark)');
    expect(page).toContain('@media (max-width:560px)');
    expect(page).toContain('name="viewport"');
  });

  it('speaks Russian when the run does', () => {
    const page = renderEvidenceBoard(viewOf({ locale: 'ru', status: 'won' }));

    expect(page).toContain('<html lang="ru">');
    expect(page).toContain('Доска улик');
    expect(page).toContain('раскрыто');
    expect(page).toContain('Улики и связи');
    expect(page).toContain('Герой и снаряжение');
  });

  it('never lets case text become markup, in any tab', () => {
    const evil = '<script>alert(1)</script>';
    const page = renderEvidenceBoard(
      viewOf({
        title: evil,
        premise: evil,
        news: ['<img src=x onerror=alert(1)>'],
        clues: [{ id: 'k', locationId: 'stall', description: evil, garbled: false }],
        insights: [{ id: 'i', insight: evil, clueIds: ['k'] }],
        suspects: [
          {
            id: 'a',
            name: evil,
            persona: evil,
            place: null,
            statements: [{ day: 1, kind: 'alibi', text: evil }],
          },
        ],
        map: {
          current: 'x',
          places: [{ id: 'x', name: evil, visited: true, blocked: null }],
          links: [],
        },
        hero: {
          name: evil,
          gender: 'female',
          archetype: 'detective',
          skills: { [evil]: 1 },
          background: evil,
        },
        revealedTraits: [{ id: evil }],
        kit: [{ id: evil, nameKey: 'x', state: 'owned' }],
      } as unknown as Partial<View>),
    );

    expect(page).not.toContain('<script>');
    expect(page).not.toContain('<img');
    expect(page).toContain('&lt;script&gt;');
  });
});

describe('the map tab', () => {
  it('draws the known places, marks where the hero is, and shows shut and unvisited ways', () => {
    const map = tab(renderEvidenceBoard(viewOf()), 'map');

    expect(map).toContain('<svg class="map"');
    expect(map).toContain('class="node visited current"');
    expect(map).toContain('class="node unvisited locked"');
    expect(map).toContain('class="node unvisited closed"');
    expect(map).toContain('you are here');
    expect(map).toContain('locked');
    expect(map).toContain('closed');
    expect(map.match(/<line /g)).toHaveLength(3);
    expect(map).toMatchSnapshot();
  });

  it('marks the places where clues were found with how many', () => {
    const map = tab(renderEvidenceBoard(viewOf(FOUND)), 'map');

    expect(map).toContain('clues found here: 1');
    expect(map.match(/class="badge"/g)).toHaveLength(2);
  });

  it('shows an unvisited place that is not shut as such', () => {
    const map = tab(
      renderEvidenceBoard(
        viewOf({
          map: {
            current: 'market',
            places: [
              { id: 'market', name: 'Market', visited: true, blocked: null },
              { id: 'lane', name: 'Lane', visited: false, blocked: null },
            ],
            links: [{ from: 'market', to: 'lane' }],
          },
        }),
      ),
      'map',
    );

    expect(map).toContain('not yet visited');
    expect(map).not.toContain('locked');
  });

  it('cuts a long name on the picture and keeps it whole in the tooltip', () => {
    const name = 'The Extremely Long-Named Municipal Archive';
    const map = tab(
      renderEvidenceBoard(
        viewOf({
          map: { current: 'a', places: [{ id: 'a', name, visited: true, blocked: null }], links: [] },
        }),
      ),
      'map',
    );

    expect(map).toContain(`<title>${name} (you are here)</title>`);
    expect(map).toContain('The Extremely Long-N…');
  });

  it('says so when nothing is known, and puts the news in the tab', () => {
    const empty = tab(
      renderEvidenceBoard(viewOf({ map: { current: 'x', places: [], links: [] }, news: ['Prices rise.'] })),
      'map',
    );

    expect(empty).toContain('Nowhere known yet.');
    expect(empty).toContain('Meanwhile, in the Draft');
    expect(empty).toContain('Prices rise.');
    expect(tab(renderEvidenceBoard(viewOf()), 'map')).not.toContain('Meanwhile');
  });

  it('ignores a way to a place it does not know', () => {
    const map = tab(
      renderEvidenceBoard(
        viewOf({
          map: {
            current: 'market',
            places: [{ id: 'market', name: 'Market', visited: true, blocked: null }],
            links: [{ from: 'market', to: 'nowhere' }],
          },
        }),
      ),
      'map',
    );

    expect(map).not.toContain('<line ');
  });
});

describe('layoutMap', () => {
  const map = viewOf().map;

  it('puts the hero in the first column and each step away one column further', () => {
    const { nodes } = layoutMap(map);
    const x = (id: string): number | undefined => nodes.find(({ place }) => place.id === id)?.x;

    expect(x('market')).toBeLessThan(x('stall') ?? 0);
    expect(x('stall')).toBe(x('cellar'));
    expect(x('chapel')).toBeGreaterThan(x('stall') ?? 0);
  });

  it('is the same every time, and gives every place its own spot', () => {
    expect(layoutMap(map)).toEqual(layoutMap(map));
    const spots = layoutMap(map).nodes.map(({ x, y }) => `${String(x)},${String(y)}`);

    expect(new Set(spots).size).toBe(spots.length);
  });

  it('puts a place that cannot be reached from the hero one column beyond the last', () => {
    const { nodes } = layoutMap({
      current: 'a',
      places: [
        { id: 'a', name: 'A', visited: true, blocked: null },
        { id: 'b', name: 'B', visited: true, blocked: null },
        { id: 'island', name: 'Island', visited: false, blocked: null },
      ],
      links: [{ from: 'a', to: 'b' }],
    });
    const x = (id: string): number | undefined => nodes.find(({ place }) => place.id === id)?.x;

    expect(x('island')).toBeGreaterThan(x('b') ?? 0);
  });
});

describe('the suspects tab', () => {
  it('shows who they are, where they were last seen and what each has said, in order', () => {
    const suspects = tab(
      renderEvidenceBoard(
        viewOf({
          suspects: [
            {
              id: 'a',
              name: 'Anna',
              persona: 'Baker',
              place: { id: 'market', name: 'Market' },
              statements: [
                { day: 1, kind: 'alibi', text: 'I was at the oven all night.' },
                { day: 2, kind: 'conceded', text: 'Fine, I left at nine.' },
                { day: 2, kind: 'secret', text: 'I owe the miller money.' },
              ],
            },
            { id: 'c', name: 'Cora', persona: 'Mayor', place: null, statements: [] },
            {
              id: 'b',
              name: 'Boris',
              persona: 'Rival',
              place: { id: 'stall', name: 'Stall' },
              statements: [],
            },
          ],
        }),
      ),
      'suspects',
    );

    expect(suspects).toContain('Last seen: right here');
    expect(suspects).toContain('Last seen: Stall');
    expect(suspects).toContain('Last seen: anywhere, apparently');
    expect(suspects).toContain('day 1 · alibi');
    expect(suspects).toContain('day 2 · gave ground');
    expect(suspects).toContain('day 2 · let a secret out');
    expect(suspects.indexOf('oven')).toBeLessThan(suspects.indexOf('nine'));
    expect(suspects).toContain('Nothing said yet.');
    expect(suspects).toMatchSnapshot();
  });
});

describe('the clues and links tab', () => {
  it('joins each conclusion to the clues it was drawn from and each clue to the place it was found', () => {
    const clues = tab(renderEvidenceBoard(viewOf(FOUND)), 'clues');

    expect(clues).toContain('<svg class="links"');
    expect(clues.match(/class="conclusion-link"/g)).toHaveLength(2);
    expect(clues.match(/class="place-link"/g)).toHaveLength(2);
    expect(clues).toContain('read badly');
    expect(clues).toContain('The baker lied about the flour.');
    expect(clues).toMatchSnapshot();
  });

  it('draws nothing that says what a clue points at: no suspect is in the picture', () => {
    const clues = tab(renderEvidenceBoard(viewOf(FOUND)), 'clues');
    const picture = /<svg class="links"[\s\S]*?<\/svg>/.exec(clues)?.[0] ?? '';

    for (const name of ['Anna', 'Boris', 'Cora']) expect(picture).not.toContain(name);
  });

  it('says so when there is nothing to connect, and keeps the empty notes', () => {
    const clues = tab(renderEvidenceBoard(viewOf()), 'clues');

    expect(clues).toContain('Nothing to connect yet.');
    expect(clues).toContain('Nothing on the board yet');
    expect(clues).toContain('No conclusions yet');
    expect(clues).not.toContain('<svg');
  });

  it('names a place it has no name for by its id, and skips a conclusion drawn from a clue it cannot find', () => {
    const clues = tab(
      renderEvidenceBoard(
        viewOf({
          clues: [{ id: 'k', locationId: 'gone', description: 'Flour.', garbled: false }],
          insights: [{ id: 'i', insight: 'Odd.', clueIds: ['k', 'missing'] }],
        }),
      ),
      'clues',
    );

    expect(clues).toContain('gone</span>');
    expect(clues.match(/class="conclusion-link"/g)).toHaveLength(1);
  });

  it('shows conclusions even when no clue is listed', () => {
    const clues = tab(
      renderEvidenceBoard(viewOf({ insights: [{ id: 'i', insight: 'Odd.', clueIds: ['x'] }] })),
      'clues',
    );

    expect(clues).toContain('<svg class="links"');
    expect(clues).not.toContain('conclusion-link');
  });
});

const TURNS: TurnView[] = [
  { turn: 9, day: 2, minute: 600, kind: 'accuse' },
  { turn: 8, day: 2, minute: 590, kind: 'use', item: 'coffee' },
  { turn: 7, day: 2, minute: 580, kind: 'reread', clue: 'A rusty key under the counter.' },
  { turn: 6, day: 2, minute: 570, kind: 'deduce', result: 'nothing', insight: null },
  { turn: 5, day: 2, minute: 560, kind: 'deduce', result: 'already-known', insight: null },
  {
    turn: 4,
    day: 2,
    minute: 550,
    kind: 'deduce',
    result: 'insight',
    insight: 'The baker hid the flour <b>.',
  },
  { turn: 3, day: 1, minute: 1100, kind: 'interrogate', suspect: 'Anna', approach: 'pressure', showed: 2 },
  { turn: 2, day: 1, minute: 700, kind: 'search', found: 1 },
  { turn: 1, day: 1, minute: 500, kind: 'rest' },
  { turn: 0, day: 1, minute: 490, kind: 'look', found: 3 },
  { turn: -1, day: 1, minute: 480, kind: 'move', to: 'Stall', entered: true },
  { turn: -2, day: 1, minute: 470, kind: 'move', to: 'Cellar', entered: false },
];

describe('the chronicle tab', () => {
  it('shows the day and the working time left', () => {
    const chronicle = tab(
      renderEvidenceBoard(viewOf({ chronicle: { activeMinutesLeft: 1000, events: [] } })),
      'chronicle',
    );

    expect(chronicle).toContain('Now: Day 2 / 3, 09:05');
    expect(chronicle).toContain('Working time left: <strong>16 h 40 min</strong>');
  });

  it('lists what the world has done with the day of each, and says so when nothing has happened', () => {
    const quiet = tab(renderEvidenceBoard(viewOf()), 'chronicle');
    const eventful = tab(
      renderEvidenceBoard(
        viewOf({
          chronicle: {
            activeMinutesLeft: 600,
            events: [
              { day: 1, text: 'The market closes early.' },
              { day: 2, text: 'The mayor <resigns>.' },
            ],
          },
        }),
      ),
      'chronicle',
    );

    expect(quiet).toContain('Nothing yet.');
    expect(eventful).toContain('Day 1</span> The market closes early.');
    expect(eventful).toContain('Day 2</span> The mayor &lt;resigns&gt;.');
    expect(eventful).not.toContain('Nothing yet.');
  });

  it('lists what is still open from the public view: places, ways that are shut, people, clues to reread', () => {
    const chronicle = tab(
      renderEvidenceBoard(
        viewOf({
          map: {
            current: 'market',
            places: [
              { id: 'market', name: 'Market', visited: true, blocked: null },
              { id: 'lane', name: 'Lane', visited: false, blocked: null },
              { id: 'cellar', name: 'Cellar', visited: false, blocked: 'locked' },
              { id: 'chapel', name: 'Chapel', visited: false, blocked: 'closed' },
            ],
            links: [],
          },
          clues: [
            { id: 'k', locationId: 'market', description: 'A rusty key.', garbled: true },
            { id: 'f', locationId: 'market', description: 'Flour.', garbled: false },
          ],
        }),
      ),
      'chronicle',
    );

    for (const line of [
      'Not yet visited: Lane',
      'Locked: Cellar',
      'Closed for now: Chapel',
      'Not yet questioned: Anna',
      'Not yet questioned: Cora',
      'To be read again: A rusty key.',
    ]) {
      expect(chronicle).toContain(line);
    }
    expect(chronicle).not.toContain('To be read again: Flour');
  });

  it('says so when nothing is open', () => {
    const asked = (name: string) => ({
      id: name,
      name,
      persona: 'x',
      place: null,
      statements: [{ day: 1, kind: 'alibi', text: 'Here.' }],
    });
    const chronicle = tab(
      renderEvidenceBoard(
        viewOf({
          map: {
            current: 'market',
            places: [{ id: 'market', name: 'Market', visited: true, blocked: null }],
            links: [],
          },
          suspects: [asked('Anna')],
        } as Partial<View>),
      ),
      'chronicle',
    );

    expect(chronicle).toContain('Every door tried, everyone asked.');
  });

  it("tells each kind of turn in the player's own terms, newest first, with the day and the hour", () => {
    const chronicle = tab(renderEvidenceBoard(viewOf(), TURNS), 'chronicle');

    for (const line of [
      'Made the accusation',
      'Took coffee',
      'Read again: A rusty key under the counter.',
      'Linked clues that led nowhere',
      'Reached a conclusion that was already drawn',
      'Concluded: The baker hid the flour &lt;b&gt;.',
      'Questioned Anna, with pressure, showing 2 clues',
      'Searched the place: found 1',
      'Rested for the night',
      'Looked around: found 3',
      'Went to Stall',
      'Tried to get into Cellar and could not',
      'Day 1 · 18:20</span>',
    ]) {
      expect(chronicle, line).toContain(line);
    }
    expect(chronicle.indexOf('Made the accusation')).toBeLessThan(chronicle.indexOf('Went to Stall'));
    expect(chronicle).toMatchSnapshot();
  });

  it('does not fail on a conclusion whose text is gone', () => {
    const chronicle = tab(
      renderEvidenceBoard(viewOf(), [
        { turn: 1, day: 1, minute: 500, kind: 'deduce', result: 'insight', insight: null },
      ]),
      'chronicle',
    );

    expect(chronicle).toContain('Concluded: </li>');
  });

  it('says so when there is no turn yet', () => {
    expect(tab(renderEvidenceBoard(viewOf()), 'chronicle')).toContain('No turns yet.');
  });

  it('is written in the language of the run', () => {
    const chronicle = tab(
      renderEvidenceBoard(
        viewOf({
          locale: 'ru',
          chronicle: { activeMinutesLeft: 125, events: [{ day: 2, text: 'Рынок закрылся.' }] },
        }),
        TURNS,
      ),
      'chronicle',
    );

    expect(chronicle).toContain('Осталось рабочего времени: <strong>2 ч 5 мин</strong>');
    expect(chronicle).toContain('Пошли в Stall');
    expect(chronicle).toContain('Опросили: Anna, нажимом, показано улик: 2');
    expect(chronicle).toContain('Приняли: кофе');
    expect(chronicle).toContain('Ещё не опрошены: Anna');
    expect(chronicle).toContain('День 2</span> Рынок закрылся.');
  });

  it('marks nothing as false or contradictory, in any language', () => {
    for (const locale of ['en', 'ru'] as const) {
      const chronicle = tab(
        renderEvidenceBoard(
          viewOf({
            locale,
            suspects: [
              {
                id: 'a',
                name: 'Anna',
                persona: 'x',
                place: null,
                statements: [
                  { day: 1, kind: 'alibi', text: 'At the oven.' },
                  { day: 2, kind: 'conceded', text: 'Left at nine.' },
                ],
              },
            ],
          }),
          TURNS,
        ),
        'chronicle',
      );

      expect(chronicle).not.toMatch(/contradict|false|\blie[sd]?\b|противореч|ложь|лжёт|солгал/i);
    }
  });
});

describe('the hero tab', () => {
  it('shows the detective, how they hold up and what they carry', () => {
    const hero = tab(
      renderEvidenceBoard(
        viewOf({
          signal: { id: 'burnt-out', voice: 'flat-dry', gift: 'x', cost: 'y' },
          condition: {
            nerves: 4,
            maxNerves: 10,
            sleepDebt: 3,
            maxSleepDebt: 10,
            conditions: [
              { id: 'exhausted', minutesLeft: null },
              { id: 'drunk', minutesLeft: 90 },
            ],
          },
          warnings: ['low-reputation'],
          kit: [
            { id: 'phone', nameKey: 'gear.phone', state: 'owned' },
            { id: 'picks', nameKey: 'gear.picks', state: 'lost' },
          ],
          supplies: [{ id: 'coffee', nameKey: 'consumable.coffee', count: 2 }],
          pending: [
            { source: 'coffee', meter: 'sleepDebt', delta: -1, inMinutes: 30 },
            { source: 'alcohol', meter: 'nerves', delta: 2, inMinutes: null },
          ],
          revealedTraits: [{ id: 'night-owl' }, { id: 'an-unlisted-trait' }],
        } as unknown as Partial<View>),
      ),
      'hero',
    );

    expect(hero).toContain('<strong>Mira</strong>');
    expect(hero).toContain('Was once: a police officer · Character: burnt out');
    expect(hero).toContain('perception: 4, reasoning: 3');
    expect(hero).toContain('<meter min="0" max="10" value="7">');
    expect(hero).toContain('4 / 10');
    expect(hero).toContain('exhausted <span class="tag">until the night</span>');
    expect(hero).toContain('drunk <span class="tag">90 min left</span>');
    expect(hero).toContain('reputation is low');
    expect(hero).toContain('phone</li>');
    expect(hero).toContain('lock picks <span class="warn">(lost)</span>');
    expect(hero).toContain('coffee ×2');
    expect(hero).toContain('coffee: -1 sleep debt <span class="tag">in 30 min</span>');
    expect(hero).toContain('a drink: +2 nerves <span class="tag">at night</span>');
    expect(hero).toContain('a night owl');
    expect(hero).toContain('an-unlisted-trait');
    expect(hero).toContain('Still hidden: 2');
    expect(hero).toMatchSnapshot();
  });

  it('says so when there is nothing to show', () => {
    const hero = tab(renderEvidenceBoard(viewOf()), 'hero');

    expect(hero).toContain('nothing in particular');
    expect(hero.match(/<p class="empty">nothing<\/p>/g)).toHaveLength(2);
    expect(hero).toContain('None revealed yet.');
    expect(hero).not.toContain('On its way');
    expect(hero).not.toContain('Climate');
  });

  it('is written in the language of the run', () => {
    const hero = tab(
      renderEvidenceBoard(
        viewOf({
          locale: 'ru',
          signal: { id: 'in-love', voice: 'x', gift: 'x', cost: 'y' },
          revealedTraits: [{ id: 'hothead' }],
          pending: [{ source: 'coffee', meter: 'nerves', delta: 1, inMinutes: 15 }],
        } as unknown as Partial<View>),
      ),
      'hero',
    );

    expect(hero).toContain('Раньше: полицейский · Характер: влюблён');
    expect(hero).toContain('вспыльчив');
    expect(hero).toContain('через 15 мин');
    expect(hero).toContain('Ещё скрыто: 2');
  });
});

describe('the climate in the hero tab', () => {
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

  it('gives the country, the zone, each season with its weather and the hazards', () => {
    const hero = tab(renderEvidenceBoard(viewOf({ setting } as Partial<View>)), 'hero');

    expect(hero).toContain('<h3>Climate</h3>');
    expect(hero).toContain('The case is set in: <strong>Val&lt;script&gt;dmark</strong>');
    expect(hero).toContain('Zone: subarctic');
    expect(hero).toContain('<li>winter: snow</li>');
    expect(hero).toContain('<li>summer: mild</li>');
    expect(hero).toContain('Weather to plan around: blizzards, ice on the roads');
    expect(hero).not.toContain('<script>');
  });

  it('is written in the language of the run, and says so when there is no hazard', () => {
    const calm = { ...setting, climate: { ...setting.climate, hazards: [] } };
    const hero = tab(renderEvidenceBoard(viewOf({ locale: 'ru', setting: calm } as Partial<View>)), 'hero');

    expect(hero).toContain('<h3>Климат</h3>');
    expect(hero).toContain('<li>зима: снег</li>');
    expect(hero).toContain('Погода, с которой придётся считаться: ничего особенного');
  });
});
