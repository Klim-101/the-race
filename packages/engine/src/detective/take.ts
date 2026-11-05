// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import type { Resolution } from './actions.js';
import { EntityIdSchema, type StockHow } from './case-schema.js';
import { GearIdSchema, type GearId } from './gear.js';
import { endTurn, spendTime, type DetectiveRunState } from './run-state.js';
import { takeStock } from './stock.js';

/**
 * Take what the place offers (see `viewRun`, `location.offers`): a tool for the suitcase, naming one to drop when the
 * suitcase is full (`dropId`), or a supply for the pockets.
 */
export const TakeIntentSchema = z.object({
  kind: z.literal('take'),
  stockId: EntityIdSchema,
  dropId: GearIdSchema.optional(),
});
export type TakeIntent = z.infer<typeof TakeIntentSchema>;

export interface TakeOutcome {
  readonly kind: 'take';
  readonly stockId: string;
  readonly how: StockHow;
  readonly itemKind: 'tool' | 'supply';
  readonly itemId: string;
  readonly minutes: number;
  /** The tool the hero put down to make room, when they did. */
  readonly dropped?: GearId;
}

/** Takes what a place offers: time passes, and the tool or the supply is the hero's. */
export function resolveTake(run: DetectiveRunState, intent: TakeIntent, rng: Rng): Resolution {
  const result = takeStock(run, intent.stockId, intent.dropId);
  if (!result.ok) return { ok: false, refusal: { code: result.code, message: result.message } };
  const { entry, minutes } = result;
  const dropped = entry.kind === 'tool' && intent.dropId !== undefined ? { dropped: intent.dropId } : {};
  return {
    ok: true,
    run: endTurn(spendTime(result.run, minutes), rng),
    outcome: {
      kind: 'take',
      stockId: entry.id,
      how: entry.how,
      itemKind: entry.kind,
      itemId: entry.itemId,
      minutes,
      ...dropped,
    },
    details: [],
  };
}
