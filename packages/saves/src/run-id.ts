// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { RUN_ID_PATTERN } from '@the-race/engine';

const SEED_PART_LENGTH = 24;

/** The part of the id that a seed gives: lower-case letters and digits, with single hyphens between them. */
function seedPart(seed: string): string {
  const slug = seed
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, SEED_PART_LENGTH)
    .replaceAll(/-+$/g, '');
  return slug === '' ? 'run' : slug;
}

/**
 * The id of a run, made when it starts: `<date>-<time>-<seed>` in UTC, so the folders of a player sort in the
 * order the runs were played and one can be told from another in a file manager. A seed the player typed may
 * hold anything, so only its letters and digits go into the id. The clock is passed in, never read.
 */
export function makeRunId(now: Date, seed: string): string {
  const stamp = now
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .replace('T', '-');
  return `${stamp}-${seedPart(seed)}`;
}

/** Whether a folder name is the id of a run. */
export const isRunId = (name: string): boolean => RUN_ID_PATTERN.test(name);
