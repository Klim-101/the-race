// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  DetectiveCaseSchema,
  assembleHero,
  createDetectiveRun,
  createRng,
  type DetectiveRunState,
} from '@the-race/engine';
import { buildCheeseCase, buildHero } from '../../engine/test/fixtures/cheese-case.js';

/** A fresh run of the engine's sample case. */
export function newRun(): DetectiveRunState {
  const rng = createRng('saves');
  const result = assembleHero(buildHero(), rng);
  if (!result.isValid) throw new Error('The fixture hero is invalid.');
  return createDetectiveRun({
    hero: buildHero(),
    traits: result.assembled.traits,
    case: DetectiveCaseSchema.parse(buildCheeseCase()),
    seed: 'saves',
    rngState: rng.state(),
    locale: 'en',
  });
}
