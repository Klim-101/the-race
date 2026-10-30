// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  DetectiveRunStateSchema,
  migrateRun,
  RUN_MIGRATIONS,
  RunMigrationError,
  type DetectiveRunState,
  type RunMigrationRegistry,
} from '@the-race/engine';
import { nodeSaveFs, type SaveFs } from './save-fs.js';

/** The save directory of a working directory. It is git-ignored. */
export function defaultSaveDir(workingDirectory: string): string {
  return join(workingDirectory, '.race');
}

export interface RunFiles {
  readonly directory: string;
  readonly current: string;
  readonly previous: string;
}

/** One active run for now: `<dir>/run/state.json` and the generation before it, `state.prev.json`. */
export function runFiles(saveDir: string): RunFiles {
  const directory = join(saveDir, 'run');
  return {
    directory,
    current: join(directory, 'state.json'),
    previous: join(directory, 'state.prev.json'),
  };
}

export const LOAD_FAILURE_REASONS = ['missing', 'corrupt', 'unsupported-version', 'unreadable'] as const;
export type LoadFailureReason = (typeof LOAD_FAILURE_REASONS)[number];

export type LoadRunResult =
  | { readonly ok: true; readonly run: DetectiveRunState; readonly source: 'current' }
  | {
      readonly ok: true;
      readonly run: DetectiveRunState;
      /** The current file was not usable and the generation before it was loaded instead. */
      readonly source: 'previous';
      readonly currentProblem: Exclude<LoadFailureReason, 'unsupported-version'>;
    }
  | { readonly ok: false; readonly reason: LoadFailureReason; readonly detail: string };

type Slot =
  | { readonly ok: true; readonly run: DetectiveRunState }
  | { readonly ok: false; readonly reason: LoadFailureReason; readonly detail: string };

/** Turns the text of a save file into a run, or says why it is not one. */
function parseRunText(text: string, migrations: RunMigrationRegistry): Slot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt', detail: 'The file is not valid JSON.' };
  }
  // An older save is upgraded in memory only; the file is rewritten by the next normal save.
  try {
    data = migrateRun(data, migrations);
  } catch (error) {
    // migrateRun throws nothing but RunMigrationError, even when a step does.
    const failure = error as RunMigrationError;
    const unsupported = failure.code === 'future-version' || failure.code === 'no-migration-path';
    return { ok: false, reason: unsupported ? 'unsupported-version' : 'corrupt', detail: failure.message };
  }
  const parsed = DetectiveRunStateSchema.safeParse(data);
  if (parsed.success) return { ok: true, run: parsed.data };
  const sealBroken = parsed.error.issues.some((issue) => issue.path[0] === 'caseSeal');
  return {
    ok: false,
    reason: 'corrupt',
    detail: sealBroken ? 'The case no longer matches its seal.' : 'The file does not match the run schema.',
  };
}

async function readSlot(fs: SaveFs, path: string, migrations: RunMigrationRegistry): Promise<Slot> {
  let text: string | undefined;
  try {
    text = await fs.readFile(path);
  } catch {
    return { ok: false, reason: 'unreadable', detail: 'The file could not be read.' };
  }
  if (text === undefined) return { ok: false, reason: 'missing', detail: 'The file does not exist.' };
  return parseRunText(text, migrations);
}

/**
 * Loads the run. It never throws: a problem comes back as `ok: false` with a reason. When the current
 * file is missing or corrupt, the previous generation is used and the result says so. A save of an
 * unknown schema version is not retried from the previous file, which would silently lose progress.
 */
export async function loadRun(
  saveDir: string,
  fs: SaveFs = nodeSaveFs,
  migrations: RunMigrationRegistry = RUN_MIGRATIONS,
): Promise<LoadRunResult> {
  const files = runFiles(saveDir);
  const current = await readSlot(fs, files.current, migrations);
  if (current.ok) return { ok: true, run: current.run, source: 'current' };
  if (current.reason === 'unsupported-version') return current;

  const previous = await readSlot(fs, files.previous, migrations);
  if (previous.ok) {
    return { ok: true, run: previous.run, source: 'previous', currentProblem: current.reason };
  }
  // Both are unusable. Report the current file's problem unless there was no current file at all.
  return current.reason === 'missing' ? previous : current;
}

/** Writes `data` so that `path` holds either its old content or the whole new content, never a mix. */
async function replaceFile(fs: SaveFs, path: string, data: string): Promise<void> {
  const temporary = `${path}.tmp`;
  try {
    await fs.writeFileSynced(temporary, data);
    await fs.rename(temporary, path);
  } catch (error) {
    await fs.remove(temporary).catch(() => undefined);
    throw error;
  }
}

/**
 * Saves the run. The current file is first copied to `state.prev.json` (only when it is a good save, so
 * a corrupt file never overwrites a good previous generation), then replaced atomically. At every point
 * of a crash, at least one of the two files is a whole save.
 */
export async function saveRun(
  saveDir: string,
  run: DetectiveRunState,
  fs: SaveFs = nodeSaveFs,
): Promise<void> {
  // Refuses to persist a state the engine would refuse to load, such as a case changed after its seal.
  const text = `${JSON.stringify(DetectiveRunStateSchema.parse(run), null, 2)}\n`;
  const files = runFiles(saveDir);
  await fs.mkdir(files.directory);

  const existing = await fs.readFile(files.current).catch(() => undefined);
  if (existing !== undefined && parseRunText(existing, RUN_MIGRATIONS).ok) {
    await replaceFile(fs, files.previous, existing);
  }
  await replaceFile(fs, files.current, text);
}
