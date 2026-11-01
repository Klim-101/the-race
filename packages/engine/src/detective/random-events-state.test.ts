// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { EMPTY_RUN_LOG, LogEntrySchema, recordResolution } from './event-log.js';
import { closedSourcesOf, drawEvents } from './random-events.js';
import { withEffect } from './solvability.js';
import {
  DetectiveRunStateSchema,
  createDetectiveRun,
  endRun,
  recordDrawnEvent,
  viewRun,
  type DetectiveRunState,
} from './run-state.js';

function newRun(): DetectiveRunState {
  const raw = buildCheeseCase();
  raw.randomEvents = [
    {
      id: 'fair-music',
      description: 'A brass band marches through the square.',
      weight: 1,
      effect: { kind: 'flavor' },
      duration: { kind: 'instant' },
    },
  ];
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(raw),
    seed: 'state',
    rngState: 7,
    locale: 'en',
  });
}

describe('a case that has no pool at all', () => {
  const bare = (): DetectiveRunState =>
    createDetectiveRun({
      hero: buildHero(),
      traits: [],
      case: DetectiveCaseSchema.parse(buildCheeseCase()),
      seed: 'state',
      rngState: 7,
      locale: 'en',
    });

  it('draws nothing, shows no random news and cannot record an event', () => {
    const run = bare();
    expect(drawEvents(run, createRng('x')).events).toEqual([]);
    expect(viewRun(run).news).toEqual([]);
    expect(() => recordDrawnEvent(run, 'fair-music')).toThrow(RangeError);
    expect(DetectiveRunStateSchema.safeParse(run).success).toBe(true);
  });
});

describe('what a standing event does and does not touch', () => {
  it('leaves the sources alone when the event closes a place', () => {
    const raw = buildCheeseCase();
    raw.randomEvents = [
      {
        id: 'road-works',
        description: 'The road is dug up for a while.',
        weight: 1,
        effect: { kind: 'location-closes', locationId: 'storage-cellar' },
        duration: { kind: 'permanent' },
      },
    ];
    const run = recordDrawnEvent(
      createDetectiveRun({
        hero: buildHero(),
        traits: [],
        case: DetectiveCaseSchema.parse(raw),
        seed: 'state',
        rngState: 7,
        locale: 'en',
      }),
      'road-works',
    );
    expect([...closedSourcesOf(run)]).toEqual([]);
  });

  it('changes nothing about the standing for an effect that happens once', () => {
    const standing = {
      closedLocationIds: new Set<string>(),
      closedSources: new Set<never>(),
      suspectPlaces: new Map(),
    };
    expect(withEffect(standing, { kind: 'flavor' })).toBe(standing);
  });
});

describe('recordDrawnEvent', () => {
  it('writes the event down with today, and leaves the old run alone', () => {
    const run = newRun();
    const next = recordDrawnEvent(run, 'fair-music');
    expect(next.drawnEvents).toEqual([{ eventId: 'fair-music', day: 1 }]);
    expect(run.drawnEvents).toEqual([]);
  });

  it('refuses an event the pool does not have, and a run that is over', () => {
    expect(() => recordDrawnEvent(newRun(), 'nothing')).toThrow(RangeError);
    expect(() => recordDrawnEvent(endRun(newRun(), 'lost'), 'fair-music')).toThrow(/already over/);
  });
});

describe('a run with drawn events', () => {
  it('reads back from a save, and a save from before the pool still reads', () => {
    const drawn = recordDrawnEvent(newRun(), 'fair-music');
    expect(DetectiveRunStateSchema.parse(JSON.parse(JSON.stringify(drawn)))).toEqual(drawn);
    const older: Record<string, unknown> = { ...drawn };
    delete older.drawnEvents;
    expect(DetectiveRunStateSchema.parse(older).drawnEvents).toEqual([]);
  });

  it('refuses an event that the case does not hold', () => {
    const drawn = recordDrawnEvent(newRun(), 'fair-music');
    const forged = { ...drawn, drawnEvents: [{ eventId: 'forged', day: 1 }] };
    expect(DetectiveRunStateSchema.safeParse(forged).success).toBe(false);
  });
});

describe('the log of a turn', () => {
  it('holds the events that the turn drew, and defaults to none for an older log', () => {
    const before = newRun();
    const resolution = resolveIntent(before, { kind: 'look' }, restoreRng(before.rngState));
    if (!resolution.ok) throw new Error('The look was refused.');
    expect(recordResolution(EMPTY_RUN_LOG, before, { kind: 'look' }, resolution)[0]?.randomEvents).toEqual(
      [],
    );

    const drawn = drawEvents(
      { ...resolution.run, rulesetVersion: 9 },
      { ...createRng('log'), roll: () => 1 },
    );
    const log = recordResolution(EMPTY_RUN_LOG, before, { kind: 'look' }, { ...resolution, run: drawn.run });
    expect(log[0]?.randomEvents).toEqual([{ eventId: 'fair-music', day: 1, phase: 'night' }]);

    const older: Record<string, unknown> = { ...log[0] };
    delete older.randomEvents;
    expect(LogEntrySchema.parse(older).randomEvents).toEqual([]);
  });
});
