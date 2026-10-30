// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { ModifierEffect } from '../meters.js';
import type { ModifierItem } from '../modifiers.js';

// Gear is what the hero carries: data, like a condition, that moves a check only through `collectModifier`.
// It never touches evidence. A robbery or a spill takes a piece of gear, and the piece stays lost, as a
// penalty, until it is replaced. Another archetype adds its own gear and backgrounds by data.

export const GEAR_IDS = ['phone', 'notebook', 'laptop', 'picks'] as const;
export const GearIdSchema = z.enum(GEAR_IDS);
export type GearId = z.infer<typeof GearIdSchema>;

export interface GearDefinition {
  /** Key of the piece's name in the locale files; the engine holds no player-facing text. */
  readonly nameKey: string;
  /** What the piece gives while the hero has it. */
  readonly effects: readonly ModifierEffect[];
  /** What its loss costs on top of the bonus that is gone; empty for a piece that is only missed. */
  readonly lostEffects: readonly ModifierEffect[];
}

export const DETECTIVE_GEAR: Readonly<Record<GearId, GearDefinition>> = {
  phone: {
    nameKey: 'gear.phone',
    effects: [{ skills: ['contacts'], amount: 1 }],
    lostEffects: [{ skills: ['contacts'], amount: -1 }],
  },
  notebook: { nameKey: 'gear.notebook', effects: [{ skills: ['reasoning'], amount: 1 }], lostEffects: [] },
  laptop: {
    nameKey: 'gear.laptop',
    effects: [{ skills: ['tech'], amount: 1 }],
    lostEffects: [{ skills: ['tech'], amount: -1 }],
  },
  picks: { nameKey: 'gear.picks', effects: [{ skills: ['perception'], amount: 1 }], lostEffects: [] },
};

export const BACKGROUNDS = ['police', 'journalist', 'locksmith', 'analyst'] as const;
export const BackgroundSchema = z.enum(BACKGROUNDS);
export type Background = z.infer<typeof BackgroundSchema>;
/** A hero who names no background was a policeman. */
export const DEFAULT_BACKGROUND: Background = 'police';

/** What each background starts with: the kit comes from who the hero was, never from a die. */
export const BACKGROUND_KITS: Readonly<Record<Background, readonly GearId[]>> = {
  police: ['phone', 'notebook'],
  journalist: ['phone', 'notebook', 'laptop'],
  locksmith: ['phone', 'picks'],
  analyst: ['notebook', 'laptop'],
};

export const GearStateSchema = z.enum(['owned', 'lost']);
export type GearState = z.infer<typeof GearStateSchema>;

export const KitItemSchema = z.object({ id: GearIdSchema, state: GearStateSchema });
export type KitItem = z.infer<typeof KitItemSchema>;

export function initialKit(background: Background): KitItem[] {
  return BACKGROUND_KITS[background].map((id) => ({ id, state: 'owned' }));
}

/** The same kit with one piece set to `state`; a piece that is not in the kit is a bug in the caller. */
export function withGearState(kit: readonly KitItem[], id: GearId, state: GearState): KitItem[] {
  if (!kit.some((item) => item.id === id)) {
    throw new RangeError(`The hero has no gear "${id}" in their kit.`);
  }
  return kit.map((item) => (item.id === id ? { id, state } : item));
}

/** The kit as modifier items: a piece in hand gives its bonus, a lost one only its penalty. */
export function gearModifiers(kit: readonly KitItem[]): ModifierItem[] {
  return kit.map(({ id, state }) => ({
    id,
    effects: state === 'owned' ? DETECTIVE_GEAR[id].effects : DETECTIVE_GEAR[id].lostEffects,
  }));
}

export interface KitView {
  readonly id: GearId;
  readonly nameKey: string;
  readonly state: GearState;
}

export function viewKit(kit: readonly KitItem[]): KitView[] {
  return kit.map(({ id, state }) => ({ id, nameKey: DETECTIVE_GEAR[id].nameKey, state }));
}
