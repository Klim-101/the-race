// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { DETECTIVE_GEAR, type GearId, type KitItem, type ToolRules } from './gear.js';
import type { DetectiveRunState } from './run-state.js';

// Two ways to turn what the hero has into a lead. Asking the locals is a contacts roll in a place: a rumour about a
// place, the one way to open a place with no clue in hand, which may be false as the case says. Studying a clue
// is a roll with a tool (a glass, a lamp, a reagent, a tape, at the least the phone's camera): handwriting, a
// stain, a size. Neither says whether there is anything to find, so a success that finds nothing reads like
// a failure that was only unlucky, and neither says what is true.

/** The first ruleset in which the hero can ask the locals and study a clue. */
export const ASK_RULESET_VERSION = 18;

export const ASK_MINUTES = 30;
/** Extra time lost when the locals say nothing, so that a failure is never "nothing happens". */
export const FAILED_ASK_MINUTES = 10;
export const ASK_DIFFICULTY = 10;
export const STUDY_MINUTES = 30;
/** Extra time lost when a study comes to nothing, for a tool whose own failure costs none. */
export const FAILED_STUDY_MINUTES = 10;

const WEAR_ORDER = ['lasting', 'may-break', 'used-up'] as const;

export type StudyChoice =
  | {
      readonly kind: 'tool';
      readonly item: KitItem;
      readonly rules: ToolRules & { readonly study: NonNullable<ToolRules['study']> };
    }
  | { readonly kind: 'refused'; readonly code: 'needs-tool' | 'wrong-tool' };

/**
 * The tool a clue is studied with: the one named, if the kit has it and it is any use for that, or the easiest to
 * study with, the one that wears least first. A tool that is lost, spent or broken is not there.
 */
export function chooseStudyTool(run: DetectiveRunState, toolId: GearId | undefined): StudyChoice {
  const usable = run.kit.flatMap((item) => {
    const rules = DETECTIVE_GEAR[item.id].tool;
    return item.state === 'owned' && rules?.study !== undefined
      ? [{ item, rules: { ...rules, study: rules.study } }]
      : [];
  });
  if (toolId !== undefined) {
    const named = usable.find(({ item }) => item.id === toolId);
    return named === undefined ? { kind: 'refused', code: 'wrong-tool' } : { kind: 'tool', ...named };
  }
  const best = [...usable].sort(
    (a, b) =>
      a.rules.study.difficulty - b.rules.study.difficulty ||
      WEAR_ORDER.indexOf(a.rules.wear) - WEAR_ORDER.indexOf(b.rules.wear),
  )[0];
  return best === undefined ? { kind: 'refused', code: 'needs-tool' } : { kind: 'tool', ...best };
}

/** What a piece of the kit adds to the contacts roll of asking the locals (cash does), if the hero names it. */
export function askBonusOf(
  run: DetectiveRunState,
  toolId: GearId,
): { item: KitItem; bonus: number } | undefined {
  const item = run.kit.find(({ id, state }) => id === toolId && state === 'owned');
  const bonus = item === undefined ? undefined : DETECTIVE_GEAR[item.id].tool?.askBonus;
  return item === undefined || bonus === undefined ? undefined : { item, bonus };
}
