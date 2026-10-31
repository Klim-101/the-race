// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { profileRecordOf, type DetectiveRunState, type RunLog } from '@the-race/engine';
import { loadProfile, recordRun } from '@the-race/saves';
import type { ServerContext } from './context.js';
import { ToolFailure } from './tool-error.js';

/**
 * Puts a run that has just ended into the player's profile; a run still in progress adds nothing. The profile is
 * a keepsake, so a failure to write it (a full disk, a folder that cannot be made) never costs the player the
 * turn that ended the run: it is dropped, and the next run that ends writes its own record.
 */
export async function keepProfile(
  context: ServerContext,
  run: DetectiveRunState,
  log: RunLog,
): Promise<void> {
  const record = profileRecordOf(run, log);
  if (record === undefined) return;
  try {
    await recordRun(context.profileDir, record, context.saveFs);
  } catch {
    // See above: nothing to do and nothing to tell.
  }
}

/** The records of the profile, or the failure that says it cannot be read. */
export async function requireProfile(context: ServerContext) {
  const loaded = await loadProfile(context.profileDir, context.saveFs);
  if (!loaded.ok) {
    throw new ToolFailure({
      code: 'profile-unusable',
      message: `The profile cannot be read (${loaded.reason}).`,
      remediation:
        'Tell the player in one line that the profile file looks damaged and is left as it is, and go on with the game.',
    });
  }
  return loaded.records;
}
