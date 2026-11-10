// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import type { RememberedHero } from '../remembered.js';
import { restoreRng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { recordResolution, replay, type RunLog } from './event-log.js';
import {
  createDetectiveRun,
  DetectiveRunStateSchema,
  moveTo,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';
import { isCaseSealIntact } from './seal.js';

const REMEMBERED: RememberedHero = {
  name: 'Bo Reyes',
  background: 'police',
  endReason: 'time-ran-out',
  setting: { id: 'norland', name: { ru: 'Норланд', en: 'Norland' } },
  theme: 'forgery',
};

function newRun(seed: string, remembers?: RememberedHero | null): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed,
    rngState: createRng(seed).state(),
    locale: 'en',
    remembers,
  });
}

describe('the hero a run remembers', () => {
  it('is none unless the run was given one, and the view says so', () => {
    expect(newRun('a').remembers).toBeNull();
    expect(viewRun(newRun('a')).remembers).toBeNull();
  });

  it('is kept as given, shown in the view and read back from a save', () => {
    const run = newRun('a', REMEMBERED);

    expect(run.remembers).toEqual(REMEMBERED);
    expect(viewRun(run).remembers).toEqual(REMEMBERED);
    expect(DetectiveRunStateSchema.parse(JSON.parse(JSON.stringify(run)))).toEqual(run);
  });

  it('is none in a save from before it existed', () => {
    const old: Record<string, unknown> = { ...newRun('a') };
    delete old.remembers;

    expect(DetectiveRunStateSchema.parse(old).remembers).toBeNull();
  });

  it('cannot carry more than the public record: a trait or a fact of the old case is refused', () => {
    for (const extra of [{ traits: ['x'] }, { truth: 'the baker did it' }]) {
      expect(
        DetectiveRunStateSchema.safeParse({ ...newRun('a'), remembers: { ...REMEMBERED, ...extra } }).success,
      ).toBe(false);
    }
  });

  it('stays through every turn of the run', () => {
    const { run } = (() => {
      const resolution = resolveIntent(
        moveTo(newRun('a', REMEMBERED), 'cheese-stall'),
        { kind: 'look' },
        createRng('a'),
      );
      if (!resolution.ok) throw new Error('Refused.');
      return resolution;
    })();

    expect(run.remembers).toEqual(REMEMBERED);
  });
});

describe('a remembered hero is flavour and changes no outcome', () => {
  const INTENTS = [
    { kind: 'look' },
    { kind: 'search' },
    { kind: 'move', locationId: 'cheese-stall' },
    { kind: 'look' },
    { kind: 'search' },
    { kind: 'move', locationId: 'storage-cellar' },
    { kind: 'search' },
    { kind: 'rest' },
    { kind: 'move', locationId: 'market-square' },
    { kind: 'look' },
  ];

  /** The same turns played with and without a remembered hero, from the same seed, turn by turn. */
  function play(seed: string, remembers: RememberedHero | null) {
    let run = newRun(seed, remembers);
    let log: RunLog = [];
    const outcomes: unknown[] = [];
    for (const intent of INTENTS) {
      const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
      if (!resolution.ok) {
        outcomes.push(resolution.refusal);
        continue;
      }
      log = recordResolution(log, run, intent, resolution);
      outcomes.push(resolution.outcome, resolution.details);
      run = resolution.run;
    }
    return { first: newRun(seed, remembers), run, log, outcomes };
  }

  it('gives the same outcomes, the same log and the same ending, over many seeds', () => {
    for (let round = 0; round < 120; round += 1) {
      const seed = `fair-${String(round)}`;

      const without = play(seed, null);
      const with_ = play(seed, REMEMBERED);

      // The turns were played, not refused: the comparison is of something.
      expect(without.log.length).toBeGreaterThan(5);
      expect(with_.outcomes).toEqual(without.outcomes);
      expect(with_.log).toEqual(without.log);
      expect({ ...with_.run, remembers: null }).toEqual(without.run);
      expect(replay(with_.first, with_.log)).toEqual({ ok: true, run: with_.run });
    }
  });

  it('leaves the case and its seal as they were', () => {
    const without = newRun('seal', null);
    const with_ = newRun('seal', REMEMBERED);

    expect(with_.caseSeal).toBe(without.caseSeal);
    expect(with_.case).toEqual(without.case);
    expect(isCaseSealIntact(with_)).toBe(true);
  });
});
