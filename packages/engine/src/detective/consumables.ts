// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { DETECTIVE_NERVES, DETECTIVE_SLEEP_DEBT } from './archetype.js';
import { ConditionIdSchema, type HeroCondition } from './condition.js';
import type { Background } from './gear.js';
import { LIFE_STATE_SHIFTS, type LifeState } from './life-state.js';

// A consumable is data: a name key, what it gives at once (the benefit) and what it costs (the price), both
// written in one small closed vocabulary. Every benefit has a visible price, so a definition with no price is
// a bug (a test checks it). Nothing here reads a clue, an insight or the case: a consumable moves the hero's
// meters and conditions and nothing else, and it never touches evidence.

export const CONSUMABLE_IDS = ['coffee', 'alcohol', 'sedative'] as const;
export const ConsumableIdSchema = z.enum(CONSUMABLE_IDS);
export type ConsumableId = z.infer<typeof ConsumableIdSchema>;

/** The meters a consumable may move. */
export const SUPPLY_METERS = ['nerves', 'sleepDebt'] as const;
export const SupplyMeterSchema = z.enum(SUPPLY_METERS);
export type SupplyMeter = z.infer<typeof SupplyMeterSchema>;

/** When a delayed effect lands: after a number of minutes of game time, or when the night comes. */
export const EffectDelaySchema = z.union([
  z.object({ minutes: z.int().min(1) }),
  z.object({ night: z.literal(true) }),
]);
export type EffectDelay = z.infer<typeof EffectDelaySchema>;

export const MeterDeltaSchema = z.object({
  meter: SupplyMeterSchema,
  delta: z.int().refine((delta) => delta !== 0, { message: 'A change of zero does nothing.' }),
});
export type MeterDelta = z.infer<typeof MeterDeltaSchema>;

/** The whole vocabulary of a consumable's effects. A modifier is a timed condition, as everywhere else. */
export const ConsumableEffectSchema = z.discriminatedUnion('kind', [
  /** A meter moves at once. */
  z.object({ kind: z.literal('meter'), ...MeterDeltaSchema.shape }),
  /** A meter moves later: the price that arrives after the benefit. */
  z.object({ kind: z.literal('later'), ...MeterDeltaSchema.shape, after: EffectDelaySchema }),
  /** A timed condition starts, with its own modifiers and duration. */
  z.object({ kind: z.literal('condition'), id: ConditionIdSchema }),
]);
export type ConsumableEffect = z.infer<typeof ConsumableEffectSchema>;

export interface ConsumableDefinition {
  /** Key of the item's name in the locale files; the engine holds no player-facing text. */
  readonly nameKey: string;
  readonly benefits: readonly ConsumableEffect[];
  readonly prices: readonly ConsumableEffect[];
}

export const CONSUMABLES: Readonly<Record<ConsumableId, ConsumableDefinition>> = {
  coffee: {
    nameKey: 'consumable.coffee',
    benefits: [{ kind: 'meter', meter: 'nerves', delta: 2 }],
    prices: [
      { kind: 'later', meter: 'nerves', delta: -1, after: { minutes: 180 } },
      { kind: 'later', meter: 'sleepDebt', delta: 1, after: { night: true } },
    ],
  },
  alcohol: {
    nameKey: 'consumable.alcohol',
    benefits: [{ kind: 'condition', id: 'emboldened' }],
    // Drunk lasts until the night sobers the hero up.
    prices: [{ kind: 'condition', id: 'drunk' }],
  },
  sedative: {
    nameKey: 'consumable.sedative',
    benefits: [{ kind: 'meter', meter: 'nerves', delta: 3 }],
    prices: [{ kind: 'condition', id: 'sedated' }],
  },
};

/** What each background starts with, by data: no shop and no money, so this is the only way in at the start. */
export const BACKGROUND_SUPPLIES: Readonly<
  Record<Background, Readonly<Partial<Record<ConsumableId, number>>>>
> = {
  police: { coffee: 1 },
  journalist: { coffee: 2 },
  locksmith: { coffee: 1 },
  analyst: { coffee: 1, sedative: 1 },
  'bus-driver': { coffee: 2 },
  nurse: { coffee: 1, sedative: 1 },
  schoolteacher: { coffee: 1 },
  electrician: { coffee: 1 },
  sommelier: { alcohol: 1 },
  accountant: { coffee: 1 },
  courier: { coffee: 1 },
  bailiff: { coffee: 1 },
  translator: { coffee: 1 },
  librarian: { coffee: 1 },
  pharmacist: { coffee: 1, sedative: 1 },
  'radio-presenter': { coffee: 2 },
  'retired-inspector': { coffee: 1 },
  'dismissed-auditor': { coffee: 1 },
  'investigative-blogger': { coffee: 2 },
  'street-private-eye': { coffee: 1, alcohol: 1 },
};

/** Counts of what the hero has; an item that is used up is not listed. Old saves have none. */
export const SuppliesSchema = z.partialRecord(ConsumableIdSchema, z.int().min(1));
export type Supplies = z.infer<typeof SuppliesSchema>;

/** The supplies of a background, with one more of what a life state adds. */
export function initialSupplies(background: Background, lifeState?: LifeState): Supplies {
  const supplies: Supplies = { ...BACKGROUND_SUPPLIES[background] };
  const added = lifeState === undefined ? undefined : LIFE_STATE_SHIFTS[lifeState].supply;
  return added === undefined ? supplies : { ...supplies, [added]: (supplies[added] ?? 0) + 1 };
}

/** The supplies with one of `id` used; the caller has checked that there is one. */
export function withSupplyUsed(supplies: Supplies, id: ConsumableId): Supplies {
  const left = (supplies[id] ?? 0) - 1;
  const rest = Object.fromEntries(Object.entries(supplies).filter(([key]) => key !== id));
  return left > 0 ? { ...rest, [id]: left } : rest;
}

/** A delayed effect that is on its way: it lands at an absolute minute of the run, or at the night. */
export const PendingEffectSchema = z.object({
  source: ConsumableIdSchema,
  ...MeterDeltaSchema.shape,
  due: z.union([z.object({ minute: z.int().min(0) }), z.object({ night: z.literal(true) })]),
});
export type PendingEffect = z.infer<typeof PendingEffectSchema>;

/** The meter moved by `delta`, held between zero and its maximum. */
export function withMeterDelta(condition: HeroCondition, { meter, delta }: MeterDelta): HeroCondition {
  if (meter === 'nerves') {
    return { ...condition, nerves: Math.min(DETECTIVE_NERVES.max, Math.max(0, condition.nerves + delta)) };
  }
  return {
    ...condition,
    sleepDebt: Math.min(DETECTIVE_SLEEP_DEBT.max, Math.max(0, condition.sleepDebt + delta)),
  };
}

/** Splits what is on its way into what lands by `minute` (or at the night, if `night`) and what waits. */
export function splitPending(
  pending: readonly PendingEffect[],
  minute: number,
  night: boolean,
): { readonly due: PendingEffect[]; readonly waiting: PendingEffect[] } {
  const due: PendingEffect[] = [];
  const waiting: PendingEffect[] = [];
  for (const item of pending) {
    const lands = 'night' in item.due ? night : item.due.minute <= minute;
    (lands ? due : waiting).push(item);
  }
  return { due, waiting };
}

export interface SupplyView {
  readonly id: ConsumableId;
  readonly nameKey: string;
  readonly count: number;
}

export interface PendingView {
  readonly source: ConsumableId;
  readonly meter: SupplyMeter;
  readonly delta: number;
  /** Minutes until it lands, or `null` for one that lands at the night. */
  readonly inMinutes: number | null;
}

export function viewSupplies(supplies: Supplies): SupplyView[] {
  return CONSUMABLE_IDS.flatMap((id) => {
    const count = supplies[id] ?? 0;
    return count > 0 ? [{ id, nameKey: CONSUMABLES[id].nameKey, count }] : [];
  });
}

/** What is on its way to the hero, for the player: the price that has not arrived yet. */
export function viewPending(pending: readonly PendingEffect[], nowMinute: number): PendingView[] {
  return pending.map(({ source, meter, delta, due }) => ({
    source,
    meter,
    delta,
    inMinutes: 'night' in due ? null : Math.max(0, due.minute - nowMinute),
  }));
}
