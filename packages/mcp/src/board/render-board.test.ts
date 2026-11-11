// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView, TurnView } from '@the-race/engine';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SCRIPT, escapeHtml, renderEvidenceBoard } from './render-board.js';
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
    placeParts: [],
    toolSlots: { total: 1, used: 0 },
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
    weather: null,
    history: { finds: [], shown: [], links: [] },
    signal: null,
    signalEvents: [],
    hiddenTraitCount: 2,
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
        {
          id: 'cellar',
          name: 'Cellar',
          visited: false,
          blocked: 'locked',
          hours: null,
          lead: null,
          exposure: 'outdoor',
          building: null,
        },
        {
          id: 'chapel',
          name: 'Chapel',
          visited: false,
          blocked: 'closed',
          hours: null,
          lead: null,
          exposure: 'outdoor',
          building: null,
        },
      ],
      links: [
        { from: 'market', to: 'stall' },
        { from: 'market', to: 'cellar' },
        { from: 'stall', to: 'chapel' },
      ],
    },
    suspects: [
      {
        id: 'a',
        name: 'Anna',
        persona: 'Baker',
        mood: 'calm',
        closed: false,
        talksAgain: null,
        cleared: false,
        claims: [],
        place: { id: 'market', name: 'Market' },
        statements: [],
      },
      {
        id: 'b',
        name: 'Boris',
        persona: 'Rival',
        mood: 'calm',
        closed: false,
        talksAgain: null,
        cleared: false,
        claims: [],
        place: { id: 'stall', name: 'Stall' },
        statements: [],
      },
      {
        id: 'c',
        name: 'Cora',
        persona: 'Mayor',
        mood: 'calm',
        closed: false,
        place: null,
        claims: [],
        statements: [],
      },
    ],
    clues: [],
    openLinks: [],
    insights: [],
    leads: [],
    chronicle: { activeMinutesLeft: 600, minutesToDeadline: null, deadline: null, events: [] },
    ...overrides,
  } as unknown as View;
}

/** The markup of one tab, to be read by itself. */
function tab(page: string, id: string): string {
  const match = new RegExp(`<section class="tab(?: notebook)?" id="${id}">([\\s\\S]*?)</section>`).exec(page);
  if (match?.[1] === undefined) throw new Error(`No tab ${id}.`);
  return match[1];
}

const FOUND = {
  clues: [
    {
      id: 'key',
      locationId: 'stall',
      description: 'A rusty key under the counter.',
      garbled: true,
      witness: null,
      bearsOn: [],
      number: 'MIRA-01',
    },
    {
      id: 'flour',
      locationId: 'market',
      description: 'Flour on the cellar steps.',
      garbled: false,
      witness: null,
      bearsOn: [],
      number: 'MIRA-02',
    },
  ],
  insights: [
    { id: 'liar', insight: 'The baker lied about the flour.', clueIds: ['key', 'flour'], clears: null },
  ],
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
  it('is one document with six tabs and a header, in a locked-down frame', () => {
    const page = renderEvidenceBoard(viewOf());

    expect(page).toContain('<title>Evidence board: The Vanishing Wheel</title>');
    expect(page).toContain('Day 2 of 3, 09:05');
    expect(page).toContain('Now at: <strong>Market</strong>');
    expect(page).toContain("default-src 'none'");
    for (const id of ['board', 'suspects', 'clues', 'map', 'chronicle', 'hero']) {
      expect(page).toContain(`<a href="#${id}">`);
      expect(page).toMatch(new RegExp(`<section class="tab(?: notebook)?" id="${id}">`));
    }
    expect(page).not.toMatch(/<link|<img|src=|url\(/);
  });

  it('holds one small script, whose hash is the only script the frame allows', () => {
    const page = renderEvidenceBoard(viewOf());
    const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];

    expect(scripts).toHaveLength(1);
    const hash = createHash('sha256')
      .update(scripts[0]?.[1] ?? '')
      .digest('base64');
    expect(page).toContain(`script-src 'sha256-${hash}'`);
    expect(page).not.toMatch(/script-src[^"]*unsafe/);
    // It only picks: no network, no storage, no eval.
    expect(SCRIPT).not.toMatch(
      /fetch|XMLHttp|localStorage|sessionStorage|eval|innerHTML|document\.write|import\(/,
    );
  });

  it('keeps the tab through a reload with the address alone, shows the first by default and all when printed', () => {
    const page = renderEvidenceBoard(viewOf());

    expect(page).toContain('.tab:target{display:block}');
    expect(page).toContain('main:not(:has(.tab:target)) #board{display:block}');
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
    expect(page).toContain('Сопоставление');
    expect(page).toContain('Выводы');
    expect(page).toContain('Досье');
    expect(page).toContain('Герой и снаряжение');
  });

  it('never lets case text become markup, in any tab', () => {
    const evil = '<script>alert(1)</script>';
    const page = renderEvidenceBoard(
      viewOf({
        title: evil,
        premise: evil,
        news: ['<img src=x onerror=alert(1)>'],
        clues: [
          {
            id: 'k',
            locationId: 'stall',
            description: evil,
            garbled: false,
            witness: null,
            bearsOn: [],
            number: 'MIRA-03',
          },
        ],
        insights: [{ id: 'i', insight: evil, clueIds: ['k'] }],
        suspects: [
          {
            id: 'a',
            name: evil,
            persona: evil,
            mood: 'calm',
            closed: false,
            talksAgain: null,
            cleared: false,
            claims: [],
            place: null,
            statements: [{ day: 1, kind: 'alibi', text: evil }],
          },
        ],
        map: {
          current: 'x',
          places: [
            {
              id: 'x',
              name: evil,
              visited: true,
              blocked: null,
              hours: null,
              lead: null,
              exposure: 'outdoor',
              building: null,
            },
          ],
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
        kit: [{ id: evil, nameKey: 'x', state: 'owned', removes: [], charges: null }],
      } as unknown as Partial<View>),
    );

    expect(page).not.toContain(evil);
    expect(page.match(/<script>/g)).toHaveLength(1);
    expect(page).not.toContain('<img');
    expect(page).toContain('&lt;script&gt;');
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
              mood: 'calm',
              closed: false,
              talksAgain: null,
              cleared: false,
              claims: [],
              place: { id: 'market', name: 'Market' },
              statements: [
                { day: 1, kind: 'alibi', text: 'I was at the oven all night.' },
                { day: 2, kind: 'conceded', text: 'Fine, I left at nine.' },
                { day: 2, kind: 'secret', text: 'I owe the miller money.' },
              ],
            },
            {
              id: 'c',
              name: 'Cora',
              persona: 'Mayor',
              mood: 'cornered',
              closed: true,
              talksAgain: { day: 2, minute: 600 },
              cleared: false,
              claims: [],
              place: null,
              statements: [],
            },
            {
              id: 'b',
              name: 'Boris',
              persona: 'Rival',
              mood: 'calm',
              closed: false,
              talksAgain: null,
              cleared: false,
              claims: [],
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
    expect(suspects).toContain('<span class="tag">day 1</span>');
    expect(suspects).toContain('<span class="tag">alibi</span>');
    // A lie that fell is struck through; the alibi and the secret are not.
    expect(suspects).toContain('<s>Fine, I left at nine.</s>');
    expect(suspects).not.toContain('<s>I was at the oven all night.</s>');
    expect(suspects).toContain('<span class="tag">let a secret out</span>');
    expect(suspects).toContain('will not talk until day 2, 10:00');
    expect(suspects.indexOf('oven')).toBeLessThan(suspects.indexOf('nine'));
    expect(suspects).toContain('Nothing said yet.');
    expect(suspects).toMatchSnapshot();
  });
});

describe('the clues and conclusions tabs', () => {
  it('says on each conclusion which clues it was drawn from, with the whole text of each', () => {
    const tree = tab(renderEvidenceBoard(viewOf(FOUND)), 'insights');
    const clues = tab(renderEvidenceBoard(viewOf(FOUND)), 'clues');

    expect(tree).toContain(
      '<span class="num">MIRA-01</span><span class="t">A rusty key under the counter.</span>',
    );
    expect(tree).toContain(
      '<span class="num">MIRA-02</span><span class="t">Flour on the cellar steps.</span>',
    );
    expect(tree).toContain('The baker lied about the flour.');
    expect(clues).toContain('read badly');
  });

  it('has no graph: the board and the notebooks already say how it hangs together', () => {
    for (const id of ['clues', 'insights']) {
      expect(tab(renderEvidenceBoard(viewOf(FOUND)), id)).not.toContain('<svg');
    }
  });

  it('says so when there is nothing to connect, and keeps the empty notes', () => {
    const page = renderEvidenceBoard(viewOf());

    expect(tab(page, 'clues')).toContain('Nothing on the board yet');
    expect(tab(page, 'insights')).toContain('No link has been tried yet.');
  });

  it('shows a clue it cannot find under a conclusion by its id, and the place a clue has no name for', () => {
    const page = renderEvidenceBoard(
      viewOf({
        clues: [
          {
            id: 'k',
            locationId: 'gone',
            description: 'Flour.',
            garbled: false,
            witness: null,
            bearsOn: [],
            number: 'MIRA-03',
          },
        ],
        insights: [
          { id: 'i', insight: 'Odd.', clueIds: ['k', 'missing'], clears: null },
          { id: 'j', insight: 'Odder.', clueIds: ['missing'], clears: null },
        ],
      }),
    );
    const tree = tab(page, 'insights');

    expect(tab(page, 'clues')).toContain('gone</th>');
    expect(tree).toContain('<span class="num">missing</span><span class="t">missing</span>');
    expect(tree).toContain('Odd.');
    expect(tree).toContain('Odder.');
  });

  it('shows conclusions even when no clue is listed', () => {
    const page = renderEvidenceBoard(
      viewOf({ insights: [{ id: 'i', insight: 'Odd.', clueIds: ['x'], clears: null }] }),
    );

    expect(tab(page, 'insights')).toContain('Odd.');
    expect(tab(page, 'clues')).toContain('Nothing on the board yet');
  });

  it('never cuts a clue short with an ellipsis: not in a link tried, not on a person, not on a conclusion', () => {
    const long = 'The badge ledger shows that the badge was issued at 22:10 to somebody who never signed.';
    const page = renderEvidenceBoard(
      viewOf({
        clues: [
          {
            id: 'ledger',
            locationId: 'stall',
            description: long,
            garbled: false,
            witness: null,
            bearsOn: [],
            number: 'MIRA-04',
          },
          {
            id: 'envelope',
            locationId: 'market',
            description: `${long} Second.`,
            garbled: false,
            witness: null,
            bearsOn: [],
            number: 'MIRA-05',
          },
        ],
        insights: [{ id: 'i', insight: 'Odd.', clueIds: ['ledger', 'envelope'], clears: null }],
        history: {
          finds: [],
          shown: [{ turn: 3, clueId: 'ledger', suspectId: 'a', effect: 'no-effect' }],
          links: [{ turn: 4, clueIds: ['ledger', 'envelope'], result: 'insight' }],
        },
      }),
    );

    expect(tab(page, 'clues')).toContain(long);
    expect(tab(page, 'insights')).toContain(`<span class="t">${long}</span>`);
    // A person's page names the clue by its number; the whole text is a click away, on the clue's own card.
    expect(tab(page, 'suspects')).toContain('MIRA-04</span> no effect');
    for (const id of ['clues', 'insights', 'suspects']) expect(tab(page, id)).not.toContain('…');
  });
});

describe('one look for the whole page', () => {
  const page = renderEvidenceBoard(viewOf(FOUND));

  it('paints the notebooks from the page variables, so the dark theme tints the paper too', () => {
    expect(page).toContain('--paper:#2a2622');
    expect(page).toContain('background-color:var(--paper)');
    expect(page).not.toContain('#fffef6;background');
  });

  it('keeps a notebook to a readable column', () => {
    expect(page).toContain('.notebook{max-width:640px');
  });
});

const TURNS: TurnView[] = [
  { turn: 17, day: 2, minute: 600, kind: 'accuse', shortfall: null },
  { turn: 16, day: 2, minute: 590, kind: 'use', item: 'coffee' },
  { turn: 15, day: 2, minute: 580, kind: 'reread', clue: 'A rusty key under the counter.' },
  { turn: 14, day: 2, minute: 570, kind: 'deduce', result: 'nothing', insight: null },
  { turn: 13, day: 2, minute: 560, kind: 'deduce', result: 'already-known', insight: null },
  {
    turn: 12,
    day: 2,
    minute: 550,
    kind: 'deduce',
    result: 'insight',
    insight: 'The baker hid the flour <b>.',
  },
  { turn: 11, day: 1, minute: 1100, kind: 'interrogate', suspect: 'Anna', approach: 'pressure', showed: 2 },
  { turn: 10, day: 1, minute: 700, kind: 'search', found: 1 },
  { turn: 9, day: 1, minute: 500, kind: 'rest' },
  { turn: 8, day: 1, minute: 495, kind: 'sit', restored: 1 },
  { turn: 7, day: 1, minute: 493, kind: 'ask', succeeded: true },
  { turn: 6, day: 1, minute: 492, kind: 'ask', succeeded: false },
  { turn: 5, day: 1, minute: 491, kind: 'study', clue: 'A <b>stamp</b>', succeeded: true },
  { turn: 4, day: 1, minute: 490, kind: 'study', clue: 'A stamp', succeeded: false },
  { turn: 3, day: 1, minute: 490, kind: 'look', found: 3 },
  { turn: 2, day: 1, minute: 480, kind: 'move', to: 'Stall', entered: true },
  { turn: 1, day: 1, minute: 470, kind: 'move', to: 'Cellar', entered: false },
];

describe('what the hero took, in the chronicle', () => {
  const took: TurnView[] = [
    { turn: 2, day: 1, minute: 500, kind: 'take', how: 'sold', itemKind: 'supply', item: 'sedative' },
    { turn: 1, day: 1, minute: 490, kind: 'take', how: 'found', itemKind: 'tool', item: 'crowbar' },
  ];

  it('says what was found and what was bought, a tool or a supply, by its name', () => {
    const chronicle = tab(renderEvidenceBoard(viewOf(), took), 'chronicle');

    expect(chronicle).toContain('Bought: ');
    expect(chronicle).toContain('Found and took: crowbar');
  });

  it('is told in the language of the run', () => {
    const chronicle = tab(renderEvidenceBoard(viewOf({ locale: 'ru' }), took), 'chronicle');

    expect(chronicle).toContain('Купил: ');
    expect(chronicle).toContain('Нашёл и взял: ');
  });
});

describe('the chronicle tab', () => {
  it('shows the day and the working time left', () => {
    const chronicle = tab(
      renderEvidenceBoard(
        viewOf({
          chronicle: { activeMinutesLeft: 1000, minutesToDeadline: null, deadline: null, events: [] },
        }),
      ),
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
            minutesToDeadline: null,
            deadline: null,
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
                id: 'lane',
                name: 'Lane',
                visited: false,
                blocked: null,
                hours: null,
                lead: null,
                exposure: 'outdoor',
                building: null,
              },
              {
                id: 'cellar',
                name: 'Cellar',
                visited: false,
                blocked: 'locked',
                hours: null,
                lead: null,
                exposure: 'outdoor',
                building: null,
              },
              {
                id: 'chapel',
                name: 'Chapel',
                visited: false,
                blocked: 'closed',
                hours: null,
                lead: null,
                exposure: 'outdoor',
                building: null,
              },
            ],
            links: [],
          },
          clues: [
            {
              id: 'k',
              locationId: 'market',
              description: 'A rusty key.',
              garbled: true,
              witness: null,
              bearsOn: [],
              number: 'MIRA-03',
            },
            {
              id: 'f',
              locationId: 'market',
              description: 'Flour.',
              garbled: false,
              witness: null,
              bearsOn: [],
              number: 'MIRA-06',
            },
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
      mood: 'calm',
      closed: false,
      talksAgain: null,
      cleared: false,
      claims: [],
      place: null,
      statements: [{ day: 1, kind: 'alibi', text: 'Here.' }],
    });
    const chronicle = tab(
      renderEvidenceBoard(
        viewOf({
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
            ],
            links: [],
          },
          suspects: [asked('Anna')],
        } as Partial<View>),
      ),
      'chronicle',
    );

    expect(chronicle).toContain('Every door tried, everyone asked.');
  });

  it("tells each kind of turn in the player's own terms, oldest first on its day, with the hour", () => {
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
      '18:20</span>',
    ]) {
      expect(chronicle, line).toContain(line);
    }
    expect(chronicle.indexOf('Went to Stall')).toBeLessThan(chronicle.indexOf('Made the accusation'));
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
          chronicle: {
            activeMinutesLeft: 125,
            minutesToDeadline: null,
            deadline: null,
            events: [{ day: 2, text: 'Рынок закрылся.' }],
          },
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
                mood: 'calm',
                closed: false,
                talksAgain: null,
                cleared: false,
                claims: [],
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
            {
              id: 'phone',
              nameKey: 'gear.phone',
              state: 'owned',
              removes: ['dark'],
              charges: null,
              lawful: true,
              suitcase: false,
            },
            {
              id: 'picks',
              nameKey: 'gear.picks',
              state: 'lost',
              removes: ['locked'],
              charges: null,
              lawful: true,
              suitcase: false,
            },
            {
              id: 'powder',
              nameKey: 'gear.powder',
              state: 'owned',
              removes: ['trace'],
              charges: 2,
              lawful: true,
              suitcase: false,
            },
            {
              id: 'test-kit',
              nameKey: 'gear.test-kit',
              state: 'spent',
              removes: ['trace'],
              charges: 0,
              lawful: true,
              suitcase: false,
            },
            {
              id: 'knife',
              nameKey: 'gear.knife',
              state: 'broken',
              removes: ['soft'],
              charges: null,
              lawful: true,
              suitcase: false,
            },
          ],
          supplies: [{ id: 'coffee', nameKey: 'consumable.coffee', count: 2, limit: 2 }],
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
    expect(hero).toContain('phone<br><span class="tag">gets past: dark</span>');
    expect(hero).toContain('lock picks <span class="warn">(lost)</span>');
    expect(hero).toContain('fingerprint powder <span class="tag">left: 2</span>');
    expect(hero).toContain('test kit <span class="warn">(used up)</span>');
    expect(hero).toContain('pocket knife <span class="warn">(broken)</span>');
    expect(hero).toContain('coffee ×2 <span class="tag">/ 2</span>');
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
    expect(hero.match(/<p class="empty">nothing<\/p>/g)).toHaveLength(1);
    expect(hero).toContain('a free slot');
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

describe('the kit in the hero tab', () => {
  const piece = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    nameKey: `gear.${id}`,
    state: 'owned',
    removes: [],
    charges: null,
    lawful: true,
    suitcase: false,
    ...extra,
  });
  const kitTab = (view: Record<string, unknown>) => tab(renderEvidenceBoard(viewOf(view)), 'hero');

  it('lays out the pockets, the suitcase with its slots taken and free, and what each piece gets past', () => {
    const hero = kitTab({
      kit: [
        piece('phone', { removes: ['dark'] }),
        piece('crowbar', { suitcase: true, lawful: false, removes: ['locked', 'sealed'] }),
        piece('powder', { suitcase: true, charges: 1, removes: ['trace'] }),
      ],
      toolSlots: { total: 3, used: 2 },
      supplies: [{ id: 'coffee', nameKey: 'consumable.coffee', count: 1, limit: 2 }],
    });

    expect(hero).toContain('In the pockets');
    expect(hero).toContain('The suitcase: 2 of 3 slots');
    expect(hero.match(/class="card slot"/g)).toHaveLength(2);
    expect(hero.match(/class="card slot empty-card"/g)).toHaveLength(1);
    expect(hero).toContain('crowbar <span class="warn">not within the law</span>');
    expect(hero).toContain('gets past: locked, sealed');
    expect(hero).toContain('fingerprint powder <span class="tag">left: 1</span>');
    expect(hero).toContain('coffee ×1 <span class="tag">/ 2</span>');
    expect(hero).toMatchSnapshot();
  });

  it('marks a piece used up, broken or lost where it sits, and shows a free slot only when there is one', () => {
    const hero = kitTab({
      kit: [
        piece('picks', { suitcase: true, state: 'broken' }),
        piece('knife', { suitcase: true, state: 'lost' }),
      ],
      toolSlots: { total: 2, used: 2 },
      // A supply the pockets do not limit shows its count and no limit.
      supplies: [{ id: 'coffee', nameKey: 'consumable.coffee', count: 3, limit: null }],
    });

    expect(hero).toContain('coffee ×3</li>');
    expect(hero).toContain('lock picks <span class="warn">(broken)</span>');
    expect(hero).toContain('pocket knife <span class="warn">(lost)</span>');
    expect(hero).not.toContain('empty-card');
  });

  it('names the tool of the kit for each part noticed and not searched, and says when there is none', () => {
    const hero = kitTab({
      kit: [
        piece('picks', { removes: ['locked'], suitcase: true }),
        piece('mirror', { removes: ['dark'], state: 'lost' }),
      ],
      toolSlots: { total: 1, used: 1 },
      map: { current: 'a', places: [{ id: 'a', name: 'The office', visited: true }], links: [] },
      placeParts: [
        {
          placeId: 'a',
          parts: [
            { id: 'safe', name: 'The safe', obstacle: 'locked', searched: false, gave: [] },
            { id: 'shelf', name: 'The dark shelf', obstacle: 'dark', searched: false, gave: [] },
            { id: 'desk', name: 'The desk', obstacle: null, searched: false, gave: [] },
            { id: 'bin', name: 'The bin', obstacle: 'locked', searched: true, gave: [] },
          ],
        },
        {
          placeId: 'unlisted',
          parts: [{ id: 'x', name: 'A box', obstacle: 'sealed', searched: false, gave: [] }],
        },
      ],
    });

    expect(hero).toContain('The tool for each part noticed');
    expect(hero).toContain(
      'The office: The safe <span class="tag">locked · tool in the kit: lock picks</span>',
    );
    expect(hero).toContain(
      'The office: The dark shelf <span class="tag">dark · no tool for it in the kit</span>',
    );
    expect(hero).toContain('unlisted: A box');
    expect(hero).not.toContain('The desk');
    expect(hero).not.toContain('The bin');
  });

  it('has no list of tools for the parts when none is in the way', () => {
    expect(kitTab({})).not.toContain('The tool for each part noticed');
  });

  it('is told in the language of the run, and no id breaks out of its markup', () => {
    const hero = kitTab({
      locale: 'ru',
      kit: [piece('crowbar', { suitcase: true, lawful: false, removes: ['locked'] })],
      toolSlots: { total: 2, used: 1 },
    });
    const hostile = kitTab({
      kit: [piece('x"><script>alert(1)</script>', { suitcase: true })],
      toolSlots: { total: 1, used: 1 },
    });

    expect(hero).toContain('Чемодан: занято 1 из 2 мест');
    expect(hero).toContain('свободное место');
    expect(hero).toContain('не по закону');
    expect(hostile).not.toContain('<script>');
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

describe('what the case grew from', () => {
  const chronicle = (view: Partial<View>) => tab(renderEvidenceBoard(viewOf(view)), 'chronicle');
  const inspiration = {
    kind: 'shortage',
    premise: 'A staple has gone missing <b>from</b> every shelf.',
  } as const;

  it('shows the kind of trouble and the sentence, escaped, in the chronicle', () => {
    const page = chronicle({ inspiration });

    expect(page).toContain('A shortage');
    expect(page).toContain('A staple has gone missing &lt;b&gt;from&lt;/b&gt; every shelf.');
    expect(page).not.toContain('<b>from</b>');
  });

  it('says in the language of the run, and says so when there was no news seed', () => {
    expect(chronicle({ locale: 'ru', inspiration })).toContain('Дефицит');
    expect(chronicle({ locale: 'ru', inspiration: null })).toContain('лента не дала зерна');
    expect(chronicle({ inspiration: null })).toContain('feeds gave no seed');
  });
});

describe('the gift and the cost of a signal on the hero tab', () => {
  const hero = (view: Partial<View>) => tab(renderEvidenceBoard(viewOf(view)), 'hero');

  it.each(['in-love', 'burnt-out', 'feeling-low'])('are told in words for %s, in both languages', (id) => {
    const signal = { id, voice: 'x', gift: 'x', cost: 'y' };

    const en = hero({ signal });
    const ru = hero({ signal, locale: 'ru' });

    expect(en).toMatch(/Gift: [A-Z]/);
    expect(en).toMatch(/Cost: [A-Z]/);
    expect(ru).toMatch(/Дар: [А-Я]/);
    expect(ru).toMatch(/Цена: [А-Я]/);
    // Words, not numbers and not the engine's own ids of the gift.
    expect(en).not.toContain('someone-to-come-back-to');
  });

  it('are left out for a hero without a signal and for a signal the board has no words for', () => {
    expect(hero({ signal: null })).not.toContain('Gift:');
    expect(hero({ signal: { id: 'unknown-mood', voice: 'x', gift: 'x', cost: 'y' } })).not.toContain('Gift:');
  });
});

describe('the links still to be made', () => {
  const links = (view: Partial<View>) => tab(renderEvidenceBoard(viewOf(view)), 'insights');

  it('says how many clues each open conclusion takes, smallest first, with no clue and no id', () => {
    const page = links({ openLinks: [2, 3, 3] });

    expect(page).toContain('aria-label="Links still to be made"');
    expect(page).toContain('1 × a link of 2');
    expect(page).toContain('2 × a link of 3');
  });

  it('is told in Russian too, and also before any clue is found', () => {
    const page = links({ locale: 'ru', openLinks: [2], clues: [], insights: [] });

    expect(page).toContain('Связок ещё предстоит');
    expect(page).toContain('1 × связка из 2');
  });

  it('says that every conclusion is drawn once none is open', () => {
    expect(links({ openLinks: [] })).toContain('Every conclusion has been drawn.');
    expect(links({ openLinks: [], locale: 'ru' })).toContain('Все выводы сделаны.');
  });
});

describe('the life state and the new backgrounds on the hero tab', () => {
  const hero = (lifeState: string | undefined, background: string, locale: 'en' | 'ru' = 'en') =>
    tab(
      renderEvidenceBoard(
        viewOf({
          locale,
          hero: {
            name: 'Mira',
            gender: 'female',
            archetype: 'detective',
            skills: { perception: 4 },
            background,
            ...(lifeState === undefined ? {} : { lifeState }),
          } as View['hero'],
        }),
      ),
      'hero',
    );

  it('names who the hero was and what they are going through, in both languages', () => {
    expect(hero('retired', 'dismissed-auditor')).toContain('a dismissed auditor');
    expect(hero('retired', 'dismissed-auditor')).toContain('Situation: retired');
    expect(hero('in-debt', 'bus-driver', 'ru')).toContain('водитель автобуса');
    expect(hero('in-debt', 'bus-driver', 'ru')).toContain('Положение: в долгах');
  });

  it('says nothing of a situation for a hero who has none', () => {
    expect(hero(undefined, 'nurse')).not.toContain('Situation');
  });
});

describe('the weather in the chronicle', () => {
  const chronicle = (view: Partial<View>) => tab(renderEvidenceBoard(viewOf(view)), 'chronicle');

  it('names the weather of today in the language of the run, and says nothing when there is none', () => {
    expect(chronicle({ weather: 'cold-rain' })).toContain('Weather today: cold rain');
    expect(chronicle({ weather: 'frost', locale: 'ru' })).toContain('Погода сегодня: мороз');
    expect(chronicle({})).not.toContain('Weather today');
  });
});

describe('the leads on the chronicle tab', () => {
  const leads = [
    {
      id: 'a',
      reason: 'A cat points the way.',
      source: null,
      window: null,
      openNow: true,
      done: false,
      opens: [],
    },
    {
      id: 'b',
      reason: 'The archive is watched by day.',
      source: null,
      window: { fromMinute: 22 * 60, untilMinute: 5 * 60 + 30 },
      openNow: false,
      done: false,
      opens: [],
    },
  ];

  it('lists each lead in the words of the hero, with the hours of one that has a window', () => {
    const chronicle = tab(renderEvidenceBoard(viewOf({ leads })), 'chronicle');

    expect(chronicle).toContain('A cat points the way.');
    expect(chronicle).toContain('The archive is watched by day.');
    expect(chronicle).toContain('only from 22:00 to 05:30');
    const listed = /<h3>Leads<\/h3>([\s\S]*?)<h3>Still open/.exec(chronicle)?.[1] ?? '';
    expect(listed.match(/only from/g)).toHaveLength(1);
  });

  it('says so when there are none', () => {
    expect(tab(renderEvidenceBoard(viewOf({ leads: [] })), 'chronicle')).toContain('No leads yet.');
  });
});

describe('the chronicle and a place that is shut at this hour', () => {
  it('lists it among what is still open, with the hours it opens in', () => {
    const view = {
      ...viewOf(),
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
            id: 'bar',
            name: 'Night Bar',
            visited: false,
            blocked: 'closed-hours',
            hours: { fromMinute: 22 * 60, untilMinute: 2 * 60 },
            lead: null,
            exposure: 'outdoor',
            building: null,
          },
        ],
        links: [{ from: 'market', to: 'bar' }],
      },
    } as unknown as DetectiveRunView;

    const chronicle =
      /<section class="tab" id="chronicle">([\s\S]*?)<\/section>/.exec(renderEvidenceBoard(view))?.[1] ?? '';

    expect(chronicle).toContain('Shut at this hour, only from 22:00 to 02:00: Night Bar');
    expect(chronicle).not.toContain('Not yet visited: Night Bar');
  });
});
