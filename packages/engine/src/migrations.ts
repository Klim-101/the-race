// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { DAY_START_MINUTE, MINUTES_PER_DAY, RUN_SCHEMA_VERSION } from './run.js';

/** A save as plain JSON, before any schema has looked at it. */
export type RawRun = Readonly<Record<string, unknown>>;

/** Upgrades a save by exactly one schema version. Pure: it never reads the clock, dice or disk. */
export type RunMigration = (raw: RawRun) => RawRun;

/** `fromVersion -> step`; the step turns a `fromVersion` save into a `fromVersion + 1` one. */
export type RunMigrationRegistry = Readonly<Record<number, RunMigration>>;

/**
 * Version 1 counted a day's minutes from its start, a run beginning at minute 0; from version 2 the clock
 * reads as the time of day and every day starts at `DAY_START_MINUTE` (08:00). The old minute is moved
 * by that offset, so a save carries on at the same point of its day: minute 0 becomes 08:00. A schema
 * change adds the step from the old version here, in the same change that bumps `RUN_SCHEMA_VERSION`.
 */
function startTheDayAtEight(raw: RawRun): RawRun {
  const { clock } = raw;
  if (!isRecord(clock) || typeof clock.minute !== 'number') {
    throw new TypeError('The save has no clock to move.');
  }
  return { ...raw, clock: { ...clock, minute: (clock.minute + DAY_START_MINUTE) % MINUTES_PER_DAY } };
}

export const RUN_MIGRATIONS: RunMigrationRegistry = { 1: startTheDayAtEight };

export const RUN_MIGRATION_ERROR_CODES = [
  'not-an-object',
  'missing-version',
  'future-version',
  'no-migration-path',
  'step-failed',
] as const;
export type RunMigrationErrorCode = (typeof RUN_MIGRATION_ERROR_CODES)[number];

export class RunMigrationError extends Error {
  readonly code: RunMigrationErrorCode;
  /** The version the save claims; absent when it has none. */
  readonly foundVersion: number | undefined;
  readonly currentVersion: number;

  constructor(
    code: RunMigrationErrorCode,
    message: string,
    foundVersion: number | undefined,
    currentVersion: number,
  ) {
    super(message);
    this.name = 'RunMigrationError';
    this.code = code;
    this.foundVersion = foundVersion;
    this.currentVersion = currentVersion;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Brings a raw save up to `currentVersion`, one step at a time, and returns plain data for the run schema
 * to parse. A save already at the current version is returned untouched. It throws a `RunMigrationError`
 * for a save that is not an object, has no whole-number version, comes from a newer engine, or has a gap
 * in its migration chain. The registry and current version are parameters so the mechanism is testable
 * before real history exists.
 */
export function migrateRun(
  raw: unknown,
  registry: RunMigrationRegistry = RUN_MIGRATIONS,
  currentVersion: number = RUN_SCHEMA_VERSION,
): RawRun {
  if (!isRecord(raw)) {
    throw new RunMigrationError('not-an-object', 'The save is not a JSON object.', undefined, currentVersion);
  }
  const found = raw.schemaVersion;
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 0) {
    throw new RunMigrationError(
      'missing-version',
      'The save has no valid schema version.',
      undefined,
      currentVersion,
    );
  }
  if (found > currentVersion) {
    throw new RunMigrationError(
      'future-version',
      `The save has schema version ${String(found)}, newer than the version ${String(currentVersion)} this engine reads. Update the game to open it.`,
      found,
      currentVersion,
    );
  }

  let data: RawRun = raw;
  for (let version = found; version < currentVersion; version += 1) {
    const step = registry[version];
    if (step === undefined) {
      throw new RunMigrationError(
        'no-migration-path',
        `The save has schema version ${String(found)} and there is no migration from version ${String(version)} to ${String(version + 1)}.`,
        found,
        currentVersion,
      );
    }
    try {
      data = { ...step(data), schemaVersion: version + 1 };
    } catch {
      throw new RunMigrationError(
        'step-failed',
        `The migration from schema version ${String(version)} to ${String(version + 1)} failed.`,
        found,
        currentVersion,
      );
    }
  }
  return data;
}
