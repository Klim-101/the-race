// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Rng } from '../dice.js';
import { assertNever } from '../assert-never.js';
import type { Resolution } from './actions.js';
import { EntityIdSchema } from './case-schema.js';
import { absoluteMinute, withCondition } from './condition.js';
import {
  CONSUMABLES,
  ConsumableIdSchema,
  withMeterDelta,
  withSupplyUsed,
  type ConsumableEffect,
  type ConsumableId,
  type PendingEffect,
} from './consumables.js';
import { endTurn, spendTime, type DetectiveRunState } from './run-state.js';

/** Take something the hero carries: a consumable. It costs a little time and its price is written down. */
export const UseIntentSchema = z.object({ kind: z.literal('use'), itemId: EntityIdSchema });
export type UseIntent = z.infer<typeof UseIntentSchema>;

/** Time spent to use one item, in minutes. */
export const USE_MINUTES = 5;

/** The effects of one consumable that were put to work, for the log and the narrator: no secret in them. */
export interface UseOutcome {
  readonly kind: 'use';
  readonly itemId: ConsumableId;
  readonly minutes: number;
  /** How many of the item the hero has left. */
  readonly left: number;
  /** Delayed prices that were scheduled by this use. */
  readonly scheduled: number;
}

function applyEffect(
  run: DetectiveRunState,
  source: ConsumableId,
  effect: ConsumableEffect,
): DetectiveRunState {
  switch (effect.kind) {
    case 'meter':
      return { ...run, condition: withMeterDelta(run.condition, effect) };
    case 'condition':
      return { ...run, condition: withCondition(run.condition, effect.id) };
    case 'later': {
      const { meter, delta, after } = effect;
      const pending: PendingEffect = {
        source,
        meter,
        delta,
        due: 'night' in after ? { night: true } : { minute: absoluteMinute(run.clock) + after.minutes },
      };
      return { ...run, pendingEffects: [...run.pendingEffects, pending] };
    }
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(effect);
  }
}

/** Uses one consumable: time passes first, then the benefit and the price are put to work. */
export function resolveUse(run: DetectiveRunState, intent: UseIntent, rng: Rng): Resolution {
  const known = ConsumableIdSchema.safeParse(intent.itemId);
  if (!known.success) {
    return { ok: false, refusal: { code: 'unknown-item', message: `"${intent.itemId}" is not an item.` } };
  }
  const id = known.data;
  if ((run.supplies[id] ?? 0) < 1) {
    return { ok: false, refusal: { code: 'none-left', message: `The hero has no "${id}" left.` } };
  }
  const { benefits, prices } = CONSUMABLES[id];
  const timed = spendTime({ ...run, supplies: withSupplyUsed(run.supplies, id) }, USE_MINUTES);
  const before = timed.pendingEffects.length;
  const used = [...benefits, ...prices].reduce((state, effect) => applyEffect(state, id, effect), timed);
  return {
    ok: true,
    run: endTurn(used, rng),
    outcome: {
      kind: 'use',
      itemId: id,
      minutes: USE_MINUTES,
      left: used.supplies[id] ?? 0,
      scheduled: used.pendingEffects.length - before,
    },
    details: [],
  };
}
