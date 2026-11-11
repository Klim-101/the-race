// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema, LocationSchema } from './case-schema.js';
import { isOpenAtMinute } from './leads.js';
import { createDetectiveRun, DetectiveRunStateSchema, viewRun, type DetectiveRunState } from './run-state.js';

const at = (hour: number, minute = 0): number => hour * 60 + minute;
const NIGHT = { fromMinute: at(22), untilMinute: at(2) };
const EVENING = { fromMinute: at(18), untilMinute: at(23) };

/** The cheese case with the hours of one place set, the hero at the market square at `minute` of day one. */
function runAt(
  minute: number,
  hours: { fromMinute: number; untilMinute: number } | undefined,
  place = 'cheese-stall',
) {
  const base = DetectiveCaseSchema.parse(buildCheeseCase());
  const detectiveCase = {
    ...base,
    locations: base.locations.map((location) =>
      location.id === place ? { ...location, ...(hours === undefined ? {} : { hours }) } : location,
    ),
  };
  const run = createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: 'hours',
    rngState: 1,
    locale: 'en',
  });
  return { ...run, clock: { day: 1, minute } };
}

const move = (run: DetectiveRunState, locationId = 'cheese-stall') =>
  resolveIntent(run, { kind: 'move', locationId }, createRng('hours'));

describe('the hours of a place', () => {
  it('are minutes of the day that may wrap midnight, and cannot be no hours or all of them', () => {
    const place = { ...DetectiveCaseSchema.parse(buildCheeseCase()).locations[0] };

    expect(LocationSchema.safeParse({ ...place, hours: NIGHT }).success).toBe(true);
    expect(LocationSchema.safeParse({ ...place, hours: { fromMinute: 600, untilMinute: 600 } }).success).toBe(
      false,
    );
    expect(LocationSchema.safeParse({ ...place, hours: { fromMinute: 0, untilMinute: 1440 } }).success).toBe(
      false,
    );
    expect(LocationSchema.parse(place).hours).toBeUndefined();
  });

  it('keep a place open at every hour when it has none, and open from the first minute to just before the last', () => {
    expect(isOpenAtMinute({}, at(3))).toBe(true);
    expect(isOpenAtMinute({ hours: EVENING }, at(18))).toBe(true);
    expect(isOpenAtMinute({ hours: EVENING }, at(22, 59))).toBe(true);
    expect(isOpenAtMinute({ hours: EVENING }, at(23))).toBe(false);
    expect(isOpenAtMinute({ hours: EVENING }, at(17, 59))).toBe(false);
  });

  it('wrap midnight: open late in the evening and early in the morning, shut by day', () => {
    for (const hour of [22, 23, 0, 1]) expect(isOpenAtMinute({ hours: NIGHT }, at(hour))).toBe(true);
    for (const hour of [2, 8, 12, 21]) expect(isOpenAtMinute({ hours: NIGHT }, at(hour))).toBe(false);
  });
});

describe('going to a place with hours', () => {
  it('is refused outside them, with its own reason and nothing changed', () => {
    const run = runAt(at(14), EVENING);
    const rng = createRng('hours');
    const before = rng.state();

    const resolution = resolveIntent(run, { kind: 'move', locationId: 'cheese-stall' }, rng);

    expect(resolution).toMatchObject({ ok: false, refusal: { code: 'closed-hours' } });
    expect(rng.state()).toBe(before);
  });

  it('is allowed inside them, and for a place with none at any hour', () => {
    expect(move(runAt(at(19), EVENING)).ok).toBe(true);
    expect(move(runAt(at(3), undefined)).ok).toBe(true);
    expect(move(runAt(at(23, 30), NIGHT)).ok).toBe(true);
  });

  it('holds for a place the hero has been in before, since the hours are about the clock', () => {
    const visited = { ...runAt(at(14), EVENING), visitedLocationIds: ['market-square', 'cheese-stall'] };

    expect(move(visited)).toMatchObject({ ok: false, refusal: { code: 'closed-hours' } });
    expect(move({ ...visited, clock: { day: 1, minute: at(19) } }).ok).toBe(true);
  });

  it('leaves a hero already inside where they are: the hours gate the way in and nothing else', () => {
    const inside = { ...runAt(at(19), EVENING), locationId: 'cheese-stall' };
    const later = { ...inside, clock: { day: 1, minute: at(23, 30) } };

    expect(resolveIntent(later, { kind: 'look' }, createRng('hours')).ok).toBe(true);
  });
});

describe('the sign on the door, in the view', () => {
  const exitOf = (run: DetectiveRunState) =>
    viewRun(run).location.exits.find(({ id }) => id === 'cheese-stall');
  const placeOf = (run: DetectiveRunState) => viewRun(run).map.places.find(({ id }) => id === 'cheese-stall');

  it('says the way is shut at this hour, with the hours, among the exits and on the map', () => {
    const shut = runAt(at(14), EVENING);

    for (const place of [exitOf(shut), placeOf(shut)]) {
      expect(place).toMatchObject({ blocked: 'closed-hours', hours: EVENING });
    }
  });

  it('shows the hours of a place that is open now, and none for a place without hours', () => {
    const open = runAt(at(19), EVENING);

    expect(exitOf(open)).toMatchObject({ blocked: null, hours: EVENING });
    expect(placeOf(open)).toMatchObject({ blocked: null, hours: EVENING });
    expect(exitOf(runAt(at(19), undefined))).toMatchObject({ blocked: null, hours: null });
  });

  it('prefers a place an event closed to the hours, and a lock to neither when the hours are right', () => {
    const closed = { ...runAt(at(14), EVENING), closedLocationIds: ['cheese-stall'] };

    expect(exitOf(closed)?.blocked).toBe('closed');
  });

  it('reads a save made before the hours existed, and keeps the seal of its case', () => {
    const old = runAt(at(9), undefined);

    expect(DetectiveRunStateSchema.parse(JSON.parse(JSON.stringify(old)))).toEqual(old);
    expect(old.case.locations.every((location) => location.hours === undefined)).toBe(true);
  });
});
