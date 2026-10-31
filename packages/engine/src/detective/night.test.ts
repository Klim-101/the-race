// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { DAY_START_MINUTE, MAX_REPUTATION, MINUTES_PER_DAY } from '../run.js';
import { IntentSchema, resolveIntent } from './actions.js';
import { DetectiveCaseSchema, LODGING_SAFETIES, type DetectiveCase } from './case-schema.js';
import { withCondition, type HeroCondition } from './condition.js';
import { settleClock } from './clock.js';
import {
  EMPTY_RUN_LOG,
  RunLogSchema,
  deriveStats,
  recordResolution,
  replay,
  type RunLog,
} from './event-log.js';
import {
  DEFAULT_LODGING,
  INCIDENT_CHANCE,
  INCIDENT_DELAY_MINUTES,
  NIGHT_NERVES_FIRST,
  NIGHT_NERVES_FLOOR,
  NightReportSchema,
  isCollapse,
  nervesRestoredOnNight,
  passNight,
  type Incident,
} from './night.js';
import { createDetectiveRun, changeReputation, type DetectiveRunState } from './run-state.js';
import { standingOf } from './random-events.js';
import { sealCase } from './seal.js';
import { isSolvable } from './solvability.js';

type Edit = (raw: ReturnType<typeof buildCheeseCase>) => void;

function caseWith(edit: Edit = () => undefined): DetectiveCase {
  const raw = buildCheeseCase();
  edit(raw);
  return DetectiveCaseSchema.parse(raw);
}

function newRun(edit?: Edit, seed = 1): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: caseWith(edit),
    seed: 'night',
    rngState: seed,
    locale: 'en',
  });
}

const lodgingOfSquare =
  (lodging: string): Edit =>
  (raw) => {
    const square = raw.locations[0];
    if (square !== undefined) square.lodging = lodging;
  };

const withCondition_ = (run: DetectiveRunState, condition: Partial<HeroCondition>): DetectiveRunState => ({
  ...run,
  condition: { ...run.condition, ...condition },
});

const SEEDS = Array.from({ length: 400 }, (_, index) => index + 1);

describe('the nerves a night gives back', () => {
  it('are only part of what was lost, and fewer each day, down to a floor', () => {
    expect([1, 2, 3, 4, 5, 9].map(nervesRestoredOnNight)).toEqual([NIGHT_NERVES_FIRST, 3, 2, 1, 1, 1]);
    expect(NIGHT_NERVES_FLOOR).toBe(1);
  });
});

const play = (
  initial: DetectiveRunState,
  intents: readonly unknown[],
): { run: DetectiveRunState; log: RunLog } => {
  let run = initial;
  let log = EMPTY_RUN_LOG;
  for (const intent of intents) {
    const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
    log = recordResolution(log, run, intent, resolution);
    if (resolution.ok) run = resolution.run;
  }
  return { run, log };
};

describe('passNight', () => {
  const tired = (): DetectiveRunState => withCondition_(newRun(), { nerves: 2, sleepDebt: 5, active: [] });

  it('restores part of the nerves, pays one point of sleep debt and moves the clock to the morning', () => {
    const { run, report } = passNight(tired(), createRng(1), 'rest', 1);

    expect(run.condition).toMatchObject({ nerves: 2 + NIGHT_NERVES_FIRST - incidentNerves(report.incident) });
    expect(run.condition.sleepDebt).toBe(4);
    expect(report).toMatchObject({ cause: 'rest', whole: true, day: 1, nervesRestored: NIGHT_NERVES_FIRST });
    expect(report.sleepDebtPaid).toBe(1);
    expect(run.clock.day).toBe(2);
  });

  it('restores less on a later day and never above the maximum', () => {
    const later = passNight(withCondition_(newRun(), { nerves: 2 }), createRng(1), 'rest', 3).report;
    expect(later.nervesRestored).toBe(2);
    const rested = passNight(withCondition_(newRun(), { nerves: 9 }), createRng(1), 'rest', 1).report;
    expect(rested.nervesRestored).toBe(1);
  });

  it('does not pay sleep debt below zero', () => {
    const { run, report } = passNight(newRun(), createRng(1), 'rest', 1);

    expect(run.condition.sleepDebt).toBe(0);
    expect(report.sleepDebtPaid).toBe(0);
  });

  it('cut short, as in a collapse, gives back the floor and pays no sleep debt', () => {
    const start = withCondition_(newRun(), { nerves: 0, sleepDebt: 5 });
    const { run, report } = passNight(start, createRng(1), 'collapse', 1);

    expect(report).toMatchObject({ whole: false, nervesRestored: NIGHT_NERVES_FLOOR, sleepDebtPaid: 0 });
    expect(run.condition.sleepDebt).toBe(5);
    expect(run.condition.nerves).toBeGreaterThan(0);
  });

  it('heals injuries and drunkenness, takes what lasts until the night and runs the rest down', () => {
    let start = newRun();
    for (const id of ['injured', 'drunk', 'exhausted', 'shaken', 'sedated', 'ill-equipped'] as const) {
      start = { ...start, condition: withCondition(start.condition, id) };
    }

    let checked = 0;
    for (const seed of SEEDS) {
      const { run, report } = passNight(start, restoreRng(seed), 'rest', 1);
      // An incident that costs gear adds one more condition; leave those nights out.
      if (report.incident?.kind === 'gear') continue;
      checked += 1;
      expect(report.conditionsCleared).toEqual(['injured', 'drunk', 'exhausted', 'shaken', 'sedated']);
      expect(run.condition.active).toEqual([{ id: 'ill-equipped', remaining: 2 * MINUTES_PER_DAY - 480 }]);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('is the same night for the same state and dice', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(passNight(tired(), createRng(seed), 'rest', 2)).toEqual(
        passNight(tired(), createRng(seed), 'rest', 2),
      );
    }
  });

  it('reports the dice it left behind, so that the next turn picks up from them', () => {
    const rng = createRng(3);
    const { run, report } = passNight(tired(), rng, 'rest', 1);

    expect(report.rngStateAfter).toBe(rng.state());
    expect(run.rngState).toBe(rng.state());
    expect(NightReportSchema.parse(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });

  it('draws nothing and takes no dice for the events when the case has no pool', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const { run, report } = passNight(newRun(), createRng(seed), 'rest', 1);
      const dice = createRng(seed);
      if (dice.roll(100) <= INCIDENT_CHANCE[DEFAULT_LODGING]) dice.roll(3);

      expect(report.events).toEqual([]);
      expect(run.drawnEvents).toEqual([]);
      expect(report.rngStateAfter).toBe(dice.state());
    }
  });
});

describe('the night draws the random events of the next day', () => {
  const POOL = [
    {
      id: 'brass-band',
      description: 'A brass band marches through the square.',
      weight: 3,
      effect: { kind: 'flavor' },
      duration: { kind: 'instant' },
    },
    {
      id: 'long-queue',
      description: 'A long queue at the bakery costs an hour.',
      weight: 3,
      effect: { kind: 'time-lost', minutes: 120 },
      duration: { kind: 'instant' },
    },
    {
      id: 'noisy-night',
      description: 'Noisy neighbours fray the nerves.',
      weight: 3,
      effect: { kind: 'nerves-cost', points: 2 },
      duration: { kind: 'instant' },
    },
    {
      id: 'sleepless',
      description: 'A sleepless night leaves the hero exhausted.',
      weight: 3,
      effect: { kind: 'condition', condition: 'exhausted' },
      duration: { kind: 'instant' },
    },
    {
      id: 'dug-up',
      description: 'The cellar road is dug up.',
      weight: 3,
      effect: { kind: 'location-closes', locationId: 'storage-cellar' },
      duration: { kind: 'permanent' },
    },
    {
      id: 'no-gossip',
      description: 'Nobody talks to strangers today.',
      weight: 3,
      effect: { kind: 'source-closes', source: 'police-data' },
      duration: { kind: 'until-day', day: 3 },
    },
  ];
  const pooled = (seed = 1): DetectiveRunState =>
    newRun((raw) => {
      raw.randomEvents = POOL;
    }, seed);

  it('records the drawn ids in the report and the run, with the dice and the effects carried through', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      const { run, report } = passNight(pooled(), rng, 'rest', 1);

      expect(run.drawnEvents.map(({ eventId }) => eventId)).toEqual(report.events);
      for (const { day } of run.drawnEvents) expect(day).toBe(2);
      expect(report.rngStateAfter).toBe(rng.state());
      expect(run.rngState).toBe(rng.state());
      expect(run.clock.day).toBe(2);
      // However much time an event costs, the morning stays on its own day.
      expect(run.clock.minute).toBeLessThan(MINUTES_PER_DAY);
      expect(report.events.length).toBeLessThanOrEqual(2);
      for (const id of report.events) seen.add(id);
      if (report.events.includes('long-queue')) {
        expect(run.clock.minute).toBeGreaterThanOrEqual(DAY_START_MINUTE + 120);
      }
      if (report.events.includes('sleepless')) {
        expect(run.condition.active.map(({ id }) => id)).toContain('exhausted');
      }
    }
    // The cellar is on the only route to the solution, so the engine never draws the event that shuts it.
    expect(seen.has('dug-up')).toBe(false);
    expect([...seen].sort()).toEqual(
      POOL.map(({ id }) => id)
        .filter((id) => id !== 'dug-up')
        .sort(),
    );
  });

  it('never ends the day before it starts, even when a late start is followed by lost time', () => {
    const start = { ...pooled(), condition: { ...pooled().condition, nerves: 1 } };
    for (const seed of SEEDS) {
      const { run } = passNight(start, createRng(seed), 'collapse', 1);
      expect(run.clock.day).toBe(2);
      expect(run.condition.nerves).toBeGreaterThanOrEqual(NIGHT_NERVES_FLOOR);
    }
  });

  it('is the same draw for the same state and dice', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(passNight(pooled(), createRng(seed), 'rest', 1)).toEqual(
        passNight(pooled(), createRng(seed), 'rest', 1),
      );
    }
  });

  it('is logged beside the night, and replay reproduces runs through several nights, for many seeds', () => {
    const script = [{ kind: 'rest' }, { kind: 'look' }, { kind: 'rest' }, { kind: 'search' }];
    let drawn = 0;
    for (const seed of SEEDS) {
      const initial = pooled(seed);
      const { run, log } = play(initial, script);

      expect(replay(initial, log)).toEqual({ ok: true, run });
      for (const entry of log) {
        const ids = entry.randomEvents.map(({ eventId }) => eventId);
        // A turn with a night has drawn the night's events alone; the others may have drawn the day's.
        if (entry.night !== null) expect(ids).toEqual(entry.night.events);
        drawn += ids.length;
      }
      // No drawn event ever cuts the last route: the case stays solvable on every day.
      expect(isSolvable(run.case, run.hero, run.traits, standingOf(run))).toBe(true);
    }
    expect(drawn).toBeGreaterThan(100);
  });

  it('is diverged when the log names other events than the draw gives', () => {
    const initial = pooled(1);
    const { log } = play(initial, [{ kind: 'rest' }]);
    const forged = log.map((entry) => ({
      ...entry,
      randomEvents: [],
      night: entry.night && { ...entry.night, events: ['x'] },
    }));

    expect(replay(initial, forged)).toMatchObject({ ok: false, code: 'diverged' });
  });
});

function incidentNerves(incident: Incident | null): number {
  return incident?.kind === 'nerves' ? incident.amount : 0;
}

describe('where the hero sleeps', () => {
  const incidents = (lodging: string | undefined): Incident[] => {
    const run = newRun(lodging === undefined ? undefined : lodgingOfSquare(lodging));
    return SEEDS.flatMap((seed) => {
      const { report } = passNight(run, createRng(seed), 'rest', 1);
      return report.incident === null ? [] : [report.incident];
    });
  };

  it('takes the sleeping place from where the hero is, and an ordinary one when the case says nothing', () => {
    expect(passNight(newRun(), createRng(1), 'rest', 1).report).toMatchObject({
      locationId: 'market-square',
      lodging: 'ordinary',
    });
    expect(passNight(newRun(lodgingOfSquare('risky')), createRng(1), 'rest', 1).report.lodging).toBe('risky');
    const moved = { ...newRun(lodgingOfSquare('safe')), locationId: 'cheese-stall' };
    expect(passNight(moved, createRng(1), 'rest', 1).report).toMatchObject({
      locationId: 'cheese-stall',
      lodging: 'ordinary',
    });
  });

  it('makes a safer place less likely to be robbed, in proportion to its chance', () => {
    const counts = Object.fromEntries(LODGING_SAFETIES.map((safety) => [safety, incidents(safety).length]));

    expect(counts.safe).toBeLessThan(counts.ordinary ?? 0);
    expect(counts.ordinary).toBeLessThan(counts.risky ?? 0);
    expect(incidents(undefined).length).toBe(counts.ordinary);
    for (const safety of LODGING_SAFETIES) {
      const expected = (SEEDS.length * INCIDENT_CHANCE[safety]) / 100;
      expect(Math.abs((counts[safety] ?? 0) - expected)).toBeLessThan(expected * 0.5 + 6);
    }
  });

  it('brings nerves, time or gear, and all three happen', () => {
    const kinds = new Set(incidents('risky').map(({ kind }) => kind));

    expect([...kinds].sort()).toEqual(['gear', 'nerves', 'time']);
  });

  it('never touches evidence, the case, reputation or where the hero is, for any seed', () => {
    const start = {
      ...newRun(lodgingOfSquare('risky')),
      foundClueIds: ['cellar-key'],
      insightIds: ['motive-debt'],
      concededLieIds: [],
    };
    let hits = 0;
    for (const seed of SEEDS) {
      const { run, report } = passNight(start, createRng(seed), 'rest', 1);
      expect(run.foundClueIds).toEqual(start.foundClueIds);
      expect(run.insightIds).toEqual(start.insightIds);
      expect(run.case).toBe(start.case);
      expect(run.caseSeal).toBe(start.caseSeal);
      expect(run.reputation).toBe(start.reputation);
      expect(run.locationId).toBe(start.locationId);
      expect(run.condition.nerves).toBeGreaterThan(0);
      if (report.incident !== null) hits += 1;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('applies each kind of incident to the right thing', () => {
    const seen = new Set<string>();
    const start = withCondition_(newRun(lodgingOfSquare('risky')), { nerves: 1 });
    for (const seed of SEEDS) {
      const { run, report } = passNight(start, createRng(seed), 'rest', 3);
      const { incident } = report;
      if (incident === null) {
        expect(run.clock).toEqual({ day: 4, minute: DAY_START_MINUTE });
        continue;
      }
      seen.add(incident.kind);
      if (incident.kind === 'nerves') {
        // The hero had 1, got 2 back and lost 1: never the last point.
        expect(run.condition.nerves).toBe(1 + 2 - incident.amount);
      } else if (incident.kind === 'time') {
        expect(run.clock).toEqual({ day: 4, minute: DAY_START_MINUTE + INCIDENT_DELAY_MINUTES });
      } else {
        expect(run.condition.active.map(({ id }) => id)).toEqual([incident.condition]);
      }
    }
    expect(seen.size).toBe(3);
  });

  it('keeps a scare from taking the last point of nerves', () => {
    const start = withCondition_(newRun(lodgingOfSquare('risky')), { nerves: 0 });
    for (const seed of SEEDS) {
      const { run } = passNight(start, createRng(seed), 'collapse', 1);
      expect(run.condition.nerves).toBeGreaterThanOrEqual(NIGHT_NERVES_FLOOR);
    }
  });
});

describe('a collapse', () => {
  const withNerves = (nerves: number, reputation: number): DetectiveRunState => ({
    ...changeReputation(newRun(), reputation - MAX_REPUTATION),
    condition: { ...newRun().condition, nerves },
  });

  it('is nerves at zero with reputation of 3 or more, and a breakdown is not one', () => {
    expect(isCollapse(withNerves(0, 3))).toBe(true);
    expect(isCollapse(withNerves(0, 10))).toBe(true);
    expect(isCollapse(withNerves(0, 2))).toBe(false);
    expect(isCollapse(withNerves(1, 10))).toBe(false);
  });

  it('forces the night: the day is lost and the hero wakes with nerves above zero', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const run = { ...withNerves(0, 5), rngState: seed, clock: { day: 1, minute: 600 } };
      const resolution = resolveIntent(run, { kind: 'look' }, restoreRng(seed));
      if (!resolution.ok) throw new Error('refused');
      expect(resolution.night).toMatchObject({ cause: 'collapse', whole: false, day: 1 });
      expect(resolution.run.clock.day).toBe(2);
      expect(resolution.run.clock.minute).toBeGreaterThanOrEqual(DAY_START_MINUTE);
      expect(resolution.run.condition.nerves).toBeGreaterThan(0);
      expect(resolution.run.status).toBe('active');
    }
  });

  it('ends the run as a breakdown, with no night, when reputation is below 3', () => {
    const run = { ...withNerves(0, 2), clock: { day: 1, minute: 600 } };

    const resolution = resolveIntent(run, { kind: 'look' }, createRng(1));

    expect(resolution).toMatchObject({ ok: true, run: { status: 'lost', endReason: 'breakdown' } });
    expect(resolution.ok && resolution.night).toBeUndefined();
  });

  it('does not let the night hide a breakdown when the action also crossed midnight', () => {
    const run = { ...withNerves(0, 2), clock: { day: 1, minute: MINUTES_PER_DAY - 1 } };

    const resolution = resolveIntent(run, { kind: 'look' }, createRng(1));

    expect(resolution).toMatchObject({ ok: true, run: { status: 'lost', endReason: 'breakdown' } });
  });
});

describe('the night in a turn', () => {
  it('accepts a rest intent', () => {
    expect(IntentSchema.parse({ kind: 'rest' })).toEqual({ kind: 'rest' });
  });

  it('comes when the hero rests: the next day starts and the turn counts', () => {
    const run = { ...newRun(), clock: { day: 1, minute: 700 } };

    const resolution = resolveIntent(run, { kind: 'rest' }, restoreRng(run.rngState));

    if (!resolution.ok) throw new Error('refused');
    expect(resolution.outcome).toEqual({ kind: 'rest' });
    expect(resolution.night).toMatchObject({ cause: 'rest', whole: true, day: 1 });
    expect(resolution.run).toMatchObject({ turn: 1, status: 'active' });
    expect(resolution.run.clock.day).toBe(2);
    expect(resolution.run.rngState).toBe(resolution.night?.rngStateAfter);
  });

  it('comes when the active hours run out, with the same dice as the rest of the turn', () => {
    const run = { ...newRun(), clock: { day: 1, minute: MINUTES_PER_DAY - 1 } };

    const resolution = resolveIntent(run, { kind: 'look' }, restoreRng(run.rngState));

    if (!resolution.ok) throw new Error('refused');
    expect(resolution.night).toMatchObject({ cause: 'active-hours', day: 1, whole: true });
    expect(resolution.run.clock.day).toBe(2);
    expect(resolution.run.clock.minute).toBeGreaterThanOrEqual(DAY_START_MINUTE);
  });

  it('does not come in the middle of the day', () => {
    const resolution = resolveIntent(newRun(), { kind: 'look' }, createRng(1));

    expect(resolution).toMatchObject({ ok: true, run: { clock: { day: 1, minute: DAY_START_MINUTE + 5 } } });
    expect(resolution.ok && resolution.night).toBeUndefined();
  });

  it('is skipped when the run is over', () => {
    const run = { ...newRun(), clock: { day: 3, minute: MINUTES_PER_DAY - 1 } };

    const resolution = resolveIntent(run, { kind: 'rest' }, createRng(1));

    expect(resolution).toMatchObject({ ok: true, run: { status: 'lost', endReason: 'time-ran-out' } });
    const accused = resolveIntent(
      newRun(),
      { kind: 'accuse', culpritId: 'rival', motiveInsightId: null, evidenceClueIds: [] },
      createRng(1),
    );
    expect(accused.ok && accused.night).toBeUndefined();
  });

  it('keeps a late start after an incident, though the clock settles to 08:00 otherwise', () => {
    const run = { ...newRun(), clock: { day: 2, minute: DAY_START_MINUTE + 30 } };

    expect(settleClock(run, 1).clock).toEqual(run.clock);
    expect(settleClock({ ...run, clock: { day: 2, minute: 10 } }, 1).clock).toEqual({
      day: 2,
      minute: DAY_START_MINUTE,
    });
  });

  it('is logged with what it did, and a replay reproduces it, for many seeds', () => {
    const script = [
      { kind: 'look' },
      { kind: 'rest' },
      { kind: 'move', locationId: 'cheese-stall' },
      { kind: 'search' },
      { kind: 'rest' },
      { kind: 'look' },
    ];
    const nights = new Set<string>();
    for (const seed of SEEDS) {
      const initial = newRun(lodgingOfSquare('risky'), seed);
      const { run, log } = play(initial, script);

      expect(replay(initial, log)).toEqual({ ok: true, run });
      expect(RunLogSchema.parse(JSON.parse(JSON.stringify(log)))).toEqual(log);
      for (const entry of log) {
        if (entry.night !== null) nights.add(entry.night.incident?.kind ?? 'none');
        expect(entry.night === null).toBe(entry.intent.kind !== 'rest');
      }
      expect(log.filter(({ night }) => night !== null)).toHaveLength(2);
    }
    expect([...nights].sort()).toEqual(['gear', 'nerves', 'none', 'time']);
  });

  it('is diverged when the log says another night than the rules give', () => {
    const initial = newRun(undefined, 4);
    const { log } = play(initial, [{ kind: 'rest' }]);
    const forged = log.map((entry) => ({
      ...entry,
      night: entry.night === null ? null : { ...entry.night, nervesRestored: entry.night.nervesRestored + 1 },
    }));

    expect(replay(initial, forged)).toMatchObject({ ok: false, code: 'diverged' });
  });

  it('is in the log of a collapse, and the stats still come from the log alone', () => {
    const initial = {
      ...newRun(undefined, 2),
      condition: { ...newRun().condition, nerves: 0 },
      clock: { day: 1, minute: 600 },
    };
    const { run, log } = play(initial, [{ kind: 'look' }]);

    expect(log[0]?.night).toMatchObject({ cause: 'collapse' });
    expect(deriveStats(log).clock).toEqual(run.clock);
  });

  it('reads a log written before nights were recorded', () => {
    const { log } = play(newRun(), [{ kind: 'look' }]);
    const old = JSON.parse(JSON.stringify(log)) as Record<string, unknown>[];
    for (const entry of old) delete entry.night;

    expect(RunLogSchema.parse(old).every(({ night }) => night === null)).toBe(true);
  });
});

describe('the lodging of a place', () => {
  it('is optional, and a case without one has the seal it always had', () => {
    const raw = buildCheeseCase();
    const parsed = DetectiveCaseSchema.parse(raw);

    expect(parsed.locations.every((location) => !('lodging' in location))).toBe(true);
    expect(sealCase(parsed)).toBe(sealCase(DetectiveCaseSchema.parse(JSON.parse(JSON.stringify(raw)))));
  });

  it('accepts the three safeties and nothing else', () => {
    for (const safety of LODGING_SAFETIES) expect(() => caseWith(lodgingOfSquare(safety))).not.toThrow();
    expect(() => caseWith(lodgingOfSquare('cosy'))).toThrow();
  });
});
