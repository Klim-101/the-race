// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { chooseSeed } from '../news/choose-seed.js';
import { toolSlotsOf } from '../progress.js';
import type { ScenarioKind } from '../scenario.js';
import { ISSUE_ORDER } from './case-issue.js';
import { GENERATED_RULES } from './case-rules.js';
import { CRIME_TYPES, CaseFormSchema, type DetectiveCase } from './case-schema.js';
import { validateCase } from './case-validator.js';
import { readCaseOrFrame } from './frame.js';
import { createDetectiveRun, type DetectiveRunState } from './run-state.js';
import { deriveSightingClues, type SightingDescription } from './witnesses.js';

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
  chooseTheme(seeds, hero, runSeed) {
    // The engine picks the seed and the crime, so the same news gives other heroes other cases.
    const choice = chooseSeed(seeds, { background: hero.background, runSeed });
    return choice && { seed: choice.seed, theme: choice.crimeType };
  },
  read: readCaseOrFrame,
  check(scenario, context, describe) {
    const form = CaseFormSchema.safeParse(context.form);
    const result = validateCase(deriveSightingClues(scenario, describe), {
      hero: context.hero,
      traits: context.traits,
      locale: context.locale,
      realNames: context.realNames,
      rules: GENERATED_RULES,
      frame: context.frame,
      ...(form.success ? { form: form.data } : {}),
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
