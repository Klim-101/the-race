// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Rng } from '../dice.js';
import type { MeterDefinition } from '../meters.js';
import { drawVariant, signalCap, type DrawnSignalEvent, type Signal, type SignalEffect } from '../signals.js';
import { DETECTIVE_NERVES, DETECTIVE_REPUTATION, DETECTIVE_SLEEP_DEBT } from './archetype.js';
import { ConditionIdSchema, withCondition } from './condition.js';
import { signalOfRun, type DetectiveRunState } from './run-state.js';

// The events of a character signal are drawn by the engine at the night, on the run's dice, after the night
// has done its own work. The engine decides whether an event comes, which of its variants (and so its tone)
// and what it does; the narrator is told the kind and writes the words. A signal event moves nerves, sleep
// debt, reputation or a timed condition and nothing else: it has no access to clues, insights or the case.

interface MeterAccess {
  readonly definition: MeterDefinition;
  readonly get: (run: DetectiveRunState) => number;
  readonly set: (run: DetectiveRunState, value: number) => DetectiveRunState;
}

const METERS: Readonly<Record<string, MeterAccess>> = {
  reputation: {
    definition: DETECTIVE_REPUTATION,
    get: (run) => run.reputation,
    set: (run, reputation) => ({ ...run, reputation }),
  },
  nerves: {
    definition: DETECTIVE_NERVES,
    get: (run) => run.condition.nerves,
    set: (run, nerves) => ({ ...run, condition: { ...run.condition, nerves } }),
  },
  'sleep-debt': {
    definition: DETECTIVE_SLEEP_DEBT,
    get: (run) => run.condition.sleepDebt,
    set: (run, sleepDebt) => ({ ...run, condition: { ...run.condition, sleepDebt } }),
  },
};

function meterOf(id: string): MeterAccess {
  const meter = METERS[id];
  if (meter === undefined) throw new RangeError(`The detective has no meter "${id}".`);
  return meter;
}

/**
 * A meter moves by `delta`: a loss never takes the last point (the hero must not wake in a breakdown), a
 * gain stops at the signal's cap.
 */
function moved(run: DetectiveRunState, signal: Signal, id: string, delta: number): DetectiveRunState {
  const { definition, get, set } = meterOf(id);
  const value = get(run);
  const next =
    delta > 0
      ? Math.min(signalCap(signal, definition), value + delta)
      : Math.max(Math.min(value, 1), value + delta);
  return set(run, next);
}

function applyEffect(run: DetectiveRunState, signal: Signal, effect: SignalEffect): DetectiveRunState {
  if (effect.kind === 'meter') return moved(run, signal, effect.meter, effect.delta);
  return { ...run, condition: withCondition(run.condition, ConditionIdSchema.parse(effect.condition)) };
}

/**
 * What a signal does at a night: its events are drawn (a die for whether each comes, a die for which
 * variant), then each meter rule drifts and caps its meter. A hero without a signal, or one whose signal
 * schedules no events, uses no dice. Returns the run with the events recorded and what was drawn.
 */
export function settleSignalAtNight(
  run: DetectiveRunState,
  rng: Rng,
): { readonly run: DetectiveRunState; readonly events: readonly DrawnSignalEvent[] } {
  const signal = signalOfRun(run);
  if (signal === undefined) return { run, events: [] };
  let current = run;
  const events: DrawnSignalEvent[] = [];
  for (const event of signal.events) {
    if (run.clock.day < event.fromDay || rng.roll(100) > event.chance) continue;
    const variant = drawVariant(event, rng);
    for (const effect of variant.effects) current = applyEffect(current, signal, effect);
    events.push({ eventId: event.id, kind: variant.kind, tone: variant.tone, day: run.clock.day });
  }
  for (const { meter, drift = 0 } of signal.meters) {
    const { definition, get, set } = meterOf(meter);
    const value = get(current);
    const drifted =
      drift > 0 ? Math.min(definition.max, value + drift) : Math.max(Math.min(value, 1), value + drift);
    current = set(current, Math.min(drifted, signalCap(signal, definition)));
  }
  return { run: { ...current, signalEvents: [...current.signalEvents, ...events] }, events };
}
