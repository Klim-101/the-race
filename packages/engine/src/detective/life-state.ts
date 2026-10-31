// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { ConsumableId } from './consumables.js';
import type { GearId } from './gear.js';

// What the hero is going through when the run begins, beside who they were. A state shifts the start a little,
// by one piece of kit or one supply and never by a penalty, so every state can be played; the wording of each
// is in the locale files. A hero made before this existed has none.

export const LIFE_STATES = [
  'just-dismissed',
  'retired',
  'on-leave',
  'in-debt',
  'newly-arrived',
  'on-probation',
] as const;
export const LifeStateSchema = z.enum(LIFE_STATES);
export type LifeState = z.infer<typeof LifeStateSchema>;

export interface LifeStateShift {
  /** A piece of gear the hero has because of it, if they did not already. */
  readonly gear?: GearId;
  /** A supply they carry because of it. */
  readonly supply?: ConsumableId;
}

export const LIFE_STATE_SHIFTS: Readonly<Record<LifeState, LifeStateShift>> = {
  // A bottle from the farewell party.
  'just-dismissed': { supply: 'alcohol' },
  // Time to write things down.
  retired: { gear: 'notebook' },
  // The phone is on, the desk is far away.
  'on-leave': { gear: 'phone' },
  // Long nights, a lot of coffee.
  'in-debt': { supply: 'coffee' },
  // A new town is learned from a notebook.
  'newly-arrived': { gear: 'notebook', supply: 'coffee' },
  // Nerves kept in check by prescription.
  'on-probation': { supply: 'sedative' },
};
