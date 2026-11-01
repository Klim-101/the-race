// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { TraitSchema, type Trait } from '../traits.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { DETECTIVE_TRAITS } from './traits.js';
import {
  DetectiveRunStateSchema,
  addInsight,
  createDetectiveRun,
  findClue,
  moveTo,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

function runOf(detectiveCase: DetectiveCase, traits: Trait[] = []): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: traits.map((entry) => TraitSchema.parse(entry)),
    case: detectiveCase,
    seed: 'public-view',
    rngState: 1,
    locale: 'en',
  });
}

const newRun = (): DetectiveRunState => runOf(DetectiveCaseSchema.parse(buildCheeseCase()));

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

function talk(run: DetectiveRunState, suspectId: string, clueIds: string[], rng: Rng): DetectiveRunState {
  const resolution: Resolution = resolveIntent(
    run,
    { kind: 'interrogate', suspectId, approach: 'social', clueIds },
    rng,
  );
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution.run;
}

describe('the known map', () => {
  it('starts with the first place and the names of the ways out of it, and nothing beyond', () => {
    const { map } = viewRun(newRun());

    expect(map.current).toBe('market-square');
    expect(map.places).toEqual([
      { id: 'market-square', name: 'Market square', visited: true, blocked: null },
      { id: 'cheese-stall', name: 'Cheese stall', visited: false, blocked: null },
      { id: 'storage-cellar', name: 'Storage cellar', visited: false, blocked: 'locked' },
    ]);
    expect(map.links).toEqual([
      { from: 'market-square', to: 'cheese-stall' },
      { from: 'market-square', to: 'storage-cellar' },
    ]);
    expect(JSON.stringify(map)).not.toMatch(/Mayor office|description|mayor-office/);
  });

  it('grows with each place visited, and lists a way between two unvisited places never', () => {
    const { map } = viewRun(moveTo(newRun(), 'cheese-stall'));

    expect(map.current).toBe('cheese-stall');
    expect(map.places.map(({ id, visited }) => [id, visited])).toEqual([
      ['market-square', true],
      ['cheese-stall', true],
      ['storage-cellar', false],
      ['mayor-office', false],
    ]);
    expect(map.links).toEqual([
      { from: 'market-square', to: 'cheese-stall' },
      { from: 'market-square', to: 'storage-cellar' },
      { from: 'cheese-stall', to: 'mayor-office' },
    ]);
  });

  it('lists a way once, whichever of its ends was the one visited', () => {
    // Only the later end has been visited: the way to it from the earlier, unvisited place is still known.
    const { map } = viewRun(moveTo(newRun(), 'mayor-office'));

    expect(map.links).toContainEqual({ from: 'cheese-stall', to: 'mayor-office' });
    expect(map.links.filter(({ from, to }) => from === 'cheese-stall' && to === 'mayor-office')).toHaveLength(
      1,
    );
  });

  it('shows a way that is shut, a locked door until its clue is found and a place an event closed', () => {
    const open = viewRun(findClue(newRun(), 'cellar-key')).map.places;
    const closed = viewRun({ ...newRun(), closedLocationIds: ['cheese-stall'] }).map.places;

    expect(open.find(({ id }) => id === 'storage-cellar')?.blocked).toBeNull();
    expect(closed.find(({ id }) => id === 'cheese-stall')?.blocked).toBe('closed');
  });

  it('gives each place the same facts as the exits of the place the hero is at', () => {
    const view = viewRun(newRun());

    for (const exit of view.location.exits) {
      expect(view.map.places.find(({ id }) => id === exit.id)).toMatchObject({
        visited: exit.visited,
        blocked: exit.blocked,
      });
    }
  });
});

describe('the statements of the suspects', () => {
  const atBaker = (): DetectiveRunState => moveTo(findClue(newRun(), 'cart-tracks'), 'cheese-stall');
  const baker = (run: DetectiveRunState) => viewRun(run).suspects.find(({ id }) => id === 'baker');

  it('are empty before anyone is questioned', () => {
    expect(viewRun(newRun()).suspects.every(({ statements }) => statements.length === 0)).toBe(true);
  });

  it('hold the alibi once, however often the suspect is questioned', () => {
    const first = talk(atBaker(), 'baker', [], dice(1));
    const second = talk(first, 'baker', [], dice(1));

    expect(baker(first)?.statements).toEqual([
      { day: 1, kind: 'alibi', text: 'Says she was asleep at home all night.' },
    ]);
    expect(baker(second)?.statements).toHaveLength(1);
  });

  it('add a lie the moment it falls, in the words the suspect used, and the secret a perfect roll wins', () => {
    const after = talk(atBaker(), 'baker', ['cart-tracks'], dice(20));

    expect(baker(after)?.statements).toEqual([
      { day: 1, kind: 'alibi', text: 'Says she was asleep at home all night.' },
      { day: 1, kind: 'conceded', text: 'I never left my house last night.' },
      { day: 1, kind: 'secret', text: 'She owes the town for an oven she cannot pay for.' },
    ]);
  });

  it('never write down a lie that still holds or a secret that was not won', () => {
    const held = talk(atBaker(), 'baker', [], dice(1));
    const text = JSON.stringify(baker(held));

    expect(text).not.toContain('I never left my house');
    expect(text).not.toContain('oven she cannot pay');
  });

  it('are kept apart per suspect and carry the day they were said on', () => {
    const rival = talk(findClue(newRun(), 'blue-glove'), 'rival', ['blue-glove'], dice(20));
    const later = { ...atBaker(), clock: { ...atBaker().clock, day: 2 } };

    const view = viewRun(talk(later, 'baker', [], dice(1)));

    expect(viewRun(rival).suspects.find(({ id }) => id === 'baker')?.statements).toEqual([]);
    expect(view.suspects.find(({ id }) => id === 'baker')?.statements[0]?.day).toBe(2);
  });

  it('survive a trip through JSON, and an old save without them loads with none', () => {
    const run = talk(atBaker(), 'baker', [], dice(1));

    expect(DetectiveRunStateSchema.parse(JSON.parse(JSON.stringify(run))).statements).toEqual(run.statements);
    const old: Record<string, unknown> = { ...newRun() };
    delete old.statements;
    expect(DetectiveRunStateSchema.parse(old).statements).toEqual([]);
  });

  it('refuse a statement of someone who is not in the case', () => {
    const run = { ...newRun(), statements: [{ suspectId: 'ghost', day: 1, kind: 'alibi', text: 'Boo.' }] };

    expect(DetectiveRunStateSchema.safeParse(run).success).toBe(false);
  });
});

describe('the sources of a conclusion', () => {
  it('are the clues it was drawn from, all found', () => {
    const run = addInsight(findClue(findClue(newRun(), 'oven-receipt'), 'debt-ledger'), 'motive-debt');

    expect(viewRun(run).insights).toEqual([
      {
        id: 'motive-debt',
        insight: 'The baker needed money fast, and the wheel is worth a fortune.',
        clueIds: ['oven-receipt', 'debt-ledger'],
      },
    ]);
  });

  it('never point at a clue the hero has not found', () => {
    const run = addInsight(findClue(newRun(), 'oven-receipt'), 'motive-debt');

    expect(viewRun(run).insights[0]?.clueIds).toEqual(['oven-receipt']);
  });
});

describe('the number of a clue', () => {
  it('is the surname of the hero and the order of finding, not the order of the case', () => {
    const run = findClue(findClue(newRun(), 'debt-ledger'), 'oven-receipt');

    const numbers = Object.fromEntries(viewRun(run).clues.map(({ id, number }) => [id, number]));
    expect(numbers).toEqual({ 'debt-ledger': 'KOS-01', 'oven-receipt': 'KOS-02' });
  });

  it('stays the same when more is found, and has none for a clue not found', () => {
    const first = findClue(newRun(), 'debt-ledger');
    const later = findClue(first, 'oven-receipt');

    expect(viewRun(later).clues.find(({ id }) => id === 'debt-ledger')?.number).toBe('KOS-01');
    expect(viewRun(first).clues.map(({ number }) => number)).toEqual(['KOS-01']);
    expect(JSON.stringify(viewRun(first))).not.toContain('KOS-02');
  });
});

// The view must hold nothing the narrator may not know. Every sample case is played to the end of what a
// hero can do (every place, every clue, every conclusion, every suspect questioned on a dice of the seed),
// with every hidden trait on, and the view is read after each step.
const FORBIDDEN_KEYS = new Set([
  'truth',
  'solution',
  'culpritId',
  'isRedHerring',
  'pointsTo',
  'brokenBy',
  'lies',
  'secret',
  'alibi',
  'timeline',
  'crimeAtMinute',
  'traits',
]);

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  }
  return [];
}

const CASES_DIR = new URL('../../../../content/cases/', import.meta.url);
const SAMPLES = readdirSync(CASES_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => DetectiveCaseSchema.parse(JSON.parse(readFileSync(new URL(name, CASES_DIR), 'utf8'))));
const CASES: readonly DetectiveCase[] = [DetectiveCaseSchema.parse(buildCheeseCase()), ...SAMPLES];
const HIDDEN_TRAITS = DETECTIVE_TRAITS.slice(0, 4);

function playedThrough(detectiveCase: DetectiveCase, seed: number): DetectiveRunState[] {
  const rng = createRng(`leak-${String(seed)}`);
  const states: DetectiveRunState[] = [];
  let run = runOf(detectiveCase, HIDDEN_TRAITS);
  const record = (next: DetectiveRunState): void => {
    run = next;
    states.push(next);
  };
  record(run);
  for (const location of detectiveCase.locations) record(moveTo(run, location.id));
  for (const clue of detectiveCase.clues) record(findClue(run, clue.id));
  for (const suspect of detectiveCase.suspects) {
    record(moveTo(run, suspect.locationId ?? detectiveCase.startLocationId));
    const shown = detectiveCase.clues.map(({ id }) => id).slice(0, 3 + (seed % 4));
    record(talk(run, suspect.id, rng.roll(2) === 1 ? shown : [], rng));
  }
  for (const deduction of detectiveCase.deductions) record(addInsight(run, deduction.id));
  return states;
}

describe('what the view leaks', () => {
  for (const detectiveCase of CASES) {
    it(`holds nothing of the truth, a false clue or a hidden trait: ${detectiveCase.title}`, () => {
      const { truth } = detectiveCase;
      const stillHolding = (run: DetectiveRunState): string[] =>
        detectiveCase.suspects.flatMap(({ lies }) =>
          lies.filter(({ id }) => !run.concededLieIds.includes(id)).map(({ statement }) => statement),
        );

      for (let seed = 0; seed < 30; seed += 1) {
        for (const run of playedThrough(detectiveCase, seed)) {
          const view = viewRun(run);
          const text = JSON.stringify(view);

          expect(keysOf(view).filter((key) => FORBIDDEN_KEYS.has(key))).toEqual([]);
          expect(text).not.toContain(truth.motive);
          expect(text).not.toContain(truth.method);
          for (const entry of truth.timeline) expect(text).not.toContain(entry.action);
          for (const trait of HIDDEN_TRAITS) expect(text).not.toContain(`"${trait.id}"`);
          for (const statement of stillHolding(run)) expect(text).not.toContain(statement);
          // No place the hero has not seen from a visited one is on the map, and none is more than a name.
          const known = new Set(view.map.places.map(({ id }) => id));
          const mapText = JSON.stringify(view.map);
          for (const location of detectiveCase.locations) {
            if (!run.visitedLocationIds.includes(location.id)) {
              expect(text).not.toContain(location.description);
            }
            if (!known.has(location.id)) expect(mapText).not.toContain(location.name);
          }
          // A number is the surname and the place in the order of finding: unique, and none for a hidden clue.
          const numbers = view.clues.map(({ number }) => number);
          expect(new Set(numbers).size).toBe(numbers.length);
          for (const { id, number } of view.clues) {
            expect(number).toBe(
              `${run.hero.name.split(' ').at(-1)?.toUpperCase() ?? ''}-${String(run.foundClueIds.indexOf(id) + 1).padStart(2, '0')}`,
            );
          }
          expect(text).not.toContain(`-${String(run.foundClueIds.length + 1).padStart(2, '0')}"`);
          for (const { clueIds } of view.insights) {
            for (const clueId of clueIds) expect(run.foundClueIds).toContain(clueId);
          }
          // The sizes of the open links are counts and nothing more: sorted, so the order says nothing of which
          // is the motive, with no id of a clue or of a conclusion in them.
          const open = detectiveCase.deductions.filter(({ id }) => !run.insightIds.includes(id));
          expect(view.openLinks).toEqual(
            open.map(({ clueIds }) => new Set(clueIds).size).toSorted((x, y) => x - y),
          );
          expect(view.openLinks.every((size) => Number.isInteger(size) && size >= 2)).toBe(true);
          for (const deduction of open) {
            expect(JSON.stringify(view.openLinks)).not.toContain(deduction.id);
          }
        }
      }
    });
  }
});
