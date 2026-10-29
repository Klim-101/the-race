// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import type { Hero } from '../hero.js';
import type { CaseIssueCode } from './case-issue.js';
import { validateCase, type CaseValidationContext } from './case-validator.js';

function context(overrides: Partial<CaseValidationContext> = {}): CaseValidationContext {
  return { hero: buildHero(), locale: 'en', realNames: [], ...overrides };
}

function issueCodes(input: unknown, validationContext = context()): CaseIssueCode[] {
  const result = validateCase(input, validationContext);
  return result.isValid ? [] : result.issues.map((issue) => issue.code);
}

describe('validateCase', () => {
  it('accepts a case the hero can solve', () => {
    const result = validateCase(buildCheeseCase(), context());

    expect(result.isValid).toBe(true);
  });

  it('reports schema errors with their path', () => {
    const detectiveCase = buildCheeseCase();
    detectiveCase.title = '';

    const result = validateCase(detectiveCase, context());

    expect(result).toMatchObject({ isValid: false, issues: [{ code: 'schema', path: 'title' }] });
  });

  describe('references', () => {
    it('rejects an id used twice, even across entity kinds', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.deductions[0]!.id = 'baker';
      detectiveCase.solution.motiveDeductionId = 'baker';

      const result = validateCase(detectiveCase, context());

      expect(result).toMatchObject({ isValid: false, issues: [{ code: 'duplicate-id', path: 'deductions[0].id' }] });
    });

    it('rejects a duplicated lie id', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.suspects[1]!.lies[0]!.id = 'baker-asleep';

      expect(issueCodes(detectiveCase)).toEqual(['duplicate-id']);
    });

    it('reports every reference that names nothing, and skips the graph checks', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.startLocationId = 'nowhere';
      detectiveCase.locations[0]!.connections = ['ghost-room'];
      detectiveCase.locations[2]!.access = { kind: 'clue', clueId: 'ghost-key' };
      detectiveCase.clues[0]!.locationId = 'ghost-room';
      detectiveCase.clues[1]!.pointsTo = ['ghost'];
      detectiveCase.suspects[0]!.lies[0]!.brokenBy = ['ghost-clue'];
      detectiveCase.deductions[0]!.clueIds = ['ghost-clue', 'debt-ledger'];
      detectiveCase.truth.culpritId = 'ghost';
      detectiveCase.truth.crimeLocationId = 'ghost-room';
      detectiveCase.truth.timeline[0]!.actorId = 'ghost';
      detectiveCase.truth.timeline[0]!.locationId = 'ghost-room';
      detectiveCase.solution.motiveDeductionId = 'ghost-motive';
      detectiveCase.solution.evidenceChains[0] = ['ghost-clue'];

      const result = validateCase(detectiveCase, context());

      expect(result.isValid).toBe(false);
      if (result.isValid) return;
      expect(result.issues.every((issue) => issue.code === 'unknown-reference')).toBe(true);
      expect(result.issues.map((issue) => issue.path)).toEqual([
        'startLocationId',
        'locations[0].connections[0]',
        'locations[2].access.clueId',
        'clues[0].locationId',
        'clues[1].pointsTo[0]',
        'suspects[0].lies[0].brokenBy[0]',
        'deductions[0].clueIds[0]',
        'truth.culpritId',
        'truth.crimeLocationId',
        'truth.timeline[0].actorId',
        'truth.timeline[0].locationId',
        'solution.motiveDeductionId',
        'solution.evidenceChains[0][0]',
      ]);
    });
  });

  describe('reachability', () => {
    it('treats connections as two-way', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.locations[0]!.connections = ['cheese-stall'];
      detectiveCase.locations[2]!.connections = ['market-square'];

      expect(validateCase(detectiveCase, context()).isValid).toBe(true);
    });

    it('rejects a location with no way in', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.locations.push({
        id: 'lighthouse',
        name: 'Lighthouse',
        description: 'Far away on a rock.',
        connections: [],
        access: { kind: 'open' },
      });

      expect(issueCodes(detectiveCase)).toEqual(['unreachable-location']);
    });

    it('rejects a clue no roll can find', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clues.push({
        id: 'microfilm',
        locationId: 'market-square',
        description: 'A microfilm hidden in the fountain.',
        discovery: { skill: 'tech', difficulty: 30 },
        pointsTo: [],
        isRedHerring: false,
      });

      expect(issueCodes(detectiveCase)).toEqual(['unobtainable-clue']);
    });

    it('rejects a location behind a check no roll can pass', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.locations[3]!.access = { kind: 'skill', check: { skill: 'charm', difficulty: 25 } };

      expect(issueCodes(detectiveCase)).toEqual(
        expect.arrayContaining(['unreachable-location', 'unobtainable-clue', 'unobtainable-evidence', 'unobtainable-motive']),
      );
    });
  });

  describe('solution', () => {
    it('demands at least two evidence chains', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.solution.evidenceChains = [['flour-crumbs', 'cart-tracks']];

      expect(issueCodes(detectiveCase)).toEqual(['too-few-evidence-chains']);
    });

    it('rejects chains that share a clue', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.solution.evidenceChains[1] = ['oven-receipt', 'cart-tracks'];

      expect(issueCodes(detectiveCase)).toEqual(['overlapping-evidence-chains']);
    });

    it('allows a clue listed twice within one chain', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.solution.evidenceChains[0] = ['flour-crumbs', 'flour-crumbs'];

      expect(validateCase(detectiveCase, context()).isValid).toBe(true);
    });

    it('rejects a red herring used as evidence', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.solution.evidenceChains[0] = ['flour-crumbs', 'blue-glove'];

      expect(issueCodes(detectiveCase)).toEqual(['red-herring-in-evidence-chain']);
    });

    it('rejects a chain where no clue points to the culprit', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.solution.evidenceChains[0] = ['cellar-key'];

      expect(issueCodes(detectiveCase)).toEqual(['evidence-chain-misses-culprit']);
    });

    it('rejects a case every chain of which needs a skill the hero has no points in', () => {
      const hero: Hero = {
        ...buildHero(),
        skills: { observation: 0, logic: 3, charm: 0, pressure: 3, tech: 2, contacts: 2 },
      };

      expect(issueCodes(buildCheeseCase(), context({ hero }))).toEqual(['no-chain-without-untrained-skill']);
    });

    it('rejects a motive deduction built on a clue the hero can never find', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.deductions[0]!.clueIds = ['debt-ledger', 'unfindable-note'];
      detectiveCase.clues.push({
        id: 'unfindable-note',
        locationId: 'market-square',
        description: 'A note written in invisible ink.',
        discovery: { skill: 'tech', difficulty: 30 },
        pointsTo: [],
        isRedHerring: false,
      });

      expect(issueCodes(detectiveCase)).toEqual(['unobtainable-clue', 'unobtainable-motive']);
    });
  });

  it('rejects a lie whose breaking clues are all out of reach', () => {
    const detectiveCase = buildCheeseCase();
    detectiveCase.clues[5]!.discovery = { skill: 'tech', difficulty: 30 };

    const result = validateCase(detectiveCase, context());

    expect(result).toMatchObject({
      isValid: false,
      issues: [{ code: 'unobtainable-clue' }, { code: 'unbreakable-lie', path: 'suspects[1].lies[0]' }],
    });
  });

  describe('timeline', () => {
    it('rejects a timeline that never puts the culprit at the crime', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.truth.timeline[1]!.atMinute = 130;

      expect(issueCodes(detectiveCase)).toEqual(['culprit-not-at-crime']);
    });

    it('rejects an actor in two places at the same minute', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.truth.timeline.push({
        atMinute: 120,
        actorId: 'baker',
        locationId: 'market-square',
        action: 'Buys a pretzel.',
      });

      expect(issueCodes(detectiveCase)).toEqual(['actor-in-two-places']);
    });

    it('allows an actor to repeat the same place at the same minute', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.truth.timeline.push({
        atMinute: 120,
        actorId: 'baker',
        locationId: 'cheese-stall',
        action: 'Looks around nervously.',
      });

      expect(validateCase(detectiveCase, context()).isValid).toBe(true);
    });
  });

  it('rejects a case drowning in red herrings', () => {
    const detectiveCase = buildCheeseCase();
    for (const id of ['cellar-key', 'flour-crumbs']) {
      detectiveCase.clues.find((clue) => clue.id === id)!.isRedHerring = true;
    }
    detectiveCase.solution.evidenceChains[0] = ['cart-tracks'];
    detectiveCase.clues.push({
      id: 'old-coin',
      locationId: 'market-square',
      description: 'An old coin from a forgotten kingdom.',
      discovery: null,
      pointsTo: [],
      isRedHerring: true,
    });

    expect(issueCodes(detectiveCase)).toEqual(['too-many-red-herrings']);
  });

  describe('texts', () => {
    it('rejects a case in another language than the run', () => {
      expect(issueCodes(buildCheeseCase(), context({ locale: 'ru' }))).toEqual(
        expect.arrayContaining(['locale-mismatch', 'wrong-script']),
      );
    });

    it('rejects a real-world name anywhere in the texts, including the truth', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.truth.method = 'Sold the wheel to a buyer from Norway.';

      const result = validateCase(detectiveCase, context({ realNames: ['Norway'] }));

      expect(result).toMatchObject({ isValid: false, issues: [{ code: 'real-name', path: 'truth.method' }] });
    });

    it('checks every kind of narrative text', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clock.worldEvents[0]!.description = 'Zorbia closes its borders.';
      detectiveCase.suspects[0]!.lies[0]!.statement = 'I was in Zorbia.';

      const result = validateCase(detectiveCase, context({ realNames: ['Zorbia'] }));

      expect(result).toMatchObject({
        isValid: false,
        issues: [
          { code: 'real-name', path: 'suspects[0].lies[0].statement' },
          { code: 'real-name', path: 'clock.worldEvents[0].description' },
        ],
      });
    });
  });
});
