// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Hero } from './hero.js';
import type { Issue } from './issues.js';
import type { ScenarioReading } from './frame.js';
import type { Locale } from './locale.js';
import type { NewsSeed, SeedKind } from './news/seed.js';
import type { ProfileRecord } from './profile.js';
import type { Trait } from './traits.js';
import type { Setting } from './world/setting.js';

// What an archetype's scenario is, written down once so that the tools that make a case know no archetype (ADR 0009).
// The detective's is `DETECTIVE_SCENARIO`; the registry of them is `SCENARIOS`.

/** What a case grew from: the kind of a seed of the news and its sentence. It is shown to the player later. */
export interface ScenarioInspiration {
  readonly kind: SeedKind;
  readonly premise: string;
}

/** The theme chosen for a run: the seed of the news it is built on and the kind of case it becomes. */
export interface ThemeChoice {
  readonly seed: NewsSeed;
  readonly theme: string;
}

/** What judging a case is given. The traits are the validator's alone: no message may name one. */
export interface ScenarioContext {
  readonly hero: Hero;
  readonly traits: readonly Trait[];
  readonly locale: Locale;
  /** Names taken from the source headlines; none of them may survive into the mirror world. */
  readonly realNames: readonly string[];
  /** Whether the case is a frame: its texts are blank, so only what does not depend on what they say is judged. */
  readonly frame: boolean;
  /** The form of case the brief named, by name; a case of another form is rejected. Left out, any form will do. */
  readonly form?: string;
}

export type ScenarioResult<Case> =
  | { readonly isValid: true; readonly scenario: Case }
  | { readonly isValid: false; readonly issues: readonly Issue[] };

/** What starting a run from an accepted case is given. */
export interface StartRunInput<Case> {
  readonly hero: Hero;
  readonly traits: readonly Trait[];
  /** A case that `check` has accepted for this hero. */
  readonly scenario: Case;
  readonly seed: string;
  /** The id of the run's folder. */
  readonly runId: string;
  /** The state of the dice after the hero was made, so that the run continues the same sequence. */
  readonly rngState: number;
  readonly locale: Locale;
  /** The country the case is set in; none when the world has no country with a climate yet. */
  readonly setting: Setting | null;
  /** The seed the case was built on; none when the news gave no seed. */
  readonly inspiration: ScenarioInspiration | null;
  /** The player's runs that are over: what they have earned this hero (the detective's tool slots) is read from them. */
  readonly records: readonly ProfileRecord[];
}

/**
 * The scenario of one archetype: the case its generator writes, how that case is read, judged and started. `Case` is the
 * type of the case, `Run` the run it starts and `Words` what the engine needs in the player's language to add to a case
 * (the detective's sightings), which comes from the locale files and not from the engine.
 */
export interface ScenarioKind<Case, Run, Words> {
  /** The themes a case of this archetype may have: what the brief names and a run without a seed falls back on. */
  readonly themes: readonly string[];
  /**
   * The codes of its issues, the most fundamental first: the order a generator is shown them in. It holds every
   * `SHARED_ISSUE_CODES` and its own, placed among them.
   */
  readonly issueOrder: readonly string[];
  /** The theme of a run, from the seeds of the news and the hero; none when there are no seeds. */
  chooseTheme(seeds: readonly NewsSeed[], hero: Hero, runSeed: string): ThemeChoice | undefined;
  /** Reads a submitted document as a whole case or a frame of the schema, or says what is wrong with it. */
  read(document: unknown): ScenarioReading<Case>;
  /** Adds what the engine makes of a case, then judges it for this hero by the rules of a generated case. */
  check(scenario: Case, context: ScenarioContext, words: Words): ScenarioResult<Case>;
  /** Starts a run from an accepted case. */
  startRun(input: StartRunInput<Case>): Run;
}
