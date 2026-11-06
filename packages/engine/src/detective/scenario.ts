// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { chooseSeed } from '../news/choose-seed.js';
import { toolSlotsOf } from '../progress.js';
import type { ScenarioKind } from '../scenario.js';
import { ISSUE_ORDER } from './case-issue.js';
import { GENERATED_RULES } from './case-rules.js';
import { CRIME_TYPES, type DetectiveCase } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { readCaseOrFrame } from './frame.js';
import { createDetectiveRun, type DetectiveRunState } from './run-state.js';
import { deriveSightingClues, type SightingDescription } from './witnesses.js';

/**
 * What the brief tells the generator of the rules of a case, in the words the generator reads. The full rules are in
 * its instructions; this is what the engine checks, so that a generator knows what a rejection is about.
 */
const BRIEF_RULES =
  'Write one complete case that fits the case schema, in two stages: first a frame, which is the case with every ' +
  'narrative text left as an empty string, then the texts, in one patch. The engine judges the frame on its ' +
  'structure alone and answers with the places of the texts still to write. Rules the engine checks: every location is reachable; ' +
  'every clue is obtainable and lies in a part of its place, and a clue behind an obstacle has a way round it that needs no tool; every lead opens something and can be earned; every clue that breaks a lie is about the one who told it; every suspect can be found; at least two independent evidence chains that ' +
  'point at the culprit and hold no red herring; every lie can be broken by an existing clue; the motive ' +
  'deduction exists; the timeline is consistent; events fall within the clock; no real names; the text is ' +
  'in the brief locale only. The full rules are in your instructions.';

/**
 * The detective's scenario: a case of a crime with a hidden culprit. The words it needs of the player's language are the
 * sentence that tells a sighting.
 */
export const DETECTIVE_SCENARIO: ScenarioKind<
  DetectiveCase,
  DetectiveRunState,
  (description: SightingDescription) => string
> = {
  themes: CRIME_TYPES,
  issueOrder: ISSUE_ORDER,
  briefRules: () => BRIEF_RULES,
  chooseTheme(seeds, hero, runSeed) {
    // The engine picks the seed and the crime, so the same news gives other heroes other cases.
    const choice = chooseSeed(seeds, { background: hero.background, runSeed });
    return choice && { seed: choice.seed, theme: choice.crimeType };
  },
  read: readCaseOrFrame,
  check(scenario, context, describe) {
    const result = validateCase(deriveSightingClues(scenario, describe), {
      hero: context.hero,
      traits: context.traits,
      locale: context.locale,
      realNames: context.realNames,
      rules: GENERATED_RULES,
      frame: context.frame,
    });
    return result.isValid ? { isValid: true, scenario: result.detectiveCase } : result;
  },
  startRun: (input) =>
    createDetectiveRun({
      hero: input.hero,
      traits: input.traits,
      case: input.scenario,
      seed: input.seed,
      runId: input.runId,
      rngState: input.rngState,
      locale: input.locale,
      setting: input.setting,
      inspiration: input.inspiration,
      // The tool slots the player's runs have earned this hero.
      toolSlots: toolSlotsOf(input.records),
    }),
};
