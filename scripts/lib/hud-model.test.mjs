// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DetectiveCaseSchema,
  assembleHero,
  createDetectiveRun,
  createRng,
  restoreRng,
  resolveIntent,
  viewRun,
} from '../../packages/engine/src/index.ts';
import { summarizeRun } from '../../packages/mcp/src/play.ts';
import {
  LABELS,
  applyResult,
  clockText,
  dayBar,
  localeOf,
  mapRows,
  parseResult,
} from '../../agents/hooks/hud-model.ts';

const MAP = {
  current: 'lobby',
  places: [
    { id: 'lobby', name: 'Lobby', visited: true, blocked: null },
    { id: 'archive', name: 'Archive', visited: false, blocked: null },
    { id: 'office', name: 'Office', visited: false, blocked: 'locked' },
    { id: 'chapel', name: 'Chapel', visited: false, blocked: 'closed' },
  ],
  links: [
    { from: 'lobby', to: 'archive' },
    { from: 'lobby', to: 'office' },
    { from: 'archive', to: 'chapel' },
  ],
};
const FULL = {
  status: 'active',
  title: 'The Goose',
  locale: 'ru',
  turn: 3,
  clock: { day: 2, minute: 14 * 60 + 20, totalDays: 7 },
  clues: [{}, {}],
  hiddenTraitCount: 2,
  map: MAP,
};
/** The object without the named keys. */
const without = (value, ...keys) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

const SHORT = {
  outcome: { kind: 'move' },
  view: {
    status: 'active',
    title: 'The Goose',
    locale: 'ru',
    turn: 4,
    clock: { day: 2, minute: 14 * 60 + 35, totalDays: 7 },
    clueCount: 2,
    hiddenTraitCount: 1,
    map: { ...MAP, current: 'archive' },
  },
};

describe('parseResult', () => {
  it('reads the JSON of a tool, and nothing that is not an object', () => {
    expect(parseResult('{"a":1}')).toEqual({ a: 1 });
    expect(parseResult(undefined)).toBeUndefined();
    expect(parseResult('Error: stale-turn')).toBeUndefined();
    expect(parseResult('[1,2]')).toBeUndefined();
    expect(parseResult('"text"')).toBeUndefined();
    expect(parseResult('null')).toBeUndefined();
  });
});

describe('localeOf', () => {
  it('finds the language in a view or in the short view of a turn, and only ru or en', () => {
    expect(localeOf(FULL)).toBe('ru');
    expect(localeOf(SHORT)).toBe('ru');
    expect(localeOf({ locale: 'de' })).toBeUndefined();
    expect(localeOf({})).toBeUndefined();
  });
});

describe('applyResult', () => {
  it('makes the HUD from a full view, with the map exactly as the game sent it', () => {
    const hud = applyResult(null, FULL);

    expect(hud).toMatchObject({
      locale: 'ru',
      title: 'The Goose',
      day: 2,
      totalDays: 7,
      minute: 860,
      turn: 3,
      locationId: 'lobby',
      clueCount: 2,
    });
    expect(hud?.places).toEqual(MAP.places);
    expect(hud?.links).toEqual(MAP.links);
  });

  it('moves with the short view of a turn, taking the map whole and not rebuilding it from exits', () => {
    const moved = applyResult(applyResult(null, FULL), SHORT);

    expect(moved?.locationId).toBe('archive');
    expect(moved?.turn).toBe(4);
    expect(moved?.clueCount).toBe(2);
    expect(moved?.places).toEqual(MAP.places);
  });

  it('forgets nothing it was not told to forget: a map that shrinks is the map', () => {
    const smaller = { ...SHORT.view, map: { current: 'lobby', places: [MAP.places[0]], links: [] } };

    expect(applyResult(applyResult(null, FULL), { view: smaller })?.places).toHaveLength(1);
  });

  it('closes on a verdict, a given-up run and no run, and leaves nothing of the old map', () => {
    const hud = applyResult(null, FULL);

    for (const status of ['won', 'lost', 'gave-up', 'no-run', 'awaiting-hero', 'awaiting-case']) {
      expect(applyResult(hud, { view: { ...SHORT.view, status } }), status).toBeNull();
      expect(applyResult(hud, { status }), status).toBeNull();
    }
  });

  it('leaves the HUD as it was for an answer that is not a view of a run in progress', () => {
    const hud = applyResult(null, FULL);

    expect(applyResult(hud, {})).toBe(hud);
    expect(applyResult(hud, { view: {} })).toBe(hud);
    expect(applyResult(hud, { ...FULL, title: undefined })).toBe(hud);
    expect(applyResult(hud, { ...FULL, clock: { day: 'x', minute: 1, totalDays: 2 } })).toBe(hud);
    expect(applyResult(hud, { ...FULL, clock: undefined })).toBe(hud);
    expect(applyResult(hud, { ...FULL, map: undefined })).toBe(hud);
    expect(applyResult(hud, { ...FULL, map: { ...MAP, current: 7 } })).toBe(hud);
    expect(applyResult(hud, { ...FULL, map: { ...MAP, places: 'x' } })).toBe(hud);
    expect(applyResult(hud, { ...FULL, map: { ...MAP, links: 'x' } })).toBe(hud);
    expect(applyResult(hud, { ...FULL, map: { ...MAP, current: 'nowhere' } })).toBe(hud);
    expect(applyResult(null, { status: 'active' })).toBeNull();
  });

  it('drops a place or a link it cannot read, and a blocked value it does not know', () => {
    const hud = applyResult(null, {
      ...FULL,
      map: {
        current: 'lobby',
        places: [
          MAP.places[0],
          { id: 'odd', name: 'Odd', visited: true, blocked: 'haunted' },
          { id: 3, name: 'Broken', visited: true },
          'nonsense',
          { id: 'half', name: 'Half' },
        ],
        links: [{ from: 'lobby', to: 'odd' }, { from: 'lobby' }, 7],
      },
    });

    expect(hud?.places.map(({ id, blocked }) => [id, blocked])).toEqual([
      ['lobby', null],
      ['odd', null],
    ]);
    expect(hud?.links).toEqual([{ from: 'lobby', to: 'odd' }]);
  });

  it('takes the number of clues from a list, from a count, or from what it knew', () => {
    const withoutClues = without(FULL, 'clues');

    expect(applyResult(null, FULL)?.clueCount).toBe(2);
    expect(applyResult(null, { ...withoutClues, clueCount: 5 })?.clueCount).toBe(5);
    expect(
      applyResult(applyResult(null, FULL), { view: { ...SHORT.view, clueCount: undefined } })?.clueCount,
    ).toBe(2);
    expect(applyResult(null, withoutClues)?.clueCount).toBe(0);
  });

  it('counts the traits still hidden: from a full view, from the short view of a turn, else from what it knew', () => {
    expect(applyResult(null, FULL)?.hiddenTraits).toBe(2);
    expect(applyResult(applyResult(null, FULL), SHORT)?.hiddenTraits).toBe(1);
    expect(
      applyResult(applyResult(null, FULL), { view: { ...SHORT.view, hiddenTraitCount: undefined } })
        ?.hiddenTraits,
    ).toBe(2);
    expect(applyResult(null, without(FULL, 'hiddenTraitCount'))?.hiddenTraits).toBe(0);
  });

  it('tells the hero\u2019s composure as a word from the warnings, the worst band winning, else what it knew', () => {
    const warned = (...warnings) => ({ ...FULL, warnings });

    expect(applyResult(null, warned())?.composure).toBe('steady');
    expect(applyResult(null, warned('frayed-nerves'))?.composure).toBe('frayed');
    expect(applyResult(null, warned('frayed-nerves', 'ragged-nerves'))?.composure).toBe('ragged');
    expect(applyResult(null, warned('low-reputation'))?.composure).toBe('steady');
    // The short view of a turn carries the warnings too; an answer without them keeps what was known.
    expect(applyResult(null, { view: { ...SHORT.view, warnings: ['frayed-nerves'] } })?.composure).toBe(
      'frayed',
    );
    expect(applyResult(applyResult(null, warned('ragged-nerves')), SHORT)?.composure).toBe('ragged');
    expect(applyResult(null, FULL)?.composure).toBe('steady');
  });

  it('takes the language and the turn from the answer, else from what it knew, else English and zero', () => {
    const bare = without(FULL, 'locale', 'turn');

    expect(applyResult(applyResult(null, FULL), bare)).toMatchObject({ locale: 'ru', turn: 3 });
    expect(applyResult(null, bare)).toMatchObject({ locale: 'en', turn: 0 });
  });
});

describe('the texts of the HUD', () => {
  it('shows the hour with a leading zero and the day as a bar', () => {
    expect(clockText({ minute: 8 * 60 + 5 })).toBe('08:05');
    expect(clockText({ minute: 23 * 60 + 59 })).toBe('23:59');
    expect(dayBar({ day: 3, totalDays: 7 })).toBe('▓▓▓░░░░');
    expect(dayBar({ day: 9, totalDays: 7 })).toBe('▓▓▓▓▓▓▓');
    expect(dayBar({ day: 0, totalDays: 0 })).toBe('░');
  });

  it('has the same words in both languages', () => {
    expect(Object.keys(LABELS.ru)).toEqual(Object.keys(LABELS.en));
  });
});

describe('mapRows', () => {
  it('grows a tree from the hero, each place once, and marks where the hero is', () => {
    const rows = mapRows(applyResult(null, FULL));

    expect(rows.map(({ place }) => place.id)).toEqual(['lobby', 'archive', 'chapel', 'office']);
    expect(rows.filter(({ here }) => here).map(({ place }) => place.id)).toEqual(['lobby']);
    expect(rows[0]?.prefix).toBe('');
    expect(rows[1]?.prefix).toBe('├─ ');
    expect(rows[3]?.prefix).toBe('└─ ');
  });

  it('re-roots the tree at the hero after a move', () => {
    const rows = mapRows(applyResult(applyResult(null, FULL), SHORT));

    expect(rows.map(({ place }) => place.id)).toEqual(['archive', 'lobby', 'office', 'chapel']);
  });

  it('ignores a link to a place it does not know, and a cycle', () => {
    const rows = mapRows({
      ...applyResult(null, FULL),
      links: [...MAP.links, { from: 'lobby', to: 'ghost' }, { from: 'chapel', to: 'lobby' }],
    });

    expect(rows.map(({ place }) => place.id).sort()).toEqual(['archive', 'chapel', 'lobby', 'office']);
  });

  it('is empty for a hero whose place is not on the map', () => {
    expect(mapRows({ ...applyResult(null, FULL), locationId: 'ghost' })).toEqual([]);
  });
});

// The HUD holds only what the narrator may be told: it is made from the answers of the game's own tools.
describe('what the HUD holds', () => {
  const CASES = ['goose-of-elmwick.en.json', 'leaked-memo-of-larkspur.ru.json'].map((file) =>
    DetectiveCaseSchema.parse(
      JSON.parse(readFileSync(new URL(`../../content/cases/${file}`, import.meta.url), 'utf8')),
    ),
  );
  const ALLOWED = [
    'clueCount',
    'composure',
    'day',
    'hiddenTraits',
    'links',
    'locale',
    'locationId',
    'minute',
    'places',
    'title',
    'totalDays',
    'turn',
  ];

  function runOf(detectiveCase, seed) {
    const hero = {
      name: 'Mira',
      gender: 'female',
      archetype: 'detective',
      skills: { perception: 4, reasoning: 3, social: 3, pressure: 0, tech: 0, contacts: 0 },
      background: 'analyst',
    };
    const rng = createRng(seed);
    const made = assembleHero(hero, rng);
    if (!made.isValid) throw new Error('The hero must be valid.');
    return createDetectiveRun({
      hero,
      traits: made.assembled.traits,
      case: detectiveCase,
      seed,
      rngState: rng.state(),
      locale: detectiveCase.locale,
    });
  }

  it('has the fields of the public view and nothing of the truth, over many turns and seeds', () => {
    for (const detectiveCase of CASES) {
      for (let seed = 0; seed < 15; seed += 1) {
        let run = runOf(detectiveCase, `hud-${String(seed)}`);
        const picker = createRng(`pick-${String(seed)}`);
        for (let turn = 0; turn < 25 && run.status === 'active'; turn += 1) {
          const options = [
            { kind: 'look' },
            { kind: 'search' },
            ...detectiveCase.locations.map(({ id }) => ({ kind: 'move', locationId: id })),
          ];
          const intent = options[picker.roll(options.length) - 1];
          const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
          if (resolution.ok) run = resolution.run;

          // The HUD is made from run_view and from the short view of a turn alike.
          for (const hud of [
            applyResult(null, viewRun(run)),
            applyResult(null, { view: summarizeRun(run) }),
          ]) {
            const shown = JSON.stringify(hud);
            expect(Object.keys(hud ?? {}).every((key) => ALLOWED.includes(key))).toBe(true);
            expect(shown).not.toContain(detectiveCase.truth.motive);
            expect(shown).not.toContain(detectiveCase.truth.method);
            for (const suspect of detectiveCase.suspects) {
              expect(shown).not.toContain(suspect.secret);
              expect(shown).not.toContain(suspect.alibi);
            }
            for (const clue of detectiveCase.clues) {
              if (!run.foundClueIds.includes(clue.id)) expect(shown).not.toContain(clue.description);
            }
            for (const location of detectiveCase.locations) {
              expect(shown).not.toContain(location.description);
            }
            for (const trait of run.traits) expect(shown).not.toContain(trait.id);
            expect(shown).not.toMatch(/nerves|sleepDebt|reputation|condition|culprit|rngState|isRedHerring/);
          }
        }
      }
    }
  });

  it('shows the same known map as the run, from either answer', () => {
    const run = runOf(CASES[0], 'same-map');

    expect(applyResult(null, viewRun(run))?.places).toEqual(viewRun(run).map.places);
    expect(applyResult(null, { view: summarizeRun(run) })?.places).toEqual(viewRun(run).map.places);
    expect(applyResult(null, { view: summarizeRun(run) })?.links).toEqual(viewRun(run).map.links);
  });
});
