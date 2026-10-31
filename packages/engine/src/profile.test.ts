// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../test/fixtures/cheese-case.js';
import { createRng } from './dice.js';
import { resolveIntent } from './detective/actions.js';
import { DetectiveCaseSchema } from './detective/case-schema.js';
import { EMPTY_RUN_LOG, recordResolution, type RunLog } from './detective/event-log.js';
import { createDetectiveRun, endRun, type DetectiveRunState } from './detective/run-state.js';
import {
  PROFILE_RECORD_VERSION,
  ProfileRecordSchema,
  computeProfileStats,
  profileRecordOf,
  type ProfileRecord,
} from './profile.js';
import { END_REASONS, statusOfEndReason, type EndReason } from './run.js';

function runOf(seed = 'profile'): DetectiveRunState {
  return createDetectiveRun({
    hero: { ...buildHero(), lifeState: 'retired', signalId: 'in-love' },
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed,
    rngState: 1,
    locale: 'en',
  });
}

/** A run played one turn (a look) and then ended for `reason`. */
function played(reason: EndReason, seed?: string): { run: DetectiveRunState; log: RunLog } {
  const start = runOf(seed);
  const rng = createRng(3);
  const resolution = resolveIntent(start, { kind: 'look' }, rng);
  if (!resolution.ok) throw new Error('refused');
  const log = recordResolution(EMPTY_RUN_LOG, start, { kind: 'look' }, resolution);
  return { run: endRun(resolution.run, statusOfEndReason(reason), reason), log };
}

function record(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  const { run, log } = played('proven');
  const made = profileRecordOf(run, log);
  if (!made) throw new Error('no record');
  return { ...made, ...overrides };
}

describe('profileRecordOf', () => {
  it('makes a record of a run that is over: the hero, the title, the end and how far it got', () => {
    const { run, log } = played('breakdown');
    const made = profileRecordOf(run, log);

    expect(made).toMatchObject({
      version: PROFILE_RECORD_VERSION,
      runId: 'profile',
      locale: 'en',
      hero: { background: run.hero.background, lifeState: 'retired', signalId: 'in-love' },
      endReason: 'breakdown',
      won: false,
      turns: 1,
      cluesFound: expect.any(Number) as unknown,
      traitsRevealed: 0,
      traitsTotal: 0,
    });
    expect(ProfileRecordSchema.safeParse(made).success).toBe(true);
  });

  it('is a win only for a proven case, and has no record for a run that is still going', () => {
    const won = played('proven');
    expect(profileRecordOf(won.run, won.log)?.won).toBe(true);
    expect(profileRecordOf(runOf(), EMPTY_RUN_LOG)).toBeUndefined();
  });

  it('leaves out a hero without a signal or a situation, and holds nothing of the case', () => {
    const start = runOf();
    const bare = { ...start, hero: { ...start.hero, signalId: undefined, lifeState: undefined } };
    const made = profileRecordOf(endRun(bare, 'lost', 'time-ran-out'), EMPTY_RUN_LOG);

    expect(made?.hero).not.toHaveProperty('signalId');
    const text = JSON.stringify(made);
    for (const secret of ['culpritId', 'motive', 'solution', 'timeline', 'deductions']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('computeProfileStats', () => {
  it('is all zeros for a profile with no runs', () => {
    const stats = computeProfileStats([]);

    expect(stats).toMatchObject({ runs: 0, won: 0, lost: 0, gaveUp: 0, winRate: 0, longestRunDays: 0 });
    expect(Object.keys(stats.byReason).sort()).toEqual([...END_REASONS].sort());
    expect(Object.values(stats.byReason).every((count) => count === 0)).toBe(true);
  });

  it('counts wins, losses and runs given up apart, and by every reason', () => {
    const stats = computeProfileStats([
      record({ endReason: 'proven', won: true }),
      record({ endReason: 'wrong', won: false }),
      record({ endReason: 'breakdown', won: false }),
      record({ endReason: 'gave-up', won: false }),
      record({ endReason: 'proven', won: true }),
    ]);

    expect(stats).toMatchObject({ runs: 5, won: 2, lost: 2, gaveUp: 1, winRate: 40 });
    expect(stats.byReason).toMatchObject({
      proven: 2,
      wrong: 1,
      breakdown: 1,
      'gave-up': 1,
      'time-ran-out': 0,
    });
  });

  it('adds up the play: days, longest run, turns, clues, insights and traits shown', () => {
    const stats = computeProfileStats([
      record({ days: 3, turns: 10, cluesFound: 4, insights: 1, traitsRevealed: 1 }),
      record({ days: 5, turns: 20, cluesFound: 6, insights: 2, traitsRevealed: 2 }),
    ]);

    expect(stats).toMatchObject({
      daysPlayed: 8,
      longestRunDays: 5,
      turnsPlayed: 30,
      cluesFound: 10,
      insights: 3,
      traitsRevealed: 3,
    });
  });

  it('counts the wins in a row, and the best there ever was', () => {
    const win = (won: boolean) => record({ won, endReason: won ? 'proven' : 'wrong' });
    const stats = computeProfileStats([win(true), win(true), win(true), win(false), win(true), win(true)]);

    expect(stats).toMatchObject({ bestStreak: 3, currentStreak: 2 });
    expect(computeProfileStats([win(true), win(false)]).currentStreak).toBe(0);
  });

  it('is computed from the records alone: the same list, in any copy, gives the same numbers', () => {
    const records = [record({ runId: 'a' }), record({ runId: 'b', won: false, endReason: 'wrong' })];

    expect(computeProfileStats(structuredClone(records))).toEqual(computeProfileStats(records));
  });
});
