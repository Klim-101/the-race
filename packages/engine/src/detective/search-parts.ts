// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { ObstacleKind, PlacePart } from './case-schema.js';
import { DETECTIVE_GEAR, type GearId, type KitItem, type ToolRules } from './gear.js';
import type { DetectiveRunState } from './run-state.js';

/** The first ruleset in which a place made of parts is searched part by part. */
export const SEARCH_BY_PART_RULESET_VERSION = 12;

/** The parts the hero can work with in a place: none for a run of an older ruleset and for a place left whole. */
export function partsOfPlace(run: DetectiveRunState, locationId: string): readonly PlacePart[] {
  if (run.rulesetVersion < SEARCH_BY_PART_RULESET_VERSION) return [];
  return run.case.locations.find(({ id }) => id === locationId)?.parts ?? [];
}

/** The first ruleset in which an obstacle is got past with a tool from the kit, and not by the phone alone. */
export const TOOLS_RULESET_VERSION = 14;

/** From this ruleset the outcome of searching a part carries `attempt`; an older run's log has none and still replays. */
export const SEARCH_ATTEMPT_RULESET_VERSION = 29;

export type ToolChoice =
  | { readonly kind: 'none' }
  | { readonly kind: 'tool'; readonly item: KitItem; readonly rules: ToolRules }
  | { readonly kind: 'refused'; readonly code: 'needs-tool' | 'wrong-tool' };

/** Lasting tools first, then the ones that may break, then the ones that are used up. */
const WEAR_ORDER = ['lasting', 'may-break', 'used-up'] as const;

/**
 * What the hero gets past an obstacle with. An open part wants nothing. From the ruleset of tools it wants a tool
 * of the kit that removes the kind, the one named or, when none is named, the one that wears least; before
 * that the phone's torch cleared the dark and nothing else did. A tool that is lost, spent or broken is not there.
 */
export function chooseTool(
  run: DetectiveRunState,
  obstacle: ObstacleKind | null,
  toolId: GearId | undefined,
): ToolChoice {
  if (obstacle === null) return { kind: 'none' };
  if (run.rulesetVersion < TOOLS_RULESET_VERSION) {
    return obstacle === 'dark' ? { kind: 'none' } : { kind: 'refused', code: 'needs-tool' };
  }
  const usable = run.kit.flatMap((item) => {
    const rules = DETECTIVE_GEAR[item.id].tool;
    return item.state === 'owned' && rules?.removes.includes(obstacle) === true ? [{ item, rules }] : [];
  });
  if (toolId !== undefined) {
    const named = usable.find(({ item }) => item.id === toolId);
    return named === undefined ? { kind: 'refused', code: 'wrong-tool' } : { kind: 'tool', ...named };
  }
  const best = [...usable].sort(
    (a, b) => WEAR_ORDER.indexOf(a.rules.wear) - WEAR_ORDER.indexOf(b.rules.wear),
  )[0];
  return best === undefined ? { kind: 'refused', code: 'needs-tool' } : { kind: 'tool', ...best };
}
