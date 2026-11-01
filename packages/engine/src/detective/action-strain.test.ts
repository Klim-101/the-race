// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, D20_SIDES, type Rng } from '../dice.js';
import { RULESET_VERSION } from '../run.js';
import { resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { ACTION_STRAIN_CAP_PER_DAY, ACTION_STRAIN_RULESET_VERSION } from './condition.js';
import {
  DetectiveRunStateSchema,
  createDetectiveRun,
  findClue,
  moveTo,
  strainByAction,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

/** A seed whose first d20 roll is `die`. */
function dice(die: number): Rng {
  for (let seed = 0; ; seed += 1) {
    if (createRng(seed).roll(D20_SIDES) === die) return createRng(seed);
  }
}

const newRun = (): DetectiveRunState =>
  createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'action-strain',
    rngState: 1,
    locale: 'en',
  });

const atBaker = (): DetectiveRunState => moveTo(findClue(newRun(), 'cart-tracks'), 'cheese-stall');
const withLink = (): DetectiveRunState => findClue(findClue(newRun(), 'blue-glove'), 'cart-tracks');
const inCellar = (): DetectiveRunState => moveTo(moveTo(newRun(), 'cheese-stall'), 'storage-cellar');

/** The same run as the ruleset before this one plays it, to say what is new by the difference. */
const before = (run: DetectiveRunState): DetectiveRunState => ({
  ...run,
  rulesetVersion: ACTION_STRAIN_RULESET_VERSION - 1,
});

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const play = (run: DetectiveRunState, intent: unknown, die: number) =>
  ok(resolveIntent(run, intent, dice(die)));

/** What the new rule took: the nerves the old ruleset would have left, less the nerves left now. */
function taken(run: DetectiveRunState, intent: unknown, die: number): number {
  return play(before(run), intent, die).run.condition.nerves - play(run, intent, die).run.condition.nerves;
}

const pressure = { kind: 'interrogate', suspectId: 'baker', approach: 'pressure', clueIds: ['cart-tracks'] };
const social = { ...pressure, approach: 'social' };
const wrongLink = { kind: 'deduce', clueIds: ['blue-glove', 'cart-tracks'] };

describe('the nerves failed work costs', () => {
  it('is a point for a pressure talk that did not move anyone, however it failed', () => {
    expect(taken(atBaker(), pressure, 5)).toBe(1);
    expect(play(atBaker(), pressure, 5).outcome).toMatchObject({
      succeeded: false,
      consequences: expect.arrayContaining(['nerves-lost']) as string[],
    });
  });

  it('is nothing for a pressure talk that worked, and nothing for a social one that did not', () => {
    expect(taken(atBaker(), pressure, 20)).toBe(0);
    expect(taken(atBaker(), social, 5)).toBe(0);
  });

  it('is a point for a link that leads nowhere, and none for a conclusion that was drawn or known', () => {
    expect(taken(withLink(), wrongLink, 10)).toBe(1);
    expect(play(withLink(), wrongLink, 10).outcome).toMatchObject({
      consequences: ['time-lost', 'nerves-lost'],
    });
  });

  it('is a point for a search that found nothing although something was there', () => {
    expect(taken(inCellar(), { kind: 'search' }, 2)).toBe(1);
    expect(taken(inCellar(), { kind: 'search' }, 20)).toBe(0);
  });

  it('is not counted twice with the point a blunder already costs', () => {
    expect(taken(atBaker(), pressure, 1)).toBe(0);
    expect(taken(inCellar(), { kind: 'search' }, 1)).toBe(0);
  });

  it('takes no more than the cap in a day, and starts over the next day', () => {
    let run = newRun();
    for (let step = 0; step < ACTION_STRAIN_CAP_PER_DAY + 2; step += 1) run = strainByAction(run);

    expect(run.condition.nerves).toBe(newRun().condition.nerves - ACTION_STRAIN_CAP_PER_DAY);
    expect(run.actionStrain).toEqual({ day: 1, spent: ACTION_STRAIN_CAP_PER_DAY });

    const tomorrow = strainByAction({ ...run, clock: { ...run.clock, day: 2 } });
    expect(tomorrow.condition.nerves).toBe(run.condition.nerves - 1);
    expect(tomorrow.actionStrain).toEqual({ day: 2, spent: 1 });
  });

  it('is left out of a run of an older ruleset, which plays as it did', () => {
    const old = before(newRun());

    expect(strainByAction(old)).toBe(old);
    expect(RULESET_VERSION).toBeGreaterThanOrEqual(ACTION_STRAIN_RULESET_VERSION);
  });

  it('is told to the player as a feeling at the bands, and a run saved without the count still loads', () => {
    const at = (nerves: number) =>
      viewRun({ ...newRun(), condition: { ...newRun().condition, nerves } }).warnings;

    expect(at(6)).toEqual([]);
    expect(at(5)).toEqual(['frayed-nerves']);
    expect(at(2)).toEqual(['frayed-nerves', 'ragged-nerves']);

    const older: Record<string, unknown> = { ...newRun() };
    delete older.actionStrain;
    expect(DetectiveRunStateSchema.parse(older).actionStrain).toEqual({ day: 1, spent: 0 });
  });
});
