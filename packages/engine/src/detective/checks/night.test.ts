// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import { DetectiveCaseSchema, type DetectiveCase } from '../case-schema.js';
import { validateCase } from '../case-validator.js';
import { checkNight } from './night.js';

const at = (hour: number): number => hour * 60;
const AFTER_MIDNIGHT = { fromMinute: at(0), untilMinute: at(5) };
const EVENING = { fromMinute: at(18), untilMinute: at(23) };
const LATE = { fromMinute: at(22), untilMinute: at(2) };

interface Hours {
  fromMinute: number;
  untilMinute: number;
}

function withHours(
  places: Readonly<Record<string, Hours>>,
  extra?: (raw: ReturnType<typeof buildCheeseCase>) => void,
): DetectiveCase {
  const raw = buildCheeseCase();
  extra?.(raw);
  for (const location of raw.locations) {
    const hours = places[String(location.id)];
    if (hours !== undefined) Object.assign(location, { hours });
  }
  return DetectiveCaseSchema.parse(raw);
}

const issuesOf = (detectiveCase: DetectiveCase) => checkNight(detectiveCase, buildHero(), []);

describe('a case that uses the night', () => {
  it('has nothing to say when no place has hours', () => {
    expect(issuesOf(DetectiveCaseSchema.parse(buildCheeseCase()))).toEqual([]);
  });

  it('is fair when the hours are in the working day, or reach into it, whatever they hold', () => {
    expect(issuesOf(withHours({ 'cheese-stall': EVENING }))).toEqual([]);
    expect(issuesOf(withHours({ 'cheese-stall': LATE }))).toEqual([]);
  });

  it('is fair when the places open only after midnight hold nothing the solution needs', () => {
    const detectiveCase = withHours({ 'back-door': AFTER_MIDNIGHT }, (raw) => {
      raw.locations.push({
        id: 'back-door',
        name: 'Back door',
        description: 'A door nobody uses by day.',
        connections: ['market-square'],
        access: { kind: 'open' },
      });
    });

    expect(issuesOf(detectiveCase)).toEqual([]);
  });

  it('is told when a chain, a suspect or a lie needs a place that is open only after midnight', () => {
    const issues = issuesOf(withHours({ 'cheese-stall': AFTER_MIDNIGHT }));

    expect(issues.every(({ code }) => code === 'solution-needs-night')).toBe(true);
    expect(issues.map(({ path }) => path)).toEqual([
      'solution.evidenceChains[0]',
      'solution.motiveDeductionId',
      'suspects[0].locationId',
      'suspects[1].lies[0]',
    ]);
    expect(issues[0]?.message).toContain('Evidence chain 1');
    expect(issues[0]?.message).toContain('cheese-stall');
  });

  it('is told, and nothing else, when the place the hero starts in is open only at night', () => {
    const issues = issuesOf(withHours({ 'market-square': AFTER_MIDNIGHT }));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'solution-needs-night', path: 'startLocationId' });
  });

  it('is told of the motive when its clues lie behind a night, for a hero who can reach them', () => {
    const detectiveCase = withHours({ 'mayor-office': AFTER_MIDNIGHT });
    const social = { ...buildHero(), skills: { ...buildHero().skills, social: 5 } };

    const paths = checkNight(detectiveCase, social, []).map(({ path }) => path);

    expect(paths).toContain('solution.motiveDeductionId');
    expect(paths).toContain('solution.evidenceChains[1]');
  });

  it('is judged by the validator with the rest of the case, a bad night being one more issue to fix', () => {
    const detectiveCase = withHours({ 'cheese-stall': AFTER_MIDNIGHT });

    const result = validateCase(detectiveCase, {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
    });

    expect(!result.isValid && result.issues.map(({ code }) => code)).toContain('solution-needs-night');
  });
});

describe('the goose of Elmwick with a night', () => {
  const sample = JSON.parse(
    readFileSync(new URL('../../../../../content/cases/goose-of-elmwick.en.json', import.meta.url), 'utf8'),
  ) as { locations: Record<string, unknown>[] };
  const judge = (raw: unknown) =>
    validateCase(raw, { hero: buildHero(), traits: [], locale: 'en', realNames: [] });
  const codes = (raw: unknown): string[] => {
    const result = judge(raw);
    return result.isValid ? [] : result.issues.map(({ code }) => code);
  };

  it('passes the validator with a room that is open only after midnight and holds nothing the solution needs', () => {
    const copy = structuredClone(sample);
    copy.locations.push({
      id: 'night-room',
      name: 'The night room',
      description: 'A narrow room off the archive that the caretaker opens only for the late shift.',
      connections: ['archive'],
      access: { kind: 'open' },
      exposure: 'indoor',
      hours: AFTER_MIDNIGHT,
    });

    expect(judge(sample).isValid).toBe(true);
    expect(judge(copy).isValid).toBe(true);
  });

  it('is refused when the night would hold what the solution needs, whichever place it is put on', () => {
    const refused = sample.locations.filter((location) => {
      const copy = structuredClone(sample);
      const place = copy.locations.find(({ id }) => id === location.id);
      Object.assign(place ?? {}, { hours: AFTER_MIDNIGHT });
      return codes(copy).includes('solution-needs-night');
    });

    // Every place of the sample is somewhere a chain, a suspect, a lie or the start is: the night has none to spare.
    expect(refused).toHaveLength(sample.locations.length);
  });
});
