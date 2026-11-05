// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { createRng, restoreRng } from '../dice.js';
import { resolveIntent } from './actions.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { GENERATED_DAYS } from './checks/run-length.js';
import { DETECTIVE_NERVES, DETECTIVE_SLEEP_DEBT } from './archetype.js';
import { createDetectiveRun, viewRun, type DetectiveRunState } from './run-state.js';

const MAX_DAYS = GENERATED_DAYS.max;

function caseOfDays(days: number): DetectiveCase {
  return DetectiveCaseSchema.parse({ ...buildCheeseCase(), clock: { days, worldEvents: [] } });
}

function runOfDays(days: number, detectiveCase: DetectiveCase = caseOfDays(days)): DetectiveRunState {
  return createDetectiveRun({
    hero: buildHero(),
    traits: [],
    case: detectiveCase,
    seed: `long-${String(days)}`,
    rngState: createRng(`long-${String(days)}`).state(),
    locale: 'en',
  });
}

function rest(run: DetectiveRunState): DetectiveRunState {
  const resolution = resolveIntent(run, { kind: 'rest' }, restoreRng(run.rngState));
  if (!resolution.ok) throw new Error(`Refused: ${resolution.refusal.code}`);
  return resolution.run;
}

describe('the days a case may give', () => {
  const codes = (detectiveCase: DetectiveCase, asked = true): string[] => {
    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      ...(asked ? { days: GENERATED_DAYS } : {}),
    });
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  };

  it('is from three to ten for a generated case, and the case chooses within it', () => {
    expect(GENERATED_DAYS).toEqual({ min: 3, max: 10 });
    for (const days of [3, 4, 7, 10]) expect(codes(caseOfDays(days))).toEqual([]);
  });

  it('refuses a case that is shorter or longer, and says what to set', () => {
    for (const days of [1, 2, 11, 14]) {
      expect(codes(caseOfDays(days))).toEqual(['run-length-out-of-range']);
    }
    const result = validateCase(caseOfDays(11), {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      days: GENERATED_DAYS,
    });
    expect(result).toMatchObject({
      isValid: false,
      issues: [{ path: 'clock.days', message: expect.stringContaining('from 3 to 10') as unknown }],
    });
  });

  it('is not asked of a case that is not a generated one', () => {
    expect(codes(caseOfDays(14), false)).toEqual([]);
  });
});

describe('a run of the longest length', () => {
  it('begins with all its days ahead: the view says how many, and the time left grows by a day for each', () => {
    const view = viewRun(runOfDays(MAX_DAYS));
    const left = (days: number): number => viewRun(runOfDays(days)).chronicle.activeMinutesLeft;
    const aDay = left(2) - left(1);

    expect(view.clock).toMatchObject({ day: 1, totalDays: MAX_DAYS });
    expect(aDay).toBeGreaterThan(0);
    expect(left(MAX_DAYS) - left(1)).toBe((MAX_DAYS - 1) * aDay);
  });

  it('goes from the first night to the last: a day each time, the meters held, and the end on the tenth', () => {
    let run = runOfDays(MAX_DAYS);
    for (let day = 1; day < MAX_DAYS; day += 1) {
      expect(run.clock.day).toBe(day);
      expect(run.status).toBe('active');
      run = rest(run);
      expect(run.condition.nerves).toBeGreaterThanOrEqual(0);
      expect(run.condition.nerves).toBeLessThanOrEqual(DETECTIVE_NERVES.max);
      expect(run.condition.sleepDebt).toBeGreaterThanOrEqual(0);
      expect(run.condition.sleepDebt).toBeLessThanOrEqual(DETECTIVE_SLEEP_DEBT.max);
    }

    expect(run.clock.day).toBe(MAX_DAYS);
    expect(run.status).toBe('active');
    const last = viewRun(run);
    expect(last.clock.totalDays).toBe(MAX_DAYS);
    expect(last.chronicle.activeMinutesLeft).toBe(viewRun(runOfDays(1)).chronicle.activeMinutesLeft);

    const over = rest(run);
    expect(over.status).toBe('lost');
    expect(over.endReason).toBe('time-ran-out');
  });

  it('draws the dice of every night from the run, so the same seed gives the same ten days', () => {
    const through = (): DetectiveRunState => {
      let run = runOfDays(MAX_DAYS);
      for (let day = 1; day < MAX_DAYS; day += 1) run = rest(run);
      return run;
    };

    expect(through()).toEqual(through());
  });

  it('shows the hero only the places they know, not the whole of a wide town', () => {
    const url = new URL('../../../../content/cases/goose-of-elmwick.en.json', import.meta.url);
    const sample = DetectiveCaseSchema.parse(JSON.parse(readFileSync(url, 'utf8')));
    const wide = DetectiveCaseSchema.parse({ ...sample, clock: { ...sample.clock, days: MAX_DAYS } });
    const run = runOfDays(MAX_DAYS, wide);

    const known = viewRun(run).map.places.map(({ id }) => id);
    expect(known.length).toBeLessThan(wide.locations.length);
    expect(known).toContain(wide.startLocationId);
    for (const gated of wide.locations.filter(({ requiresLead }) => requiresLead !== undefined)) {
      expect(known).not.toContain(gated.id);
    }
  });
});
