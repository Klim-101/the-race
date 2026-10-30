// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { DAY_START_MINUTE, END_REASONS, MAX_REPUTATION, MINUTES_PER_DAY, statusOfEndReason } from '../run.js';
import { resolveIntent } from './actions.js';
import { validateCase } from './case-validator.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { ACTIVE_MINUTES_PER_DAY, daysPassed, settleClock } from './clock.js';
import {
  EMPTY_RUN_LOG,
  RunLogSchema,
  deriveStats,
  recordResolution,
  replay,
  type RunLog,
} from './event-log.js';
import {
  DetectiveRunStateSchema,
  changeReputation,
  closeLocation,
  createDetectiveRun,
  endRun,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

type Edit = (detectiveCase: ReturnType<typeof buildCheeseCase>) => void;

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
    seed: 'clock',
    rngState: seed,
    locale: 'en',
  });
}

const fleeOnDay = (day: number): Edit => {
  return (raw) => {
    raw.clock.worldEvents = [
      { day, description: 'The baker is seen packing a cart.', effect: { kind: 'culprit-flees' } },
    ];
  };
};

const at = (run: DetectiveRunState, day: number, minute: number): DetectiveRunState => ({
  ...run,
  clock: { day, minute },
});
/** Where the clock stands when an action has carried it past midnight, into `day`. */
const pastMidnight = (run: DetectiveRunState, day: number, minute = 0): DetectiveRunState =>
  at(run, day, minute);

function resolved(run: DetectiveRunState, intent: unknown): DetectiveRunState {
  const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.message}`);
  return resolution.run;
}

describe('end reasons', () => {
  it('lists the closed set, and only a proven case is won', () => {
    expect([...END_REASONS]).toEqual([
      'proven',
      'unproven',
      'wrong',
      'time-ran-out',
      'culprit-fled',
      'reputation-zero',
      'breakdown',
      'gave-up',
    ]);
    expect(END_REASONS.map(statusOfEndReason)).toEqual([
      'won',
      'lost',
      'lost',
      'lost',
      'lost',
      'lost',
      'lost',
      'gave-up',
    ]);
  });

  it('is null in a new run, and an old save without the field still parses', () => {
    const run = newRun();
    const old: Record<string, unknown> = { ...run };
    delete old.endReason;
    delete old.closedLocationIds;

    expect(run.endReason).toBeNull();
    expect(DetectiveRunStateSchema.parse(old)).toEqual(run);
  });

  it('must agree with the status', () => {
    const run = newRun();

    expect(DetectiveRunStateSchema.safeParse({ ...run, endReason: 'wrong' }).success).toBe(false);
    expect(
      DetectiveRunStateSchema.safeParse({ ...run, status: 'won', endReason: 'time-ran-out' }).success,
    ).toBe(false);
    expect(
      DetectiveRunStateSchema.safeParse({ ...run, status: 'lost', endReason: 'time-ran-out' }).success,
    ).toBe(true);
    expect(DetectiveRunStateSchema.safeParse({ ...run, status: 'lost' }).success).toBe(true);
  });

  it('is refused by endRun when it leads to another status', () => {
    expect(() => endRun(newRun(), 'won', 'wrong')).toThrow(RangeError);
    expect(endRun(newRun(), 'gave-up', 'gave-up')).toMatchObject({ status: 'gave-up', endReason: 'gave-up' });
    expect(endRun(newRun(), 'lost')).toMatchObject({ status: 'lost', endReason: null });
  });
});

describe('daysPassed', () => {
  const events: Edit = (raw) => {
    raw.clock.worldEvents = [
      { day: 2, description: 'Rain.' },
      {
        day: 2,
        description: 'The cellar floods.',
        effect: { kind: 'location-closes', locationId: 'storage-cellar' },
      },
      { day: 3, description: 'The baker leaves.', effect: { kind: 'culprit-flees' } },
      { day: 3, description: 'Never told.' },
    ];
  };

  it('fires nothing when no day turns', () => {
    expect(daysPassed(caseWith(events), 1, 1)).toEqual({
      firedEventIndexes: [],
      closedLocationIds: [],
      endReason: null,
    });
  });

  it('fires the events of a day in order, whatever their effect', () => {
    expect(daysPassed(caseWith(events), 1, 2)).toEqual({
      firedEventIndexes: [0, 1],
      closedLocationIds: ['storage-cellar'],
      endReason: null,
    });
  });

  it('stops at the culprit who flees, and fires nothing after', () => {
    expect(daysPassed(caseWith(events), 1, 3)).toEqual({
      firedEventIndexes: [0, 1, 2],
      closedLocationIds: ['storage-cellar'],
      endReason: 'culprit-fled',
    });
  });

  it('ends the case on the first day past the last one, even across several days', () => {
    expect(daysPassed(caseWith(), 3, 4)).toEqual({
      firedEventIndexes: [],
      closedLocationIds: [],
      endReason: 'time-ran-out',
    });
    expect(daysPassed(caseWith(), 1, 9).endReason).toBe('time-ran-out');
    expect(daysPassed(caseWith(), 1, 3).endReason).toBeNull();
  });

  it('lets an event of the last day fire before the days run out', () => {
    const passed = daysPassed(caseWith(fleeOnDay(3)), 2, 4);

    expect(passed.endReason).toBe('culprit-fled');
  });
});

describe('the start of the day', () => {
  it('puts a new run at 08:00 of day 1 with sixteen active hours before the night', () => {
    const run = newRun();

    expect(run.clock).toEqual({ day: 1, minute: DAY_START_MINUTE });
    expect(DAY_START_MINUTE).toBe(8 * 60);
    expect(DAY_START_MINUTE + ACTIVE_MINUTES_PER_DAY).toBe(MINUTES_PER_DAY);
  });

  it('gives a fresh hero no sleep debt and carries the night over to 08:00 of the next day', () => {
    const run = newRun();
    expect(run.condition.sleepDebt).toBe(0);

    const late = resolved(at(run, 1, MINUTES_PER_DAY - 1), { kind: 'look' });

    expect(late.clock).toEqual({ day: 2, minute: DAY_START_MINUTE });
    expect(late.status).toBe('active');
  });
});

describe('settleClock', () => {
  it('leaves a turn inside the active hours alone', () => {
    const run = at(newRun(), 1, MINUTES_PER_DAY - 1);

    expect(settleClock(run, 1)).toBe(run);
  });

  it('passes the night when the active hours are spent', () => {
    const settled = settleClock(pastMidnight(newRun(), 2), 1);

    expect(settled.clock).toEqual({ day: 2, minute: DAY_START_MINUTE });
    expect(settled.status).toBe('active');
  });

  it('fires the events of the day that begins, and shows their news', () => {
    const run = newRun((raw) => {
      raw.clock.worldEvents = [
        {
          day: 2,
          description: 'The cellar floods.',
          effect: { kind: 'location-closes', locationId: 'storage-cellar' },
        },
        { day: 3, description: 'Not yet.' },
      ];
    });
    expect(viewRun(run).news).toEqual([]);

    const settled = settleClock(pastMidnight(run, 2, 5), 1);

    expect(settled.closedLocationIds).toEqual(['storage-cellar']);
    expect(viewRun(settled).news).toEqual(['The cellar floods.']);
  });

  it('loses the run when the days run out', () => {
    const settled = settleClock(pastMidnight(newRun(), 4), 3);

    expect(settled).toMatchObject({ status: 'lost', endReason: 'time-ran-out' });
  });

  it('loses the run when the culprit flees before the case is solved', () => {
    const settled = settleClock(pastMidnight(newRun(fleeOnDay(2)), 2), 1);

    expect(settled).toMatchObject({ status: 'lost', endReason: 'culprit-fled', clock: { day: 2 } });
  });

  it('loses the run when reputation is gone', () => {
    const run = changeReputation(newRun(), -MAX_REPUTATION);

    expect(settleClock(run, 1)).toMatchObject({ status: 'lost', endReason: 'reputation-zero' });
  });

  it('does not touch a run that is already over', () => {
    const over = endRun(newRun(), 'won', 'proven');

    expect(settleClock(at(over, 9, 0), 1)).toMatchObject({ endReason: 'proven' });
  });

  it('reports the culprit fleeing before reputation, as the world moved first', () => {
    const run = changeReputation(pastMidnight(newRun(fleeOnDay(2)), 2), -MAX_REPUTATION);

    expect(settleClock(run, 1).endReason).toBe('culprit-fled');
  });
});

describe('closed places', () => {
  it('cannot be entered, even by a hero who could pass the door', () => {
    const run = closeLocation(newRun(), 'storage-cellar');

    const resolution = resolveIntent(run, { kind: 'move', locationId: 'storage-cellar' }, createRng(1));

    expect(resolution).toMatchObject({ ok: false, refusal: { code: 'location-closed' } });
  });

  it('refuse an id that names nothing', () => {
    expect(() => closeLocation(newRun(), 'nowhere')).toThrow(RangeError);
    expect(DetectiveRunStateSchema.safeParse({ ...newRun(), closedLocationIds: ['nowhere'] }).success).toBe(
      false,
    );
  });
});

describe('a turn that ends the run', () => {
  it('is lost on time when an action carries the clock past the last night', () => {
    const run = at(newRun(), 3, MINUTES_PER_DAY - 1);

    const after = resolved(run, { kind: 'look' });

    expect(after).toMatchObject({ status: 'lost', endReason: 'time-ran-out', turn: 1 });
  });

  it('is lost to the culprit on the day the event names', () => {
    const run = at(newRun(fleeOnDay(2)), 1, MINUTES_PER_DAY - 1);

    expect(resolved(run, { kind: 'look' })).toMatchObject({ status: 'lost', endReason: 'culprit-fled' });
  });

  it('is lost when a failed roll costs the last point of reputation', () => {
    let run = changeReputation(newRun(), 1 - MAX_REPUTATION);
    run = { ...run, locationId: 'cheese-stall', visitedLocationIds: ['market-square', 'cheese-stall'] };
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed += 1) {
      const resolution = resolveIntent(run, { kind: 'search' }, createRng(seed));
      if (resolution.ok && resolution.run.reputation === 0) {
        expect(resolution.run).toMatchObject({ status: 'lost', endReason: 'reputation-zero' });
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('can still be won on the last day: the accusation does not wait for the clock', () => {
    const run = at(newRun(fleeOnDay(3)), 2, 100);
    const accused = resolved(
      { ...run, foundClueIds: ['debt-ledger'], insightIds: ['motive-debt'] },
      {
        kind: 'accuse',
        culpritId: 'baker',
        motiveInsightId: 'motive-debt',
        evidenceClueIds: ['debt-ledger'],
      },
    );

    expect(accused).toMatchObject({ status: 'lost', endReason: 'unproven' });
  });
});

describe('the verdict sets the reason', () => {
  const accuse = (
    run: DetectiveRunState,
    culpritId: string,
    motive: string | null,
    evidence: string[],
  ): DetectiveRunState =>
    resolved(
      { ...run, foundClueIds: ['flour-crumbs', 'cart-tracks', 'debt-ledger'], insightIds: ['motive-debt'] },
      { kind: 'accuse', culpritId, motiveInsightId: motive, evidenceClueIds: evidence },
    );

  it('names proven, unproven and wrong', () => {
    const run = newRun();

    expect(accuse(run, 'baker', 'motive-debt', ['flour-crumbs', 'cart-tracks'])).toMatchObject({
      status: 'won',
      endReason: 'proven',
    });
    expect(accuse(run, 'baker', null, [])).toMatchObject({ status: 'lost', endReason: 'unproven' });
    expect(accuse(run, 'rival', null, [])).toMatchObject({ status: 'lost', endReason: 'wrong' });
  });
});

describe('the event log', () => {
  function playUntilEnd(initial: DetectiveRunState): { run: DetectiveRunState; log: RunLog } {
    let run = initial;
    let log = EMPTY_RUN_LOG;
    const dice = createRng(`walk-${String(initial.rngState)}`);
    for (let step = 0; step < 300 && run.status === 'active'; step += 1) {
      const intent =
        dice.roll(4) === 1
          ? { kind: 'search' }
          : dice.roll(2) === 1
            ? { kind: 'look' }
            : {
                kind: 'move',
                locationId: ['market-square', 'cheese-stall', 'storage-cellar', 'mayor-office'][
                  dice.roll(4) - 1
                ],
              };
      const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
      log = recordResolution(log, run, intent, resolution);
      if (resolution.ok) run = resolution.run;
    }
    return { run, log };
  }

  const mixed: Edit = (raw) => {
    raw.clock.worldEvents = [
      { day: 2, description: 'Rain.' },
      { day: 3, description: 'The baker leaves.', effect: { kind: 'culprit-flees' } },
    ];
  };

  it('records why the run ended and which events fired, and replays, for many seeds', () => {
    const reasons = new Set<string | null>();
    const fired = new Set<number>();
    for (let seed = 1; seed <= 120; seed += 1) {
      const initial = newRun(mixed, seed);
      const { run, log } = playUntilEnd(initial);

      expect(run.status).not.toBe('active');
      const last = log[log.length - 1];
      expect(last?.endReason).toBe(run.endReason);
      expect(deriveStats(log).endReason).toBe(run.endReason);
      expect(replay(initial, log)).toEqual({ ok: true, run });
      expect(RunLogSchema.parse(JSON.parse(JSON.stringify(log)))).toEqual(log);
      for (const entry of log) for (const index of entry.worldEvents) fired.add(index);
      reasons.add(run.endReason);
      expect(log.slice(0, -1).every(({ endReason }) => endReason === null)).toBe(true);
    }
    expect([...fired].sort()).toEqual([0, 1]);
    expect(reasons.has('culprit-fled')).toBe(true);
    // Hundreds of replays: over the default limit when the whole suite runs under coverage.
  }, 30_000);

  it('is diverged when the recorded reason is not the one the rules give', () => {
    const initial = newRun(mixed, 4);
    const { log } = playUntilEnd(initial);
    const forged = log.map((entry, index) =>
      index === log.length - 1 ? { ...entry, endReason: 'wrong' as const } : entry,
    );

    expect(replay(initial, forged)).toMatchObject({ ok: false, code: 'diverged' });
  });

  it('reads a log written before reasons were recorded', () => {
    const initial = newRun(undefined, 2);
    const { log } = playUntilEnd(initial);
    const old = JSON.parse(JSON.stringify(log)) as Record<string, unknown>[];
    for (const entry of old) {
      delete entry.endReason;
      delete entry.worldEvents;
    }

    const parsed = RunLogSchema.parse(old);

    expect(parsed.every(({ endReason, worldEvents }) => endReason === null && worldEvents.length === 0)).toBe(
      true,
    );
  });
});

describe('world events in the validator', () => {
  const codes = (edit: Edit): string[] => {
    const result = validateCase(
      (() => {
        const raw = buildCheeseCase();
        edit(raw);
        return raw;
      })(),
      { hero: buildHero(), traits: [], locale: 'en', realNames: [] },
    );
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  };
  const withOldWell: Edit = (raw) => {
    raw.locations.push({
      id: 'old-well',
      name: 'Old well',
      description: 'A dry well nobody has used in years.',
      connections: ['market-square'],
      access: { kind: 'open' },
    });
  };

  it('accepts events that only tell the news or close a place that is not needed', () => {
    expect(
      codes((raw) => {
        withOldWell(raw);
        raw.clock.worldEvents = [
          {
            day: 2,
            description: 'The well is boarded up.',
            effect: { kind: 'location-closes', locationId: 'old-well' },
          },
          { day: 3, description: 'The baker is packing.', effect: { kind: 'culprit-flees' } },
        ];
      }),
    ).toEqual([]);
  });

  it('rejects an event after the last day, and a culprit who flees on the first', () => {
    expect(codes((raw) => (raw.clock.worldEvents = [{ day: 4, description: 'Too late.' }]))).toEqual([
      'world-event-out-of-range',
    ]);
    expect(codes(fleeOnDay(1))).toEqual(['world-event-out-of-range']);
  });

  it('rejects closing a place that does not exist', () => {
    expect(
      codes((raw) => {
        raw.clock.worldEvents = [
          { day: 2, description: 'A fire.', effect: { kind: 'location-closes', locationId: 'nowhere' } },
        ];
      }),
    ).toEqual(['unknown-reference']);
  });

  it('rejects closing the place the hero starts in', () => {
    expect(
      codes((raw) => {
        raw.clock.worldEvents = [
          {
            day: 2,
            description: 'A fire.',
            effect: { kind: 'location-closes', locationId: 'market-square' },
          },
        ];
      }),
    ).toContain('event-cuts-solution');
  });

  it('rejects closing a place that holds the last route to the solution', () => {
    expect(
      codes((raw) => {
        raw.clock.worldEvents = [
          {
            day: 2,
            description: 'The cellar floods.',
            effect: { kind: 'location-closes', locationId: 'storage-cellar' },
          },
        ];
      }),
    ).toEqual(['event-cuts-solution']);
  });

  it('rejects closing a place that only the motive needs', () => {
    expect(
      codes((raw) => {
        raw.clock.worldEvents = [
          {
            day: 2,
            description: 'The office burns.',
            effect: { kind: 'location-closes', locationId: 'mayor-office' },
          },
        ];
      }),
    ).toEqual(['event-cuts-solution']);
  });
});
