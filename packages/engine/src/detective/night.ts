// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import { applyMeterRate, endReasonOfMeters } from '../meters.js';
import { DrawnSignalEventSchema } from '../signals.js';
import { DAY_START_MINUTE } from '../run.js';
import { DETECTIVE_NERVES, DETECTIVE_SLEEP_DEBT } from './archetype.js';
import { drawEvents } from './random-events.js';
import { LodgingSafetySchema, type LodgingSafety } from './case-schema.js';
import {
  ConditionIdSchema,
  meterReadings,
  withCondition,
  type ConditionId,
  type HeroCondition,
} from './condition.js';
import { settleSignalAtNight } from './signal-events.js';
import { landPending, type DetectiveRunState } from './run-state.js';

// The night is the main moment of recalculation, and it is ONE pure step over the state and the dice: the
// same state and dice always give the same night. It restores the nerves only in part, by less each day,
// pays sleep debt off only when the night is whole, heals what sleep heals and may bring an incident, by
// where the hero sleeps. An incident costs nerves, time or gear and never touches evidence: it has no
// access to clues, insights or the case, and `passNight` returns only the fields it changed.

/** What starts a night. */
export const NIGHT_CAUSES = ['active-hours', 'rest', 'collapse'] as const;
export const NightCauseSchema = z.enum(NIGHT_CAUSES);
export type NightCause = z.infer<typeof NightCauseSchema>;

/** Nerves the first night gives back; each later night gives one point less, down to the floor. */
export const NIGHT_NERVES_FIRST = 4;
export const NIGHT_NERVES_LESS_PER_DAY = 1;
/** The least a night restores: a collapse wakes the hero with exactly this much, and never with none. */
export const NIGHT_NERVES_FLOOR = 1;
/** Game time a night takes: timed conditions that outlast it run down by this much. */
export const NIGHT_MINUTES = DAY_START_MINUTE;
/** Conditions that a night's sleep heals outright, besides those that last until the night. */
export const NIGHT_HEALS: readonly ConditionId[] = ['injured', 'drunk'];

/** Percent chance of an incident for each kind of place the hero sleeps in. */
export const INCIDENT_CHANCE: Readonly<Record<LodgingSafety, number>> = { safe: 3, ordinary: 12, risky: 30 };
/** A place whose case says nothing about where to sleep is an ordinary one. */
export const DEFAULT_LODGING: LodgingSafety = 'ordinary';
export const INCIDENT_NERVES = 1;
export const INCIDENT_DELAY_MINUTES = 90;

export const IncidentSchema = z.discriminatedUnion('kind', [
  /** A scare: nerves lost, though never the last of them. */
  z.object({ kind: z.literal('nerves'), amount: z.int().min(1) }),
  /** The next day starts this much later than 08:00. */
  z.object({ kind: z.literal('time'), minutes: z.int().min(1) }),
  /** Gear stolen or spoiled, until it is replaced: a timed condition, never a clue. */
  z.object({ kind: z.literal('gear'), condition: ConditionIdSchema }),
]);
export type Incident = z.infer<typeof IncidentSchema>;

/** What the night did, for the engine's log; a replay must reproduce it exactly. */
export const NightReportSchema = z.object({
  cause: NightCauseSchema,
  /** `false` for a night that was cut short; it pays no sleep debt. */
  whole: z.boolean(),
  /** The day that ended. */
  day: z.int().min(1),
  locationId: z.string().min(1),
  lodging: LodgingSafetySchema,
  nervesRestored: z.int().min(0),
  sleepDebtPaid: z.int().min(0),
  conditionsCleared: z.array(ConditionIdSchema),
  incident: IncidentSchema.nullable(),
  /** The ids of the random events the night drew for the morning, in order; empty when the case has no pool. */
  events: z.array(z.string().min(1)),
  /** The events of the hero's character signal that the night drew, with their tones; see `signals.ts`. */
  signalEvents: z.array(DrawnSignalEventSchema).default([]),
  /** The state of the dice after the night, so the next turn picks up from it. */
  rngStateAfter: z.int().min(0).max(0xffffffff),
});
export type NightReport = z.infer<typeof NightReportSchema>;

/** Nerves that the night of `day` gives back. */
export function nervesRestoredOnNight(day: number): number {
  return Math.max(NIGHT_NERVES_FLOOR, NIGHT_NERVES_FIRST - NIGHT_NERVES_LESS_PER_DAY * (day - 1));
}

/**
 * A collapse: nerves are gone and the meters do not end the run for it, which they do for a breakdown
 * (nerves at zero with little reputation). It forces the night.
 */
export function isCollapse(run: DetectiveRunState): boolean {
  return run.condition.nerves === 0 && endReasonOfMeters(meterReadings(run)) === null;
}

/** Sleep heals injuries and drunkenness, takes what lasts until the night and runs the rest down. */
function sleptOff(condition: HeroCondition): HeroCondition {
  const active = condition.active.flatMap((item) => {
    // What lasts until the night ends with it, and a night's sleep heals some conditions outright.
    if (item.remaining === 'night' || NIGHT_HEALS.includes(item.id)) return [];
    const remaining = item.remaining - NIGHT_MINUTES;
    return remaining > 0 ? [{ id: item.id, remaining }] : [];
  });
  return { ...condition, active };
}

/** One die decides which: a scare, a late start or lost gear, a third of the incidents each. */
function incidentOf(rng: Rng): Incident {
  const die = rng.roll(3);
  if (die === 1) return { kind: 'nerves', amount: INCIDENT_NERVES };
  if (die === 2) return { kind: 'time', minutes: INCIDENT_DELAY_MINUTES };
  return { kind: 'gear', condition: 'ill-equipped' };
}

/**
 * The night after `day`, slept where the hero stands. The clock goes to the morning of the next day; the
 * run's other facts (clues, insights, the case, reputation) are not touched. Two dice are taken at most:
 * one for whether an incident happens and one for which, and then the draw of the next day's random events,
 * which takes none when the case has no pool.
 */
export function passNight(
  run: DetectiveRunState,
  rng: Rng,
  cause: NightCause,
  day: number,
): { readonly run: DetectiveRunState; readonly report: NightReport } {
  const whole = cause !== 'collapse';
  const location = run.case.locations.find(({ id }) => id === run.locationId);
  const lodging = location?.lodging ?? DEFAULT_LODGING;

  const healed = sleptOff(run.condition);
  const restored = whole
    ? nervesRestoredOnNight(day)
    : // A night cut short gives back no more than the floor, and no sleep debt.
      NIGHT_NERVES_FLOOR;
  let nerves = Math.min(DETECTIVE_NERVES.max, healed.nerves + restored);
  const nervesRestored = nerves - run.condition.nerves;
  const sleepDebt = whole
    ? applyMeterRate(DETECTIVE_SLEEP_DEBT, healed.sleepDebt, 'drain', 'night')
    : healed.sleepDebt;
  let condition: HeroCondition = { ...healed, nerves, sleepDebt };

  const incident = rng.roll(100) <= INCIDENT_CHANCE[lodging] ? incidentOf(rng) : null;
  let minute = DAY_START_MINUTE;
  if (incident !== null) {
    switch (incident.kind) {
      case 'nerves':
        // A scare never takes the last point: the hero must not wake up in a breakdown.
        nerves = Math.max(NIGHT_NERVES_FLOOR, nerves - incident.amount);
        condition = { ...condition, nerves };
        break;
      case 'time':
        minute += incident.minutes;
        break;
      case 'gear':
        condition = withCondition(condition, incident.condition);
        break;
    }
  }

  const slept: DetectiveRunState = { ...run, condition, clock: { day: day + 1, minute } };
  // The random events come first and the signal after them: both are drawn on the same dice, and their
  // effects (an hour lost, a scare, a message) land on the new morning.
  const drawn = drawEvents(landPending(slept, true), rng);
  const { run: settled, events: signalEvents } = settleSignalAtNight(drawn.run, rng);
  return {
    run: { ...settled, rngState: rng.state() },
    report: {
      cause,
      whole,
      day,
      locationId: run.locationId,
      lodging,
      nervesRestored,
      sleepDebtPaid: run.condition.sleepDebt - sleepDebt,
      conditionsCleared: run.condition.active
        .map(({ id }) => id)
        .filter((id) => !healed.active.some((item) => item.id === id)),
      incident,
      events: drawn.events.map(({ eventId }) => eventId),
      signalEvents: [...signalEvents],
      rngStateAfter: rng.state(),
    },
  };
}
