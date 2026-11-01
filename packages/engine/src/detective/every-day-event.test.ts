// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { intentOf } from '../../test/fixtures/ordinary-play.js';
import { createRng, type Rng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import {
  EVERY_DAY_RULESET_VERSION,
  drawDayEvents,
  drawEvents,
  drawOwedDayEvent,
  standingOf,
} from './random-events.js';
import { createDetectiveRun, type DetectiveRunState } from './run-state.js';
import { isSolvable } from './solvability.js';
import { validateCase } from './case-validator.js';

const event = (id: string, fromDay = 1, untilDay: number | null = null) => ({
  id,
  description: `Something harmless happens: ${id}.`,
  weight: 1,
  fromDay,
  untilDay,
  tones: [],
  traitTriggers: [],
  effect: { kind: 'flavor' },
  duration: { kind: 'instant' },
});

function runWith(count: number, ruleset: number, days = 3): DetectiveRunState {
  const raw = buildCheeseCase();
  raw.clock.days = days;
  raw.randomEvents = Array.from({ length: count }, (_, index) => event(`event-${String(index)}`));
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(raw),
    seed: 'every-day',
    rngState: 1,
    locale: 'en',
  });
  return { ...run, rulesetVersion: ruleset };
}

/** Dice that give the values the test names, in order, whatever the sides. */
function scripted(...values: number[]): Rng {
  let index = 0;
  const next = (): number => values[index++] ?? 1;
  return { next: () => 0, roll: (sides) => Math.min(sides, next()), state: () => index };
}

const MISS = 100;
const at = (run: DetectiveRunState, day: number, minute: number): DetectiveRunState => ({
  ...run,
  clock: { day, minute },
});

describe('the event a day is promised', () => {
  const evening = (ruleset: number) => {
    const before = at(runWith(3, ruleset), 1, 17 * 60);
    return drawDayEvents(at(before, 1, 18 * 60 + 5), before.clock, scripted(MISS, 1));
  };

  it('comes at the evening mark when none came by then, whatever the chance roll says', () => {
    const drawn = evening(EVERY_DAY_RULESET_VERSION);

    expect(drawn.events).toEqual([{ eventId: 'event-0', day: 1, phase: 'day' }]);
    expect(drawn.run.drawnEvents).toEqual(drawn.events);
  });

  it('is left out of a run of the ruleset before, which draws by chance alone', () => {
    expect(evening(EVERY_DAY_RULESET_VERSION - 1).events).toEqual([]);
  });

  it('is not owed when the day already had an event at a mark, and a night event for the morning does not count', () => {
    const before = at(runWith(3, EVERY_DAY_RULESET_VERSION), 1, 17 * 60);
    const now = at(before, 1, 18 * 60 + 5);
    const had = (phase: 'day' | 'night') => ({
      ...now,
      drawnEvents: [{ eventId: 'event-1', day: 1, phase }],
    });

    expect(drawDayEvents(had('day'), before.clock, scripted(MISS, 1)).events).toEqual([]);
    expect(drawDayEvents(had('night'), before.clock, scripted(MISS, 1)).events).toMatchObject([
      { eventId: 'event-0', phase: 'day' },
    ]);
  });

  it('is the last slot of a turn that carries the hero past midday and the evening alike', () => {
    const before = at(runWith(3, EVERY_DAY_RULESET_VERSION), 1, 11 * 60);
    const drawn = drawDayEvents(at(before, 1, 19 * 60), before.clock, scripted(MISS, MISS, 1));

    expect(drawn.events).toHaveLength(1);
    // With events to spare, midday with a good roll and the evening owed would be two, not three.
    const rich = at(runWith(6, EVERY_DAY_RULESET_VERSION), 1, 11 * 60);
    const lucky = drawDayEvents(at(rich, 1, 19 * 60), rich.clock, scripted(1, 1, 1, 1));
    expect(lucky.events).toHaveLength(2);
  });

  it('is not owed at midday alone, and nothing is drawn when the evening was not reached', () => {
    const before = at(runWith(3, EVERY_DAY_RULESET_VERSION), 1, 11 * 60);

    expect(drawDayEvents(at(before, 1, 13 * 60), before.clock, scripted(MISS, 1)).events).toEqual([]);
  });
});

describe('what a day takes of the pool', () => {
  it('is no more than its own event when the pool holds no more than one for each day', () => {
    const before = at(runWith(3, EVERY_DAY_RULESET_VERSION), 1, 11 * 60);
    const midday = drawDayEvents(at(before, 1, 13 * 60), before.clock, scripted(1, 1));
    expect(midday.events).toHaveLength(1);

    const evening = drawDayEvents(
      at(midday.run, 1, 19 * 60),
      at(midday.run, 1, 17 * 60).clock,
      scripted(1, 1),
    );
    expect(evening.events).toEqual([]);
  });

  it('is a chance draw of the ruleset before when the pool is tight, as it always was', () => {
    const before = at(runWith(3, EVERY_DAY_RULESET_VERSION - 1), 1, 11 * 60);
    const drawn = drawDayEvents(at(before, 1, 19 * 60), before.clock, scripted(1, 1, 1, 1));

    expect(drawn.events).toHaveLength(2);
  });
});

describe('the event owed to a day that is cut short', () => {
  it('comes as the hero turns in before the evening, once, on the closing day', () => {
    const run = at(runWith(3, EVERY_DAY_RULESET_VERSION), 1, 13 * 60);
    const drawn = drawOwedDayEvent(run, scripted(MISS, 1));

    expect(drawn.events).toEqual([{ eventId: 'event-0', day: 1, phase: 'day' }]);
    expect(drawOwedDayEvent(drawn.run, scripted(MISS, 1)).events).toEqual([]);
  });

  it('is not owed to a run of the ruleset before, nor to a day whose pool has nothing to give', () => {
    expect(
      drawOwedDayEvent(at(runWith(3, EVERY_DAY_RULESET_VERSION - 1), 1, 13 * 60), scripted(1, 1)).events,
    ).toEqual([]);
    expect(
      drawOwedDayEvent(at(runWith(0, EVERY_DAY_RULESET_VERSION), 1, 13 * 60), scripted(1, 1)).events,
    ).toEqual([]);
  });

  it('keeps the dice moving from where the draw left them', () => {
    const run = at(runWith(3, EVERY_DAY_RULESET_VERSION), 1, 13 * 60);

    expect(drawOwedDayEvent(run, scripted(MISS, 1)).run.rngState).toBeGreaterThan(0);
  });
});

describe('the pool the night leaves for the days to come', () => {
  const night = (count: number, ruleset: number, day: number) =>
    drawEvents(at(runWith(count, ruleset), day, 8 * 60), scripted(1, 1, 1, 1)).events;

  it('keeps one event for each day still to come, so a night takes only what is spare', () => {
    expect(night(3, EVERY_DAY_RULESET_VERSION, 2)).toHaveLength(1);
    expect(night(2, EVERY_DAY_RULESET_VERSION, 2)).toHaveLength(0);
    expect(night(5, EVERY_DAY_RULESET_VERSION, 2)).toHaveLength(2);
    expect(night(1, EVERY_DAY_RULESET_VERSION, 3)).toHaveLength(0);
  });

  it('is not asked of a run of the ruleset before, whose nights draw as they did', () => {
    expect(night(3, EVERY_DAY_RULESET_VERSION - 1, 2)).toHaveLength(2);
  });

  it('writes a night event down as one of the night, and a day event as one of the day', () => {
    expect(night(5, EVERY_DAY_RULESET_VERSION, 2).every(({ phase }) => phase === 'night')).toBe(true);
  });
});

describe('the pool a generated case must bring', () => {
  const context = (minRandomEvents: number) => ({
    hero: buildHero(),
    traits: [],
    locale: 'en' as const,
    realNames: [],
    minRandomEvents,
  });
  const caseWith = (days: number, events: readonly Record<string, unknown>[]) => {
    const raw = buildCheeseCase();
    raw.clock.days = days;
    raw.randomEvents = [...events];
    return raw;
  };
  const codes = (raw: unknown) => {
    const result = validateCase(raw, context(3));
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  };

  it('has an event for every day of the case, and at least three', () => {
    const five = Array.from({ length: 5 }, (_, index) => event(`event-${String(index)}`));

    expect(codes(caseWith(5, five))).toEqual([]);
    expect(codes(caseWith(5, five.slice(0, 4)))).toEqual(['too-few-random-events']);
    expect(codes(caseWith(3, five.slice(0, 3)))).toEqual([]);
  });

  it('has an event that may happen on each day, by its window', () => {
    const early = ['a', 'b', 'c'].map((id) => event(id, 1, 1));

    expect(codes(caseWith(3, early))).toEqual(['random-events-miss-a-day']);
    expect(codes(caseWith(3, [event('a', 1, 1), event('b', 2, 2), event('c', 3, null)]))).toEqual([]);
  });
});

// A balance run: ordinary play of the sample cases for every day of the case, over many seeds.
const CASES_DIR = new URL('../../../../content/cases/', import.meta.url);
const SAMPLES: DetectiveCase[] = readdirSync(CASES_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => DetectiveCaseSchema.parse(JSON.parse(readFileSync(new URL(name, CASES_DIR), 'utf8'))));
const SEEDS = 100;

interface Tally {
  days: number;
  withDayEvent: number;
  events: number;
  unsolvable: number;
}

function tallyOf(ruleset: number): Tally {
  const tally: Tally = { days: 0, withDayEvent: 0, events: 0, unsolvable: 0 };
  for (const detectiveCase of SAMPLES) {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rng = createRng(`daily-${String(seed)}`);
      let run: DetectiveRunState = {
        ...createDetectiveRun({
          hero: buildHero(),
          traits: [],
          case: detectiveCase,
          seed: `daily-${String(seed)}`,
          rngState: rng.state(),
          locale: 'en',
        }),
        rulesetVersion: ruleset,
      };
      // A player who lies down when the hero is at the end of their nerves, as the nerves task found sensible.
      for (
        let turn = 0;
        turn < 900 && run.status === 'active' && run.clock.day <= detectiveCase.clock.days;
        turn += 1
      ) {
        const resolution = resolveIntent(run, intentOf(run, rng, true), rng);
        if (!resolution.ok) continue;
        run = resolution.run;
        if (!isSolvable(run.case, run.hero, run.traits, standingOf(run))) tally.unsolvable += 1;
      }
      for (let day = 1; day <= Math.min(run.clock.day, detectiveCase.clock.days); day += 1) {
        // The day the run stopped on is not whole, and is not counted.
        if (day === run.clock.day) continue;
        tally.days += 1;
        const today = run.drawnEvents.filter((drawn) => drawn.day === day);
        if (today.some(({ phase }) => phase === 'day')) tally.withDayEvent += 1;
        tally.events += today.length;
      }
    }
  }
  return tally;
}

describe('events over the days of ordinary play', () => {
  const now = tallyOf(EVERY_DAY_RULESET_VERSION);
  const before = tallyOf(EVERY_DAY_RULESET_VERSION - 1);

  it('bring an event in the day on at least nine days of ten, where the ruleset before brought far fewer', () => {
    expect(now.days).toBeGreaterThan(0);
    expect(now.withDayEvent / now.days).toBeGreaterThanOrEqual(0.9);
    expect(before.withDayEvent / before.days).toBeLessThan(0.7);
  });

  it('never make the case unsolvable', () => {
    expect(now.unsolvable).toBe(0);
    expect(before.unsolvable).toBe(0);
  });
});
