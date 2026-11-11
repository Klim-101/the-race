// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../run.js';
import { resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { AWAKE_MINUTES_PER_DEBT, awakeDebtBetween } from './condition.js';
import { EMPTY_RUN_LOG, RunLogSchema, recordResolution, replay, type RunLog } from './event-log.js';
import { NIGHT_NERVES_FLOOR } from './night.js';
import { createDetectiveRun, DetectiveRunStateSchema, viewRun, type DetectiveRunState } from './run-state.js';

const at = (hour: number, minute = 0): number => hour * 60 + minute;
const NIGHT_HOURS = { fromMinute: at(22), untilMinute: at(2) };

function newRun(withHours = false): DetectiveRunState {
  const base = DetectiveCaseSchema.parse(buildCheeseCase());
  const detectiveCase = withHours
    ? {
        ...base,
        locations: base.locations.map((place) =>
          place.id === 'cheese-stall' ? { ...place, hours: NIGHT_HOURS } : place,
        ),
      }
    : base;
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'stay',
    rngState: createRng('stay').state(),
    locale: 'en',
  });
}

/** The run at a moment of the clock, staying up through the night of `night` unless it is none. */
const awake = (night: number | null, day: number, minute: number, withHours = false): DetectiveRunState => ({
  ...newRun(withHours),
  clock: { day, minute },
  awakeNight: night,
});

function carry(run: DetectiveRunState, intent: unknown): Extract<Resolved, { ok: true }> {
  const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}

describe('the sleep debt of the hours awake', () => {
  const NIGHT_ONE = MINUTES_PER_DAY; // midnight after day 1

  it('is none before midnight, one point for every two full hours after it, and none after the dawn', () => {
    expect(awakeDebtBetween(1, NIGHT_ONE - 600, NIGHT_ONE)).toBe(0);
    expect(awakeDebtBetween(1, NIGHT_ONE, NIGHT_ONE + AWAKE_MINUTES_PER_DEBT - 1)).toBe(0);
    expect(awakeDebtBetween(1, NIGHT_ONE, NIGHT_ONE + AWAKE_MINUTES_PER_DEBT)).toBe(1);
    expect(awakeDebtBetween(1, NIGHT_ONE, NIGHT_ONE + DAY_START_MINUTE)).toBe(4);
    expect(awakeDebtBetween(1, NIGHT_ONE, NIGHT_ONE + 3 * MINUTES_PER_DAY)).toBe(4);
  });

  it('does not depend on how the minutes were split into turns', () => {
    const whole = awakeDebtBetween(1, NIGHT_ONE + 30, NIGHT_ONE + 400);
    let pieces = 0;
    for (let from = NIGHT_ONE + 30; from < NIGHT_ONE + 400; from += 37) {
      pieces += awakeDebtBetween(1, from, Math.min(from + 37, NIGHT_ONE + 400));
    }

    expect(pieces).toBe(whole);
  });

  it('counts the night of the day the hero chose, and no other', () => {
    expect(awakeDebtBetween(2, NIGHT_ONE, NIGHT_ONE + DAY_START_MINUTE)).toBe(0);
    expect(awakeDebtBetween(2, 2 * MINUTES_PER_DAY, 2 * MINUTES_PER_DAY + 240)).toBe(2);
  });
});

describe('choosing to stay up', () => {
  it('takes no time, marks the night, and is in the log as a turn', () => {
    const run = { ...newRun(), clock: { day: 1, minute: at(20) } };

    const { run: after, outcome } = carry(run, { kind: 'stay-up' });

    expect(outcome).toEqual({ kind: 'stay-up' });
    expect(after.awakeNight).toBe(1);
    expect(after.clock).toEqual(run.clock);
    expect(after.turn).toBe(run.turn + 1);
    expect(
      RunLogSchema.parse(
        recordResolution(EMPTY_RUN_LOG, run, { kind: 'stay-up' }, carry(run, { kind: 'stay-up' })),
      ),
    ).toHaveLength(1);
  });

  it('is refused when the hero is already doing it, with nothing changed and no dice rolled', () => {
    const run = awake(1, 1, at(21));
    const rng = createRng('x');
    const before = rng.state();

    const resolution = resolveIntent(run, { kind: 'stay-up' }, rng);

    expect(resolution).toMatchObject({ ok: false, refusal: { code: 'already-awake' } });
    expect(rng.state()).toBe(before);
  });

  it('is shown in the view, and absent for a hero who sleeps at the end of the day', () => {
    expect(viewRun(newRun()).awake).toBeNull();
    expect(viewRun(awake(1, 1, at(20))).awake).toEqual({ minutesPastMidnight: 0 });
    expect(viewRun(awake(1, 2, at(1, 30))).awake).toEqual({ minutesPastMidnight: 90 });
  });

  it('is absent from a save made before it existed', () => {
    const old: Record<string, unknown> = { ...newRun() };
    delete old.awakeNight;

    expect(DetectiveRunStateSchema.parse(old).awakeNight).toBeNull();
  });
});

describe('the night of a hero who stays up', () => {
  it('does not come at midnight, and the clock runs on into the hours after it', () => {
    const { run, night } = carry(awake(1, 1, at(23, 50)), { kind: 'search' });

    expect(night).toBeUndefined();
    expect(run.clock.day).toBe(2);
    expect(run.clock.minute).toBeLessThan(DAY_START_MINUTE);
    expect(run.awakeNight).toBe(1);
  });

  it('comes at midnight for a hero who sleeps, as it always did', () => {
    const { run, night } = carry(awake(null, 1, at(23, 50)), { kind: 'search' });

    expect(night?.cause).toBe('active-hours');
    expect(run.clock).toEqual({ day: 2, minute: DAY_START_MINUTE });
  });

  it('costs sleep debt as the hours after midnight pass', () => {
    const start = awake(1, 2, at(3, 58));

    const { run } = carry(start, { kind: 'look' });

    // Five minutes carry the clock across 04:00, the second stretch of two hours.
    expect(run.condition.sleepDebt).toBe(start.condition.sleepDebt + 1);
  });

  it('lets the hero act in a place that is open only at night, and shuts it again by day', () => {
    const night = carry(awake(1, 2, at(0, 30), true), { kind: 'move', locationId: 'cheese-stall' });
    const later = resolveIntent(
      awake(1, 2, at(3), true),
      { kind: 'move', locationId: 'cheese-stall' },
      createRng('a'),
    );

    expect(night.outcome).toMatchObject({ kind: 'move', entered: true });
    expect(later).toMatchObject({ ok: false, refusal: { code: 'closed-hours' } });
  });

  it('ends at the dawn without sleep: no debt paid, no incident, and the clock where it is', () => {
    const start = awake(1, 2, at(7, 55));

    const { run, night } = carry(start, { kind: 'look' });

    expect(night).toMatchObject({
      cause: 'sleepless',
      whole: false,
      day: 1,
      sleepDebtPaid: 0,
      incident: null,
    });
    expect(run.awakeNight).toBeNull();
    expect(run.clock.day).toBe(2);
    expect(run.clock.minute).toBeGreaterThanOrEqual(DAY_START_MINUTE);
    expect(run.condition.sleepDebt).toBeGreaterThanOrEqual(start.condition.sleepDebt);
    expect(night?.nervesRestored).toBeGreaterThanOrEqual(0);
    expect(NIGHT_NERVES_FLOOR).toBeGreaterThan(0);
  });

  it('is cut short by a rest in the night hours: the night of the day before, with no debt paid', () => {
    const start = awake(1, 2, at(3));

    const { run, night } = carry(start, { kind: 'rest' });

    expect(night).toMatchObject({ cause: 'late-rest', whole: false, day: 1, sleepDebtPaid: 0 });
    expect(run.clock.day).toBe(2);
    expect(run.clock.minute).toBeGreaterThanOrEqual(DAY_START_MINUTE);
    expect(run.awakeNight).toBeNull();
    expect(run.condition.sleepDebt).toBe(start.condition.sleepDebt);
  });

  it('is given up by a rest before midnight, which is the whole night it always was', () => {
    const { run, night } = carry(awake(1, 1, at(21)), { kind: 'rest' });

    expect(night).toMatchObject({ cause: 'rest', whole: true, day: 1 });
    expect(run.clock.day).toBe(2);
    expect(run.awakeNight).toBeNull();
  });

  it('ends in a collapse when the nerves give out in the night hours, on the night of the day before', () => {
    const base = awake(1, 2, at(3));
    const start = { ...base, condition: { ...base.condition, nerves: 0 } };

    const { run, night } = carry(start, { kind: 'look' });

    expect(night).toMatchObject({ cause: 'collapse', whole: false, day: 1 });
    expect(run.clock.day).toBe(2);
    expect(run.awakeNight).toBeNull();
  });
});

describe('a whole night stayed up through, turn by turn', () => {
  it('replays from its log, gives the same state twice and costs the hero most of the night', () => {
    const first = { ...newRun(), clock: { day: 1, minute: at(21) } };
    let run = first;
    let log: RunLog = EMPTY_RUN_LOG;
    const causes: string[] = [];
    // The hero declares it, then walks between two places until the dawn.
    for (let step = 0; step < 300 && causes.length === 0 && run.status === 'active'; step += 1) {
      const intent =
        step === 0
          ? { kind: 'stay-up' }
          : {
              kind: 'move',
              locationId: run.locationId === 'market-square' ? 'cheese-stall' : 'market-square',
            };
      const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
      if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
      log = recordResolution(log, run, intent, resolution);
      if (resolution.night !== undefined) causes.push(resolution.night.cause);
      run = resolution.run;
    }

    expect(causes).toEqual(['sleepless']);
    expect(run.clock.day).toBe(2);
    expect(run.condition.sleepDebt).toBeGreaterThanOrEqual(first.condition.sleepDebt + 4);
    expect(RunLogSchema.parse(log).length).toBeGreaterThan(10);
    expect(replay(first, log)).toEqual({ ok: true, run });
  });
});
