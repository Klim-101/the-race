// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { restoreRng } from '../dice.js';
import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../run.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import {
  EMPTY_RUN_LOG,
  RunLogSchema,
  appendEntry,
  deriveStats,
  recordResolution,
  replay,
  type LogEntry,
  type RunLog,
} from './event-log.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';

function newRun(rngState: number): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'event-log',
    rngState,
    locale: 'en',
  });
}

// A walk through the whole case that, depending on the dice, is refused here and there. Refused intents
// leave no entry, so the same script exercises every outcome from different seeds.
const SCRIPT: readonly unknown[] = [
  { kind: 'look' },
  { kind: 'look' },
  { kind: 'move', locationId: 'cheese-stall' },
  { kind: 'look' },
  { kind: 'search' },
  { kind: 'search' },
  { kind: 'interrogate', suspectId: 'baker', approach: 'social' },
  { kind: 'move', locationId: 'mayor-office' },
  { kind: 'search' },
  { kind: 'interrogate', suspectId: 'baker', approach: 'pressure', clueIds: ['blue-glove'] },
  { kind: 'deduce', clueIds: ['blue-glove', 'debt-ledger'] },
  { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] },
  { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] },
  { kind: 'move', locationId: 'market-square' },
  { kind: 'search' },
  { kind: 'move', locationId: 'storage-cellar' },
  { kind: 'search' },
  { kind: 'interrogate', suspectId: 'rival', approach: 'pressure', clueIds: ['blue-glove'] },
  { kind: 'accuse', culpritId: 'baker', motiveInsightId: 'motive-debt', evidenceClueIds: ['debt-ledger'] },
];

/** Plays the script the way a host would: dice restored from the state, every turn recorded. */
function play(
  initial: DetectiveRunState,
  script: readonly unknown[] = SCRIPT,
): { run: DetectiveRunState; log: RunLog } {
  let run = initial;
  let log = EMPTY_RUN_LOG;
  for (const intent of script) {
    const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
    log = recordResolution(log, run, intent, resolution);
    if (resolution.ok) run = resolution.run;
  }
  return { run, log };
}

const SEEDS = Array.from({ length: 300 }, (_, index) => index + 1);

describe('replay', () => {
  it('reaches the same final state from the same start and log, for many seeds', () => {
    const outcomes = new Set<string>();
    for (const seed of SEEDS) {
      const initial = newRun(seed);
      const { run, log } = play(initial);

      const replayed = replay(initial, log);

      expect(replayed).toEqual({ ok: true, run });
      for (const entry of log) outcomes.add(entry.outcome.kind);
    }
    expect([...outcomes].sort()).toEqual(['accuse', 'deduce', 'interrogate', 'look', 'move', 'search']);
  });

  it('replays a log that went through JSON, as a save does', () => {
    const initial = newRun(5);
    const { run, log } = play(initial);

    const loaded = RunLogSchema.parse(JSON.parse(JSON.stringify(log)));

    expect(replay(initial, loaded)).toEqual({ ok: true, run });
  });

  it('replays an empty log to the start', () => {
    const initial = newRun(1);

    expect(replay(initial, [])).toEqual({ ok: true, run: initial });
  });

  it('replays a prefix of the log to the state of that turn', () => {
    const initial = newRun(9);
    const { log } = play(initial);

    const half = replay(initial, log.slice(0, 3));

    expect(half.ok && half.run.turn).toBe(3);
  });

  describe('stops at the entry that does not fit', () => {
    const initial = newRun(3);
    const { log } = play(initial);
    const replace = (index: number, edit: (entry: LogEntry) => LogEntry): RunLog =>
      log.map((entry, at) => (at === index ? edit(entry) : entry));

    it('when a turn is missing', () => {
      expect(replay(initial, log.slice(1))).toEqual({ ok: false, index: 0, code: 'out-of-order' });
    });

    it('when the dice are not where the run stands', () => {
      const bent = replace(2, (entry) => ({ ...entry, rngStateBefore: entry.rngStateBefore + 1 }));

      expect(replay(initial, bent)).toEqual({ ok: false, index: 2, code: 'out-of-order' });
    });

    it('when the engine refuses what the log says happened', () => {
      const bent = replace(0, (entry) => ({
        ...entry,
        intent: { kind: 'move', locationId: 'mayor-office' },
      }));

      expect(replay(initial, bent)).toEqual({ ok: false, index: 0, code: 'refused' });
    });

    it('when the condition differs from what was written', () => {
      const bent = replace(1, (entry) => ({
        ...entry,
        condition: { ...entry.condition, nerves: entry.condition.nerves - 1 },
      }));

      expect(replay(initial, bent)).toEqual({ ok: false, index: 1, code: 'diverged' });
    });

    it('when the result differs from what was written', () => {
      const bent = replace(1, (entry) => ({ ...entry, reputation: entry.reputation - 1 }));

      expect(replay(initial, bent)).toEqual({ ok: false, index: 1, code: 'diverged' });
    });
  });
});

describe('recording', () => {
  it('leaves the log alone for a refused intent, and the old log is never changed', () => {
    const run = newRun(1);
    const refused = resolveIntent(run, { kind: 'move', locationId: 'mayor-office' }, restoreRng(1));
    const log = recordResolution(
      EMPTY_RUN_LOG,
      run,
      { kind: 'look' },
      resolveIntent(run, { kind: 'look' }, restoreRng(1)),
    );

    expect(recordResolution(log, run, { kind: 'move', locationId: 'mayor-office' }, refused)).toBe(log);
    expect(EMPTY_RUN_LOG).toEqual([]);
    expect(log).toHaveLength(1);
  });

  it('writes down the intent, the dice before the turn, the checks and the state after', () => {
    const run = newRun(11);
    const { log } = play(run, [{ kind: 'move', locationId: 'cheese-stall' }, { kind: 'search' }]);

    const entry = log[1];
    expect(entry).toMatchObject({ turn: 2, intent: { kind: 'search' }, outcome: { kind: 'search' } });
    expect(entry?.details.length).toBeGreaterThan(0);
    expect(entry?.rngStateBefore).toBe(
      play(run, [{ kind: 'move', locationId: 'cheese-stall' }]).run.rngState,
    );
  });

  it('refuses entries that do not follow on', () => {
    const { log: played } = play(newRun(2), [{ kind: 'look' }, { kind: 'look' }]);
    const log = [
      ...played,
      ...play(newRun(2), [{ kind: 'accuse', culpritId: 'baker', motiveInsightId: null, evidenceClueIds: [] }])
        .log,
    ];
    const first = log[0]!;

    expect(() => appendEntry(log.slice(0, 1), first)).toThrow(RangeError);
    expect(() => appendEntry(log.slice(0, 1), { ...first, turn: 3 })).toThrow(RangeError);
    const ended = log.slice(-1);
    expect(ended[0]?.status).not.toBe('active');
    expect(() => appendEntry(ended, { ...first, turn: (ended[0]?.turn ?? 0) + 1 })).toThrow(
      /nothing can follow/,
    );
  });

  it('rejects a stored log whose turns skip or that goes on after the end', () => {
    const { log } = play(newRun(2), [
      { kind: 'look' },
      { kind: 'accuse', culpritId: 'baker', motiveInsightId: null, evidenceClueIds: [] },
    ]);
    const first = log[0]!;
    const last = log[log.length - 1]!;

    expect(RunLogSchema.safeParse([first, { ...first, turn: 5 }]).success).toBe(false);
    expect(RunLogSchema.safeParse([{ ...last }, { ...first, turn: last.turn + 1 }]).success).toBe(false);
    expect(RunLogSchema.safeParse(log).success).toBe(true);
  });
});

describe('deriveStats', () => {
  it('is empty for a log with nothing in it', () => {
    expect(deriveStats([])).toEqual({
      turns: 0,
      minutes: 0,
      checksRolled: 0,
      checksPassed: 0,
      cluesFound: 0,
      insights: 0,
      criticalSuccesses: 0,
      criticalFailures: 0,
      verdict: null,
      status: 'active',
      endReason: null,
      clock: null,
    });
  });

  it('agrees with the state the run ended in, for many seeds', () => {
    for (const seed of SEEDS) {
      const { run, log } = play(newRun(seed));

      const stats = deriveStats(log);

      expect(stats.turns).toBe(run.turn);
      expect(stats.minutes).toBe((run.clock.day - 1) * MINUTES_PER_DAY + run.clock.minute - DAY_START_MINUTE);
      expect(stats.cluesFound).toBe(run.foundClueIds.length);
      expect(stats.insights).toBe(run.insightIds.length);
      expect(stats.status).toBe(run.status);
      expect(stats.clock).toEqual(run.clock);
      expect(stats.checksPassed).toBeLessThanOrEqual(stats.checksRolled);
    }
  });

  it('counts checks, criticals and the verdict', () => {
    const totals = { rolled: 0, passed: 0, wins: 0, fails: 0, verdicts: new Set<string | null>() };
    for (const seed of SEEDS) {
      const { log } = play(newRun(seed));
      const stats = deriveStats(log);
      const rolls = log
        .flatMap(({ details }) => details.map(({ result }) => result))
        .filter((r) => r !== 'auto');
      expect(stats.checksRolled).toBe(rolls.length);
      expect(stats.checksPassed).toBe(rolls.filter((roll) => roll.success).length);
      expect(stats.criticalSuccesses).toBe(rolls.filter((roll) => roll.die === 20).length);
      expect(stats.criticalFailures).toBe(rolls.filter((roll) => roll.die === 1).length);
      totals.rolled += stats.checksRolled;
      totals.wins += stats.criticalSuccesses;
      totals.fails += stats.criticalFailures;
      totals.verdicts.add(stats.verdict);
    }
    expect(totals.rolled).toBeGreaterThan(0);
    expect(totals.wins).toBeGreaterThan(0);
    expect(totals.fails).toBeGreaterThan(0);
    expect([...totals.verdicts].filter((verdict) => verdict !== null).length).toBeGreaterThan(0);
  });

  it('does not count a clue found without a roll as a check', () => {
    const { log } = play(newRun(4), [{ kind: 'look' }]);

    expect(deriveStats(log)).toMatchObject({ turns: 1, minutes: 5, checksRolled: 0, cluesFound: 1 });
  });
});

describe('what the narrator is told', () => {
  // The log names clues that were rolled for and missed, and the truth of an accusation. None of it may
  // reach the view, which is all the narrator sees.
  it('is never part of the run state or its view', () => {
    for (const seed of SEEDS) {
      const initial = newRun(seed);
      const { run, log } = play(initial, SCRIPT.slice(0, 5));
      const missed = log
        .flatMap(({ details }) => details)
        .filter(({ result }) => result !== 'auto' && !result.success)
        .map(({ subject }) => subject.id)
        .filter((id) => !run.foundClueIds.includes(id));
      if (missed.length === 0) continue;

      const view = JSON.stringify(viewRun(run));
      const logText = JSON.stringify(log);

      for (const id of missed) {
        expect(logText).toContain(id);
        expect(view).not.toContain(id);
      }
      expect(Object.keys(run)).not.toContain('log');
      expect(Object.keys(viewRun(run))).not.toContain('log');
      return;
    }
    throw new Error('No seed missed a clue.');
  });

  it('holds the truth of the accusation, which the view of a finished run does not name as such', () => {
    const { run, log } = play(newRun(1), [
      { kind: 'accuse', culpritId: 'baker', motiveInsightId: null, evidenceClueIds: [] },
    ]);

    expect(JSON.stringify(log)).toContain('Rolled the wheel into the cellar');
    expect(JSON.stringify(viewRun(run))).not.toContain('Rolled the wheel into the cellar');
  });
});
