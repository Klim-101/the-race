// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import type { CaseIssueCode } from '../case-issue.js';
import { validateCase } from '../case-validator.js';

type Loose = Record<string, unknown>;

const lead = (id: string, earnedBy: Loose, extra: Loose = {}): Loose => ({
  id,
  reason: 'Something the hero heard makes them look there.',
  earnedBy,
  isFalse: false,
  ...extra,
});

/** The cheese case with a back lane that waits for the lead `hint`, earned by `earnedBy`. */
function buildLaneCase(earnedBy: Loose = { kind: 'clue', clueId: 'flour-crumbs' }, extra: Loose = {}) {
  const detectiveCase = buildCheeseCase();
  detectiveCase.locations.push({
    id: 'back-lane',
    name: 'Back lane',
    description: 'Bins and cats.',
    connections: ['market-square'],
    access: { kind: 'open' },
    requiresLead: 'hint',
  });
  detectiveCase.leads = [lead('hint', earnedBy, extra)];
  return detectiveCase;
}

function issueCodes(input: unknown): CaseIssueCode[] {
  const result = validateCase(input, { hero: buildHero(), traits: [], locale: 'en', realNames: [] });
  return result.isValid ? [] : result.issues.map((issue) => issue.code);
}

const place = (detectiveCase: ReturnType<typeof buildCheeseCase>, id: string): Loose => {
  const found = detectiveCase.locations.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No place ${id}.`);
  return found;
};

/** The mayor's office, shut so hard that this hero can never get in: what lies there is out of reach. */
const sealOffice = (detectiveCase: ReturnType<typeof buildCheeseCase>): void => {
  place(detectiveCase, 'mayor-office').access = {
    kind: 'skill',
    check: { skill: 'tech', difficulty: 30 },
  };
};

describe('a lead that can be earned', () => {
  it('opens a place when the clue that earns it can be found', () => {
    expect(issueCodes(buildLaneCase())).toEqual([]);
  });

  it('can be earned by a talk with a person within reach, or with one tied to no place', () => {
    expect(issueCodes(buildLaneCase({ kind: 'talk', suspectId: 'baker' }))).toEqual([]);
    expect(issueCodes(buildLaneCase({ kind: 'talk', suspectId: 'mayor' }))).toEqual([]);
  });

  it('can be earned by a lie that a clue within reach breaks', () => {
    expect(issueCodes(buildLaneCase({ kind: 'lie', lieId: 'baker-asleep' }))).toEqual([]);
  });

  it('can be earned by a conclusion whose clues are within reach', () => {
    expect(issueCodes(buildLaneCase({ kind: 'deduction', deductionId: 'motive-debt' }))).toEqual([]);
  });
});

describe('a lead that can never be earned', () => {
  it('is rejected for a clue out of reach', () => {
    const detectiveCase = buildLaneCase({ kind: 'clue', clueId: 'oven-receipt' });
    sealOffice(detectiveCase);

    expect(issueCodes(detectiveCase)).toContain('unearnable-lead');
  });

  it('is rejected for a talk with a person out of reach', () => {
    const detectiveCase = buildLaneCase({ kind: 'talk', suspectId: 'baker' });
    sealOffice(detectiveCase);
    const baker = detectiveCase.suspects.find((suspect) => suspect.id === 'baker');
    if (baker !== undefined) baker.locationId = 'mayor-office';

    expect(issueCodes(detectiveCase)).toContain('unearnable-lead');
  });

  it('is rejected for a lie whose person is out of reach, and for one no clue within reach breaks', () => {
    const unreachable = buildLaneCase({ kind: 'lie', lieId: 'baker-asleep' });
    sealOffice(unreachable);
    const baker = unreachable.suspects.find((suspect) => suspect.id === 'baker');
    if (baker !== undefined) baker.locationId = 'mayor-office';
    expect(issueCodes(unreachable)).toContain('unearnable-lead');

    const unbroken = buildLaneCase({ kind: 'lie', lieId: 'baker-asleep' });
    sealOffice(unbroken);
    const lie = unbroken.suspects[0]?.lies[0];
    if (lie !== undefined) lie.brokenBy = ['oven-receipt'];
    expect(issueCodes(unbroken)).toContain('unearnable-lead');
  });

  it('is rejected for a conclusion whose clues are out of reach', () => {
    const detectiveCase = buildLaneCase({ kind: 'deduction', deductionId: 'motive-debt' });
    sealOffice(detectiveCase);

    expect(issueCodes(detectiveCase)).toContain('unearnable-lead');
  });

  it('is rejected when it is earned only in the place it opens', () => {
    const detectiveCase = buildLaneCase({ kind: 'clue', clueId: 'lane-note' });
    detectiveCase.clues.push({
      id: 'lane-note',
      locationId: 'back-lane',
      description: 'A note under a bin.',
      discovery: null,
      pointsTo: [],
      isRedHerring: true,
    });

    expect(issueCodes(detectiveCase)).toContain('unearnable-lead');
  });
});

describe('what a lead must keep to', () => {
  it('opens something', () => {
    const detectiveCase = buildLaneCase();
    delete place(detectiveCase, 'back-lane').requiresLead;

    expect(issueCodes(detectiveCase)).toEqual(['unused-lead']);
  });

  it('is not needed to start: the first place is known from the first minute', () => {
    const detectiveCase = buildLaneCase();
    place(detectiveCase, 'market-square').requiresLead = 'hint';

    expect(issueCodes(detectiveCase)).toContain('hidden-start');
  });

  it('leads a false lead to nothing but a red herring', () => {
    const lane = (isRedHerring: boolean) => {
      const detectiveCase = buildLaneCase(undefined, { isFalse: true });
      detectiveCase.clues.push({
        id: 'lane-note',
        locationId: 'back-lane',
        description: 'A note under a bin.',
        discovery: null,
        pointsTo: [],
        isRedHerring,
      });
      return detectiveCase;
    };

    expect(issueCodes(lane(true))).toEqual([]);
    expect(issueCodes(lane(false))).toEqual(['false-lead-holds-clue']);
  });

  it('leads a false lead to no part that holds a real clue', () => {
    const parted = (isRedHerring: boolean, holds: string | null) => {
      const detectiveCase = buildLaneCase(undefined, { isFalse: true });
      delete place(detectiveCase, 'back-lane').requiresLead;
      detectiveCase.clues.push({
        id: 'lane-note',
        locationId: 'back-lane',
        description: 'A note under a bin.',
        discovery: null,
        pointsTo: [],
        isRedHerring,
      });
      place(detectiveCase, 'back-lane').parts = [
        {
          id: 'bin',
          name: 'The bin',
          obstacle: null,
          holds,
          inQuickLook: false,
          requiresLead: 'hint',
          fallback: null,
        },
      ];
      return detectiveCase;
    };

    expect(issueCodes(parted(true, 'lane-note'))).toEqual([]);
    expect(issueCodes(parted(false, 'lane-note'))).toEqual(['false-lead-holds-clue']);
    expect(issueCodes(parted(true, null))).toEqual(['clue-without-part']);
  });

  it('does not hide a person the hero has to find', () => {
    const detectiveCase = buildLaneCase();
    const mayor = detectiveCase.suspects.find((suspect) => suspect.id === 'mayor');
    if (mayor !== undefined) mayor.locationId = 'back-lane';

    expect(issueCodes(detectiveCase)).toEqual(['suspect-in-hidden-place']);
  });

  it('can be the way round an obstacle, if it can be earned', () => {
    const detectiveCase = buildLaneCase();
    delete place(detectiveCase, 'back-lane').requiresLead;
    place(detectiveCase, 'market-square').parts = [
      {
        id: 'fountain-edge',
        name: 'The fountain edge',
        obstacle: 'locked',
        holds: 'cellar-key',
        inQuickLook: true,
        requiresLead: null,
        fallback: { kind: 'lead', leadId: 'hint' },
      },
    ];

    expect(issueCodes(detectiveCase)).toEqual([]);
    sealOffice(detectiveCase);
    detectiveCase.leads = [lead('hint', { kind: 'clue', clueId: 'oven-receipt' })];
    expect(issueCodes(detectiveCase)).toContain('unearnable-lead');
  });
});

describe('references of leads', () => {
  it('rejects a lead that shares an id with another entity', () => {
    const detectiveCase = buildLaneCase();
    detectiveCase.leads = [lead('baker', { kind: 'clue', clueId: 'flour-crumbs' })];
    place(detectiveCase, 'back-lane').requiresLead = 'baker';

    expect(issueCodes(detectiveCase)).toEqual(['duplicate-id']);
  });

  it('rejects a place that waits for a lead the case does not have', () => {
    const detectiveCase = buildLaneCase();
    place(detectiveCase, 'back-lane').requiresLead = 'no-such-lead';

    expect(issueCodes(detectiveCase)).toEqual(['unknown-reference']);
  });

  it('rejects a part that waits for a lead, or falls back on one, that the case does not have', () => {
    const detectiveCase = buildLaneCase();
    delete place(detectiveCase, 'back-lane').requiresLead;
    place(detectiveCase, 'market-square').parts = [
      {
        id: 'fountain-edge',
        name: 'The fountain edge',
        obstacle: 'locked',
        holds: 'cellar-key',
        inQuickLook: true,
        requiresLead: 'no-such-lead',
        fallback: { kind: 'lead', leadId: 'nor-this-one' },
      },
    ];

    expect(issueCodes(detectiveCase)).toEqual(['unknown-reference', 'unknown-reference']);
  });

  it('rejects a lead earned by something the case does not have', () => {
    for (const earnedBy of [
      { kind: 'clue', clueId: 'nothing' },
      { kind: 'talk', suspectId: 'nobody' },
      { kind: 'lie', lieId: 'no-lie' },
      { kind: 'deduction', deductionId: 'no-deduction' },
    ]) {
      expect(issueCodes(buildLaneCase(earnedBy))).toEqual(['unknown-reference']);
    }
  });

  it('reads the reason as narrative text', () => {
    const detectiveCase = buildLaneCase(undefined, { reason: 'Подсказка о переулке.' });

    expect(issueCodes(detectiveCase)).toContain('wrong-script');
  });
});
