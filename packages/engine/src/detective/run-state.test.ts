// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { assembleHero } from '../assemble-hero.js';
import { createRng } from '../dice.js';
import { MAX_REPUTATION, MINUTES_PER_DAY } from '../run.js';
import { DetectiveCaseSchema } from './case-schema.js';
import {
  DetectiveRunStateSchema,
  addInsight,
  changeReputation,
  createDetectiveRun,
  endRun,
  endTurn,
  findClue,
  moveTo,
  revealTrait,
  spendTime,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

function newRun(): DetectiveRunState {
  const rng = createRng('run');
  const result = assembleHero(buildHero(), rng);
  if (!result.isValid) throw new Error('The fixture hero is invalid.');
  return createDetectiveRun({
    hero: buildHero(),
    traits: result.assembled.traits,
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'run',
    rngState: rng.state(),
    locale: 'en',
  });
}

describe('createDetectiveRun', () => {
  it('starts at the start location on day one with full reputation and nothing found', () => {
    const run = newRun();

    expect(run).toMatchObject({
      schemaVersion: 1,
      archetype: 'detective',
      turn: 0,
      clock: { day: 1, minute: 0 },
      reputation: MAX_REPUTATION,
      status: 'active',
      locationId: 'market-square',
      visitedLocationIds: ['market-square'],
      foundClueIds: [],
      insightIds: [],
      revealedTraitIds: [],
    });
    expect(run.traits).toHaveLength(2);
  });

  it('survives a trip through JSON unchanged', () => {
    const run = newRun();

    expect(DetectiveRunStateSchema.parse(JSON.parse(JSON.stringify(run)))).toEqual(run);
  });
});

describe('DetectiveRunStateSchema', () => {
  it('rejects ids that name nothing in the run', () => {
    const run = newRun();
    const bad = [
      { locationId: 'nowhere' },
      { visitedLocationIds: ['nowhere'] },
      { foundClueIds: ['nothing'] },
      { insightIds: ['nothing'] },
      { revealedTraitIds: ['nothing'] },
    ];

    for (const change of bad) {
      expect(DetectiveRunStateSchema.safeParse({ ...run, ...change }).success).toBe(false);
    }
  });

  it('rejects another schema version, a negative turn, dice out of range and too much reputation', () => {
    const run = newRun();

    expect(DetectiveRunStateSchema.safeParse({ ...run, schemaVersion: 2 }).success).toBe(false);
    expect(DetectiveRunStateSchema.safeParse({ ...run, turn: -1 }).success).toBe(false);
    expect(DetectiveRunStateSchema.safeParse({ ...run, rngState: 2 ** 32 }).success).toBe(false);
    expect(DetectiveRunStateSchema.safeParse({ ...run, reputation: MAX_REPUTATION + 1 }).success).toBe(false);
  });
});

describe('transitions', () => {
  it('moves the hero and remembers where they have been, once', () => {
    const run = moveTo(moveTo(moveTo(newRun(), 'cheese-stall'), 'market-square'), 'cheese-stall');

    expect(run.locationId).toBe('cheese-stall');
    expect(run.visitedLocationIds).toEqual(['market-square', 'cheese-stall']);
  });

  it('records a clue and an insight once each', () => {
    let run = findClue(findClue(newRun(), 'cellar-key'), 'cellar-key');
    run = addInsight(addInsight(run, 'motive-debt'), 'motive-debt');

    expect(run.foundClueIds).toEqual(['cellar-key']);
    expect(run.insightIds).toEqual(['motive-debt']);
  });

  it('reveals a trait that the hero has, once', () => {
    const run = newRun();
    const id = run.traits[0]!.id;

    expect(revealTrait(revealTrait(run, id), id).revealedTraitIds).toEqual([id]);
  });

  it('spends time and rolls the day over', () => {
    expect(spendTime(newRun(), 90).clock).toEqual({ day: 1, minute: 90 });
    expect(spendTime(spendTime(newRun(), MINUTES_PER_DAY - 10), 20).clock).toEqual({ day: 2, minute: 10 });
  });

  it('keeps reputation between zero and the maximum', () => {
    expect(changeReputation(newRun(), -3).reputation).toBe(MAX_REPUTATION - 3);
    expect(changeReputation(newRun(), 5).reputation).toBe(MAX_REPUTATION);
    expect(changeReputation(newRun(), -100).reputation).toBe(0);
    expect(() => changeReputation(newRun(), 0.5)).toThrow(RangeError);
  });

  it('counts a turn and keeps the state of the dice', () => {
    const rng = createRng('after');
    rng.roll(20);

    const run = endTurn(newRun(), rng);

    expect(run.turn).toBe(1);
    expect(run.rngState).toBe(rng.state());
  });

  it('ends the run once, and then refuses every change', () => {
    const over = endRun(newRun(), 'lost');

    expect(over.status).toBe('lost');
    expect(() => endRun(over, 'won')).toThrow(RangeError);
    expect(() => moveTo(over, 'cheese-stall')).toThrow(RangeError);
    expect(() => findClue(over, 'cellar-key')).toThrow(RangeError);
    expect(() => addInsight(over, 'motive-debt')).toThrow(RangeError);
    expect(() => revealTrait(over, over.traits[0]!.id)).toThrow(RangeError);
    expect(() => spendTime(over, 1)).toThrow(RangeError);
    expect(() => changeReputation(over, 1)).toThrow(RangeError);
    expect(() => endTurn(over, createRng(1))).toThrow(RangeError);
  });

  it('refuses ids that name nothing', () => {
    const run = newRun();

    expect(() => moveTo(run, 'nowhere')).toThrow(RangeError);
    expect(() => findClue(run, 'nothing')).toThrow(RangeError);
    expect(() => addInsight(run, 'nothing')).toThrow(RangeError);
    expect(() => revealTrait(run, 'nothing')).toThrow(RangeError);
  });

  it('never changes the state it is given', () => {
    const run = newRun();
    const before = structuredClone(run);

    moveTo(run, 'cheese-stall');
    findClue(run, 'cellar-key');
    addInsight(run, 'motive-debt');
    revealTrait(run, run.traits[0]!.id);
    spendTime(run, 60);
    changeReputation(run, -2);
    endTurn(run, createRng(1));
    endRun(run, 'won');

    expect(run).toEqual(before);
  });
});

describe('viewRun', () => {
  it('shows the scene: where the hero is, the exits, the suspects and the clock', () => {
    const view = viewRun(newRun());

    expect(view).toMatchObject({
      title: 'The Vanishing Wheel of Valdmark',
      clock: { day: 1, minute: 0, totalDays: 3 },
      reputation: MAX_REPUTATION,
      hiddenTraitCount: 2,
      revealedTraits: [],
      location: { id: 'market-square', name: 'Market square' },
      clues: [],
      insights: [],
    });
    expect(view.location.exits).toEqual([
      { id: 'cheese-stall', name: 'Cheese stall', visited: false },
      { id: 'storage-cellar', name: 'Storage cellar', visited: false },
    ]);
    expect(view.suspects.map(({ id }) => id)).toEqual(['baker', 'rival', 'mayor']);
  });

  it('shows only what has been found, made or revealed', () => {
    const base = newRun();
    const traitId = base.traits[1]!.id;
    const run = revealTrait(
      addInsight(findClue(moveTo(base, 'cheese-stall'), 'flour-crumbs'), 'motive-debt'),
      traitId,
    );

    const view = viewRun(run);

    expect(view.clues.map(({ id }) => id)).toEqual(['flour-crumbs']);
    expect(view.insights.map(({ id }) => id)).toEqual(['motive-debt']);
    expect(view.hiddenTraitCount).toBe(1);
    expect(view.revealedTraits.map(({ id }) => id)).toEqual([traitId]);
    expect(view.location.exits).toContainEqual({ id: 'market-square', name: 'Market square', visited: true });
  });

  it('lists no exits for a location that connects to nothing', () => {
    const run = newRun();
    const detectiveCase = {
      ...run.case,
      locations: [
        ...run.case.locations,
        {
          id: 'attic',
          name: 'Attic',
          description: 'Dusty.',
          connections: [],
          access: { kind: 'open' as const },
          situations: [],
        },
      ],
    };

    expect(viewRun(moveTo({ ...run, case: detectiveCase }, 'attic')).location.exits).toEqual([]);
  });

  it('keeps every secret of the case and the dice out of what the player and the narrator see', () => {
    const base = newRun();
    const run = revealTrait(findClue(addInsight(base, 'motive-debt'), 'flour-crumbs'), base.traits[0]!.id);
    const text = JSON.stringify(viewRun(run));
    const detectiveCase = run.case;

    const secrets = [
      detectiveCase.truth.motive,
      detectiveCase.truth.method,
      ...detectiveCase.suspects.flatMap((suspect) => [
        suspect.secret,
        ...suspect.lies.map((lie) => lie.statement),
      ]),
      ...detectiveCase.clues
        .filter((clue) => !run.foundClueIds.includes(clue.id))
        .map((clue) => clue.description),
      run.traits[1]!.id,
      run.seed,
    ];
    for (const secret of secrets) expect(text).not.toContain(secret);

    const hiddenKeys = [
      'truth',
      'solution',
      'isRedHerring',
      'pointsTo',
      'brokenBy',
      'rngState',
      'seed',
      'traits',
    ];
    for (const key of hiddenKeys) expect(text).not.toContain(`"${key}"`);
  });

  it('refuses to view a state that points at a place that does not exist', () => {
    expect(() => viewRun({ ...newRun(), locationId: 'nowhere' })).toThrow(RangeError);
  });
});
