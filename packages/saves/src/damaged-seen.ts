// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { z } from 'zod';
import type { DamagedRun } from './run-store.js';
import { replaceFile, type SaveFs } from './save-fs.js';

// A run that cannot be read is left exactly as it is, and the player is told of it once. Which ones they were told of
// is kept in a file beside the runs, never in a run's own folder: a damaged run is not touched.

export const DAMAGED_SEEN_FILE = 'damaged-seen.json';

const DamagedSeenSchema = z.strictObject({ schemaVersion: z.literal(1), runIds: z.array(z.string()) });

export const damagedSeenFile = (saveDir: string): string => join(saveDir, DAMAGED_SEEN_FILE);

async function loadSeen(saveDir: string, fs: SaveFs): Promise<string[]> {
  try {
    const text = await fs.readFile(damagedSeenFile(saveDir));
    if (text === undefined) return [];
    const parsed = DamagedSeenSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.runIds : [];
  } catch {
    return [];
  }
}

/**
 * The runs of `damaged` the player has not been told of yet, which are then recorded as told. A file that cannot be
 * read or written only means the player is told again, so it never fails the call that asked.
 */
export async function takeUnseenDamaged(
  saveDir: string,
  damaged: readonly DamagedRun[],
  fs: SaveFs,
): Promise<DamagedRun[]> {
  if (damaged.length === 0) return [];
  const seen = await loadSeen(saveDir, fs);
  const unseen = damaged.filter(({ runId }) => !seen.includes(runId));
  if (unseen.length === 0) return [];
  try {
    await fs.mkdir(saveDir);
    const runIds = [...new Set([...seen, ...unseen.map(({ runId }) => runId)])];
    await replaceFile(
      fs,
      damagedSeenFile(saveDir),
      `${JSON.stringify({ schemaVersion: 1, runIds }, null, 2)}\n`,
    );
  } catch {
    // Told again next time: better than failing a call for a note.
  }
  return unseen;
}
