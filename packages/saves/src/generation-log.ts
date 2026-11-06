// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { LocaleSchema } from '@the-race/engine';
import { z } from 'zod';
import { replaceFile, type SaveFs } from './save-fs.js';

// What the engine said to each case the generator submitted, kept so that the player (and whoever tunes the
// generator) can see how often it fails and which rules reject it. It lives in the game folder like the rest of the
// player's files and never leaves the machine. An entry holds codes of issues and counts only: a message or a path
// may quote the case, and the case is sealed.

export const GENERATION_LOG_FILE = 'generation-log.json';
/** The newest entries kept; an older one is dropped, so that the file stays small however long the game is played. */
export const MAX_LOG_ENTRIES = 1000;

/** `accepted`: the run started. `rejected`: another attempt is left. `final`: the last attempt was rejected too. */
export const GENERATION_OUTCOMES = ['accepted', 'rejected', 'final'] as const;

export const GenerationEntrySchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seed: z.string().min(1),
  locale: LocaleSchema,
  theme: z.string().min(1),
  archetype: z.string().min(1),
  /** Which submission of this run's case it was, counted from 1. */
  attempt: z.int().min(1),
  outcome: z.enum(GENERATION_OUTCOMES),
  /** The distinct codes of the issues found, the most fundamental first; none for an accepted case. */
  codes: z.array(z.string().min(1)),
  /** How many issues there were in all, which is at least the number of codes. */
  issues: z.int().min(0),
});
export type GenerationEntry = z.infer<typeof GenerationEntrySchema>;

const GenerationLogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  entries: z.array(GenerationEntrySchema),
});

export const GenerationStatsSchema = z.strictObject({
  /** Runs whose case was accepted. */
  accepted: z.int().min(0),
  /** Runs that used every attempt and got none. */
  failed: z.int().min(0),
  /** Index 0 is the first attempt: how many cases were accepted on it. As long as the highest attempt seen. */
  acceptedOnAttempt: z.array(z.int().min(0)),
  /** How many submissions each code rejected, the most frequent first. */
  codes: z.array(z.strictObject({ code: z.string().min(1), count: z.int().min(1) })),
});
export type GenerationStats = z.infer<typeof GenerationStatsSchema>;

export const generationLogFile = (directory: string): string => join(directory, GENERATION_LOG_FILE);

/**
 * The entries of the log, oldest first. A log that is missing, cannot be read or does not match the schema counts
 * as empty: it is a convenience, and nothing is worth stopping the game for.
 */
export async function loadGenerationLog(directory: string, fs: SaveFs): Promise<GenerationEntry[]> {
  try {
    const text = await fs.readFile(generationLogFile(directory));
    if (text === undefined) return [];
    const parsed = GenerationLogSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.entries : [];
  } catch {
    return [];
  }
}

/** Adds one entry and writes the file whole, so that it holds the old log or the new one and never a mix. */
export async function appendGenerationEntry(
  directory: string,
  entry: GenerationEntry,
  fs: SaveFs,
): Promise<void> {
  const entries = [...(await loadGenerationLog(directory, fs)), GenerationEntrySchema.parse(entry)];
  await fs.mkdir(directory);
  await replaceFile(
    fs,
    generationLogFile(directory),
    `${JSON.stringify({ schemaVersion: 1, entries: entries.slice(-MAX_LOG_ENTRIES) }, null, 2)}\n`,
  );
}

/** Sums the log up. A run still being generated (only rejections so far) is in neither count. */
export function summarizeGeneration(entries: readonly GenerationEntry[]): GenerationStats {
  let accepted = 0;
  let failed = 0;
  let highest = 0;
  const onAttempt = new Map<number, number>();
  const rejections = new Map<string, number>();
  for (const { attempt, outcome, codes } of entries) {
    highest = Math.max(highest, attempt);
    if (outcome === 'accepted') {
      accepted += 1;
      onAttempt.set(attempt, (onAttempt.get(attempt) ?? 0) + 1);
      continue;
    }
    if (outcome === 'final') failed += 1;
    for (const code of codes) rejections.set(code, (rejections.get(code) ?? 0) + 1);
  }
  return {
    accepted,
    failed,
    acceptedOnAttempt: Array.from({ length: highest }, (_, index) => onAttempt.get(index + 1) ?? 0),
    codes: [...rejections]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}
