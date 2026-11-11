// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { resolveIntent, type Resolved } from './actions.js';
import { DetectiveCaseSchema } from './case-schema.js';
import { EMPTY_RUN_LOG, RunLogSchema, recordResolution, replay, type RunLog } from './event-log.js';
import { createDetectiveRun, DetectiveRunStateSchema, type DetectiveRunState } from './run-state.js';
import { showTrace, traceKey } from './traces.js';

const FLYER = 'A torn flyer, creased small, lies under the bench.';
const LITTER = 'A cigarette end and a bus ticket lie by the wall.';

interface Raw {
  locations: Record<string, unknown>[];
  startLocationId: string;
}

/** The goose with a closet added that holds one empty part, with or without the texts of a trace and litter. */
function parted(withTexts: boolean): DetectiveRunState {
  const raw = JSON.parse(
    readFileSync(new URL('../../../../content/cases/goose-of-elmwick.en.json', import.meta.url), 'utf8'),
  ) as Raw;
  raw.locations.push({
    id: 'closet',
    name: 'The closet',
    description: 'A narrow closet off the hall that holds brooms and little else.',
    connections: [raw.startLocationId],
    access: { kind: 'open' },
    exposure: 'indoor',
    ...(withTexts ? { litter: LITTER } : {}),
    parts: [
      {
        id: 'broom-shelf',
        name: 'The broom shelf',
        obstacle: null,
        holds: null,
        inQuickLook: true,
        requiresLead: null,
        fallback: null,
        ...(withTexts ? { trace: FLYER } : {}),
      },
    ],
  });
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(raw),
    seed: 'trace',
    rngState: createRng('trace').state(),
    locale: 'en',
  });
  return { ...run, locationId: 'closet', visitedLocationIds: [...run.visitedLocationIds, 'closet'] };
}

/** The cheese case with a bare place off the square, whose whole search finds nothing. */
function bare(litter?: string): DetectiveRunState {
  const raw = buildCheeseCase();
  raw.locations.push({
    id: 'side-alley',
    name: 'Side alley',
    description: 'A narrow alley that leads nowhere in particular.',
    connections: ['market-square'],
    access: { kind: 'open' },
    ...(litter === undefined ? {} : { litter }),
  });
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: DetectiveCaseSchema.parse(raw),
    seed: 'bare',
    rngState: createRng('bare').state(),
    locale: 'en',
  });
  return { ...run, locationId: 'side-alley', visitedLocationIds: [...run.visitedLocationIds, 'side-alley'] };
}

function carry(run: DetectiveRunState, intent: unknown): Extract<Resolved, { ok: true }> {
  const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution;
}
const traceOf = (resolution: Extract<Resolved, { ok: true }>): unknown =>
  'trace' in resolution.outcome ? resolution.outcome.trace : undefined;

describe('showing a trace', () => {
  it('tells it once, remembers where it came from, and tells nothing for a text that is not there', () => {
    const run = bare();

    const first = showTrace(run, traceKey('place', 'side-alley'), LITTER);
    const again = showTrace(first.run, traceKey('place', 'side-alley'), LITTER);

    expect(first.trace).toBe(LITTER);
    expect(first.run.tracesSeen).toEqual(['place:side-alley']);
    expect(again.trace).toBeUndefined();
    expect(showTrace(run, 'place:x', undefined)).toEqual({ run, trace: undefined });
  });
});

describe('a look or a search that finds no clue', () => {
  it('shows the litter of a place without parts, once, and nothing when there is none', () => {
    const look = carry(bare(LITTER), { kind: 'look' });
    const search = carry(look.run, { kind: 'search' });

    expect(traceOf(look)).toBe(LITTER);
    expect(traceOf(search)).toBeUndefined();
    expect(traceOf(carry(bare(), { kind: 'look' }))).toBeUndefined();
  });

  it('shows the litter of a whole search when the look did not come first', () => {
    expect(traceOf(carry(bare(LITTER), { kind: 'search' }))).toBe(LITTER);
  });

  it('shows the litter of a place made of parts at the glance, and the trace of an empty part at its search', () => {
    const look = carry(parted(true), { kind: 'look' });
    const search = carry(look.run, { kind: 'search', partId: 'broom-shelf' });

    expect(look.outcome).toMatchObject({ kind: 'look', foundClueIds: [], trace: LITTER });
    expect(search.outcome).toMatchObject({ kind: 'search', partId: 'broom-shelf', trace: FLYER });
    expect(search.run.tracesSeen).toEqual(['place:closet', 'part:broom-shelf']);
  });

  it('shows no trace when a clue is found, and the litter waits for a look that finds none', () => {
    const run = bare(LITTER);
    const withClue = {
      ...run,
      locationId: 'cheese-stall',
      visitedLocationIds: [...run.visitedLocationIds, 'cheese-stall'],
    };

    const found = carry(withClue, { kind: 'look' });

    expect(found.outcome).toMatchObject({ kind: 'look' });
    expect(traceOf(found)).toBeUndefined();
    expect(found.run.tracesSeen).toEqual([]);
  });

  it('is told for an empty search of a place whether or not a clue was there to be found, so the two look alike', () => {
    const raw = buildCheeseCase();
    const stall = raw.locations.find((place) => place.id === 'cheese-stall');
    Object.assign(stall ?? {}, { litter: LITTER });
    for (const clue of raw.clues.filter(({ locationId }) => locationId === 'cheese-stall')) {
      Object.assign(clue, { discovery: { skill: 'perception', difficulty: 30 } });
    }
    const make = (seed: string): DetectiveRunState => ({
      ...createDetectiveRun({
        hero: buildHero(),
        traits: [],
        case: DetectiveCaseSchema.parse(raw),
        seed,
        rngState: createRng(seed).state(),
        locale: 'en',
      }),
      locationId: 'cheese-stall',
    });

    const results = Array.from({ length: 30 }, (_, index) =>
      carry(make(`wasted-${String(index)}`), { kind: 'search' }),
    );
    const empty = results.filter(
      (result) => result.outcome.kind === 'search' && result.outcome.foundClueIds.length === 0,
    );

    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((result) => traceOf(result) === LITTER)).toBe(true);
  });
});

describe('a trace changes nothing in the case', () => {
  const INTENTS = [
    { kind: 'look' },
    { kind: 'search', partId: 'broom-shelf' },
    { kind: 'look' },
    { kind: 'search', partId: 'broom-shelf' },
    { kind: 'rest' },
  ];

  function play(run: DetectiveRunState) {
    let state = run;
    let log: RunLog = EMPTY_RUN_LOG;
    const outcomes: unknown[] = [];
    for (const intent of INTENTS) {
      const resolution = resolveIntent(state, intent, restoreRng(state.rngState));
      if (!resolution.ok) {
        outcomes.push(resolution.refusal);
        continue;
      }
      log = recordResolution(log, state, intent, resolution);
      const outcome = { ...(resolution.outcome as Record<string, unknown>) };
      delete outcome.trace;
      outcomes.push(outcome);
      state = resolution.run;
    }
    return { state, log, outcomes };
  }

  it('gives the same outcomes, clues and ending with the texts and without them, and replays from its log', () => {
    const without = play(parted(false));
    const withTexts = play(parted(true));

    expect(withTexts.outcomes).toEqual(without.outcomes);
    expect(withTexts.state.foundClueIds).toEqual(without.state.foundClueIds);
    expect(withTexts.state.clock).toEqual(without.state.clock);
    expect(withTexts.state.rngState).toBe(without.state.rngState);
    expect(withTexts.state.status).toBe(without.state.status);
    expect(without.state.tracesSeen).toEqual([]);
    expect(withTexts.state.tracesSeen.length).toBeGreaterThan(0);
    expect(RunLogSchema.parse(withTexts.log)).toEqual(withTexts.log);
    expect(replay(parted(true), withTexts.log)).toEqual({ ok: true, run: withTexts.state });
  });

  it('is absent from a save made before it existed', () => {
    const old: Record<string, unknown> = { ...bare() };
    delete old.tracesSeen;

    expect(DetectiveRunStateSchema.parse(old).tracesSeen).toEqual([]);
  });
});
