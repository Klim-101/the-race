// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { MAX_REPUTATION } from '../run.js';
import { TraitSchema, type Trait } from '../traits.js';
import {
  CRITICAL_FAILURE_REPUTATION,
  FAILED_ENTRY_MINUTES,
  FAILED_SEARCH_MINUTES,
  LOOK_MINUTES,
  MOVE_MINUTES,
  SEARCH_MINUTES,
  resolveIntent,
  type Resolution,
} from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { DETECTIVE_TRAITS } from './traits.js';
import {
  createDetectiveRun,
  endRun,
  findClue,
  markSearched,
  moveTo,
  startCondition,
  type DetectiveRunState,
} from './run-state.js';

const trait = (id: string): Trait => {
  const found = DETECTIVE_TRAITS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No trait ${id}`);
  return found;
};

/** A seed whose first d20 roll is `die`, so that a test can choose how a check goes. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

function newRun(
  overrides: { traits?: Trait[]; edit?: (detectiveCase: DetectiveCase) => void } = {},
): DetectiveRunState {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  overrides.edit?.(detectiveCase);
  return createDetectiveRun({
    hero: buildHero(),
    traits: (overrides.traits ?? []).map((entry) => TraitSchema.parse(entry)),
    case: detectiveCase,
    seed: 'actions',
    rngState: 1,
    locale: 'en',
  });
}

/** The hero stands in the cellar, which they have a key to. */
function inCellar(run = newRun()): DetectiveRunState {
  return moveTo(findClue(run, 'cellar-key'), 'storage-cellar');
}

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

describe('look', () => {
  it('finds what lies in plain sight, costs a few minutes and counts the turn', () => {
    const run = newRun();
    const rng = createRng(1);

    const { run: next, outcome } = ok(resolveIntent(run, { kind: 'look' }, rng));

    expect(outcome).toEqual({ kind: 'look', foundClueIds: ['cellar-key'], minutes: LOOK_MINUTES });
    expect(next.foundClueIds).toEqual(['cellar-key']);
    expect(next.clock.minute).toBe(LOOK_MINUTES);
    expect(next.turn).toBe(1);
    expect(next.rngState).toBe(rng.state());
  });

  it('finds nothing the second time, and does not spend dice', () => {
    const rng = createRng(2);
    const first = ok(resolveIntent(newRun(), { kind: 'look' }, rng));

    const second = ok(resolveIntent(first.run, { kind: 'look' }, rng));

    expect(second.outcome).toMatchObject({ kind: 'look', foundClueIds: [] });
    expect(second.run.rngState).toBe(first.run.rngState);
  });

  it('does not show a clue that needs a check', () => {
    const run = moveTo(newRun(), 'cheese-stall');

    const { outcome } = ok(resolveIntent(run, { kind: 'look' }, createRng(3)));

    expect(outcome).toMatchObject({ foundClueIds: ['blue-glove'] });
  });
});

describe('move', () => {
  it('walks to a neighbouring open place', () => {
    const { run, outcome } = ok(
      resolveIntent(newRun(), { kind: 'move', locationId: 'cheese-stall' }, createRng(1)),
    );

    expect(outcome).toEqual({
      kind: 'move',
      from: 'market-square',
      to: 'cheese-stall',
      entered: true,
      minutes: MOVE_MINUTES,
      consequences: [],
    });
    expect(run.locationId).toBe('cheese-stall');
    expect(run.visitedLocationIds).toContain('cheese-stall');
  });

  it('refuses a place that does not exist, the place the hero is in, and one that is not next door', () => {
    const run = newRun();
    const codes = ['nowhere', 'market-square', 'mayor-office'].map((locationId) => {
      const resolution = resolveIntent(run, { kind: 'move', locationId }, createRng(1));
      return resolution.ok ? 'ok' : resolution.refusal.code;
    });

    expect(codes).toEqual(['unknown-location', 'already-here', 'not-adjacent']);
  });

  it('refuses a door that needs a key until the key is found, without spending time or dice', () => {
    const run = newRun();
    const rng = createRng(1);
    const before = rng.state();

    const refused = resolveIntent(run, { kind: 'move', locationId: 'storage-cellar' }, rng);

    expect(refused).toMatchObject({ ok: false, refusal: { code: 'locked' } });
    expect(rng.state()).toBe(before);
    const opened = ok(
      resolveIntent(findClue(run, 'cellar-key'), { kind: 'move', locationId: 'storage-cellar' }, rng),
    );
    expect(opened.run.locationId).toBe('storage-cellar');
  });

  describe('a door that needs a skill', () => {
    const atStall = (): DetectiveRunState => moveTo(newRun(), 'cheese-stall');
    const toOffice = { kind: 'move', locationId: 'mayor-office' };

    it('opens on a good roll', () => {
      const { run, outcome } = ok(resolveIntent(atStall(), toOffice, dice(15)));

      expect(outcome).toMatchObject({ entered: true, minutes: MOVE_MINUTES, consequences: [] });
      expect(run.locationId).toBe('mayor-office');
    });

    it('stays shut on a bad one, and the failure costs time', () => {
      const { run, outcome } = ok(resolveIntent(atStall(), toOffice, dice(5)));

      expect(outcome).toMatchObject({
        entered: false,
        minutes: MOVE_MINUTES + FAILED_ENTRY_MINUTES,
        consequences: ['time-lost'],
      });
      expect(run.locationId).toBe('cheese-stall');
      expect(run.clock.minute).toBe(atStall().clock.minute + MOVE_MINUTES + FAILED_ENTRY_MINUTES);
      expect(run.reputation).toBe(MAX_REPUTATION);
    });

    it('costs reputation as well on a natural 1', () => {
      const { run, outcome } = ok(resolveIntent(atStall(), toOffice, dice(1)));

      expect(outcome).toMatchObject({ entered: false, consequences: ['time-lost', 'reputation-lost'] });
      expect(run.reputation).toBe(MAX_REPUTATION - CRITICAL_FAILURE_REPUTATION);
    });

    it('is not asked again once the hero has been inside', () => {
      const inside = moveTo(atStall(), 'mayor-office');
      const rng = createRng(1);
      const before = rng.state();

      const back = ok(resolveIntent(moveTo(inside, 'cheese-stall'), toOffice, rng));

      expect(back.run.locationId).toBe('mayor-office');
      expect(back.details).toEqual([]);
      expect(rng.state()).toBe(before);
    });

    it('is affected by the hero’s traits in the scene', () => {
      const edit = (detectiveCase: DetectiveCase): void => {
        const office = detectiveCase.locations.find(({ id }) => id === 'mayor-office')!;
        office.access = { kind: 'skill', check: { skill: 'perception', difficulty: 13 } };
        office.situations = ['high-society'];
      };
      // perception 3 + die 10 = 13: a pass, and with a penalty of 2 a fail
      const plain = moveTo(newRun({ edit }), 'cheese-stall');
      const unlucky = moveTo(
        newRun({
          edit,
          traits: [
            {
              id: 'snob-trouble',
              polarity: 'negative',
              trigger: 'high-society',
              effects: [{ kind: 'modifier', skills: 'all', amount: -2 }],
              excludes: [],
            },
          ],
        }),
        'cheese-stall',
      );

      expect(ok(resolveIntent(plain, toOffice, dice(10))).outcome).toMatchObject({ entered: true });
      expect(ok(resolveIntent(unlucky, toOffice, dice(10))).outcome).toMatchObject({ entered: false });
    });
  });

  it('copes with a place that has no neighbours at all', () => {
    const run = newRun({
      edit: (detectiveCase) => {
        detectiveCase.locations.push({
          id: 'attic',
          name: 'Attic',
          description: 'Dusty.',
          connections: [],
          access: { kind: 'open' },
          situations: [],
        });
      },
    });

    const refused = resolveIntent(
      moveTo(run, 'attic'),
      { kind: 'move', locationId: 'market-square' },
      createRng(1),
    );

    expect(refused).toMatchObject({ ok: false, refusal: { code: 'not-adjacent' } });
  });
});

describe('search', () => {
  it('finds what is in plain sight and what the roll uncovers', () => {
    const run = moveTo(newRun(), 'cheese-stall');

    const { run: next, outcome, details } = ok(resolveIntent(run, { kind: 'search' }, dice(15)));

    expect(outcome).toMatchObject({
      kind: 'search',
      foundClueIds: ['flour-crumbs', 'blue-glove'],
      minutes: SEARCH_MINUTES,
    });
    expect(next.foundClueIds).toEqual(['flour-crumbs', 'blue-glove']);
    expect(next.searchedLocationIds).toEqual(['cheese-stall']);
    expect(details.map(({ subject }) => subject.id)).toEqual(['flour-crumbs', 'blue-glove']);
  });

  it('keeps hidden what the roll misses, with no penalty while something else was found', () => {
    const run = moveTo(newRun(), 'cheese-stall');

    const { run: next, outcome } = ok(resolveIntent(run, { kind: 'search' }, dice(2)));

    expect(outcome).toMatchObject({
      foundClueIds: ['blue-glove'],
      minutes: SEARCH_MINUTES,
      consequences: [],
    });
    expect(next.foundClueIds).toEqual(['blue-glove']);
  });

  it('turns up nothing, costs more time and can be tried again', () => {
    const run = inCellar();

    const failed = ok(resolveIntent(run, { kind: 'search' }, dice(2)));

    expect(failed.outcome).toEqual({
      kind: 'search',
      foundClueIds: [],
      minutes: SEARCH_MINUTES + FAILED_SEARCH_MINUTES,
      consequences: ['time-lost'],
    });
    expect(failed.run.foundClueIds).toEqual(['cellar-key']);
    const again = ok(resolveIntent(failed.run, { kind: 'search' }, dice(15)));
    expect(again.outcome).toMatchObject({ foundClueIds: ['cart-tracks'] });
  });

  it('costs reputation too on a natural 1', () => {
    const { run, outcome } = ok(resolveIntent(inCellar(), { kind: 'search' }, dice(1)));

    expect(outcome).toMatchObject({ consequences: ['time-lost', 'reputation-lost'] });
    expect(run.reputation).toBe(MAX_REPUTATION - CRITICAL_FAILURE_REPUTATION);
  });

  it('also frays the nerves on a natural 1, and not otherwise', () => {
    const { run } = ok(resolveIntent(inCellar(), { kind: 'search' }, dice(1)));
    expect(run.condition.nerves).toBe(9);

    const calm = ok(resolveIntent(inCellar(), { kind: 'search' }, dice(15)));
    expect(calm.run.condition.nerves).toBe(10);
  });

  it('wears the hero down as time passes and applies the condition to the roll', () => {
    const rested = ok(resolveIntent(inCellar(), { kind: 'search' }, dice(12)));
    const sedated = ok(resolveIntent(startCondition(inCellar(), 'sedated'), { kind: 'search' }, dice(12)));

    const modifierOf = (resolution: ReturnType<typeof ok>) => {
      const result = resolution.details[0]?.result;
      return result === undefined || result === 'auto' ? undefined : result.modifier;
    };
    expect(modifierOf(sedated)).toBe((modifierOf(rested) ?? 0) - 3);
    expect(sedated.run.condition.active).toEqual([
      { id: 'sedated', remaining: 360 - (sedated.outcome as { minutes: number }).minutes },
    ]);
  });

  it('has no penalty when there was nothing left to find', () => {
    const found = ok(resolveIntent(inCellar(), { kind: 'search' }, dice(15)));
    const rng = createRng(4);
    const before = rng.state();

    const empty = ok(resolveIntent(found.run, { kind: 'search' }, rng));

    expect(empty.outcome).toEqual({
      kind: 'search',
      foundClueIds: [],
      minutes: SEARCH_MINUTES,
      consequences: [],
    });
    expect(rng.state()).toBe(before);
  });

  it('is affected by the traits of the hero in the scene', () => {
    const edit = (detectiveCase: DetectiveCase): void => {
      detectiveCase.locations.find(({ id }) => id === 'storage-cellar')!.situations = ['confined-space'];
      detectiveCase.clues.find(({ id }) => id === 'cart-tracks')!.discovery = {
        skill: 'perception',
        difficulty: 14,
      };
    };
    // perception 3 + die 11 = 14: a pass, and with a penalty of 3 a fail
    const plain = inCellar(newRun({ edit }));
    const claustrophobic = inCellar(newRun({ edit, traits: [trait('claustrophobe')] }));

    expect(ok(resolveIntent(plain, { kind: 'search' }, dice(11))).outcome).toMatchObject({
      foundClueIds: ['cart-tracks'],
    });
    expect(ok(resolveIntent(claustrophobic, { kind: 'search' }, dice(11))).outcome).toMatchObject({
      foundClueIds: [],
    });
  });

  describe('a photographic memory', () => {
    const memory = [trait('photographic-memory')];

    it('finds the clue without a roll when the place is searched again', () => {
      const run = markSearched(inCellar(newRun({ traits: memory })), 'storage-cellar');
      const rng = dice(1);
      const before = rng.state();

      const { outcome, details, run: next } = ok(resolveIntent(run, { kind: 'search' }, rng));

      expect(outcome).toMatchObject({ foundClueIds: ['cart-tracks'], consequences: [] });
      expect(details).toEqual([{ subject: { kind: 'clue', id: 'cart-tracks' }, result: 'auto' }]);
      expect(rng.state()).toBe(before);
      expect(next.rngState).toBe(before);
    });

    it('does nothing the first time: a clue has to be missed once', () => {
      const run = inCellar(newRun({ traits: memory }));

      expect(ok(resolveIntent(run, { kind: 'search' }, dice(2))).outcome).toMatchObject({ foundClueIds: [] });
    });
  });

  it('never turns up a clue from a source the hero’s traits shut out', () => {
    const run = moveTo(
      newRun({
        traits: [trait('old-enemy-in-the-police')],
        edit: (detectiveCase) => {
          detectiveCase.clues.find(({ id }) => id === 'blue-glove')!.source = 'police-data';
        },
      }),
      'cheese-stall',
    );

    expect(ok(resolveIntent(run, { kind: 'look' }, createRng(1))).outcome).toMatchObject({
      foundClueIds: [],
    });
    expect(ok(resolveIntent(run, { kind: 'search' }, dice(15))).outcome).toMatchObject({
      foundClueIds: ['flour-crumbs'],
    });
  });
});

describe('every intent', () => {
  it('is validated: unknown kinds and missing parts are refused', () => {
    const run = newRun();
    const inputs = [
      { kind: 'teleport' },
      { kind: 'move' },
      { kind: 'move', locationId: 'Not An Id' },
      'look',
      null,
    ];

    for (const input of inputs) {
      expect(resolveIntent(run, input, createRng(1))).toMatchObject({
        ok: false,
        refusal: { code: 'invalid-intent' },
      });
    }
  });

  it('is refused once the run is over', () => {
    const over = endRun(newRun(), 'lost');

    expect(resolveIntent(over, { kind: 'look' }, createRng(1))).toMatchObject({
      ok: false,
      refusal: { code: 'run-over' },
    });
  });

  it('throws on a state that puts the hero where there is no place: that is a bug, not a refusal', () => {
    const corrupt = { ...newRun(), locationId: 'nowhere' };

    expect(() => resolveIntent(corrupt, { kind: 'search' }, createRng(1))).toThrow(RangeError);
  });

  it('is a pure function: the same state, intent and dice give the same resolution', () => {
    const run = moveTo(newRun(), 'cheese-stall');
    const before = structuredClone(run);

    const first = resolveIntent(run, { kind: 'search' }, createRng(7));
    const second = resolveIntent(run, { kind: 'search' }, createRng(7));

    expect(first).toEqual(second);
    expect(run).toEqual(before);
  });

  it('counts a turn and keeps the state of the dice', () => {
    const rng = createRng(9);

    const { run } = ok(resolveIntent(moveTo(newRun(), 'cheese-stall'), { kind: 'search' }, rng));

    expect(run.turn).toBe(1);
    expect(run.rngState).toBe(rng.state());
  });
});

describe('what the player and the narrator are told', () => {
  it('never names a clue that was not found, and never says how many are hidden', () => {
    const { outcome } = ok(resolveIntent(inCellar(), { kind: 'search' }, dice(2)));
    const text = JSON.stringify(outcome);

    expect(text).not.toContain('cart-tracks');
    expect(text).not.toContain('Round tracks');
    expect(outcome).toEqual({
      kind: 'search',
      foundClueIds: [],
      minutes: SEARCH_MINUTES + FAILED_SEARCH_MINUTES,
      consequences: ['time-lost'],
    });
  });

  it('keeps the checks, with what they were about, in the engine’s own details', () => {
    const { details } = ok(resolveIntent(inCellar(), { kind: 'search' }, dice(2)));

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      subject: { kind: 'clue', id: 'cart-tracks' },
      result: { success: false },
    });
  });
});

describe('resolveIntent: deduction and accusation', () => {
  const found = (): DetectiveRunState => findClue(findClue(newRun(), 'oven-receipt'), 'debt-ledger');

  it('routes a deduction to the verdict module and keeps no checks', () => {
    const resolution = ok(
      resolveIntent(found(), { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] }, dice(10)),
    );

    expect(resolution.outcome).toMatchObject({
      kind: 'deduce',
      result: 'insight',
      deductionId: 'motive-debt',
    });
    expect(resolution.run.insightIds).toContain('motive-debt');
    expect(resolution.details).toEqual([]);
  });

  it('routes an accusation, which ends the run', () => {
    const accusation = {
      kind: 'accuse',
      culpritId: 'baker',
      motiveInsightId: null,
      evidenceClueIds: ['oven-receipt', 'debt-ledger'],
    };
    const resolution = ok(resolveIntent(found(), accusation, dice(10)));

    expect(resolution.outcome).toMatchObject({ kind: 'accuse', verdict: 'unproven' });
    expect(resolution.run.status).toBe('lost');
    expect(resolution.details).toEqual([]);
  });

  it('passes the refusals of these intents through unchanged', () => {
    const refusal = resolveIntent(
      newRun(),
      { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] },
      dice(10),
    );

    expect(refusal).toMatchObject({ ok: false, refusal: { code: 'not-found' } });
    expect(
      resolveIntent(
        newRun(),
        { kind: 'accuse', culpritId: 'nobody', motiveInsightId: null, evidenceClueIds: [] },
        dice(10),
      ),
    ).toMatchObject({ ok: false, refusal: { code: 'unknown-suspect' } });
  });
});
