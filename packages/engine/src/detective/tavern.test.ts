// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { assembleHero } from '../assemble-hero.js';
import { createRng } from '../dice.js';
import { DETECTIVE } from './archetype.js';
import { BACKGROUNDS } from './gear.js';
import { LIFE_STATES } from './life-state.js';
import { DETECTIVE_SKILL_PRESETS } from './skill-presets.js';
import {
  CANDIDATE_IDS,
  MAX_REROLLS,
  OFFER_SIZE,
  candidateHeroInput,
  offerHeroes,
  offeredHero,
} from './tavern.js';

const SEEDS = Array.from({ length: 200 }, (_, index) => `tavern-seed-${String(index)}`);
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

describe('offerHeroes', () => {
  it('puts forward three heroes with the ids a, b and c', () => {
    expect(OFFER_SIZE).toBe(3);
    expect(MAX_REROLLS).toBe(1);
    for (const seed of SEEDS) {
      expect(offerHeroes(seed, 0, 'en').map(({ id }) => id)).toEqual([...CANDIDATE_IDS]);
    }
  });

  it('is reproducible from the seed, the round and the language', () => {
    for (const seed of SEEDS) {
      expect(offerHeroes(seed, 0, 'ru')).toEqual(offerHeroes(seed, 0, 'ru'));
      expect(offerHeroes(seed, 1, 'en')).toEqual(offerHeroes(seed, 1, 'en'));
    }
  });

  it('offers kinds of detective, not three of one: distinct backgrounds and surnames', () => {
    for (const seed of SEEDS) {
      for (const round of [0, 1]) {
        const heroes = offerHeroes(seed, round, 'en');
        expect(new Set(heroes.map(({ background }) => background)).size).toBe(OFFER_SIZE);
        expect(new Set(heroes.map(({ name }) => name.split(' ')[1])).size).toBe(OFFER_SIZE);
      }
    }
  });

  it('gives every candidate a hero the engine accepts, built from one of its ready-made builds', () => {
    for (const seed of SEEDS) {
      for (const candidate of offerHeroes(seed, 0, 'en')) {
        const preset = DETECTIVE_SKILL_PRESETS.find(({ id }) => id === candidate.build);
        expect(preset?.skills).toEqual(candidate.skills);
        expect(sum(Object.values(candidate.skills))).toBe(DETECTIVE.skillPoints);
        const result = assembleHero(candidateHeroInput(candidate), createRng(seed));
        expect(result.isValid).toBe(true);
      }
    }
  });

  it('spells one hero in both languages: the same person, a name in each alphabet', () => {
    for (const seed of SEEDS) {
      const en = offerHeroes(seed, 0, 'en');
      const ru = offerHeroes(seed, 0, 'ru');
      for (const [at, candidate] of en.entries()) {
        const other = ru[at]!;
        expect({ ...other, name: '' }).toEqual({ ...candidate, name: '' });
        expect(candidate.name).toMatch(/^[A-Za-z]+ [A-Za-z]+$/);
        expect(other.name).toMatch(/^[А-Яа-яЁё]+ [А-Яа-яЁё]+$/);
      }
    }
  });

  it('changes with the round, so asking again shows other heroes', () => {
    const different = SEEDS.filter(
      (seed) => JSON.stringify(offerHeroes(seed, 0, 'en')) !== JSON.stringify(offerHeroes(seed, 1, 'en')),
    );
    expect(different.length).toBe(SEEDS.length);
  });

  it('varies over seeds: every background and build, every life state, every gender, and heroes with and without a signal', () => {
    const all = SEEDS.flatMap((seed) => offerHeroes(seed, 0, 'en'));
    expect(new Set(all.map(({ background }) => background)).size).toBe(BACKGROUNDS.length);
    expect(new Set(all.map(({ build }) => build)).size).toBe(DETECTIVE_SKILL_PRESETS.length);
    expect(new Set(all.flatMap(({ lifeState }) => (lifeState === undefined ? [] : [lifeState]))).size).toBe(
      LIFE_STATES.length,
    );
    expect(all.some(({ lifeState }) => lifeState === undefined)).toBe(true);
    expect(new Set(all.map(({ gender }) => gender))).toEqual(new Set(['female', 'male', 'nonbinary']));
    expect(all.some(({ signalId }) => signalId === undefined)).toBe(true);
    expect(new Set(all.flatMap(({ signalId }) => (signalId === undefined ? [] : [signalId]))).size).toBe(
      DETECTIVE.signals.length,
    );
  });

  it('never carries a hidden trait: a candidate is only what the player may see', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const candidate of offerHeroes(seed, 0, 'en')) {
        expect(Object.keys(candidate).toSorted()).toEqual(
          [
            'background',
            'build',
            'gender',
            'id',
            'name',
            'skills',
            ...(candidate.signalId === undefined ? [] : ['signalId']),
            ...(candidate.lifeState === undefined ? [] : ['lifeState']),
          ].toSorted(),
        );
      }
    }
  });
});

describe('candidateHeroInput', () => {
  const everyone = SEEDS.flatMap((seed) => offerHeroes(seed, 0, 'en'));
  const candidate = everyone.find(({ signalId }) => signalId !== undefined);
  const plain = everyone.find(({ signalId }) => signalId === undefined);

  it('carries what assembleHero takes and keeps the name of the card unless the player gives another', () => {
    for (const found of [candidate, plain]) {
      const hero = found!;
      const input = candidateHeroInput(hero);
      expect(input).toMatchObject({ name: hero.name, archetype: 'detective', background: hero.background });
      expect('id' in input).toBe(false);
      expect('build' in input).toBe(false);
      expect('signalId' in input).toBe(hero.signalId !== undefined);
      expect(candidateHeroInput(hero, 'Own Name').name).toBe('Own Name');
    }
  });
});

describe('offeredHero', () => {
  it('is the hero of the offer with that id', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const offer = offerHeroes(seed, 1, 'ru');
      for (const [at, id] of CANDIDATE_IDS.entries()) {
        expect(offeredHero(seed, 1, 'ru', id)).toEqual(offer[at]);
      }
    }
  });
});
