// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { CRIME_TYPES, DetectiveHeroSchema, LocaleSchema, TraitSchema, createRng } from '@the-race/engine';
import type { SaveFs } from '@the-race/saves';
import { z } from 'zod';

/**
 * The theme a new run falls back to when the news gave no seed: any crime type of the case schema, picked from
 * the run's seed. With a seed the engine takes the theme from the seed's kind instead.
 */
export const PENDING_THEMES = CRIME_TYPES;
const PendingThemeSchema = z.enum(PENDING_THEMES);

/**
 * A run that has been asked for but has no case yet: the seed, the language and, once the player has made
 * one, the hero. It lives in its own file beside `run/` and is gone once the case is accepted and the run
 * is saved. `traits` is the hero's hidden roll: it is engine-side state like the run's own, and no tool
 * returns it. `rngState` is the state of the dice after the hero was assembled, so the run continues the
 * same sequence and the same seed always gives the same hero and the same run. `attempts` counts the case
 * submissions made so far and `failed` is set when the generator ran out of them; both have defaults, so a
 * record written without them still loads.
 */
export const PendingRunSchema = z.object({
  schemaVersion: z.literal(1),
  seed: z.string().min(1),
  locale: LocaleSchema,
  theme: PendingThemeSchema,
  hero: DetectiveHeroSchema.nullable(),
  traits: z.array(TraitSchema),
  rngState: z.int().min(0).max(0xffffffff),
  /** How many times the player has asked the tavern for another three heroes. */
  offerRound: z.int().min(0).default(0),
  attempts: z.int().min(0).default(0),
  failed: z.boolean().default(false),
});
export type PendingRun = z.infer<typeof PendingRunSchema>;

export function pendingFile(saveDir: string): string {
  return join(saveDir, 'pending', 'state.json');
}

/** The theme of a seed. It uses dice of its own so that picking it never moves the hero's dice. */
export function themeOfSeed(seed: string): PendingRun['theme'] {
  const pick = createRng(`${seed}:theme`).roll(PENDING_THEMES.length) - 1;
  // The die has exactly one face per theme, so the index is always inside the list.
  return PendingThemeSchema.parse(PENDING_THEMES[pick]);
}

/** A pending run with no hero yet. */
export function newPendingRun(seed: string, locale: PendingRun['locale']): PendingRun {
  return {
    schemaVersion: 1,
    seed,
    locale,
    theme: themeOfSeed(seed),
    hero: null,
    traits: [],
    rngState: createRng(seed).state(),
    offerRound: 0,
    attempts: 0,
    failed: false,
  };
}

/**
 * The pending run, or `undefined` when there is none. A file that cannot be read or does not match the
 * schema counts as none: a pending run holds nothing that cannot be asked for again, so it is never worth
 * stopping the game for.
 */
export async function loadPending(saveDir: string, fs: SaveFs): Promise<PendingRun | undefined> {
  let text: string | undefined;
  try {
    text = await fs.readFile(pendingFile(saveDir));
  } catch {
    return undefined;
  }
  if (text === undefined) return undefined;
  try {
    const parsed = PendingRunSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Writes the file so that it holds either the old content or the whole new one, never a mix. */
export async function savePending(saveDir: string, pending: PendingRun, fs: SaveFs): Promise<void> {
  const path = pendingFile(saveDir);
  const temporary = `${path}.tmp`;
  await fs.mkdir(join(saveDir, 'pending'));
  try {
    await fs.writeFileSynced(temporary, `${JSON.stringify(PendingRunSchema.parse(pending), null, 2)}\n`);
    await fs.rename(temporary, path);
  } catch (error) {
    await fs.remove(temporary).catch(() => undefined);
    throw error;
  }
}

/** Removes the pending run; it is not an error if there is none. */
export async function clearPending(saveDir: string, fs: SaveFs): Promise<void> {
  await fs.remove(pendingFile(saveDir));
}
