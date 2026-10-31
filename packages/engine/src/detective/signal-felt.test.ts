// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { distinctFelt, feltModifier, feltShield } from '../signals.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { BURNT_OUT, FEELING_LOW, IN_LOVE } from './signals.js';
import { createDetectiveRun, moveTo, type DetectiveRunState } from './run-state.js';

/** A seed whose first d20 roll is `die`, so that a test can choose how a check goes. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

function runOf(signalId?: string, edit?: (detectiveCase: DetectiveCase) => void): DetectiveRunState {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  edit?.(detectiveCase);
  return createDetectiveRun({
    hero: { ...buildHero(), ...(signalId === undefined ? {} : { signalId }) },
    traits: [],
    case: detectiveCase,
    seed: 'felt',
    rngState: 1,
    locale: 'en',
  });
}

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const talk = (run: DetectiveRunState, approach: 'social' | 'pressure', rng: Rng = createRng(3)) =>
  ok(resolveIntent(run, { kind: 'interrogate', suspectId: 'rival', approach, clueIds: [] }, rng));

describe('what a signal did in a turn', () => {
  it('names the gift that moved a roll: in love makes a talk easier, a plain modifier on a skill', () => {
    expect(talk(runOf('in-love'), 'social').felt).toEqual([{ kind: 'modifier', skill: 'social', amount: 1 }]);
  });

  it('names a trigger only in its situation: the modifier of a talk is not felt in a search', () => {
    // The pressure approach rolls another skill, which in love does not touch.
    expect(talk(runOf('in-love'), 'pressure').felt).toEqual([]);
    const search = ok(
      resolveIntent(moveTo(runOf('in-love'), 'cheese-stall'), { kind: 'search' }, createRng(5)),
    );
    expect(search.felt).toEqual([]);
  });

  it('names a cost as a negative amount, in a search too, once however many clues were rolled for', () => {
    const search = ok(
      resolveIntent(moveTo(runOf('feeling-low'), 'cheese-stall'), { kind: 'search' }, createRng(5)),
    );

    expect(search.felt).toEqual([{ kind: 'modifier', skill: 'perception', amount: -1 }]);
  });

  it('names a trigger that the place brings: low spirits read better at night', () => {
    const night = (detectiveCase: DetectiveCase): void => {
      const office = detectiveCase.locations.find(({ id }) => id === 'mayor-office');
      if (office) office.situations = ['night'];
    };
    const at = (edit?: (detectiveCase: DetectiveCase) => void) =>
      ok(resolveIntent(moveTo(runOf('feeling-low', edit), 'mayor-office'), { kind: 'search' }, createRng(5)));

    expect(at(night).felt).toContainEqual({ kind: 'modifier', skill: 'reasoning', amount: 1 });
    expect(at().felt).not.toContainEqual({ kind: 'modifier', skill: 'reasoning', amount: 1 });
  });

  it('names the nerves a signal spared on a blunder, in a search and in a talk', () => {
    const blunderSearch = ok(
      resolveIntent(moveTo(runOf('burnt-out'), 'cheese-stall'), { kind: 'search' }, dice(1)),
    );
    const blunderTalk = talk(runOf('burnt-out'), 'social', dice(1));

    expect(blunderSearch.felt).toContainEqual({ kind: 'shield', meter: 'nerves' });
    expect(blunderTalk.felt).toContainEqual({ kind: 'shield', meter: 'nerves' });
    // The nerves are whole, which is what the shield did.
    expect(blunderSearch.run.condition.nerves).toBe(runOf('burnt-out').condition.nerves);
    // A good roll has nothing to absorb.
    expect(talk(runOf('burnt-out'), 'social', dice(15)).felt).not.toContainEqual({
      kind: 'shield',
      meter: 'nerves',
    });
  });

  it('names the door that a signal helped to open or kept shut', () => {
    const move = ok(
      resolveIntent(
        moveTo(runOf('burnt-out'), 'cheese-stall'),
        { kind: 'move', locationId: 'mayor-office' },
        createRng(2),
      ),
    );

    expect(move.felt).toContainEqual({ kind: 'modifier', skill: 'social', amount: -1 });
  });

  it('is nothing for a hero without a signal, and for a turn that rolls nothing', () => {
    expect(talk(runOf(), 'social').felt).toEqual([]);
    expect(ok(resolveIntent(runOf('in-love'), { kind: 'look' }, createRng(1))).felt).toBeUndefined();
  });

  it('never names a hidden trait: a felt effect is the signal and the skill, nothing else', () => {
    for (const signal of [IN_LOVE, BURNT_OUT, FEELING_LOW]) {
      for (const item of [
        ...feltModifier(signal, ['interrogation', 'night'], 'social'),
        ...feltShield(signal, 'nerves', 'failure'),
      ]) {
        expect(Object.keys(item).toSorted()).toEqual(
          item.kind === 'modifier' ? ['amount', 'kind', 'skill'] : ['kind', 'meter'],
        );
      }
    }
  });
});

describe('feltModifier, feltShield and distinctFelt', () => {
  it('give nothing for no signal, a zero modifier or a loss the signal does not absorb', () => {
    expect(feltModifier(undefined, [], 'social')).toEqual([]);
    expect(feltModifier(IN_LOVE, [], 'social')).toEqual([]);
    expect(feltShield(undefined, 'nerves', 'failure')).toEqual([]);
    expect(feltShield(IN_LOVE, 'nerves', 'failure')).toEqual([]);
  });

  it('keeps one of each, in the order first felt', () => {
    const one = { kind: 'modifier', skill: 'perception', amount: -1 } as const;
    const two = { kind: 'shield', meter: 'nerves' } as const;

    expect(distinctFelt([one, two, one, two])).toEqual([one, two]);
  });
});
