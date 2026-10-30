// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { collectModifier } from '../modifiers.js';
import { DETECTIVE } from './archetype.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { CONDITION_IDS, modifierSources } from './condition.js';
import { EMPTY_RUN_LOG, RunLogSchema, recordResolution, replay } from './event-log.js';
import { IntentSchema, resolveIntent } from './actions.js';
import { NightReportSchema, passNight } from './night.js';
import {
  DetectiveRunStateSchema,
  createDetectiveRun,
  strainNerves,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';
import { settleSignalAtNight } from './signal-events.js';
import { BURNT_OUT, DETECTIVE_SIGNALS, FEELING_LOW, IN_LOVE } from './signals.js';
import { defineSignal, type SignalEffect } from '../signals.js';

function newRun(signalId?: string, seed = 1): DetectiveRunState {
  return createDetectiveRun({
    hero: { ...buildHero(), ...(signalId === undefined ? {} : { signalId }) },
    traits: [],
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'signal',
    rngState: seed,
    locale: 'en',
  });
}

/** The run with its first day over, so that the night's day is the second. */
function withNerves(run: DetectiveRunState, nerves: number): DetectiveRunState {
  return { ...run, condition: { ...run.condition, nerves } };
}

describe('the data of the first signals', () => {
  it('are all on the detective, with distinct ids, and are public heroes’ choices', () => {
    expect(DETECTIVE.signals).toBe(DETECTIVE_SIGNALS);
    expect(new Set(DETECTIVE_SIGNALS.map(({ id }) => id)).size).toBe(DETECTIVE_SIGNALS.length);
    expect(DETECTIVE_SIGNALS.map(({ id }) => id)).toEqual(['in-love', 'burnt-out', 'feeling-low']);
  });

  it('start only conditions the detective has, and name only roles for people', () => {
    for (const signal of DETECTIVE_SIGNALS) {
      for (const event of signal.events) {
        expect(event.role === undefined || event.role === 'partner').toBe(true);
        for (const variant of event.variants) {
          for (const effect of variant.effects) {
            if (effect.kind === 'condition') {
              expect(CONDITION_IDS as readonly string[]).toContain(effect.condition);
            }
          }
        }
      }
    }
  });
});

describe('settleSignalAtNight', () => {
  it('leaves a hero without a signal alone and uses no dice', () => {
    const run = newRun();
    const rng = createRng(3);
    const before = rng.state();
    const settled = settleSignalAtNight(run, rng);

    expect(settled).toEqual({ run, events: [] });
    expect(rng.state()).toBe(before);
  });

  it('uses no dice for a signal that schedules no events', () => {
    const rng = createRng(3);
    const before = rng.state();
    settleSignalAtNight(newRun('burnt-out'), rng);

    expect(rng.state()).toBe(before);
  });

  it('is the same for the same run and dice', () => {
    const run = withNerves(newRun('in-love'), 5);

    expect(settleSignalAtNight(run, createRng(11))).toEqual(settleSignalAtNight(run, createRng(11)));
  });

  it('records the event and moves nerves by the tone the dice chose, never past the cap or the last point', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed += 1) {
      const run = withNerves(newRun('in-love'), 5);
      const { run: settled, events } = settleSignalAtNight(run, createRng(seed));
      for (const event of events) {
        seen.add(event.tone);
        expect(settled.signalEvents).toContainEqual(event);
        expect(settled.condition.nerves).toBe(event.tone === 'encouraging' ? 7 : 2);
        expect(event.day).toBe(run.clock.day);
      }
      if (events.length === 0) expect(settled).toEqual(run);
    }

    expect([...seen].sort()).toEqual(['demoralising', 'encouraging']);
  });

  it('never takes the last point of nerves and never raises them above the maximum', () => {
    const low = { ...withNerves(newRun('in-love'), 1) };
    const high = withNerves(newRun('in-love'), 10);
    for (let seed = 0; seed < 100; seed += 1) {
      expect(settleSignalAtNight(low, createRng(seed)).run.condition.nerves).toBeGreaterThanOrEqual(1);
      expect(settleSignalAtNight(high, createRng(seed)).run.condition.nerves).toBeLessThanOrEqual(10);
    }
  });

  it('draws the tones of the data in about the proportion of its weights', () => {
    let warm = 0;
    let cold = 0;
    for (let seed = 0; seed < 3000; seed += 1) {
      for (const { tone } of settleSignalAtNight(withNerves(newRun('in-love'), 5), createRng(seed)).events) {
        if (tone === 'encouraging') warm += 1;
        else cold += 1;
      }
    }

    expect(warm / (warm + cold)).toBeGreaterThan(0.6);
    expect(warm / (warm + cold)).toBeLessThan(0.73);
    // The event comes on about two nights in five.
    expect((warm + cold) / 3000).toBeGreaterThan(0.35);
    expect((warm + cold) / 3000).toBeLessThan(0.45);
  });

  it('starts the condition of a neutral event, which the next night cures', () => {
    let cold = null as DetectiveRunState | null;
    for (let seed = 0; seed < 100 && cold === null; seed += 1) {
      const { run, events } = settleSignalAtNight(newRun('feeling-low'), createRng(seed));
      if (events.length > 0) cold = run;
    }

    expect(cold?.condition.active).toEqual([{ id: 'exhausted', remaining: 'night' }]);
    const next = passNight(cold!, createRng(1), 'active-hours', 2);
    expect(next.report.conditionsCleared).toEqual(['exhausted']);
  });

  it('holds an event back until its first day', () => {
    const late = defineSignal({
      id: 'late',
      voice: 'v',
      gift: 'g',
      cost: 'c',
      events: [
        {
          id: 'e',
          chance: 100,
          fromDay: 5,
          variants: [
            {
              tone: 'neutral',
              kind: 'k',
              weight: 1,
              effects: [{ kind: 'meter', meter: 'nerves', delta: -1 }],
            },
          ],
        },
      ],
    });
    withSignals([late], () => {
      const rng = createRng(1);
      const before = rng.state();

      expect(settleSignalAtNight(newRun('late'), rng).events).toEqual([]);
      expect(rng.state()).toBe(before);
    });
  });

  it('drifts a meter at the night and holds it under the cap', () => {
    const drifting = defineSignal({
      id: 'drifting',
      voice: 'v',
      gift: 'g',
      cost: 'c',
      meters: [
        { meter: 'sleep-debt', drift: 2 },
        { meter: 'nerves', drift: -9, cap: 6 },
        { meter: 'reputation', cap: 4 },
      ],
    });
    withSignals([drifting], () => {
      const run = {
        ...withNerves(newRun('drifting'), 8),
        condition: { ...withNerves(newRun('drifting'), 8).condition, sleepDebt: 9 },
      };
      const { run: settled } = settleSignalAtNight(run, createRng(1));

      expect(settled.condition.sleepDebt).toBe(10);
      expect(settled.condition.nerves).toBe(1);
      expect(settled.reputation).toBe(4);
    });
  });

  it('lets a drift down run the meter to zero when it is not the nerves’ last point', () => {
    withSignals([BURNT_OUT], () => {
      const run = { ...newRun('burnt-out'), condition: { ...newRun().condition, sleepDebt: 3, nerves: 10 } };
      const { run: settled } = settleSignalAtNight(run, createRng(1));

      expect(settled.condition.sleepDebt).toBe(2);
      expect(settled.condition.nerves).toBe(8);
    });
  });

  it('refuses data that names a meter or a condition the detective lacks', () => {
    const odd = (effect: SignalEffect) =>
      defineSignal({
        id: 'odd',
        voice: 'v',
        gift: 'g',
        cost: 'c',
        events: [
          { id: 'e', chance: 100, variants: [{ tone: 'neutral', kind: 'k', weight: 1, effects: [effect] }] },
        ],
      });
    withSignals([odd({ kind: 'meter', meter: 'luck', delta: 1 })], () => {
      expect(() => settleSignalAtNight(newRun('odd'), createRng(1))).toThrow(RangeError);
    });
    withSignals([odd({ kind: 'condition', condition: 'cursed' })], () => {
      expect(() => settleSignalAtNight(newRun('odd'), createRng(1))).toThrow();
    });
  });

  it('never touches evidence, the case or the clock', () => {
    for (const id of ['in-love', 'burnt-out', 'feeling-low']) {
      for (let seed = 0; seed < 60; seed += 1) {
        const run = { ...withNerves(newRun(id), 5), foundClueIds: ['c1'], insightIds: [] };
        const { run: settled } = settleSignalAtNight(run, createRng(seed));

        expect(settled.foundClueIds).toEqual(run.foundClueIds);
        expect(settled.insightIds).toEqual(run.insightIds);
        expect(settled.concededLieIds).toEqual(run.concededLieIds);
        expect(settled.garbledClueIds).toEqual(run.garbledClueIds);
        expect(settled.case).toBe(run.case);
        expect(settled.clock).toEqual(run.clock);
      }
    }
  });
});

/** Runs `body` with the detective's signals swapped for `signals`; the registry is restored afterwards. */
function withSignals(signals: readonly ReturnType<typeof defineSignal>[], body: () => void): void {
  const registry = DETECTIVE.signals as unknown as ReturnType<typeof defineSignal>[];
  const saved = [...registry];
  registry.splice(0, registry.length, ...signals);
  try {
    body();
  } finally {
    registry.splice(0, registry.length, ...saved);
  }
}

describe('signals at the table', () => {
  it('add their modifiers under their triggers through the one modifier total', () => {
    // Without a kit: a notebook would add its own point of reasoning to the signal's.
    const run = { ...newRun('feeling-low'), kit: [] };

    expect(collectModifier(modifierSources(run), 'perception', [])).toBe(-1);
    expect(collectModifier(modifierSources(run), 'reasoning', ['night'])).toBe(1);
    expect(collectModifier(modifierSources(newRun('in-love')), 'social', ['interrogation'])).toBe(1);
    expect(collectModifier(modifierSources(newRun()), 'perception', [])).toBe(0);
    expect(
      collectModifier(
        modifierSources({ traits: [], condition: newRun().condition, kit: [] }),
        'perception',
        [],
      ),
    ).toBe(0);
  });

  it('spare the nerves of a failure only where the signal says so', () => {
    expect(strainNerves(newRun('burnt-out')).condition.nerves).toBe(10);
    expect(strainNerves(newRun('burnt-out'), 'event').condition.nerves).toBe(9);
    expect(strainNerves(newRun('in-love')).condition.nerves).toBe(9);
    expect(strainNerves(newRun()).condition.nerves).toBe(9);
  });

  it('show the narrator the voice and the kind, and no tone or number', () => {
    const quiet = viewRun(newRun());
    expect(quiet.signal).toBeNull();
    expect(quiet.signalEvents).toEqual([]);

    let run = withNerves(newRun('in-love'), 5);
    let drawn = false;
    for (let seed = 0; seed < 100 && !drawn; seed += 1) {
      const settled = settleSignalAtNight(run, createRng(seed));
      drawn = settled.events.length > 0;
      if (drawn) run = settled.run;
    }
    const view = viewRun(run);

    expect(view.signal).toEqual({
      id: 'in-love',
      voice: IN_LOVE.voice,
      gift: IN_LOVE.gift,
      cost: IN_LOVE.cost,
    });
    expect(view.signalEvents).toHaveLength(1);
    expect(Object.keys(view.signalEvents[0] ?? {})).toEqual(['kind']);
    expect(JSON.stringify(view)).not.toMatch(/demoralising|encouraging/);
    // Only the events of today are shown.
    expect(viewRun({ ...run, clock: { ...run.clock, day: run.clock.day + 1 } }).signalEvents).toEqual([]);
  });

  it('are recorded in the night report and the log, and a replay reproduces them', () => {
    expect(FEELING_LOW.events).toHaveLength(1);
    let run = newRun('in-love');
    let log = EMPTY_RUN_LOG;
    const start = run;
    let sawEvent = false;
    for (let turn = 0; turn < 6 && run.status === 'active'; turn += 1) {
      const intent = IntentSchema.parse({ kind: 'rest' });
      const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
      if (!resolution.ok) throw new Error('Rest was refused.');
      log = recordResolution(log, run, intent, resolution);
      const night = resolution.night;
      if (night !== undefined && night.signalEvents.length > 0) sawEvent = true;
      run = resolution.run;
    }

    expect(RunLogSchema.parse(log)).toEqual(log);
    expect(replay(start, log)).toEqual({ ok: true, run });
    expect(sawEvent).toBe(true);
  });

  it('parse from an old night report and an old run that know nothing of signals', () => {
    const old: Record<string, unknown> = { ...passNight(newRun(), createRng(2), 'active-hours', 1).report };
    const oldRun: Record<string, unknown> = { ...newRun() };
    delete old.signalEvents;
    delete oldRun.signalEvents;

    expect(NightReportSchema.parse(old).signalEvents).toEqual([]);
    expect(DetectiveRunStateSchema.parse(oldRun).signalEvents).toEqual([]);
  });
});
