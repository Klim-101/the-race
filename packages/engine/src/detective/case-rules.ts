// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { MIN_RANDOM_EVENTS } from './case-schema.js';
import { GENERATED_MAP, type MapRules } from './checks/map-shape.js';
import { GENERATED_DAYS, type DayRules } from './checks/run-length.js';

/**
 * The rules a case is judged by beyond the schema and the checks every case passes: which of the rules that came with
 * the generator are on, and how much they ask. It is data, in one place: a new rule is a field here and a line in
 * `GENERATED_RULES`, and nothing that judges a case has a flag of its own to forget.
 */
export interface CaseRules {
  /** Every place that holds a clue is split into parts, and a clue behind an obstacle has a way round it. */
  readonly parts: boolean;
  /** A clue that breaks a lie is about the one who told it. */
  readonly ties: boolean;
  /** Every lie says what the suspect admits once it is caught. */
  readonly admissions: boolean;
  /** Every evidence chain of two clues or more has a conclusion that takes some two of them. */
  readonly linkable: boolean;
  /** Every innocent suspect can be cleared, and every red herring is explained. */
  readonly clearing: boolean;
  /** Every suspect who lies has a true claim to say beside it. */
  readonly claims: boolean;
  /** Every public place has something in it: a part, a witness or a rumour. */
  readonly publicLife: boolean;
  /** A clue describes what is seen, never what it means. */
  readonly observations: boolean;
  /** Every part that holds nothing has a trace, a small true thing its search shows. */
  readonly traces: boolean;
  /** The fewest random events the pool must hold; 0 asks for none. */
  readonly minRandomEvents: number;
  /** The shape the map must have (enough places, streets between the buildings); `null` accepts any map. */
  readonly map: MapRules | null;
  /** How many days the case may give the hero; `null` accepts any length the schema allows. */
  readonly days: DayRules | null;
}

/**
 * The rules of the cases from before the generator's rules: a place may stay whole, a lie need not say what is
 * admitted, any map and any length will do, and no pool of events is asked for. The sample cases and every test that
 * looks at one rule alone start here.
 */
export const LEGACY_RULES: CaseRules = Object.freeze({
  parts: false,
  ties: false,
  admissions: false,
  linkable: false,
  clearing: false,
  claims: false,
  publicLife: false,
  observations: false,
  traces: false,
  minRandomEvents: 0,
  map: null,
  days: null,
});

/** The rules a case the generator writes is judged by: all of them. */
export const GENERATED_RULES: CaseRules = Object.freeze({
  parts: true,
  ties: true,
  admissions: true,
  linkable: true,
  clearing: true,
  claims: true,
  publicLife: true,
  observations: true,
  traces: true,
  minRandomEvents: MIN_RANDOM_EVENTS,
  map: Object.freeze({ ...GENERATED_MAP }),
  days: Object.freeze({ ...GENERATED_DAYS }),
});
