// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { collectModifier } from '../modifiers.js';
import { IntentSchema, resolveIntent, type Resolution } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { CONDITION_IDS, modifierSources } from './condition.js';
import {
  BACKGROUND_SUPPLIES,
  CONSUMABLES,
  CONSUMABLE_IDS,
  ConsumableEffectSchema,
  initialSupplies,
  splitPending,
  viewPending,
  viewSupplies,
  withMeterDelta,
  withSupplyUsed,
} from './consumables.js';
import { EMPTY_RUN_LOG, RunLogSchema, recordResolution, replay, type RunLog } from './event-log.js';
import { BACKGROUNDS } from './gear.js';
import { passNight } from './night.js';
import {
  DetectiveRunStateSchema,
  createDetectiveRun,
  endRun,
  spendTime,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';
import { USE_MINUTES } from './use-item.js';

function newRun(
  supplies: DetectiveRunState['supplies'] = { coffee: 2, alcohol: 2, sedative: 2 },
  condition: { nerves: number; sleepDebt: number } = { nerves: 5, sleepDebt: 2 },
): DetectiveRunState {
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'consumables',
    rngState: 7,
    locale: 'en',
  });
  return { ...run, supplies, condition: { ...run.condition, ...condition } };
}

function use(run: DetectiveRunState, itemId: string): Resolution {
  return resolveIntent(run, { kind: 'use', itemId }, restoreRng(run.rngState));
}

function used(run: DetectiveRunState, itemId: string): DetectiveRunState {
  const resolution = use(run, itemId);
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution.run;
}

function refusalCode(resolution: Resolution): string | null {
  return resolution.ok ? null : resolution.refusal.code;
}

const modifier = (run: DetectiveRunState, skill: string): number =>
  collectModifier(modifierSources(run), skill, []);

describe('consumables as data', () => {
  it('gives every consumable a benefit and a visible price, in the closed vocabulary', () => {
    for (const id of CONSUMABLE_IDS) {
      const { nameKey, benefits, prices } = CONSUMABLES[id];
      expect(nameKey).toBe(`consumable.${id}`);
      expect(benefits.length).toBeGreaterThan(0);
      expect(prices.length).toBeGreaterThan(0);
      for (const effect of [...benefits, ...prices]) {
        expect(ConsumableEffectSchema.safeParse(effect).success).toBe(true);
        if (effect.kind === 'condition') expect(CONDITION_IDS).toContain(effect.id);
      }
    }
  });

  it('starts every background with something to use, from a table', () => {
    for (const background of BACKGROUNDS) {
      expect(Object.keys(initialSupplies(background)).length).toBeGreaterThan(0);
      expect(initialSupplies(background)).toEqual(BACKGROUND_SUPPLIES[background]);
    }
    expect(
      createDetectiveRun({
        hero: buildHero(),
        traits: [],
        case: DetectiveCaseSchema.parse(buildCheeseCase()),
        seed: 's',
        rngState: 1,
        locale: 'en',
      }).supplies,
    ).toEqual({ coffee: 1 });
  });

  it('counts supplies down and drops an item that is used up', () => {
    expect(withSupplyUsed({ coffee: 2, alcohol: 1 }, 'coffee')).toEqual({ coffee: 1, alcohol: 1 });
    expect(withSupplyUsed({ coffee: 1, alcohol: 1 }, 'coffee')).toEqual({ alcohol: 1 });
    expect(withSupplyUsed({}, 'coffee')).toEqual({});
  });

  it('holds a meter between zero and its maximum', () => {
    const base = { nerves: 9, sleepDebt: 1, active: [] };
    expect(withMeterDelta(base, { meter: 'nerves', delta: 5 }).nerves).toBe(10);
    expect(withMeterDelta(base, { meter: 'nerves', delta: -20 }).nerves).toBe(0);
    expect(withMeterDelta(base, { meter: 'sleepDebt', delta: -5 }).sleepDebt).toBe(0);
    expect(withMeterDelta(base, { meter: 'sleepDebt', delta: 99 }).sleepDebt).toBeLessThanOrEqual(10);
  });
});

describe('using a consumable', () => {
  it('costs time, a turn and one item, and is written in the outcome', () => {
    const run = newRun();
    const resolution = use(run, 'sedative');

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.outcome).toEqual({
      kind: 'use',
      itemId: 'sedative',
      minutes: USE_MINUTES,
      left: 1,
      scheduled: 0,
    });
    expect(resolution.run.turn).toBe(run.turn + 1);
    expect(resolution.run.clock.minute).toBe(run.clock.minute + USE_MINUTES);
    expect(resolution.run.supplies).toEqual({ coffee: 2, alcohol: 2, sedative: 1 });
    expect(run.supplies.sedative).toBe(2);
  });

  it('coffee gives nerves now and the price later: a crash after minutes, sleep debt at the night', () => {
    const run = newRun();
    const after = used(run, 'coffee');

    expect(after.condition.nerves).toBe(7);
    expect(after.condition.sleepDebt).toBe(2);
    expect(after.pendingEffects).toHaveLength(2);
    expect(viewRun(after).pending).toEqual([
      { source: 'coffee', meter: 'nerves', delta: -1, inMinutes: 180 },
      { source: 'coffee', meter: 'sleepDebt', delta: 1, inMinutes: null },
    ]);

    const crashed = spendTime(after, 180);
    const plain = spendTime({ ...after, pendingEffects: [] }, 180);
    expect(crashed.condition.nerves).toBe(plain.condition.nerves - 1);
    expect(crashed.pendingEffects).toHaveLength(1);
    expect(spendTime(after, 179).pendingEffects).toHaveLength(2);

    const night = passNight(crashed, restoreRng(3), 'rest', crashed.clock.day);
    expect(night.run.pendingEffects).toEqual([]);
    // The night pays sleep debt off, and then the price of the coffee lands on the morning.
    const without = passNight({ ...crashed, pendingEffects: [] }, restoreRng(3), 'rest', crashed.clock.day);
    expect(night.run.condition.sleepDebt).toBe(without.run.condition.sleepDebt + 1);
  });

  it('alcohol raises social and makes the hero drunk until the night sobers them up', () => {
    const run = newRun();
    const after = used(run, 'alcohol');

    expect(modifier(after, 'social')).toBe(modifier(run, 'social') + 2);
    expect(modifier(after, 'perception')).toBe(modifier(run, 'perception') - 2);
    expect(after.condition.active.map(({ id }) => id).sort()).toEqual(['drunk', 'emboldened']);

    const night = passNight(after, restoreRng(3), 'rest', after.clock.day);
    expect(night.run.condition.active.map(({ id }) => id)).not.toContain('drunk');
    expect(night.report.conditionsCleared).toContain('drunk');
  });

  it('a sedative restores nerves at once and costs perception for hours', () => {
    const run = newRun();
    const after = used(run, 'sedative');

    expect(after.condition.nerves).toBe(8);
    // Nerves above the tired band take its penalty away, so the sedative's three points are all that is left.
    expect(modifier(after, 'perception')).toBe(-3);
    expect(spendTime(after, 359).condition.active.map(({ id }) => id)).toContain('sedated');
    expect(spendTime(after, 360).condition.active.map(({ id }) => id)).not.toContain('sedated');
  });

  it('refuses an item that is no consumable, and one that is used up, with nothing changed', () => {
    const run = newRun({ coffee: 1 });
    const unknown = use(run, 'sword');
    const none = use(run, 'sedative');

    expect(refusalCode(unknown)).toBe('unknown-item');
    expect(refusalCode(none)).toBe('none-left');
    expect(refusalCode(use(used(run, 'coffee'), 'coffee'))).toBe('none-left');
    expect(IntentSchema.safeParse({ kind: 'use' }).success).toBe(false);
    expect(refusalCode(use(endRun(run, 'gave-up'), 'coffee'))).toBe('run-over');
  });

  it('takes no dice of its own and leaves the evidence alone', () => {
    const run = newRun();
    for (const id of CONSUMABLE_IDS) {
      const after = used(run, id);
      expect(after.rngState).toBe(run.rngState);
      expect(after.case).toEqual(run.case);
      expect(after.caseSeal).toBe(run.caseSeal);
      expect(after.foundClueIds).toEqual(run.foundClueIds);
      expect(after.insightIds).toEqual(run.insightIds);
      expect(after.garbledClueIds).toEqual(run.garbledClueIds);
      expect(DetectiveRunStateSchema.parse(after)).toEqual(after);
    }
  });
});

describe('supplies and pending prices in the state and view', () => {
  it('are empty for an old save, and shown by count in the view', () => {
    const old: Partial<DetectiveRunState> = newRun();
    delete old.supplies;
    delete old.pendingEffects;
    const parsed = DetectiveRunStateSchema.parse(old);

    expect(parsed.supplies).toEqual({});
    expect(parsed.pendingEffects).toEqual([]);
    expect(viewRun(newRun({ coffee: 2, sedative: 1 })).supplies).toEqual([
      { id: 'coffee', nameKey: 'consumable.coffee', count: 2 },
      { id: 'sedative', nameKey: 'consumable.sedative', count: 1 },
    ]);
    expect(viewSupplies({})).toEqual([]);
  });

  it('shows how long a price has to go, never below zero', () => {
    const pending = [
      { source: 'coffee', meter: 'nerves', delta: -1, due: { minute: 100 } },
      { source: 'coffee', meter: 'sleepDebt', delta: 1, due: { night: true } },
    ] as const;

    expect(viewPending(pending, 40)).toEqual([
      { source: 'coffee', meter: 'nerves', delta: -1, inMinutes: 60 },
      { source: 'coffee', meter: 'sleepDebt', delta: 1, inMinutes: null },
    ]);
    expect(viewPending(pending, 500)[0]?.inMinutes).toBe(0);
    expect(splitPending(pending, 100, false).due).toHaveLength(1);
    expect(splitPending(pending, 99, true).due).toHaveLength(1);
  });
});

describe('over whole runs', () => {
  const PLAN = ['coffee', 'alcohol', 'sedative', 'look', 'rest', 'coffee', 'sedative', 'rest', 'alcohol'];

  function play(seed: number): { initial: DetectiveRunState; run: DetectiveRunState; log: RunLog } {
    const picker = createRng(seed);
    const initial = newRun({ coffee: 3, alcohol: 2, sedative: 2 });
    let run = initial;
    let log: RunLog = EMPTY_RUN_LOG;
    for (let step = 0; step < 40 && run.status === 'active'; step += 1) {
      const pick = PLAN[picker.roll(PLAN.length) - 1] ?? 'look';
      const intent = pick === 'look' || pick === 'rest' ? { kind: pick } : { kind: 'use', itemId: pick };
      const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
      log = recordResolution(log, run, intent, resolution);
      if (resolution.ok) {
        run = resolution.run;
        for (const count of Object.values(run.supplies)) expect(count).toBeGreaterThanOrEqual(1);
        expect(run.foundClueIds.every((id) => run.case.clues.some((clue) => clue.id === id))).toBe(true);
      }
    }
    return { initial, run, log };
  }

  it('replays the same over several nights, with prices landing the same way', () => {
    let nights = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const { initial, run, log } = play(seed);
      nights += log.filter((entry) => entry.night !== null).length;

      expect(RunLogSchema.parse(log)).toEqual(log);
      expect(replay(initial, log)).toEqual({ ok: true, run });
      expect(run.caseSeal).toBe(initial.caseSeal);
    }
    expect(nights).toBeGreaterThan(60);
  });

  it('records supplies and the prices on their way in the log', () => {
    const run = newRun({ coffee: 1 });
    const intent = { kind: 'use', itemId: 'coffee' };
    const log = recordResolution(EMPTY_RUN_LOG, run, intent, use(run, 'coffee'));

    expect(log[0]?.supplies).toEqual({});
    expect(log[0]?.pendingEffects).toHaveLength(2);
    expect(log[0]?.outcome).toMatchObject({ kind: 'use', itemId: 'coffee', left: 0, scheduled: 2 });
    expect(replay(run, [{ ...log[0], supplies: { coffee: 1 } } as never])).toMatchObject({
      ok: false,
      code: 'diverged',
    });
  });
});
