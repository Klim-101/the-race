// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { scenarioOf, type AnyScenarioKind, type Archetype, type Hero, type Locale } from '@the-race/engine';
import type { ServerContext } from './context.js';
import { describeSighting } from './sighting-text.js';

/**
 * The scenario of an archetype as the server has it: the engine's scenario and the words it needs of the player's
 * language, which live in the locale files here and not in the engine (the detective's are the sentence of a sighting).
 * This file and `sighting-text.ts` are where the server names an archetype; the tools that make a case take the scenario
 * of the hero's archetype from here and know none (ADR 0009).
 */
export interface ServerScenario {
  readonly kind: AnyScenarioKind;
  readonly words: (locale: Locale) => unknown;
}

/** One scenario for every archetype: the registry of the engine is as complete as the archetypes are. */
export type ScenarioSet = Readonly<Record<Archetype, ServerScenario>>;

export const DEFAULT_SCENARIOS: ScenarioSet = {
  detective: { kind: scenarioOf('detective'), words: describeSighting },
};

/** The scenario of the hero's archetype: the context's own when it has one (a test gives one), else the engine's. */
export const scenarioFor = (context: ServerContext, hero: Hero): ServerScenario =>
  (context.scenarios ?? DEFAULT_SCENARIOS)[hero.archetype];
