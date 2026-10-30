// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildHero } from '../test/fixtures/cheese-case.js';
import { assembleHero, viewHero, type AssembledHero } from './assemble-hero.js';
import { DETECTIVE_TRAITS } from './detective/traits.js';
import { createRng } from './dice.js';

function assemble(seed: string | number, input: unknown = buildHero()): AssembledHero {
  const result = assembleHero(input, createRng(seed));
  if (!result.isValid) throw new Error(JSON.stringify(result.issues));
  return result.assembled;
}

describe('assembleHero', () => {
  it('keeps what the player chose and deals one positive and one negative trait', () => {
    const { hero, traits } = assemble('hero');

    expect(hero).toEqual(buildHero());
    expect(traits.map(({ polarity }) => polarity)).toEqual(['positive', 'negative']);
  });

  it('gives the same hero for the same seed and different heroes across seeds', () => {
    expect(assemble('same')).toEqual(assemble('same'));

    const dealt = new Set<string>();
    for (let seed = 0; seed < 50; seed += 1) {
      dealt.add(
        assemble(seed)
          .traits.map(({ id }) => id)
          .join(),
      );
    }
    expect(dealt.size).toBeGreaterThan(10);
  });

  it('draws the traits from the catalogue of the hero’s archetype', () => {
    const ids = new Set(DETECTIVE_TRAITS.map(({ id }) => id));
    for (const { id } of assemble(1).traits) expect(ids).toContain(id);
  });

  it('takes the trait rule as a parameter', () => {
    const result = assembleHero(buildHero(), createRng(5), { positive: 1, negative: 1, any: 1 });

    expect(result.isValid && result.assembled.traits).toHaveLength(3);
  });

  it('ignores traits the player tries to bring along', () => {
    const cheating = { ...buildHero(), traits: [DETECTIVE_TRAITS[1]] };

    const { hero, traits } = assemble('cheat', cheating);

    expect(hero).not.toHaveProperty('traits');
    expect(traits).toEqual(assemble('cheat').traits);
  });

  it('reports every problem with its path, and spends no dice on invalid input', () => {
    const rng = createRng('untouched');
    const before = rng.state();
    const input = { ...buildHero(), name: ' ', skills: { ...buildHero().skills, tech: 5 } };

    const result = assembleHero(input, rng);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues.map(({ path }) => path)).toEqual(expect.arrayContaining(['name', 'skills']));
    }
    expect(rng.state()).toBe(before);
  });

  it('rejects an archetype that does not exist', () => {
    expect(assembleHero({ ...buildHero(), archetype: 'wizard' }, createRng(1)).isValid).toBe(false);
  });
});

describe('assembleHero with a signal', () => {
  it('keeps the signal the player picked, and takes it from the archetype’s list only', () => {
    expect(assemble('s', { ...buildHero(), signalId: 'burnt-out' }).hero).toEqual({
      ...buildHero(),
      signalId: 'burnt-out',
    });

    const result = assembleHero({ ...buildHero(), signalId: 'smitten' }, createRng('s'));
    expect(result.isValid).toBe(false);
    if (!result.isValid) expect(result.issues.map(({ path }) => path)).toEqual(['signalId']);
  });

  it('rolls the same traits with a signal or without one, so a signal costs no dice', () => {
    expect(assemble('t', { ...buildHero(), signalId: 'in-love' }).traits).toEqual(assemble('t').traits);
  });

  it('shows the signal in the hero view, which is public', () => {
    expect(viewHero(assemble('v', { ...buildHero(), signalId: 'in-love' })).hero).toMatchObject({
      signalId: 'in-love',
    });
  });
});

describe('viewHero', () => {
  it('shows the hero and how many traits are hidden, and nothing about them', () => {
    const traitIds = DETECTIVE_TRAITS.map(({ id }) => id);

    for (let seed = 0; seed < 100; seed += 1) {
      const view = viewHero(assemble(seed));
      const text = JSON.stringify(view);

      expect(view.hero).toEqual(buildHero());
      expect(view.hiddenTraitCount).toBe(2);
      expect(text).not.toContain('trait"');
      for (const id of traitIds) expect(text).not.toContain(id);
    }
  });
});
