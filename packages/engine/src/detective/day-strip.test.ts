// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { TraitSchema } from '../traits.js';
import { resolveIntent, type Intent } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { viewDayStrip, STRIP_KINDS } from './day-strip.js';
import { recordResolution, type RunLog } from './event-log.js';
import { createDetectiveRun, type DetectiveRunState } from './run-state.js';
import { DETECTIVE_TRAITS } from './traits.js';

function startRun(): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: DETECTIVE_TRAITS.slice(0, 3).map((trait) => TraitSchema.parse(trait)),
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'strip',
    rngState: createRng('strip').state(),
    locale: 'en',
  });
}

function play(intents: Intent[]): { run: DetectiveRunState; log: RunLog } {
  let run = startRun();
  let log: RunLog = [];
  for (const intent of intents) {
    const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
    if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
    log = recordResolution(log, run, intent, resolution);
    run = resolution.run;
  }
  return { run, log };
}

/** A log of entries made by hand, for the turns the dice do not reach: only what the projection reads is in them. */
function handmade(entries: object[], at = 'stall'): { run: DetectiveRunState; log: RunLog } {
  return { run: { locationId: at } as DetectiveRunState, log: entries as unknown as RunLog };
}

const entry = (turn: number, minute: number, outcome: object, extra: object = {}) => ({
  turn,
  outcome,
  clock: { day: 1, minute },
  night: null,
  ...extra,
});

describe('viewDayStrip', () => {
  it('is empty before the first turn', () => {
    const { run } = play([]);

    expect(viewDayStrip(run, [])).toEqual([]);
  });

  it('starts the first turn at the start of the first day and each next one where the last left the clock', () => {
    const { run, log } = play([{ kind: 'look' }, { kind: 'move', locationId: 'cheese-stall' }]);

    const strip = viewDayStrip(run, log);

    expect(strip.map(({ turn, kind, day }) => [turn, kind, day])).toEqual([
      [1, 'look', 1],
      [2, 'move', 1],
    ]);
    expect(strip[0]?.startMinute).toBe(8 * 60);
    expect(strip[0]?.endMinute).toBe(log[0]?.clock.minute);
    expect(strip[1]?.startMinute).toBe(strip[0]?.endMinute);
    expect(strip[1]?.endMinute).toBe(log[1]?.clock.minute);
    expect(strip.every(({ crossedMidnight, endedInNight }) => !crossedMidnight && !endedInNight)).toBe(true);
  });

  it('runs a rest to the end of the day and says the turn ended in a night', () => {
    const { run, log } = play([{ kind: 'look' }, { kind: 'rest' }]);

    const [, rest] = viewDayStrip(run, log);

    expect(rest).toMatchObject({ kind: 'rest', day: 1, endMinute: 1440, endedInNight: true });
    expect(log[1]?.clock.day).toBe(2);
  });

  it('takes the next turn from the morning after the night', () => {
    const { run, log } = play([{ kind: 'rest' }, { kind: 'look' }]);

    const [, look] = viewDayStrip(run, log);

    expect(look).toMatchObject({ kind: 'look', day: 2 });
    expect(look?.startMinute).toBe(log[0]?.clock.minute);
  });

  it('cuts a turn that ran past midnight at the edge of its day and says so', () => {
    const { run, log } = handmade([
      entry(1, 1400, { kind: 'search', foundClueIds: [], minutes: 100, consequences: [] }),
    ]);
    const late = handmade([
      entry(1, 1400, { kind: 'look', foundClueIds: [], minutes: 20 }),
      {
        ...entry(2, 480, { kind: 'search', foundClueIds: ['key'], minutes: 90, consequences: [] }, {}),
        clock: { day: 2, minute: 480 },
        night: {},
      },
    ]);

    expect(viewDayStrip(run, log)[0]).toMatchObject({
      startMinute: 480,
      endMinute: 580,
      crossedMidnight: false,
    });
    const [, crossed] = viewDayStrip(late.run, late.log);
    expect(crossed).toMatchObject({ day: 1, startMinute: 1400, endMinute: 1440, crossedMidnight: true });
    expect(crossed?.endedInNight).toBe(true);
  });

  it('draws a detention as part of the turn that brought it, and only for the turn that had one', () => {
    const { run, log } = handmade([
      entry(1, 700, {
        kind: 'search',
        foundClueIds: [],
        minutes: 200,
        consequences: [],
        detainedMinutes: 180,
      }),
      entry(2, 720, { kind: 'search', foundClueIds: [], minutes: 20, consequences: [] }),
      entry(3, 730, { kind: 'look', foundClueIds: [], minutes: 10 }),
    ]);

    expect(viewDayStrip(run, log).map(({ detainedMinutes }) => detainedMinutes)).toEqual([180, null, null]);
  });

  it('names what each kind of turn touched, by ids the hero knows', () => {
    const { run, log } = handmade(
      [
        entry(1, 490, { kind: 'move', from: 'market', to: 'stall', entered: true, minutes: 10 }),
        entry(2, 500, { kind: 'move', from: 'stall', to: 'cellar', entered: false, minutes: 10 }),
        entry(3, 510, { kind: 'look', foundClueIds: ['key'], minutes: 10 }),
        entry(4, 520, { kind: 'study', clueId: 'key', minutes: 10 }),
        entry(5, 530, {
          kind: 'interrogate',
          suspectId: 'baker',
          minutes: 10,
          presented: [{ clueId: 'key', effect: 'no-effect' }],
        }),
        entry(6, 540, { kind: 'ask', minutes: 10 }),
        entry(7, 550, { kind: 'sit', minutes: 10 }),
        entry(8, 560, { kind: 'deduce', result: 'nothing', minutes: 10 }),
        entry(9, 570, { kind: 'use', minutes: 10 }),
        entry(10, 580, { kind: 'reread', clueId: 'key', minutes: 10 }),
        entry(11, 590, { kind: 'accuse' }),
      ],
      'stall',
    );

    const strip = viewDayStrip(run, log);

    expect(strip.map(({ touched }) => touched.placeId)).toEqual([
      'stall',
      'stall',
      'stall',
      'stall',
      'stall',
      'stall',
      'stall',
      'stall',
      'stall',
      'stall',
      'stall',
    ]);
    expect(strip[2]?.touched.clueIds).toEqual(['key']);
    expect(strip[3]?.touched.clueIds).toEqual(['key']);
    expect(strip[4]?.touched).toEqual({ clueIds: ['key'], placeId: 'stall', suspectId: 'baker' });
    expect(strip[10]).toMatchObject({ kind: 'accuse', startMinute: 580, endMinute: 580 });
    expect(strip.map(({ kind }) => kind)).toEqual([
      'move',
      'move',
      'look',
      'study',
      'talk',
      'ask',
      'sit',
      'deduce',
      'use',
      'reread',
      'accuse',
    ]);
    expect(new Set(strip.map(({ kind }) => kind)).size).toBeLessThanOrEqual(STRIP_KINDS.length);
  });

  it('puts the hero where they were at each turn, backwards from where they stand', () => {
    const { run, log } = handmade(
      [
        entry(1, 490, { kind: 'look', foundClueIds: [], minutes: 10 }),
        entry(2, 500, { kind: 'move', from: 'market', to: 'stall', entered: true, minutes: 10 }),
        entry(3, 510, { kind: 'look', foundClueIds: [], minutes: 10 }),
        entry(4, 520, { kind: 'move', from: 'stall', to: 'cellar', entered: false, minutes: 10 }),
        entry(5, 530, { kind: 'search', foundClueIds: [], minutes: 10, consequences: [] }),
      ],
      'stall',
    );

    expect(viewDayStrip(run, log).map(({ touched }) => touched.placeId)).toEqual([
      'market',
      'stall',
      'stall',
      'stall',
      'stall',
    ]);
  });

  it('holds nothing of the rolls, the dice or the truth', () => {
    const { run, log } = handmade([
      entry(
        1,
        490,
        { kind: 'accuse', truth: { culpritId: 'baker', motive: 'debt' } },
        { details: [{ result: 20 }], rngStateBefore: 5 },
      ),
    ]);

    expect(JSON.stringify(viewDayStrip(run, log))).not.toMatch(/baker|debt|rng|details|truth/);
  });
});
