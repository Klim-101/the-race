// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import type { CaseIssue } from '../case-issue.js';
import { validateCase } from '../case-validator.js';

type Raw = ReturnType<typeof buildCheeseCase>;

interface Variant {
  fate?: string;
  means?: boolean;
  witness?: 'none' | 'no-hours' | 'ok';
  atScene?: 'both' | 'culprit';
  report?: string | null;
  reportAt?: number;
}

/**
 * The cheese case as an attempt that passes: a means to draw, a victim who lies in a ward off the square (open 14:00 to 18:00),
 * two suspects at the scene, the stall, and a report that comes on the second day.
 */
function homicide(variant: Variant = {}): Raw {
  const raw = buildCheeseCase();
  Object.assign(raw, { form: 'homicide' });
  Object.assign(raw.truth, {
    homicide: { victim: { name: 'Pieter Vane' }, fate: variant.fate ?? 'attempt' },
  });
  raw.deductions.push({
    id: 'means-rolled',
    clueIds: ['flour-crumbs', 'cart-tracks'],
    insight: 'The wheel was rolled to the cellar on a cart.',
  });
  if (variant.means !== false) Object.assign(raw.solution, { meansDeductionId: 'means-rolled' });
  if (variant.atScene !== 'culprit') {
    raw.truth.timeline.push({
      atMinute: 125,
      actorId: 'rival',
      locationId: 'cheese-stall',
      action: 'Waits at the stall.',
    });
  }
  raw.locations.push({
    id: 'ward',
    name: 'The ward',
    description: 'A quiet ward with a few beds and a nurse at the desk.',
    connections: ['market-square'],
    access: { kind: 'open' },
    ...(variant.witness === 'no-hours' ? {} : { hours: { fromMinute: 14 * 60, untilMinute: 18 * 60 } }),
  });
  if (variant.witness !== 'none') {
    Object.assign(raw, {
      witnesses: [
        {
          id: 'victim-witness',
          locationId: 'ward',
          name: 'Pieter Vane',
          persona: 'A man in a bed who remembers little of that night.',
          hours: { fromMinute: 0, untilMinute: 1439 },
          victim: true,
        },
      ],
    });
  }
  if (variant.report !== null) {
    raw.clues.push({
      id: 'doctor-report',
      locationId: 'market-square',
      description: variant.report ?? 'The doctor writes that the blow fell two hours before the alarm.',
      discovery: null,
      pointsTo: [],
      isRedHerring: false,
      message: { channel: 'report', arrivesAtMinute: variant.reportAt ?? 1700 },
    });
  }
  return raw;
}

function issuesOf(raw: Raw): CaseIssue[] {
  const result = validateCase(raw, { hero: buildHero(), traits: [], locale: 'en', realNames: [] });
  return result.isValid ? [] : [...result.issues];
}
const codesOf = (raw: Raw): string[] => issuesOf(raw).map(({ code }) => code);

describe('a homicide that is fair', () => {
  it('passes the rules of the form, and a case of another form has none of them to judge', () => {
    expect(issuesOf(homicide())).toEqual([]);
    expect(issuesOf(buildCheeseCase())).toEqual([]);
  });
});

describe('what a homicide needs', () => {
  it('is an attempt for now: a case that says the victim was killed is not yet accepted', () => {
    const issues = issuesOf(homicide({ fate: 'death', witness: 'none' }));

    expect(issues).toEqual([
      expect.objectContaining({ code: 'homicide-death-not-ready', path: 'truth.homicide.fate' }),
    ]);
  });

  it('has a conclusion about the means', () => {
    expect(issuesOf(homicide({ means: false }))).toEqual([
      expect.objectContaining({ code: 'homicide-without-means', path: 'solution.meansDeductionId' }),
    ]);
  });

  it('leans on the clues of the means, which the hero must be able to find, as on those of the motive', () => {
    const raw = homicide();
    raw.locations.push({
      id: 'sealed-room',
      name: 'Sealed room',
      description: 'A room nobody can get into.',
      connections: [],
      access: { kind: 'open' },
    });
    raw.clues.push({
      id: 'sealed-note',
      locationId: 'sealed-room',
      description: 'A note on a shelf.',
      discovery: null,
      pointsTo: [],
      isRedHerring: false,
    });
    raw.deductions.push({
      id: 'means-hidden',
      clueIds: ['sealed-note', 'flour-crumbs'],
      insight: 'A note says so.',
    });
    Object.assign(raw.solution, { meansDeductionId: 'means-hidden' });

    expect(issuesOf(raw).filter(({ code }) => code === 'unobtainable-clue')).toEqual([
      expect.objectContaining({ message: expect.stringContaining('sealed-note') as unknown }),
    ]);
  });
});

describe('the victim of an attempt', () => {
  it('is a witness at the place where they lie', () => {
    expect(issuesOf(homicide({ witness: 'none' }))).toEqual([
      expect.objectContaining({ code: 'attempt-without-victim-witness', path: 'witnesses' }),
    ]);
  });

  it('lies at a place that keeps hours, so the hero has to come at the right time', () => {
    const issues = issuesOf(homicide({ witness: 'no-hours' }));

    expect(issues).toEqual([
      expect.objectContaining({ code: 'victim-place-without-hours', path: 'witnesses[0].locationId' }),
    ]);
    expect(issues[0]?.message).toContain('ward');
  });
});

describe('the scene of a homicide', () => {
  it('has at least two suspects at it, so that the hero has to tell them apart by evidence', () => {
    const issues = issuesOf(homicide({ atScene: 'culprit' }));

    expect(issues).toEqual([
      expect.objectContaining({ code: 'homicide-opportunity-single', path: 'truth.timeline' }),
    ]);
    expect(issues[0]?.message).toContain('cheese-stall');
  });
});

describe('a report of a homicide', () => {
  it('arrives before the case ends', () => {
    const issues = issuesOf(homicide({ reportAt: 3 * 1440 }));

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'message-after-deadline',
        path: expect.stringMatching(/message\.arrivesAtMinute$/) as unknown,
      }),
    ]);
  });

  it('names no one the case holds guilty, by name or by a word of it', () => {
    for (const report of [
      'The doctor says Orla Brenn was seen near the bed.',
      'The doctor found flour on the glove, a baker’s glove: Brenn.',
    ]) {
      expect(codesOf(homicide({ report }))).toEqual(['message-names-culprit']);
    }
  });

  it('is judged for its words only once it is written, so a frame does not hold it to them', () => {
    const result = validateCase(homicide({ report: 'Orla Brenn did it.' }), {
      hero: buildHero(),
      traits: [],
      locale: 'en',
      realNames: [],
      frame: true,
    });

    expect(result.isValid).toBe(true);
  });
});
