// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { PROFILE_FILE, recordRun } from '@the-race/saves';
import type { ProfileRecord } from '@the-race/engine';
import { describe, expect, it } from 'vitest';
import { TEST_PROFILE_DIR } from '../../test/fake-context.js';
import { call, gameContext, type GameContext } from '../../test/game.js';
import { loadPending } from '../pending-run.js';
import { heroPick } from './hero-pick.js';
import { profileView } from './profile-tools.js';
import { runNew } from './run-new.js';

let counter = 0;
const record = (won: boolean): ProfileRecord => {
  counter += 1;
  return {
    version: 1,
    runId: `run-${String(counter)}`,
    locale: 'en',
    title: 'A case',
    hero: { name: 'Mira Kos', background: 'police' },
    endReason: won ? 'proven' : 'wrong',
    won,
    days: 1,
    turns: 3,
    minutes: 60,
    cluesFound: 1,
    insights: 0,
    traitsRevealed: 0,
    traitsTotal: 2,
  };
};

async function withRuns(...outcomes: boolean[]): Promise<GameContext> {
  const context = gameContext();
  for (const won of outcomes) await recordRun(TEST_PROFILE_DIR, record(won), context.fs);
  await call(runNew, { locale: 'en', seed: 'earned-seed' }, context);
  return context;
}

async function hiddenTraits(context: GameContext): Promise<number> {
  const result = await call(heroPick, { choiceId: 'a' }, context);
  expect(result.isError).toBe(false);
  const pending = await loadPending(context.saveDir, context.saveFs);
  expect(pending?.traits.length).toBe(result.body.hiddenTraitCount);
  return pending?.traits.length ?? -1;
}

describe('what the wins of the profile give a new hero', () => {
  it('is two hidden traits for a player with no wins, and one more for each win', async () => {
    expect(await hiddenTraits(await withRuns())).toBe(2);
    expect(await hiddenTraits(await withRuns(false, false))).toBe(2);
    expect(await hiddenTraits(await withRuns(true))).toBe(3);
    expect(await hiddenTraits(await withRuns(true, false, true))).toBe(4);
  });

  it('stops at five hidden traits', async () => {
    expect(await hiddenTraits(await withRuns(true, true, true, true, true, true))).toBe(5);
  });

  it('is two hidden traits when the profile cannot be read, and never stops the run', async () => {
    const context = gameContext();
    context.fs.files.set(join(TEST_PROFILE_DIR, PROFILE_FILE), 'not a profile');
    await call(runNew, { locale: 'en', seed: 'earned-seed' }, context);

    expect(await hiddenTraits(context)).toBe(2);
  });
});

describe('what the profile says is earned', () => {
  it('names the tool slots and the trait slots the next hero has', async () => {
    const none = await call(profileView, {}, await withRuns());
    const some = await call(profileView, {}, await withRuns(true, true, false, false));

    expect(none.body).toMatchObject({ earned: { toolSlots: 1, traitSlots: 2 } });
    expect(some.body).toMatchObject({ earned: { toolSlots: 2, traitSlots: 4 } });
  });
});
