// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RUN_SCHEMA_VERSION } from './run.js';
import { migrateRun, RUN_MIGRATIONS, RunMigrationError, type RunMigrationRegistry } from './migrations.js';

// A made-up history: v1 -> v2 added `flag`, v2 -> v3 added `extra`.
const registry: RunMigrationRegistry = {
  1: (raw) => ({ ...raw, flag: false }),
  2: (raw) => ({ ...raw, extra: 'x' }),
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof RunMigrationError ? error.code : 'other';
  }
  return undefined;
}

describe('migrateRun', () => {
  it('has no real migrations until a second schema version exists', () => {
    expect(RUN_MIGRATIONS).toEqual({});
  });

  it('returns a current-version save as it is', () => {
    const raw = { schemaVersion: RUN_SCHEMA_VERSION, a: 1 };
    expect(migrateRun(raw)).toBe(raw);
  });

  it('runs every step up to the current version and stamps the version', () => {
    expect(migrateRun({ schemaVersion: 1, a: 1 }, registry, 3)).toEqual({
      schemaVersion: 3,
      a: 1,
      flag: false,
      extra: 'x',
    });
  });

  it('runs only the steps after the save version', () => {
    expect(migrateRun({ schemaVersion: 2 }, registry, 3)).toEqual({ schemaVersion: 3, extra: 'x' });
  });

  it('does not change its input', () => {
    const raw = { schemaVersion: 1 };
    migrateRun(raw, registry, 3);
    expect(raw).toEqual({ schemaVersion: 1 });
  });

  it('rejects a future version and names both versions', () => {
    let caught: unknown;
    try {
      migrateRun({ schemaVersion: 7 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RunMigrationError);
    const e = caught as RunMigrationError;
    expect(e.code).toBe('future-version');
    expect(e.foundVersion).toBe(7);
    expect(e.currentVersion).toBe(RUN_SCHEMA_VERSION);
    expect(e.message).toContain('7');
    expect(e.message).toContain(String(RUN_SCHEMA_VERSION));
  });

  it('rejects data that is not an object', () => {
    for (const raw of [null, [], 'x', 3, undefined]) {
      expect(codeOf(() => migrateRun(raw))).toBe('not-an-object');
    }
  });

  it('rejects a missing or malformed version', () => {
    for (const version of [undefined, 'one', -1, 1.5, null]) {
      expect(codeOf(() => migrateRun({ schemaVersion: version }))).toBe('missing-version');
    }
    expect(codeOf(() => migrateRun({}))).toBe('missing-version');
  });

  it('rejects an older version with a gap in the chain', () => {
    expect(codeOf(() => migrateRun({ schemaVersion: 1 }, {}, 2))).toBe('no-migration-path');
    expect(codeOf(() => migrateRun({ schemaVersion: 1 }, { 2: (raw) => raw }, 3))).toBe('no-migration-path');
  });

  it('wraps a step that throws', () => {
    const broken: RunMigrationRegistry = {
      1: () => {
        throw new Error('boom');
      },
    };
    expect(codeOf(() => migrateRun({ schemaVersion: 1 }, broken, 2))).toBe('step-failed');
  });
});
