// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { type CrimeType } from '../detective/case-schema.js';
import { type Background } from '../detective/gear.js';
import { createRng } from '../dice.js';
import type { NewsSeed, SeedKind } from './seed.js';

/** The crimes a kind of tension can grow into. Every crime type is reachable from some kind. */
export const SEED_CRIMES: Readonly<Record<SeedKind, readonly CrimeType[]>> = {
  shortage: ['curious-theft', 'financial', 'corporate-espionage'],
  scandal: ['political-leak', 'financial', 'forgery'],
  outage: ['cyber', 'corporate-espionage'],
  leak: ['political-leak', 'cyber', 'corporate-espionage'],
  'market-shock': ['financial', 'forgery', 'cyber'],
  dispute: ['corporate-espionage', 'forgery', 'missing-person'],
  reform: ['political-leak', 'financial', 'forgery'],
  curiosity: ['curious-theft', 'missing-person', 'forgery'],
};

/** The crimes a hero's former trade makes a natural fit. A leaning, not a rule: any crime can still come up. */
export const BACKGROUND_CRIMES: Readonly<Record<Background, readonly CrimeType[]>> = {
  police: ['missing-person', 'curious-theft', 'forgery'],
  journalist: ['political-leak', 'corporate-espionage', 'missing-person'],
  locksmith: ['curious-theft', 'forgery', 'corporate-espionage'],
  analyst: ['financial', 'cyber', 'forgery'],
  'bus-driver': ['missing-person', 'curious-theft'],
  nurse: ['missing-person', 'forgery', 'curious-theft'],
  schoolteacher: ['forgery', 'missing-person', 'political-leak'],
  electrician: ['cyber', 'corporate-espionage', 'curious-theft'],
  sommelier: ['forgery', 'curious-theft', 'corporate-espionage'],
  accountant: ['financial', 'forgery', 'corporate-espionage'],
  courier: ['curious-theft', 'missing-person', 'corporate-espionage'],
  bailiff: ['financial', 'missing-person', 'curious-theft'],
  translator: ['political-leak', 'corporate-espionage', 'cyber'],
  librarian: ['forgery', 'political-leak', 'curious-theft'],
  pharmacist: ['forgery', 'missing-person', 'financial'],
  'radio-presenter': ['political-leak', 'missing-person', 'corporate-espionage'],
  'retired-inspector': ['missing-person', 'curious-theft', 'forgery'],
  'dismissed-auditor': ['financial', 'corporate-espionage', 'forgery'],
  'investigative-blogger': ['political-leak', 'cyber', 'corporate-espionage'],
  'street-private-eye': ['missing-person', 'curious-theft', 'corporate-espionage'],
};

export const FITTING_WEIGHT = 3;

export interface SeedChoice {
  readonly seed: NewsSeed;
  readonly crimeType: CrimeType;
}

/**
 * The seed and the crime a run is built from. Every (seed, crime) pair the seeds allow is a candidate, a
 * crime that suits the hero's background weighs `FITTING_WEIGHT` times as much, and the run's seed picks one
 * on dice of its own, so the choice is the same on every call and never moves the dice the run is played
 * with. The same seeds therefore give different cases to different heroes. `undefined` when there are none.
 */
export function chooseSeed(
  seeds: readonly NewsSeed[],
  hero: { readonly background: Background; readonly runSeed: string },
): SeedChoice | undefined {
  const fitting = new Set<CrimeType>(BACKGROUND_CRIMES[hero.background]);
  const candidates = seeds.flatMap((seed) =>
    SEED_CRIMES[seed.kind].map((crimeType) => ({
      seed,
      crimeType,
      weight: fitting.has(crimeType) ? FITTING_WEIGHT : 1,
    })),
  );
  const total = candidates.reduce((sum, { weight }) => sum + weight, 0);
  const point = total === 0 ? 0 : createRng(`${hero.runSeed}:seed`).roll(total);
  let passed = 0;
  let chosen: (typeof candidates)[number] | undefined;
  for (const candidate of candidates) {
    passed += candidate.weight;
    chosen ??= passed >= point ? candidate : undefined;
  }
  return chosen && { seed: chosen.seed, crimeType: chosen.crimeType };
}
