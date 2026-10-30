// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import type { Trait } from '../../traits.js';
import type { CaseIssue } from '../case-issue.js';
import { validateCase } from '../case-validator.js';
import { DETECTIVE_TRAITS } from '../traits.js';

type RawCase = ReturnType<typeof buildCheeseCase>;

function issuesOf(raw: RawCase, traits: readonly Trait[] = []): CaseIssue[] {
  const result = validateCase(raw, { hero: buildHero(), traits, locale: 'en', realNames: [] });
  return result.isValid ? [] : [...result.issues];
}

function codesOf(raw: RawCase, traits: readonly Trait[] = []): string[] {
  return issuesOf(raw, traits).map(({ code }) => code);
}

function flees(raw: RawCase, day: number): void {
  raw.clock.days = 5;
  raw.clock.worldEvents.push({
    day,
    description: 'The culprit slips away.',
    effect: { kind: 'culprit-flees' },
  });
}

function closes(raw: RawCase, day: number, locationId: string): void {
  raw.clock.worldEvents.push({
    day,
    description: 'A road is shut.',
    effect: { kind: 'location-closes', locationId },
  });
}

/** Replaces the direct road from the cheese stall to the mayor office with a corridor of `length` halls. */
function corridor(raw: RawCase, prefix: string, length: number): void {
  const ids = Array.from({ length }, (_, index) => `${prefix}-${String(index + 1)}`);
  const stall = raw.locations.find((location) => location.id === 'cheese-stall');
  if (!stall) throw new Error('The fixture has no cheese stall.');
  stall.connections = [...(stall.connections as string[]).filter((id) => id !== 'mayor-office'), ids[0]];
  ids.forEach((id, index) => {
    raw.locations.push({
      id,
      name: `Hall ${id}`,
      description: 'A long, plain hall.',
      connections: [ids[index + 1] ?? 'mayor-office'],
      access: { kind: 'open' },
    });
  });
}

describe('the culprit-flees deadline', () => {
  it('has nothing to check when the culprit never flees', () => {
    expect(codesOf(buildCheeseCase())).toEqual([]);
  });

  it('only looks where nothing wanted needs a roll, and ignores what a look cannot show', () => {
    const raw = buildCheeseCase();
    raw.clues.push({
      id: 'loose-coin',
      locationId: 'market-square',
      description: 'A coin wedged between the cobbles.',
      discovery: { skill: 'perception', difficulty: 5 },
      pointsTo: [],
      isRedHerring: false,
    });
    flees(raw, 2);

    expect(codesOf(raw)).toEqual([]);
  });

  it('leaves a flight on the first day to the event check', () => {
    const raw = buildCheeseCase();
    flees(raw, 1);

    expect(codesOf(raw)).toEqual(['world-event-out-of-range']);
  });

  it('accepts a case the hero can finish in the first day', () => {
    const raw = buildCheeseCase();
    flees(raw, 2);

    expect(codesOf(raw)).toEqual([]);
  });

  it('rejects a case whose solution lies further than the days before the flight', () => {
    const raw = buildCheeseCase();
    corridor(raw, 'hall', 70);
    flees(raw, 2);

    const issues = issuesOf(raw);

    expect(issues).toEqual([
      expect.objectContaining({ code: 'solution-after-culprit-flees', path: 'clock.worldEvents' }),
    ]);
  });

  it('accepts the same long road when the flight comes late enough', () => {
    const raw = buildCheeseCase();
    corridor(raw, 'hall', 70);
    flees(raw, 3);

    expect(codesOf(raw)).toEqual([]);
  });

  describe('closures', () => {
    // The short corridor is 1115 minutes of play away, the long one 2015: day 3 starts at 1920.
    function twoRoads(): RawCase {
      const raw = buildCheeseCase();
      corridor(raw, 'short', 70);
      corridor(raw, 'long', 130);
      flees(raw, 3);
      return raw;
    }

    it('accepts the short road while nothing has closed', () => {
      expect(codesOf(twoRoads())).toEqual([]);
    });

    it('counts a closure from the day it fires: it cuts the short road the hero reaches too late', () => {
      const raw = twoRoads();
      closes(raw, 2, 'short-65');

      expect(codesOf(raw)).toEqual(['solution-after-culprit-flees']);
    });

    it('does not count a closure that fires after the hero has passed', () => {
      const raw = twoRoads();
      closes(raw, 3, 'short-65');

      expect(codesOf(raw)).toEqual([]);
    });

    it('lets the hero through a place that closes after they have gone by', () => {
      const raw = twoRoads();
      closes(raw, 2, 'short-5');

      expect(codesOf(raw)).toEqual([]);
    });
  });

  it('rejects a case whose evidence the plan can never gather', () => {
    const raw = buildCheeseCase();
    for (const clue of raw.clues) {
      if (clue.id === 'oven-receipt' || clue.id === 'debt-ledger') clue.source = 'police-data';
    }
    flees(raw, 3);
    const enemy = DETECTIVE_TRAITS.find(({ id }) => id === 'old-enemy-in-the-police');
    if (!enemy) throw new Error('The trait is missing.');

    expect(codesOf(raw, [enemy])).toContain('solution-after-culprit-flees');
  });

  it('rejects a case in which the starting place leads nowhere', () => {
    const raw = buildCheeseCase();
    const start = raw.locations[0];
    if (!start) throw new Error('The fixture has no locations.');
    start.connections = [];
    flees(raw, 3);

    expect(codesOf(raw)).toContain('solution-after-culprit-flees');
  });

  it('says nothing about a trait of the hero', () => {
    const raw = buildCheeseCase();
    corridor(raw, 'hall', 70);
    flees(raw, 2);
    const claustrophobe = DETECTIVE_TRAITS.find(({ id }) => id === 'claustrophobe');
    if (!claustrophobe) throw new Error('The trait is missing.');

    const text = JSON.stringify(issuesOf(raw, [claustrophobe])).toLowerCase();

    expect(text).toContain('solution-after-culprit-flees');
    for (const forbidden of ['claustrophob', 'trait', 'police']) expect(text).not.toContain(forbidden);
  });
});
