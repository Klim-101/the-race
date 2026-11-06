// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import type { CaseIssueCode } from '../case-issue.js';
import { DetectiveCaseSchema, type DetectiveCase } from '../case-schema.js';
import { validateCase } from '../case-validator.js';
import { LEGACY_RULES } from '../case-rules.js';
import { checkPublicPlaces } from './public-places.js';

/** The cheese case with every place indoors but the market square, which has nothing in it. */
function buildSquareCase(edit: (detectiveCase: DetectiveCase) => void = () => undefined): DetectiveCase {
  const detectiveCase = DetectiveCaseSchema.parse(buildCheeseCase());
  for (const location of detectiveCase.locations) {
    location.exposure = location.id === 'market-square' ? 'outdoor' : 'indoor';
  }
  edit(detectiveCase);
  return detectiveCase;
}

function codes(detectiveCase: DetectiveCase, requirePublicLife = true): CaseIssueCode[] {
  const result = validateCase(detectiveCase, {
    hero: buildHero(),
    traits: [],
    locale: 'en',
    realNames: [],
    rules: { ...LEGACY_RULES, publicLife: requirePublicLife },
  });
  return result.isValid ? [] : result.issues.map(({ code }) => code);
}

const square = (detectiveCase: DetectiveCase) => {
  const found = detectiveCase.locations.find(({ id }) => id === 'market-square');
  if (found === undefined) throw new Error('No square.');
  return found;
};

describe('a public place', () => {
  it('with nothing in it is refused, and named', () => {
    expect(codes(buildSquareCase())).toEqual(['empty-public-place']);
    const issues = checkPublicPlaces(buildSquareCase());
    expect(issues).toMatchObject([{ code: 'empty-public-place', path: 'locations[0]' }]);
    expect(issues[0]?.message).toContain('market-square');
  });

  it('is not asked for when the case is not a generated one', () => {
    expect(codes(buildSquareCase(), false)).toEqual([]);
  });

  it('is saved by a part to search', () => {
    const detectiveCase = buildSquareCase((built) => {
      square(built).parts = [
        {
          id: 'square-fountain',
          name: 'fountain',
          obstacle: null,
          holds: null,
          inQuickLook: true,
          requiresLead: null,
          fallback: null,
        },
      ];
    });

    expect(checkPublicPlaces(detectiveCase)).toEqual([]);
  });

  it('is saved by a witness who stands in it', () => {
    const detectiveCase = buildSquareCase((built) => {
      built.witnesses = [
        {
          id: 'vendor',
          locationId: 'market-square',
          name: 'Pip',
          persona: 'A fruit seller.',
          hours: { fromMinute: 0, untilMinute: 1439 },
        },
      ];
    });

    expect(codes(detectiveCase)).toEqual([]);
  });

  it('is saved by a rumour to be had there', () => {
    const detectiveCase = buildSquareCase((built) => {
      built.leads = [
        {
          id: 'rumour',
          reason: 'Somebody talks about the cellar.',
          earnedBy: { kind: 'locals', locationId: 'market-square' },
          isFalse: false,
        },
      ];
    });

    expect(checkPublicPlaces(detectiveCase)).toEqual([]);
  });

  it('is not saved by a rumour of another place, nor by a lead of another kind', () => {
    const detectiveCase = buildSquareCase((built) => {
      built.leads = [
        {
          id: 'rumour',
          reason: 'Somebody talks about the cellar.',
          earnedBy: { kind: 'locals', locationId: 'mayor-office' },
          isFalse: false,
        },
        {
          id: 'hunch',
          reason: 'The key looks used.',
          earnedBy: { kind: 'clue', clueId: 'cellar-key' },
          isFalse: false,
        },
      ];
    });

    expect(checkPublicPlaces(detectiveCase)).toMatchObject([{ code: 'empty-public-place' }]);
  });

  it('is also a place to sit down in, indoors as it may be', () => {
    const detectiveCase = buildSquareCase((built) => {
      square(built).exposure = 'indoor';
      const office = built.locations.find(({ id }) => id === 'mayor-office');
      if (office !== undefined) office.venue = 'teahouse';
    });

    expect(checkPublicPlaces(detectiveCase)).toMatchObject([
      { code: 'empty-public-place', path: 'locations[3]' },
    ]);
  });
});
