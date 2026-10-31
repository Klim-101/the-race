// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { EntityIdSchema } from '../detective/case-schema.js';
import { createRng } from '../dice.js';
import { ClimateProfileSchema } from './climate.js';
import { MirrorFormsSchema, type World } from './world.js';

/**
 * The country a run is set in, with the climate it keeps from the real one. It is copied into the run when
 * the case is accepted, so the run keeps its setting even if the dictionary grows later.
 */
export const SettingSchema = z.strictObject({
  id: EntityIdSchema,
  name: MirrorFormsSchema,
  climate: ClimateProfileSchema,
});
export type Setting = z.infer<typeof SettingSchema>;

/**
 * The country of the mirror world a run is set in, picked from the countries that have a climate on dice of
 * the run's own, so the same seed in the same world is set in the same place. `undefined` when the world has no
 * such country yet.
 */
export function chooseSetting(world: World, runSeed: string): Setting | undefined {
  const countries = world.entries.flatMap(({ id, kind, mirror, climate }) =>
    kind === 'country' && climate !== undefined ? [{ id, name: mirror, climate }] : [],
  );
  return countries[createRng(`${runSeed}:setting`).roll(Math.max(countries.length, 1)) - 1];
}
