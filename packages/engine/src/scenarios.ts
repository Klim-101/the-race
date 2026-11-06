// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { DETECTIVE_SCENARIO } from './detective/scenario.js';
import type { Archetype } from './hero.js';
import type { ScenarioKind } from './scenario.js';

/**
 * The scenario of every archetype the engine can run; the compiler insists that each id of the schema has one, as it
 * does for the definitions in `ARCHETYPES`. The types of a case, a run and the words are each archetype's own.
 */
export const SCENARIOS = { detective: DETECTIVE_SCENARIO } as const satisfies Record<
  Archetype,
  ScenarioKind<unknown, unknown, unknown>
>;

/** The run an accepted case starts: the run of its archetype. Only the detective's exists until the run is general (#43). */
export type ArchetypeRun = ReturnType<(typeof SCENARIOS)[Archetype]['startRun']>;

/**
 * A scenario seen from outside, by what every archetype's has in common: the case, and the words it needs of the player's
 * language, are its own and nothing here knows them, and the run it starts is the archetype's run.
 */
export type AnyScenarioKind = ScenarioKind<unknown, ArchetypeRun, unknown>;

/** The scenario of an archetype. */
export const scenarioOf = (archetype: Archetype): AnyScenarioKind => SCENARIOS[archetype];
