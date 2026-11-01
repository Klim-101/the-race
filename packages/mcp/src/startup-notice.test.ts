// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { call, gameContext } from '../test/game.js';
import { takeNotices } from './startup-notice.js';
import { runView } from './tools/run-view.js';

describe('what the player is told once at the start', () => {
  it('is nothing when the saves were not moved', async () => {
    const context = gameContext();

    expect(takeNotices(context)).toEqual({});
    expect((await call(runView, {}, context)).body).not.toHaveProperty('savesMoved');
  });

  it('is the move of the saves, told by the first run_view and by no other call', async () => {
    const context = gameContext();
    context.notices.savesMoved = { from: '/old/the-race', to: '/new/the-race/saves' };

    const first = await call(runView, {}, context);
    const second = await call(runView, {}, context);

    expect(first.body).toMatchObject({
      status: 'no-run',
      savesMoved: { from: '/old/the-race', to: '/new/the-race/saves' },
    });
    expect(second.body).not.toHaveProperty('savesMoved');
    expect(context.notices.savesMoved).toBeUndefined();
  });
});
