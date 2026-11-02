// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import { resolveIntent, type Resolved } from './actions.js';
import { DETECTIVE_NERVES } from './archetype.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { closeLocation, createDetectiveRun, moveTo, viewRun, type DetectiveRunState } from './run-state.js';
import { MAX_SITS_PER_DAY, SIT_MINUTES, SIT_NERVES, VENUE_RULESET_VERSION, sitsLeft } from './venue.js';

function newRun(
  options: { edit?: (detectiveCase: DetectiveCase) => void; nerves?: number; ruleset?: number } = {},
): DetectiveRunState {
  const detectiveCase = buildCheeseCase();
  const square = detectiveCase.locations.find((place) => place.id === 'market-square');
  if (square !== undefined) square.venue = 'teahouse';
  const parsed = DetectiveCaseSchema.parse(detectiveCase);
  options.edit?.(parsed);
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: parsed,
    seed: 'venue',
    rngState: 1,
    locale: 'en',
  });
  return {
    ...run,
    condition: { ...run.condition, nerves: options.nerves ?? 5 },
    ...(options.ruleset === undefined ? {} : { rulesetVersion: options.ruleset }),
  };
}

const sit = (run: DetectiveRunState, rng = createRng(1)): Resolved =>
  resolveIntent(run, { kind: 'sit' }, rng);

function sat(run: DetectiveRunState): Extract<Resolved, { ok: true }> {
  const resolution = sit(run);
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

const refusalOf = (run: DetectiveRunState): string => {
  const rng = createRng(1);
  const resolution = sit(run, rng);
  if (resolution.ok) throw new Error('Expected a refusal.');
  expect(rng.state()).toBe(createRng(1).state());
  return resolution.refusal.code;
};

describe('sitting down at a venue', () => {
  it('costs time and gives back a point of nerves, and counts the sitting', () => {
    const run = newRun();

    const done = sat(run);

    expect(done.outcome).toEqual({
      kind: 'sit',
      minutes: SIT_MINUTES,
      nervesRestored: SIT_NERVES,
      sitsLeft: MAX_SITS_PER_DAY - 1,
    });
    expect(done.run.condition.nerves).toBe(run.condition.nerves + SIT_NERVES);
    expect(done.run.clock.minute).toBe(run.clock.minute + SIT_MINUTES);
    expect(done.run.turn).toBe(run.turn + 1);
    expect(done.outcome).not.toHaveProperty('mishap');
  });

  it('is a choice and not a free refill: only so many sittings a day', () => {
    const first = sat(newRun());
    const second = sat(first.run);

    expect(second.outcome).toMatchObject({ sitsLeft: 0 });
    expect(refusalOf(second.run)).toBe('sat-enough');
    expect(sitsLeft(second.run)).toBe(0);
  });

  it('counts the sittings afresh with the day', () => {
    const spent = sat(sat(newRun()).run).run;

    const tomorrow = { ...spent, clock: { ...spent.clock, day: spent.clock.day + 1 } };

    expect(sitsLeft(tomorrow)).toBe(MAX_SITS_PER_DAY);
    expect(sat(tomorrow).outcome).toMatchObject({ sitsLeft: MAX_SITS_PER_DAY - 1 });
    expect(sat(tomorrow).run.sitting).toEqual({ day: tomorrow.clock.day, count: 1 });
  });

  it('gives nothing, and takes nothing, where there is no venue', () => {
    expect(refusalOf(moveTo(newRun(), 'cheese-stall'))).toBe('no-venue');
  });

  it('is for the ruleset of venues only', () => {
    expect(refusalOf(newRun({ ruleset: VENUE_RULESET_VERSION - 1 }))).toBe('no-venue');
  });

  it('gives nothing in a place that has been shut', () => {
    expect(refusalOf(closeLocation(newRun(), 'market-square'))).toBe('venue-closed');
  });

  it('gives nothing in a place that is not safe to sit in', () => {
    const risky = newRun({
      edit: (detectiveCase) => {
        const square = detectiveCase.locations.find((place) => place.id === 'market-square');
        if (square !== undefined) square.lodging = 'risky';
      },
    });

    expect(refusalOf(risky)).toBe('venue-unsafe');
  });

  it('is for a hero who is frayed, and fills no more than the nerves hold', () => {
    expect(refusalOf(newRun({ nerves: DETECTIVE_NERVES.max }))).toBe('not-frayed');
    const nearly = sat(newRun({ nerves: DETECTIVE_NERVES.max - 1 }));
    expect(nearly.run.condition.nerves).toBe(DETECTIVE_NERVES.max);
    expect(nearly.outcome).toMatchObject({ nervesRestored: 1 });
  });
});

describe('what the view says of a venue', () => {
  it('names the venue and the sittings left, and nothing for a place that is not one', () => {
    const run = newRun();

    expect(viewRun(run).location.venue).toEqual({ kind: 'teahouse', sitsLeft: MAX_SITS_PER_DAY });
    expect(viewRun(sat(run).run).location.venue).toEqual({
      kind: 'teahouse',
      sitsLeft: MAX_SITS_PER_DAY - 1,
    });
    expect(viewRun(moveTo(run, 'cheese-stall')).location.venue).toBeNull();
    expect(viewRun(newRun({ ruleset: VENUE_RULESET_VERSION - 1 })).location.venue).toBeNull();
  });
});
