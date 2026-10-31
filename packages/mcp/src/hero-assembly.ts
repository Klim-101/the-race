// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assembleHero, viewHero, type Rng } from '@the-race/engine';
import { loadPending, savePending, type PendingRun } from './pending-run.js';
import type { ServerContext } from './context.js';
import { ToolFailure } from './tool-error.js';

/** The pending run a hero is being made for, or the failure that says there is none. */
export async function requirePending(context: ServerContext): Promise<PendingRun> {
  const pending = await loadPending(context.saveDir, context.saveFs);
  if (pending === undefined) {
    throw new ToolFailure({
      code: 'no-pending-run',
      message: 'There is no new run waiting for a hero.',
      remediation: 'Call run_view. If no run exists, call run_new first; if one is active, resume it.',
    });
  }
  return pending;
}

/**
 * Assembles the hero on `rng`, keeps it (with its hidden traits and the state of the dice) in the pending run
 * and returns what the narrator may see: the hero and how many traits are still hidden.
 */
export async function storeHero(context: ServerContext, pending: PendingRun, input: unknown, rng: Rng) {
  const assembled = assembleHero(input, rng);
  if (!assembled.isValid) {
    const reasons = assembled.issues.map(({ path, message }) => `${path}: ${message}`);
    throw new ToolFailure({
      code: 'invalid-hero',
      message: `The hero is not valid. ${reasons.join(' ')}`,
      remediation: 'Ask the player to adjust the choices and call hero_create again.',
    });
  }
  await savePending(
    context.saveDir,
    {
      ...pending,
      hero: assembled.assembled.hero,
      traits: [...assembled.assembled.traits],
      rngState: rng.state(),
    },
    context.saveFs,
  );
  const view = viewHero(assembled.assembled);
  return {
    status: 'awaiting-case' as const,
    hero: { ...view.hero },
    hiddenTraitCount: view.hiddenTraitCount,
  };
}
