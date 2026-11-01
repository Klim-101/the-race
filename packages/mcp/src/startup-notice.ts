// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { ServerContext } from './context.js';

/**
 * What the player is to be told once, if anything: the saves were moved into the game folder at this start. It is
 * taken, so the first tool that carries it clears it and the next call says nothing.
 */
export function takeNotices(context: ServerContext): { savesMoved?: { from: string; to: string } } {
  const { savesMoved } = context.notices;
  if (savesMoved === undefined) return {};
  context.notices.savesMoved = undefined;
  return { savesMoved: { ...savesMoved } };
}
