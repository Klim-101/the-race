// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Rng } from '../../src/dice.js';
import type { DetectiveRunState } from '../../src/detective/run-state.js';

// The ordinary player of the balance runs: someone who looks, searches, moves, talks to people (pressing as
// often as charming) and tries links, in no clever order. What a balance run measures is what the rules do to a
// hero played like this, so the policy is shared by every one of them.

function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[rng.roll(items.length) - 1];
}

/** One intent an ordinary player might try next, from what is true now. */
export function intentOf(run: DetectiveRunState, rng: Rng, prudent: boolean): unknown {
  // A prudent player who is told the hero is at the end of their nerves lies down for the night.
  if (prudent && run.condition.nerves <= 2) return { kind: 'rest' };
  const here = run.case.locations.find(({ id }) => id === run.locationId);
  const found = run.foundClueIds;
  const choice = rng.roll(10);
  if (choice <= 3) return { kind: 'search' };
  if (choice === 4) return { kind: 'look' };
  if (choice <= 6) {
    const exit = pick(rng, here?.connections ?? []);
    return exit === undefined ? { kind: 'look' } : { kind: 'move', locationId: exit };
  }
  if (choice <= 9) {
    const suspect = pick(rng, run.case.suspects);
    const shown = found.slice(0, 1 + rng.roll(2) - 1);
    return {
      kind: 'interrogate',
      suspectId: suspect?.id,
      approach: rng.roll(3) === 1 ? 'pressure' : 'social',
      clueIds: shown,
    };
  }
  const one = pick(rng, found);
  const other = pick(
    rng,
    found.filter((id) => id !== one),
  );
  return { kind: 'deduce', clueIds: [one, other] };
}
