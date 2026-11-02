// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { DETECTIVE_GEAR, type GearId, type KitItem } from './gear.js';
import type { DetectiveRunState } from './run-state.js';

// The suitcase holds the tools the hero carries, a slot each, up to the slots their runs have earned. The phone,
// the coffee and the pills are in the pockets and take no slot, and neither does what the hero's own trade gave.
// With no slot free, a new tool means dropping one.

export type TakeToolRefusal = 'already-carried' | 'no-slot' | 'not-in-suitcase';

export type TakeToolResult =
  | { readonly ok: true; readonly run: DetectiveRunState }
  | { readonly ok: false; readonly code: TakeToolRefusal };

/** The tools in the suitcase, each taking a slot. */
export const suitcaseOf = (run: Pick<DetectiveRunState, 'kit'>): KitItem[] =>
  run.kit.filter(({ suitcase }) => suitcase === true);

/** The slots the hero has free. */
export const freeSlots = (run: Pick<DetectiveRunState, 'kit' | 'toolSlots'>): number =>
  Math.max(0, run.toolSlots - suitcaseOf(run).length);

/**
 * Puts a tool in the suitcase, dropping `dropId` first when one is named. Refused when the hero already carries
 * it, when the dropped tool is not in the suitcase, and when there is no slot free and none was dropped.
 */
export function takeTool(run: DetectiveRunState, toolId: GearId, dropId?: GearId): TakeToolResult {
  if (run.kit.some(({ id }) => id === toolId)) return { ok: false, code: 'already-carried' };
  const kept =
    dropId === undefined
      ? run.kit
      : run.kit.filter(({ id, suitcase }) => !(id === dropId && suitcase === true));
  if (dropId !== undefined && kept.length === run.kit.length) return { ok: false, code: 'not-in-suitcase' };
  if (dropId === undefined && freeSlots(run) === 0) return { ok: false, code: 'no-slot' };
  const rules = DETECTIVE_GEAR[toolId].tool;
  const taken: KitItem = {
    id: toolId,
    state: 'owned',
    suitcase: true,
    ...(rules?.wear === 'used-up' ? { charges: rules.charges } : {}),
  };
  return { ok: true, run: { ...run, kit: [...kept, taken] } };
}
