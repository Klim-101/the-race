// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../../test/fixtures/cheese-case.js';
import type { CaseIssueCode } from '../case-issue.js';
import { LEGACY_RULES } from '../case-rules.js';
import { validateCase, type CaseValidationContext } from '../case-validator.js';

type Part = Record<string, unknown>;

const lead = (id: string) => ({
  id,
  reason: 'Something about the key makes the hero look again.',
  earnedBy: { kind: 'clue', clueId: 'cellar-key' },
  isFalse: false,
});

const part = (id: string, holds: string | null, overrides: Part = {}): Part => ({
  id,
  name: `The ${id.replaceAll('-', ' ')}`,
  obstacle: null,
  holds,
  inQuickLook: true,
  requiresLead: null,
  fallback: null,
  ...overrides,
});

/** The cheese case with every place that holds a clue split into parts, one part to a clue. */
function buildPartedCase() {
  const detectiveCase = buildCheeseCase();
  const partsByPlace: Record<string, Part[]> = {
    'market-square': [part('fountain-edge', 'cellar-key')],
    'cheese-stall': [part('plinth', 'flour-crumbs'), part('crate', 'blue-glove')],
    'storage-cellar': [part('cellar-floor', 'cart-tracks')],
    'mayor-office': [part('desk', 'oven-receipt'), part('cabinet', 'debt-ledger')],
  };
  for (const location of detectiveCase.locations) {
    location.parts = partsByPlace[location.id as string];
  }
  return detectiveCase;
}

const partsOf = (detectiveCase: ReturnType<typeof buildPartedCase>, placeId: string): Part[] =>
  detectiveCase.locations.find(({ id }) => id === placeId)?.parts as Part[];

function context(overrides: Partial<CaseValidationContext> = {}): CaseValidationContext {
  return {
    hero: buildHero(),
    traits: [],
    locale: 'en',
    realNames: [],
    rules: { ...LEGACY_RULES, parts: true },
    ...overrides,
  };
}

function issueCodes(input: unknown, validationContext = context()): CaseIssueCode[] {
  const result = validateCase(input, validationContext);
  return result.isValid ? [] : result.issues.map((issue) => issue.code);
}

describe('the parts of a place', () => {
  it('accepts a case whose places are split into parts', () => {
    expect(issueCodes(buildPartedCase())).toEqual([]);
  });

  it('accepts a case without parts when they are not required, as before the parts', () => {
    expect(issueCodes(buildCheeseCase(), context({ rules: LEGACY_RULES }))).toEqual([]);
    const withoutTheOption = { hero: buildHero(), traits: [], locale: 'en', realNames: [] } as const;
    expect(issueCodes(buildCheeseCase(), withoutTheOption)).toEqual([]);
  });

  it('asks a generated case to split every place that holds a clue', () => {
    const result = validateCase(buildCheeseCase(), context());

    expect(result.isValid).toBe(false);
    const issues = result.isValid ? [] : result.issues;
    expect(issues.map(({ code }) => code)).toEqual([
      'parts-missing',
      'parts-missing',
      'parts-missing',
      'parts-missing',
    ]);
    expect(issues[0]).toMatchObject({ path: 'locations[0].parts' });
    expect(issues[0]?.message).toContain('market-square');
  });

  it('lets a place that holds nothing stay whole even when parts are required', () => {
    const detectiveCase = buildPartedCase();
    detectiveCase.locations.push({
      id: 'back-lane',
      name: 'Back lane',
      description: 'Bins and cats.',
      connections: ['market-square'],
      access: { kind: 'open' },
    });

    expect(issueCodes(detectiveCase)).toEqual([]);
  });

  it('lets a part hold nothing', () => {
    const detectiveCase = buildPartedCase();
    partsOf(detectiveCase, 'mayor-office').push(part('bin', null));

    expect(issueCodes(detectiveCase)).toEqual([]);
  });

  describe('the obstacle and its way round', () => {
    const lockedDesk = (fallback: Part | null): Part =>
      part('desk', 'oven-receipt', { obstacle: 'locked', fallback });

    it('rejects a clue behind an obstacle with no way round', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[0] = lockedDesk(null);

      const result = validateCase(detectiveCase, context());

      expect(result).toMatchObject({
        isValid: false,
        issues: [{ code: 'part-without-fallback', path: 'locations[3].parts[0].fallback' }],
      });
    });

    it('accepts a clue behind an obstacle when a person can be asked instead', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[0] = lockedDesk({ kind: 'ask', suspectId: 'baker' });

      expect(issueCodes(detectiveCase)).toEqual([]);
    });

    it('accepts a clue behind an obstacle when a lead gives it another way', () => {
      const detectiveCase = buildPartedCase();
      detectiveCase.leads = [lead('baker-gossip')];
      partsOf(detectiveCase, 'mayor-office')[0] = lockedDesk({ kind: 'lead', leadId: 'baker-gossip' });

      expect(issueCodes(detectiveCase)).toEqual([]);
    });

    it('accepts a person who is tied to no place', () => {
      const detectiveCase = buildPartedCase();
      delete detectiveCase.suspects[0]?.locationId;
      partsOf(detectiveCase, 'mayor-office')[0] = lockedDesk({ kind: 'ask', suspectId: 'baker' });

      expect(issueCodes(detectiveCase)).toEqual([]);
    });

    it('does not ask a way round for an obstacle with nothing behind it', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office').push(part('safe', null, { obstacle: 'locked' }));

      expect(issueCodes(detectiveCase)).toEqual([]);
    });

    it('rejects a way round through a person this hero cannot reach', () => {
      const detectiveCase = buildPartedCase();
      const gate = { kind: 'skill', check: { skill: 'tech', difficulty: 30 } };
      const cellar = detectiveCase.locations.find(({ id }) => id === 'storage-cellar');
      if (cellar !== undefined) cellar.access = gate;
      const baker = detectiveCase.suspects.find(({ id }) => id === 'baker');
      if (baker !== undefined) baker.locationId = 'storage-cellar';
      partsOf(detectiveCase, 'mayor-office')[0] = lockedDesk({ kind: 'ask', suspectId: 'baker' });

      expect(issueCodes(detectiveCase)).toContain('fallback-unreachable');
    });
  });

  describe('what the places hold', () => {
    it('rejects a part that holds a clue lying in another place', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[0] = part('desk', 'flour-crumbs');

      expect(issueCodes(detectiveCase)).toEqual(
        expect.arrayContaining(['part-in-wrong-place', 'clue-in-two-parts', 'clue-without-part']),
      );
    });

    it('rejects a clue held by two parts', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[1] = part('cabinet', 'oven-receipt');

      expect(issueCodes(detectiveCase)).toEqual(['clue-in-two-parts', 'clue-without-part']);
    });

    it('rejects a clue in a place with parts that no part holds', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office').pop();

      const result = validateCase(detectiveCase, context());

      const issues = result.isValid ? [] : result.issues;
      expect(issues.map(({ code }) => code)).toEqual(['clue-without-part']);
      expect(issues[0]?.message).toContain('debt-ledger');
    });

    it('rejects a part that nothing would ever show', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[0] = part('desk', 'oven-receipt', { inQuickLook: false });

      expect(issueCodes(detectiveCase)).toEqual(['part-never-shown']);
    });

    it('accepts a part that only a lead shows', () => {
      const detectiveCase = buildPartedCase();
      detectiveCase.leads = [lead('worn-spot')];
      partsOf(detectiveCase, 'mayor-office')[0] = part('desk', 'oven-receipt', {
        inQuickLook: false,
        requiresLead: 'worn-spot',
      });

      expect(issueCodes(detectiveCase)).toEqual([]);
    });
  });

  describe('references and text', () => {
    it('rejects a part id that another entity already uses', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[0] = part('baker', 'oven-receipt');

      expect(issueCodes(detectiveCase)).toEqual(['duplicate-id']);
    });

    it('rejects a part that holds a clue that does not exist', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office').push(part('bin', 'no-such-clue'));

      const result = validateCase(detectiveCase, context());

      expect(result).toMatchObject({
        isValid: false,
        issues: [{ code: 'unknown-reference', path: 'locations[3].parts[2].holds' }],
      });
    });

    it('rejects a way round through a person who does not exist', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[0] = part('desk', 'oven-receipt', {
        obstacle: 'locked',
        fallback: { kind: 'ask', suspectId: 'nobody' },
      });

      expect(issueCodes(detectiveCase)).toEqual(['unknown-reference']);
    });

    it('reads the names of the parts as narrative text', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[0] = part('desk', 'oven-receipt', { name: 'Рабочий стол' });

      expect(issueCodes(detectiveCase)).toContain('wrong-script');
    });

    it('rejects an obstacle of a kind nobody knows', () => {
      const detectiveCase = buildPartedCase();
      partsOf(detectiveCase, 'mayor-office')[0] = part('desk', 'oven-receipt', { obstacle: 'haunted' });

      expect(issueCodes(detectiveCase)).toEqual(['schema']);
    });
  });
});
