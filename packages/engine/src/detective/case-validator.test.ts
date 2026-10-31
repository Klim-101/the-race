// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import type { DetectiveHero } from './archetype.js';
import { DETECTIVE_TRAITS } from './traits.js';
import type { Trait } from '../traits.js';
import type { CaseIssueCode } from './case-issue.js';
import { MIN_RANDOM_EVENTS } from './case-schema.js';
import { validateCase, type CaseValidationContext } from './case-validator.js';

function context(overrides: Partial<CaseValidationContext> = {}): CaseValidationContext {
  return { hero: buildHero(), traits: [], locale: 'en', realNames: [], ...overrides };
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

      expect(result).toMatchObject({
        isValid: false,
        issues: [{ code: 'duplicate-id', path: 'deductions[0].id' }],
      });
    });

    it('rejects a duplicated lie id', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.suspects[1]!.lies[0]!.id = 'baker-asleep';

      expect(issueCodes(detectiveCase)).toEqual(['duplicate-id']);
    });

    it('rejects a suspect placed in a location that does not exist', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.suspects[1]!.locationId = 'ghost-room';

      const result = validateCase(detectiveCase, context());

      expect(result).toMatchObject({
        isValid: false,
        issues: [{ code: 'unknown-reference', path: 'suspects[1].locationId' }],
      });
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

    it('lets an optional clue no roll can find stay unavailable', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clues.push({
        id: 'microfilm',
        locationId: 'market-square',
        description: 'A microfilm hidden in the fountain.',
        discovery: { skill: 'tech', difficulty: 30 },
        pointsTo: [],
        isRedHerring: false,
      });

      expect(issueCodes(detectiveCase)).toEqual([]);
    });

    it('rejects a clue of an evidence chain no roll can find', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clues[0]!.discovery = { skill: 'tech', difficulty: 30 };

      expect(issueCodes(detectiveCase)).toEqual(
        expect.arrayContaining(['unobtainable-clue', 'unobtainable-evidence']),
      );
    });

    it('rejects a suspect in a place the hero cannot reach', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.locations[3]!.access = { kind: 'skill', check: { skill: 'social', difficulty: 25 } };
      detectiveCase.suspects[2]!.locationId = 'mayor-office';

      const result = validateCase(detectiveCase, context());

      expect(result.isValid).toBe(false);
      expect(result.isValid ? [] : result.issues).toContainEqual(
        expect.objectContaining({ code: 'unreachable-suspect', path: 'suspects[2].locationId' }),
      );
    });

    it('does not check a suspect without a location', () => {
      const detectiveCase = buildCheeseCase();
      delete detectiveCase.suspects[2]!.locationId;

      expect(issueCodes(detectiveCase)).not.toContain('unreachable-suspect');
    });

    it('accepts a suspect behind a check the hero can pass', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.suspects[2]!.locationId = 'mayor-office';

      expect(issueCodes(detectiveCase)).not.toContain('unreachable-suspect');
    });

    it('rejects a location behind a check no roll can pass', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.locations[3]!.access = { kind: 'skill', check: { skill: 'social', difficulty: 25 } };

      expect(issueCodes(detectiveCase)).toEqual(
        expect.arrayContaining([
          'unreachable-location',
          'unobtainable-clue',
          'unobtainable-evidence',
          'unobtainable-motive',
        ]),
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
      const hero: DetectiveHero = {
        ...buildHero(),
        skills: { perception: 0, reasoning: 3, social: 0, pressure: 3, tech: 2, contacts: 2 },
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

    it('rejects a Latin-script text in the wrong language, anywhere including the truth', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.truth.method = 'La rueda de queso fue rodada hasta la bodega por la noche.';
      detectiveCase.suspects[0]!.persona = 'Eine freundliche Bäckerin, die den ganzen Tag im Laden steht.';

      const result = validateCase(detectiveCase, context());

      expect(result).toMatchObject({
        isValid: false,
        issues: [
          { code: 'wrong-language', path: 'suspects[0].persona' },
          { code: 'wrong-language', path: 'truth.method' },
        ],
      });
    });

    it('reports a wrong script once, not as a wrong language too', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.premise = 'Утром в день ярмарки огромный круг сыра исчез с прилавка.';

      const result = validateCase(detectiveCase, context());

      expect(result).toMatchObject({ isValid: false, issues: [{ code: 'wrong-script', path: 'premise' }] });
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

  describe('hero traits', () => {
    const trait = (id: string): Trait => {
      const found = DETECTIVE_TRAITS.find((candidate) => candidate.id === id);
      if (!found) throw new Error(`No trait ${id}`);
      return found;
    };

    it('rejects a case that leans on a source a trait closes to the hero', () => {
      const detectiveCase = buildCheeseCase();
      for (const clue of detectiveCase.clues) {
        if (clue.id === 'oven-receipt' || clue.id === 'debt-ledger') clue.source = 'police-data';
      }

      expect(issueCodes(detectiveCase)).toEqual([]);
      expect(issueCodes(detectiveCase, context({ traits: [trait('old-enemy-in-the-police')] }))).toContain(
        'unobtainable-evidence',
      );
    });

    it('never names a trait or a closed source in the issues the generator reads', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clues[3]!.source = 'police-data';
      const traits = [trait('old-enemy-in-the-police'), trait('claustrophobe')];

      const result = validateCase(detectiveCase, context({ traits }));
      const text = JSON.stringify(result).toLowerCase();

      expect(result.isValid).toBe(false);
      for (const forbidden of ['police', 'enemy', 'claustrophob', 'trait']) {
        expect(text).not.toContain(forbidden);
      }
    });

    it('applies a penalty in the situations of the location', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.locations[2]!.situations = ['confined-space'];
      detectiveCase.clues[2]!.discovery = { skill: 'perception', difficulty: 23 };
      const claustrophobe = context({ traits: [trait('claustrophobe')] });

      expect(issueCodes(detectiveCase)).toEqual([]);
      expect(issueCodes(detectiveCase, claustrophobe)).toContain('unobtainable-evidence');
    });

    it('applies a penalty in the situations of the clue itself', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clues[2]!.situations = ['confined-space'];
      detectiveCase.clues[2]!.discovery = { skill: 'perception', difficulty: 23 };

      expect(issueCodes(detectiveCase, context({ traits: [trait('claustrophobe')] }))).toContain(
        'unobtainable-evidence',
      );
    });

    it('does not apply a penalty outside its situation', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clues[2]!.discovery = { skill: 'perception', difficulty: 23 };

      expect(issueCodes(detectiveCase, context({ traits: [trait('claustrophobe')] }))).toEqual([]);
    });

    it('lets a bonus open a check that was out of reach', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.locations[3]!.access = { kind: 'skill', check: { skill: 'social', difficulty: 22 } };
      detectiveCase.locations[3]!.situations = ['high-society'];

      expect(issueCodes(detectiveCase)).toContain('unreachable-location');
      // The bonus makes the door possible, not likely: luck is left out, so the chance is still too small.
      expect(issueCodes(detectiveCase, context({ traits: [trait('well-connected')] }))).toEqual([
        'unlikely-solution',
      ]);
    });

    it('lets an optional police-data clue stay closed to the hero without failing the case', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clues.push({
        id: 'police-file',
        locationId: 'market-square',
        description: 'A file from the police archive.',
        discovery: null,
        source: 'police-data',
        pointsTo: [],
        isRedHerring: false,
      });

      expect(issueCodes(detectiveCase, context({ traits: [trait('old-enemy-in-the-police')] }))).toEqual([]);
    });

    it('still fails a police-data clue that sits in an evidence chain', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.clues[0]!.source = 'police-data';

      expect(issueCodes(detectiveCase, context({ traits: [trait('old-enemy-in-the-police')] }))).toContain(
        'unobtainable-clue',
      );
    });

    it('does not let a photographic memory rescue a clue no roll can find', () => {
      const detectiveCase = buildCheeseCase();
      detectiveCase.solution.evidenceChains[0]!.push('microfilm');
      detectiveCase.clues.push({
        id: 'microfilm',
        locationId: 'market-square',
        description: 'A microfilm hidden in the fountain.',
        discovery: { skill: 'tech', difficulty: 30 },
        pointsTo: [],
        isRedHerring: false,
      });

      expect(issueCodes(detectiveCase, context({ traits: [trait('photographic-memory')] }))).toEqual(
        expect.arrayContaining(['unobtainable-clue', 'unobtainable-evidence']),
      );
    });
  });
});

describe('the pool of random events a generated case must bring', () => {
  const pool = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `event-${String(index)}`,
      description: `Something harmless happens, number ${String(index)}.`,
      weight: 1,
      fromDay: 1,
      untilDay: null,
      tones: [],
      traitTriggers: [],
      effect: { kind: 'flavor' },
      duration: { kind: 'instant' },
    }));

  it('is not asked of a case when no minimum is given, as before the pool existed', () => {
    expect(issueCodes(buildCheeseCase())).toEqual([]);
  });

  it('rejects a case with fewer events than the minimum, and says how many it has', () => {
    for (const count of [0, 1, 2]) {
      const detectiveCase = { ...buildCheeseCase(), randomEvents: pool(count) };
      const result = validateCase(detectiveCase, context({ minRandomEvents: MIN_RANDOM_EVENTS }));

      expect(result).toMatchObject({
        isValid: false,
        issues: [{ code: 'too-few-random-events', path: 'randomEvents' }],
      });
      expect(JSON.stringify(result)).toContain(`it has ${String(count)}`);
    }
  });

  it('rejects a case without any pool at all', () => {
    expect(issueCodes(buildCheeseCase(), context({ minRandomEvents: MIN_RANDOM_EVENTS }))).toEqual([
      'too-few-random-events',
    ]);
  });

  it('accepts a case with the minimum', () => {
    const detectiveCase = { ...buildCheeseCase(), randomEvents: pool(MIN_RANDOM_EVENTS) };

    expect(issueCodes(detectiveCase, context({ minRandomEvents: MIN_RANDOM_EVENTS }))).toEqual([]);
  });
});
