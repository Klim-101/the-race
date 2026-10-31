// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { World } from '@the-race/engine';
import { loadWorld } from '@the-race/saves';
import type { ServerContext } from './context.js';
import { ToolFailure } from './tool-error.js';

/** The dictionary of the mirror world, or a failure that says it cannot be used. Nothing is replaced. */
export async function requireWorld(context: ServerContext): Promise<World> {
  const loaded = await loadWorld(context.saveDir, context.saveFs);
  if (loaded.ok) return loaded.world;
  throw new ToolFailure({
    code: 'world-unusable',
    message: 'The dictionary of the mirror world cannot be loaded.',
    remediation:
      'Tell the player in one plain sentence that the world dictionary is damaged and stop. The player can ' +
      'move world.json out of the save folder to start a new world, which gives every name afresh.',
  });
}
