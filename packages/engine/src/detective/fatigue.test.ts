// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng, type Rng } from '../dice.js';
import { DETECTIVE_NERVES } from './archetype.js';
import { resolveIntent, type Intent, type Resolution } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { EMPTY_RUN_LOG, RunLogSchema, recordResolution, replay, type RunLog } from './event-log.js';
import {
  MISHAPS,
  MISHAP_MINUTES,
  MISHAP_REPUTATION,
  REREAD_MINUTES,
  garbleLevelOf,
  garbledFoundClueIds,
  mishapChanceOf,
} from './fatigue.js';
import { DetectiveRunStateSchema, createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';

function newRun(
  condition: { nerves: number; sleepDebt: number } = { nerves: 10, sleepDebt: 0 },
): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'fatigue',
    rngState: 1,
    locale: 'en',
  });
  return { ...run, condition: { ...run.condition, ...condition } };
}

/** Nerves 2: a mishap chance of 15% and a garble level of 2. */
const TIRED = { nerves: 2, sleepDebt: 0 };

/** Dice that answer d100 and the mishap list from a script, and that fail on any other roll. */
function scripted(...rolls: number[]): Rng & { readonly left: () => number } {
  const queue = [...rolls];
  return {
    next: () => {
      throw new Error('Unexpected next()');
    },
    roll: () => {
      const value = queue.shift();
      if (value === undefined) throw new Error('Unexpected roll');
      return value;
    },
    state: () => 4242,
    left: () => queue.length,
  };
}

function ok(resolution: Resolution): Extract<Resolution, { ok: true }> {
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

describe('the pure rules', () => {
  it('maps nerves and sleep debt to a mishap chance and a garble level, taking the worst', () => {
    expect(mishapChanceOf({ nerves: 10, sleepDebt: 0 })).toBe(0);
    expect(garbleLevelOf({ nerves: 10, sleepDebt: 0 })).toBe(0);
    expect(mishapChanceOf({ nerves: 5, sleepDebt: 0 })).toBe(0);
    expect(mishapChanceOf({ nerves: 2, sleepDebt: 0 })).toBe(15);
    expect(garbleLevelOf({ nerves: 2, sleepDebt: 0 })).toBe(2);
    expect(garbleLevelOf({ nerves: 10, sleepDebt: 4 })).toBe(1);
    expect(mishapChanceOf({ nerves: 10, sleepDebt: 4 })).toBe(0);
    expect(mishapChanceOf({ nerves: 10, sleepDebt: 7 })).toBe(10);
    expect(garbleLevelOf({ nerves: 2, sleepDebt: 4 })).toBe(2);
    expect(garbleLevelOf({ nerves: 5, sleepDebt: 0 })).toBe(0);
    expect(DETECTIVE_NERVES.max).toBe(10);
  });
});

describe('mishaps', () => {
  it('leave the dice alone for a rested hero', () => {
    const rested = ok(resolveIntent(newRun(), { kind: 'look' }, scripted()));
    expect(rested.outcome).toEqual({ kind: 'look', foundClueIds: ['cellar-key'], minutes: 5 });
    expect(rested.run.rngState).toBe(4242);
  });

  it('do not happen when the roll is above the chance, and then take only that one roll', () => {
    const dice = scripted(16);
    const result = ok(resolveIntent(newRun(TIRED), { kind: 'look' }, dice));
    expect(dice.left()).toBe(0);
    expect(result.outcome).not.toHaveProperty('mishap');
    expect(result.outcome).toMatchObject({ minutes: 5 });
  });

  it('cost time for a mishap of that kind', () => {
    const index = MISHAPS.findIndex(({ cost }) => cost === 'time');
    const before = newRun(TIRED);
    const result = ok(resolveIntent(before, { kind: 'look' }, scripted(15, index + 1)));
    expect(result.outcome).toMatchObject({ mishap: MISHAPS[index]?.id, minutes: 5 + MISHAP_MINUTES });
    expect(result.run.clock.minute).toBe(before.clock.minute + 5 + MISHAP_MINUTES);
    expect(result.run.reputation).toBe(before.reputation);
    expect(result.run.rngState).toBe(4242);
  });

  it('cost reputation for a mishap of that kind', () => {
    const index = MISHAPS.findIndex(({ cost }) => cost === 'reputation');
    const before = newRun(TIRED);
    const result = ok(resolveIntent(before, { kind: 'look' }, scripted(1, index + 1)));
    expect(result.outcome).toMatchObject({ mishap: MISHAPS[index]?.id, minutes: 5 });
    expect(result.run.reputation).toBe(before.reputation - MISHAP_REPUTATION);
  });

  it('are listed among the consequences of an outcome that has them', () => {
    const result = ok(
      // A run of the ruleset before the road, whose walks draw no dice of their own (see `road.test.ts`).
      resolveIntent(
        { ...newRun(TIRED), rulesetVersion: 7 },
        { kind: 'move', locationId: 'cheese-stall' },
        scripted(1, 1),
      ),
    );
    expect(result.outcome).toMatchObject({ kind: 'move', consequences: ['mishap'], mishap: MISHAPS[0].id });
  });

  it('can follow a deduction that led nowhere', () => {
    const run = { ...newRun(TIRED), foundClueIds: ['cellar-key', 'flour-crumbs'] };
    const result = ok(
      resolveIntent(run, { kind: 'deduce', clueIds: ['cellar-key', 'flour-crumbs'] }, scripted(1, 1)),
    );
    expect(result.outcome).toMatchObject({
      result: 'nothing',
      consequences: ['time-lost', 'nerves-lost', 'mishap'],
    });
  });

  it('never follow the accusation, which ends the run', () => {
    const run = { ...newRun(TIRED), foundClueIds: ['cellar-key'] };
    const result = ok(
      resolveIntent(
        run,
        { kind: 'accuse', culpritId: 'baker', motiveInsightId: null, evidenceClueIds: [] },
        scripted(),
      ),
    );
    expect(result.outcome.kind).toBe('accuse');
    expect(result.outcome).not.toHaveProperty('mishap');
  });

  it('can be recorded in the log and replayed', () => {
    const start = newRun(TIRED);
    let run = start;
    let log: RunLog = EMPTY_RUN_LOG;
    for (const intent of [{ kind: 'look' }, { kind: 'look' }, { kind: 'look' }, { kind: 'look' }] as const) {
      const rng = restoreRng(run.rngState);
      const resolution = resolveIntent(run, intent, rng);
      log = recordResolution(log, run, intent, resolution);
      run = ok(resolution).run;
    }
    expect(RunLogSchema.parse(log)).toEqual(log);
    expect(log.some(({ outcome }) => 'garbleLevel' in outcome)).toBe(true);
    expect(replay(start, log)).toEqual({ ok: true, run });
  });
});

describe('garbled reading', () => {
  it('is clean for a rested hero', () => {
    const result = ok(resolveIntent(newRun(), { kind: 'look' }, scripted()));
    expect(result.outcome).not.toHaveProperty('garbleLevel');
    expect(result.run.garbledClueIds).toEqual([]);
  });

  it('garbles what a look finds, without a roll when the chance is zero, and the clue still counts as found', () => {
    const result = ok(resolveIntent(newRun({ nerves: 10, sleepDebt: 4 }), { kind: 'look' }, scripted()));
    expect(result.outcome).toMatchObject({ kind: 'look', foundClueIds: ['cellar-key'], garbleLevel: 1 });
    expect(result.run.foundClueIds).toEqual(['cellar-key']);
    expect(result.run.garbledClueIds).toEqual(['cellar-key']);
    const view = viewRun(result.run);
    expect(view.clues).toEqual([expect.objectContaining({ id: 'cellar-key', garbled: true })]);
  });

  it('garbles what a search finds, and does not garble the same clue twice', () => {
    const first = ok(resolveIntent(newRun(TIRED), { kind: 'look' }, scripted(100)));
    const second = ok(resolveIntent(first.run, { kind: 'search' }, scripted(100)));
    expect(second.outcome).toMatchObject({ kind: 'search', garbleLevel: 2 });
    expect(second.run.garbledClueIds).toEqual(['cellar-key']);
    const view = viewRun(second.run);
    expect(view.clues.every(({ garbled }) => garbled)).toBe(true);
  });

  it('marks the start of a dialogue and garbles no clue', () => {
    const run = { ...newRun(TIRED), foundClueIds: ['cellar-key'] };
    const result = ok(
      resolveIntent(
        run,
        { kind: 'interrogate', suspectId: 'rival', approach: 'social', clueIds: [] },
        createRng(7),
      ),
    );
    expect(result.outcome).toMatchObject({ kind: 'interrogate', garbleLevel: 2 });
    expect(result.run.garbledClueIds).toEqual([]);
  });

  it('is shown to the narrator only for clues that were found', () => {
    const run = { ...newRun(), garbledClueIds: ['cellar-key', 'blue-glove'], foundClueIds: ['cellar-key'] };
    expect(garbledFoundClueIds(run)).toEqual(['cellar-key']);
    expect(JSON.stringify(viewRun(run))).not.toContain('blue-glove');
  });
});

describe('re-reading', () => {
  const garbled = (): DetectiveRunState => ({
    ...newRun(TIRED),
    foundClueIds: ['cellar-key', 'debt-ledger'],
    garbledClueIds: ['cellar-key'],
  });

  it('clears the flag, costs time and never nerves, and is itself read clearly', () => {
    const before = garbled();
    const result = ok(resolveIntent(before, { kind: 'reread', clueId: 'cellar-key' }, scripted(100)));
    expect(result.outcome).toEqual({ kind: 'reread', clueId: 'cellar-key', minutes: REREAD_MINUTES });
    expect(result.run.garbledClueIds).toEqual([]);
    expect(result.run.condition.nerves).toBe(before.condition.nerves);
    expect(result.run.foundClueIds).toEqual(before.foundClueIds);
    expect(result.run.clock.minute).toBe(before.clock.minute + REREAD_MINUTES);
    expect(before.garbledClueIds).toEqual(['cellar-key']);
  });

  it('refuses a clue that was not found, the same for one that does not exist', () => {
    for (const clueId of ['blue-glove', 'no-such-clue']) {
      const result = resolveIntent(garbled(), { kind: 'reread', clueId }, scripted());
      expect(result).toMatchObject({ ok: false, refusal: { code: 'clue-not-found' } });
    }
  });

  it('refuses a clue that was read clearly', () => {
    const result = resolveIntent(garbled(), { kind: 'reread', clueId: 'debt-ledger' }, scripted());
    expect(result).toMatchObject({ ok: false, refusal: { code: 'not-garbled' } });
  });

  it('is needed before a deduction, and then the deduction works', () => {
    const run = {
      ...garbled(),
      foundClueIds: ['oven-receipt', 'debt-ledger'],
      garbledClueIds: ['debt-ledger'],
    };
    const link = { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] } as const;
    const refused = resolveIntent(run, link, scripted());
    expect(refused).toMatchObject({ ok: false, refusal: { code: 'garbled-clue' } });
    const reread = ok(resolveIntent(run, { kind: 'reread', clueId: 'debt-ledger' }, scripted(100)));
    const deduced = ok(resolveIntent(reread.run, link, scripted(100)));
    expect(deduced.outcome).toMatchObject({ result: 'insight', deductionId: 'motive-debt' });
  });

  it('is needed before an accusation lays the clue out as proof', () => {
    const run = { ...garbled(), garbledClueIds: ['cellar-key'] };
    const accuse: Intent = {
      kind: 'accuse',
      culpritId: 'baker',
      motiveInsightId: null,
      evidenceClueIds: ['cellar-key'],
    };
    expect(resolveIntent(run, accuse, scripted())).toMatchObject({
      ok: false,
      refusal: { code: 'garbled-clue' },
    });
    const clear = ok(resolveIntent(run, { kind: 'reread', clueId: 'cellar-key' }, scripted(100)));
    expect(ok(resolveIntent(clear.run, accuse, scripted(100))).outcome.kind).toBe('accuse');
  });

  it('is not demanded for a garbled clue that the link or the evidence leaves out', () => {
    const run = { ...garbled(), foundClueIds: ['cellar-key', 'debt-ledger', 'oven-receipt'] };
    const link = { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] } as const;
    expect(resolveIntent(run, link, scripted(100)).ok).toBe(true);
  });

  it('keeps the other refusals first, so that a garbled refusal names nothing hidden', () => {
    const run = garbled();
    expect(
      resolveIntent(run, { kind: 'deduce', clueIds: ['cellar-key', 'blue-glove'] }, scripted()),
    ).toMatchObject({
      refusal: { code: 'not-found' },
    });
    expect(
      resolveIntent(
        run,
        { kind: 'accuse', culpritId: 'baker', motiveInsightId: null, evidenceClueIds: ['blue-glove'] },
        scripted(),
      ),
    ).toMatchObject({ refusal: { code: 'not-found' } });
  });
});

describe('state', () => {
  it('refuses a garbled id that names no clue of the case', () => {
    const run = { ...newRun(), garbledClueIds: ['no-such-clue'] };
    expect(DetectiveRunStateSchema.safeParse(run).success).toBe(false);
  });

  it('defaults to nothing garbled for a save from before', () => {
    const saved: Record<string, unknown> = { ...newRun() };
    delete saved.garbledClueIds;
    expect(DetectiveRunStateSchema.parse(saved).garbledClueIds).toEqual([]);
  });
});

describe('over many seeds', () => {
  const INTENTS: readonly Intent[] = [
    { kind: 'look' },
    { kind: 'search' },
    { kind: 'move', locationId: 'cheese-stall' },
    { kind: 'move', locationId: 'market-square' },
    { kind: 'interrogate', suspectId: 'rival', approach: 'social', clueIds: [] },
    { kind: 'deduce', clueIds: ['oven-receipt', 'debt-ledger'] },
  ];

  it('no mishap or garble changes the evidence, and a garbled clue can always be read again', () => {
    let mishaps = 0;
    let garbles = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const start = newRun({ nerves: 2 + (seed % 2), sleepDebt: seed % 9 });
      let run: DetectiveRunState = { ...start, rngState: seed };
      const rng = createRng(seed);
      for (let turn = 0; turn < 8 && run.status === 'active'; turn += 1) {
        const intent = INTENTS[Math.floor(rng.next() * INTENTS.length)]!;
        const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
        if (!resolution.ok) continue;
        if ('mishap' in resolution.outcome) mishaps += 1;
        if ('garbleLevel' in resolution.outcome) garbles += 1;
        // The case and its seal are the same object of data, and found clues never get lost.
        expect(resolution.run.case).toEqual(run.case);
        expect(resolution.run.caseSeal).toBe(run.caseSeal);
        expect(resolution.run.foundClueIds).toEqual(expect.arrayContaining(run.foundClueIds));
        expect(DetectiveRunStateSchema.safeParse(resolution.run).success).toBe(true);
        run = resolution.run;
      }
      for (const id of run.garbledClueIds) {
        expect(run.foundClueIds).toContain(id);
        const reread = resolveIntent(run, { kind: 'reread', clueId: id }, createRng(seed));
        if (run.status === 'active') {
          const cleared = ok(reread).run;
          expect(cleared.garbledClueIds).not.toContain(id);
          expect(cleared.condition.nerves).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(mishaps).toBeGreaterThan(0);
    expect(garbles).toBeGreaterThan(0);
  });

  it('replays to the same state for every seed', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const start: DetectiveRunState = { ...newRun({ nerves: 2, sleepDebt: seed % 9 }), rngState: seed };
      let run = start;
      let log: RunLog = EMPTY_RUN_LOG;
      for (let turn = 0; turn < 6 && run.status === 'active'; turn += 1) {
        const intent = INTENTS[turn % INTENTS.length]!;
        const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
        log = recordResolution(log, run, intent, resolution);
        if (resolution.ok) run = resolution.run;
      }
      expect(replay(start, log)).toEqual({ ok: true, run });
    }
  });
});
