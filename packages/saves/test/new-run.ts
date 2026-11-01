// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  DetectiveCaseSchema,
  EMPTY_RUN_LOG,
  assembleHero,
  createDetectiveRun,
  createRng,
  recordResolution,
  resolveIntent,
  restoreRng,
  type DetectiveRunState,
  type RunLog,
} from '@the-race/engine';
import { buildCheeseCase, buildHero } from '../../engine/test/fixtures/cheese-case.js';

/** The folder id of the fixture run. */
export const RUN_ID = '20261031-120000-saves';

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
    runId: RUN_ID,
    rngState: rng.state(),
    locale: 'en',
  });
}

/** Plays the intents that the engine accepts and keeps the log of them; refused ones leave nothing. */
export function playTurns(
  start: DetectiveRunState,
  intents: readonly unknown[],
): { run: DetectiveRunState; log: RunLog } {
  let run = start;
  let log: RunLog = EMPTY_RUN_LOG;
  for (const intent of intents) {
    const resolution = resolveIntent(run, intent, restoreRng(run.rngState));
    log = recordResolution(log, run, intent, resolution);
    if (resolution.ok) run = resolution.run;
  }
  return { run, log };
}

export const WALK: readonly unknown[] = [
  { kind: 'look' },
  { kind: 'move', locationId: 'cheese-stall' },
  { kind: 'search' },
  { kind: 'look' },
];
