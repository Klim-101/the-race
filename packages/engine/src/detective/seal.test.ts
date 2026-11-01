// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { assembleHero } from '../assemble-hero.js';
import { canonicalJson, sha256Hex } from '../canonical-json.js';
import { createRng } from '../dice.js';
import { DetectiveCaseSchema, type DetectiveCase } from './case-schema.js';
import {
  DetectiveRunStateSchema,
  createDetectiveRun,
  endTurn,
  findClue,
  moveTo,
  spendTime,
  type DetectiveRunState,
} from './run-state.js';
import { CASE_SEAL_PATTERN, assertCaseSealIntact, isCaseSealIntact, sealCase } from './seal.js';

function acceptedCase(): DetectiveCase {
  return DetectiveCaseSchema.parse(buildCheeseCase());
}

function newRun(): DetectiveRunState {
  const rng = createRng('seal');
  const result = assembleHero(buildHero(), rng);
  if (!result.isValid) throw new Error('The fixture hero is invalid.');
  return createDetectiveRun({
    hero: buildHero(),
    traits: result.assembled.traits,
    case: acceptedCase(),
    seed: 'seal',
    rngState: rng.state(),
    locale: 'en',
  });
}

/** The same data with the keys of every object written in reverse order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => reverseKeys(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)]),
    );
  }
  return value;
}

describe('sealCase', () => {
  it('is 64 hex digits and the same every time for the same case', () => {
    const seal = sealCase(acceptedCase());

    expect(seal).toMatch(CASE_SEAL_PATTERN);
    expect(sealCase(acceptedCase())).toBe(seal);
  });

  it('does not depend on the order the keys were stored in', () => {
    const detectiveCase = acceptedCase();

    expect(sealCase(reverseKeys(detectiveCase) as DetectiveCase)).toBe(sealCase(detectiveCase));
  });

  it('covers byte for byte what is read back from a file', () => {
    const detectiveCase = acceptedCase();
    const readBack = JSON.parse(JSON.stringify(detectiveCase)) as DetectiveCase;

    expect(canonicalJson(readBack)).toBe(canonicalJson(detectiveCase));
    expect(sealCase(readBack)).toBe(sealCase(detectiveCase));
  });

  it('changes when anything in the case changes, the truth and the solution first of all', () => {
    const seal = sealCase(acceptedCase());
    const changes: ((detectiveCase: DetectiveCase) => void)[] = [
      (c) => {
        c.truth.culpritId = 'rival';
      },
      (c) => {
        c.truth.motive = 'She did it for the glory.';
      },
      (c) => {
        c.truth.crimeAtMinute += 1;
      },
      (c) => {
        c.truth.timeline[0]!.atMinute += 1;
      },
      (c) => {
        c.solution.evidenceChains.reverse();
      },
      (c) => {
        c.solution.motiveDeductionId = 'other';
      },
      (c) => {
        c.clues[0]!.isRedHerring = true;
      },
      (c) => {
        c.suspects[0]!.lies.pop();
      },
      (c) => {
        c.title = `${c.title} `;
      },
    ];

    for (const change of changes) {
      const detectiveCase = acceptedCase();
      change(detectiveCase);
      expect(sealCase(detectiveCase)).not.toBe(seal);
    }
  });
});

describe('a sealed run', () => {
  it('is created with the seal of its case', () => {
    const run = newRun();

    expect(run.caseSeal).toBe(sealCase(run.case));
    expect(isCaseSealIntact(run)).toBe(true);
    expect(() => {
      assertCaseSealIntact(run);
    }).not.toThrow();
  });

  it('loads from JSON whatever order the keys were stored in', () => {
    const run = newRun();

    expect(DetectiveRunStateSchema.parse(reverseKeys(JSON.parse(JSON.stringify(run))))).toEqual(run);
  });

  it('refuses to load a save whose truth was changed after acceptance', () => {
    const saved = JSON.parse(JSON.stringify(newRun())) as DetectiveRunState;
    saved.case.truth.culpritId = 'rival';

    const result = DetectiveRunStateSchema.safeParse(saved);

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues.map((issue) => issue.path.join('.'))).toContain('caseSeal');
  });

  it('refuses a save whose seal was swapped for another, or is not a digest', () => {
    const run = newRun();
    const other = { ...acceptedCase(), title: 'Another case' };

    expect(DetectiveRunStateSchema.safeParse({ ...run, caseSeal: sealCase(other) }).success).toBe(false);
    expect(DetectiveRunStateSchema.safeParse({ ...run, caseSeal: 'not-a-digest' }).success).toBe(false);
  });

  it('detects a change made in memory and refuses a verdict on it', () => {
    const run = newRun();
    const tampered = { ...run, case: { ...run.case, truth: { ...run.case.truth, culpritId: 'rival' } } };

    expect(isCaseSealIntact(tampered)).toBe(false);
    expect(() => {
      assertCaseSealIntact(tampered);
    }).toThrow(Error);
  });

  it('keeps the seal through every transition', () => {
    const run = newRun();

    const later = endTurn(spendTime(findClue(moveTo(run, 'cheese-stall'), 'flour-crumbs'), 30), createRng(1));

    expect(later).not.toEqual(run);
    expect(isCaseSealIntact(later)).toBe(true);
  });
});

describe('a save made before places said where they are', () => {
  /** A run as an older version saved it: its case had no `exposure`, and was sealed without it. */
  function oldSave(): Record<string, unknown> {
    const run = JSON.parse(JSON.stringify(newRun())) as {
      case: { locations: Record<string, unknown>[] };
      caseSeal: string;
    };
    for (const location of run.case.locations) delete location.exposure;
    run.caseSeal = sha256Hex(canonicalJson(run.case));
    return run as unknown as Record<string, unknown>;
  }

  it('still loads: the default a later version fills in does not make the case look edited', () => {
    const parsed = DetectiveRunStateSchema.safeParse(oldSave());

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.case.locations.every(({ exposure }) => exposure === 'outdoor')).toBe(
      true,
    );
  });

  it('is judged intact at the verdict, and a case edited after the seal is still caught', () => {
    const parsed = DetectiveRunStateSchema.parse(oldSave());
    expect(isCaseSealIntact(parsed)).toBe(true);
    expect(() => assertCaseSealIntact(parsed)).not.toThrow();

    const edited = { ...parsed, case: { ...parsed.case, title: 'Another case' } };
    expect(isCaseSealIntact(edited)).toBe(false);
    const moved = {
      ...parsed,
      case: {
        ...parsed.case,
        locations: parsed.case.locations.map((location, index) =>
          index === 0 ? { ...location, exposure: 'indoor' as const } : location,
        ),
      },
    };
    expect(isCaseSealIntact(moved)).toBe(false);
  });

  it('seals a new case with its places as they say, so one marked indoor is held to it', () => {
    const run = newRun();
    const indoor = {
      ...run,
      case: {
        ...run.case,
        locations: run.case.locations.map((location) => ({ ...location, exposure: 'indoor' as const })),
      },
    };

    expect(isCaseSealIntact(run)).toBe(true);
    expect(isCaseSealIntact(indoor)).toBe(false);
    expect(isCaseSealIntact({ case: indoor.case, caseSeal: sealCase(indoor.case) })).toBe(true);
  });
});
