// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { HeroSchema, LOCALES, TraitSchema } from '@the-race/engine';
import type { SaveFs } from '@the-race/saves';
import { z } from 'zod';

/**
 * A run that has a hero but no case yet. The traits are hidden and engine-only: no tool returns them.
 * `attempts` counts the case submissions made so far and `failed` is set when the generator ran out of
 * them; both are additive, so a record written without them still loads.
 */
export const PendingRunSchema = z.object({
  schemaVersion: z.literal(1),
  seed: z.string().min(1),
  locale: z.enum(LOCALES),
  theme: z.string(),
  hero: HeroSchema.nullable(),
  traits: z.array(TraitSchema),
  attempts: z.int().min(0).default(0),
  failed: z.boolean().default(false),
});
export type PendingRun = z.infer<typeof PendingRunSchema>;

export function pendingPath(saveDir: string): string {
  return join(saveDir, 'pending-run.json');
}

/** The pending record, or `null` when there is none or it cannot be read as one. */
export async function loadPending(saveDir: string, fs: SaveFs): Promise<PendingRun | null> {
  let text: string | undefined;
  try {
    text = await fs.readFile(pendingPath(saveDir));
  } catch {
    return null;
  }
  if (text === undefined) return null;
  try {
    const parsed = PendingRunSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Replaces the record atomically: the file holds the old content or the whole new one, never a mix. */
export async function savePending(saveDir: string, pending: PendingRun, fs: SaveFs): Promise<void> {
  const path = pendingPath(saveDir);
  const temporary = `${path}.tmp`;
  await fs.mkdir(saveDir);
  try {
    await fs.writeFileSynced(temporary, `${JSON.stringify(PendingRunSchema.parse(pending), null, 2)}\n`);
    await fs.rename(temporary, path);
  } catch (error) {
    await fs.remove(temporary).catch(() => undefined);
    throw error;
  }
}

export async function clearPending(saveDir: string, fs: SaveFs): Promise<void> {
  await fs.remove(pendingPath(saveDir));
}
