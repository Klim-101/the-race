// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { assembleHero } from '../assemble-hero.js';
import { createRng } from '../dice.js';
import { DETECTIVE } from './archetype.js';
import { BACKGROUNDS } from './gear.js';
import { DETECTIVE_SKILL_PRESETS } from './skill-presets.js';

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

describe('the detective skill presets', () => {
  it('have distinct ids and name every skill of the archetype, and no other', () => {
    const ids = DETECTIVE_SKILL_PRESETS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { skills } of DETECTIVE_SKILL_PRESETS) {
      expect(Object.keys(skills).toSorted()).toEqual([...DETECTIVE.skills].toSorted());
    }
  });

  it('spend exactly the points of the archetype and keep every skill within its maximum', () => {
    for (const { skills } of DETECTIVE_SKILL_PRESETS) {
      expect(sum(Object.values(skills))).toBe(DETECTIVE.skillPoints);
      for (const level of Object.values(skills)) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(DETECTIVE.maxSkillLevel);
      }
    }
  });

  it('make a valid hero with any background and any character signal, or none', () => {
    const signals = [undefined, ...DETECTIVE.signals.map(({ id }) => id)];
    for (const { skills } of DETECTIVE_SKILL_PRESETS) {
      for (const background of BACKGROUNDS) {
        for (const signalId of signals) {
          const result = assembleHero(
            {
              name: 'Test Hero',
              gender: 'female',
              archetype: 'detective',
              skills,
              background,
              ...(signalId === undefined ? {} : { signalId }),
            },
            createRng('presets'),
          );
          expect(result.isValid).toBe(true);
        }
      }
    }
  });

  it('are different builds: no two spend the points alike', () => {
    const shapes = DETECTIVE_SKILL_PRESETS.map(({ skills }) => JSON.stringify(skills));
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
