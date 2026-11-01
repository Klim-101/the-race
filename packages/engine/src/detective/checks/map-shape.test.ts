// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import { DetectiveCaseSchema, type DetectiveCase, type Exposure } from '../case-schema.js';
import { validateCase } from '../case-validator.js';
import { GENERATED_MAP, checkMapShape } from './map-shape.js';

/**
 * A map of places with the exposure and the connections given: each entry is [id, exposure, connections]. The
 * rest of the case is the fixture's, which the map check does not read.
 */
function mapOf(places: readonly (readonly [string, Exposure, string[]])[]): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  const template = detectiveCase.locations[0];
  if (!template) throw new Error('The fixture has a place.');
  detectiveCase.locations = places.map(([id, exposure, connections]) => ({
    ...template,
    id,
    exposure,
    connections,
  }));
  return detectiveCase;
}

const TOWN = mapOf([
  ['hall', 'indoor', ['yard']],
  ['yard', 'outdoor', ['hall', 'street', 'cellar']],
  ['cellar', 'indoor', ['yard']],
  ['street', 'outdoor', ['yard', 'shop', 'square']],
  ['shop', 'indoor', ['street', 'back-room']],
  ['back-room', 'indoor', ['shop']],
  ['square', 'outdoor', ['street', 'office']],
  ['office', 'indoor', ['square']],
]);

const codes = (detectiveCase: DetectiveCase, rules = GENERATED_MAP): string[] =>
  checkMapShape(detectiveCase, rules).map(({ code }) => code);

describe('checkMapShape', () => {
  it('accepts a town: eight places, three outdoors, several buildings', () => {
    expect(codes(TOWN)).toEqual([]);
  });

  it('says a map is too small or too large, with the numbers', () => {
    const small = mapOf([
      ['hall', 'indoor', ['yard']],
      ['yard', 'outdoor', ['hall']],
    ]);
    const issues = checkMapShape(small, GENERATED_MAP);

    expect(issues.map(({ code }) => code)).toContain('map-too-small');
    expect(issues.find(({ code }) => code === 'map-too-small')?.message).toMatch(/2 places.*at least 8/);

    const big = mapOf(
      Array.from({ length: 13 }, (_, index): [string, Exposure, string[]] => [
        `p${String(index)}`,
        index % 2 === 0 ? 'outdoor' : 'indoor',
        [],
      ]),
    );
    expect(codes(big)).toContain('map-too-large');
  });

  it('asks for places out of doors, since the weather and the road touch only those', () => {
    const indoors = mapOf(
      TOWN.locations.map(({ id, connections }): [string, Exposure, string[]] => [id, 'indoor', connections]),
    );

    expect(codes(indoors)).toContain('too-few-outdoor-places');
    expect(
      checkMapShape(indoors, GENERATED_MAP).find(({ code }) => code === 'too-few-outdoor-places')?.message,
    ).toMatch(/Only 0 places are out of doors/);
  });

  it('asks for more than one building: rooms that touch are one building, two buildings meet only outdoors', () => {
    const one = mapOf([
      ['hall', 'indoor', ['stairs']],
      ['stairs', 'indoor', ['attic', 'cellar']],
      ['attic', 'indoor', []],
      ['cellar', 'indoor', []],
      ['yard', 'outdoor', ['hall']],
      ['street', 'outdoor', ['yard']],
      ['square', 'outdoor', ['street']],
      ['lane', 'outdoor', ['square']],
    ]);

    expect(codes(one)).toEqual(['single-building']);
    // The town has five buildings: the hall, the cellar, the shop with its back room, and the office.
    expect(codes(TOWN)).toEqual([]);
  });

  it('lists every problem at once, so the generator can mend them in one go', () => {
    const bad = mapOf([
      ['hall', 'indoor', ['room']],
      ['room', 'indoor', []],
    ]);

    expect(codes(bad)).toEqual(['map-too-small', 'too-few-outdoor-places', 'single-building']);
  });

  it('is only asked when the rules are given: the validator accepts any map without them', () => {
    const detectiveCase = buildCheeseCase();
    const base = { hero: buildHero(), traits: [], locale: 'en', realNames: [] } as const;

    expect(validateCase(detectiveCase, base)).toMatchObject({ isValid: true });
    const strict = validateCase(detectiveCase, { ...base, map: GENERATED_MAP });
    expect(strict.isValid).toBe(false);
    expect(!strict.isValid && strict.issues.map(({ code }) => code)).toContain('map-too-small');
  });
});
