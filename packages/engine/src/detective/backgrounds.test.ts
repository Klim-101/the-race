// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildCheeseCase, buildHero } from '../../test/fixtures/cheese-case.js';
import { BACKGROUND_CRIMES } from '../news/choose-seed.js';
import { CRIME_TYPES, DetectiveCaseSchema } from './case-schema.js';
import { BACKGROUND_SUPPLIES, CONSUMABLE_IDS, initialSupplies } from './consumables.js';
import { BACKGROUNDS, BACKGROUND_KITS, GEAR_IDS, initialKit } from './gear.js';
import { LIFE_STATES, LIFE_STATE_SHIFTS } from './life-state.js';
import { createDetectiveRun } from './run-state.js';
import { BACKGROUND_BUILDS, DETECTIVE_SKILL_PRESETS } from './skill-presets.js';

describe('the backgrounds', () => {
  it('number at least sixteen beyond the first four, and include those the tavern promised', () => {
    expect(BACKGROUNDS.length).toBeGreaterThanOrEqual(20);
    for (const id of ['dismissed-auditor', 'street-private-eye', 'investigative-blogger']) {
      expect(BACKGROUNDS).toContain(id);
    }
  });

  it('are kebab-case ids, each with a kit, supplies, two suiting builds and the crimes it meets', () => {
    for (const background of BACKGROUNDS) {
      expect(background).toMatch(/^[a-z]+(-[a-z]+)*$/);
      for (const id of BACKGROUND_KITS[background]) expect(GEAR_IDS).toContain(id);
      for (const id of Object.keys(BACKGROUND_SUPPLIES[background])) expect(CONSUMABLE_IDS).toContain(id);
      const [first, second] = BACKGROUND_BUILDS[background];
      expect(first).not.toBe(second);
      for (const id of [first, second])
        expect(DETECTIVE_SKILL_PRESETS.map((preset) => preset.id)).toContain(id);
      expect(BACKGROUND_CRIMES[background].length).toBeGreaterThanOrEqual(2);
    }
  });

  it('lean on every kind of crime between them, so each case type has someone it suits', () => {
    const leaned = new Set(BACKGROUNDS.flatMap((background) => BACKGROUND_CRIMES[background]));
    expect([...leaned].sort()).toEqual([...CRIME_TYPES].sort());
  });

  it('use every ready-made build somewhere', () => {
    const used = new Set(BACKGROUNDS.flatMap((background) => BACKGROUND_BUILDS[background]));
    expect([...used].sort()).toEqual(DETECTIVE_SKILL_PRESETS.map(({ id }) => id).sort());
  });
});

describe('the life states', () => {
  it('shift the start by something and never take anything away', () => {
    for (const state of LIFE_STATES) {
      const shift = LIFE_STATE_SHIFTS[state];
      expect(shift.gear !== undefined || shift.supply !== undefined).toBe(true);
    }
  });

  it('add a piece of gear the hero lacked, and leave a kit that already has it as it is', () => {
    expect(initialKit('bus-driver', 'retired').map(({ id }) => id)).toEqual(['phone', 'notebook']);
    expect(initialKit('police', 'retired').map(({ id }) => id)).toEqual(['phone', 'notebook']);
    expect(initialKit('police').map(({ id }) => id)).toEqual(['phone', 'notebook']);
    expect(initialKit('schoolteacher', 'on-leave').map(({ id }) => id)).toEqual(['notebook', 'phone']);
  });

  it('add a supply to what the background gives, and nothing without a state', () => {
    expect(initialSupplies('sommelier')).toEqual({ alcohol: 1 });
    expect(initialSupplies('sommelier', 'just-dismissed')).toEqual({ alcohol: 2 });
    expect(initialSupplies('bus-driver', 'on-probation')).toEqual({ coffee: 2, sedative: 1 });
    expect(initialSupplies('police', 'retired')).toEqual({ coffee: 1 });
  });

  it('start a run with the kit and supplies of the hero, and an old hero with no state is unchanged', () => {
    const input = (lifeState?: (typeof LIFE_STATES)[number]) => ({
      hero: {
        ...buildHero(),
        background: 'sommelier' as const,
        ...(lifeState === undefined ? {} : { lifeState }),
      },
      traits: [],
      case: DetectiveCaseSchema.parse(buildCheeseCase()),
      seed: 'states',
      rngState: 1,
      locale: 'en' as const,
    });

    expect(createDetectiveRun(input()).supplies).toEqual({ alcohol: 1 });
    expect(createDetectiveRun(input('just-dismissed')).supplies).toEqual({ alcohol: 2 });
    expect(createDetectiveRun(input('retired')).kit.map(({ id }) => id)).toEqual(['phone', 'notebook']);
  });
});
