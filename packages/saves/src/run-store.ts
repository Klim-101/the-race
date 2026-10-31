// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  DetectiveRunStateSchema,
  EMPTY_RUN_LOG,
  RunLogSchema,
  canonicalJson,
  createDetectiveRun,
  migrateRun,
  replay,
  RUN_MIGRATIONS,
  RunMigrationError,
  type DetectiveRunState,
  type RunLog,
  type RunMigrationRegistry,
} from '@the-race/engine';
import { nodeSaveFs, replaceFile, type SaveFs } from './save-fs.js';

export interface RunFiles {
  readonly directory: string;
  readonly current: string;
  readonly previous: string;
  readonly currentLog: string;
  readonly previousLog: string;
}

/**
 * One active run for now: `<dir>/run/state.json` and the generation before it, `state.prev.json`, with the
 * run's event log beside each: `log.json` and `log.prev.json`.
 */
export function runFiles(saveDir: string): RunFiles {
  const directory = join(saveDir, 'run');
  return {
    directory,
    current: join(directory, 'state.json'),
    previous: join(directory, 'state.prev.json'),
    currentLog: join(directory, 'log.json'),
    previousLog: join(directory, 'log.prev.json'),
  };
}

export const LOAD_FAILURE_REASONS = [
  'missing',
  'corrupt',
  'unsupported-version',
  'unreadable',
  'log-mismatch',
] as const;
export type LoadFailureReason = (typeof LOAD_FAILURE_REASONS)[number];

export type LoadRunResult =
  | {
      readonly ok: true;
      readonly run: DetectiveRunState;
      /** The turns the run was played with; empty for a save made before logs were stored. */
      readonly log: RunLog;
      readonly source: 'current';
    }
  | {
      readonly ok: true;
      readonly run: DetectiveRunState;
      readonly log: RunLog;
      /** The current pair of files was not usable and the generation before it was loaded instead. */
      readonly source: 'previous';
      readonly currentProblem: Exclude<LoadFailureReason, 'unsupported-version'>;
    }
  | { readonly ok: false; readonly reason: LoadFailureReason; readonly detail: string };

interface Failure {
  readonly ok: false;
  readonly reason: LoadFailureReason;
  readonly detail: string;
}
type Slot = { readonly ok: true; readonly run: DetectiveRunState; readonly log: RunLog } | Failure;

/** Turns the text of a state file into a run, or says why it is not one. */
function parseRunText(
  text: string,
  migrations: RunMigrationRegistry,
): { readonly ok: true; readonly run: DetectiveRunState } | Failure {
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

/**
 * Whether playing `log` from the start of the run reaches `run`. The start is rebuilt from the run itself:
 * hero, traits, case, seed, locale, setting and inspiration never change during a run, and the dice a run started with are the
 * dice before its first logged turn (or, with no turns, the dice it has now). So the log file needs to hold
 * nothing but the log.
 *
 * Playing the log also gives the run's history of the clues. A save made before that history existed holds none,
 * and must not be refused for it: its history is left out of the comparison, and the caller takes the replayed
 * one. A save that holds a history is held to it.
 */
function replayed(run: DetectiveRunState, log: RunLog): DetectiveRunState | undefined {
  const initial = {
    ...createDetectiveRun({
      hero: run.hero,
      traits: run.traits,
      case: run.case,
      seed: run.seed,
      rngState: log[0]?.rngStateBefore ?? run.rngState,
      locale: run.locale,
      setting: run.setting,
      inspiration: run.inspiration,
    }),
    // A save keeps the versions it was made with; replay must not fail over a version stamp.
    schemaVersion: run.schemaVersion,
    rulesetVersion: run.rulesetVersion,
  };
  const played = replay(initial, log);
  if (!played.ok) return undefined;
  const { finds, shown, links } = run.history;
  const hasHistory = finds.length + shown.length + links.length > 0;
  const expected = hasHistory ? played.run : { ...played.run, history: run.history };
  return canonicalJson(expected) === canonicalJson(run) ? played.run : undefined;
}

const replaysTo = (run: DetectiveRunState, log: RunLog): boolean => replayed(run, log) !== undefined;

/**
 * Turns the texts of a state file and its log file into a run with its log. A log file that does not exist
 * is a save from before logs were stored: it loads with an empty log and nothing to check it against.
 */
function parsePair(stateText: string, logText: string | undefined, migrations: RunMigrationRegistry): Slot {
  const state = parseRunText(stateText, migrations);
  if (!state.ok) return state;
  if (logText === undefined) return { ok: true, run: state.run, log: EMPTY_RUN_LOG };
  let data: unknown;
  try {
    data = JSON.parse(logText);
  } catch {
    return { ok: false, reason: 'corrupt', detail: 'The log file is not valid JSON.' };
  }
  const parsed = RunLogSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, reason: 'corrupt', detail: 'The log file does not match the log schema.' };
  }
  const played = replayed(state.run, parsed.data);
  if (played === undefined) {
    return { ok: false, reason: 'log-mismatch', detail: 'The log does not replay to the saved state.' };
  }
  const { finds, shown, links } = state.run.history;
  const run =
    finds.length + shown.length + links.length === 0 ? { ...state.run, history: played.history } : state.run;
  return { ok: true, run, log: parsed.data };
}

async function readPair(
  fs: SaveFs,
  statePath: string,
  logPath: string,
  migrations: RunMigrationRegistry,
): Promise<Slot> {
  let stateText: string | undefined;
  let logText: string | undefined;
  try {
    stateText = await fs.readFile(statePath);
    if (stateText === undefined) return { ok: false, reason: 'missing', detail: 'The file does not exist.' };
    logText = await fs.readFile(logPath);
  } catch {
    return { ok: false, reason: 'unreadable', detail: 'The file could not be read.' };
  }
  return parsePair(stateText, logText, migrations);
}

/**
 * Loads the run with its log. It never throws: a problem comes back as `ok: false` with a reason. When the
 * current pair of files is missing, corrupt or does not replay, the previous generation is used and the
 * result says so. A save of an unknown schema version is not retried from the previous file, which would
 * silently lose progress.
 */
export async function loadRun(
  saveDir: string,
  fs: SaveFs = nodeSaveFs,
  migrations: RunMigrationRegistry = RUN_MIGRATIONS,
): Promise<LoadRunResult> {
  const files = runFiles(saveDir);
  const current = await readPair(fs, files.current, files.currentLog, migrations);
  if (current.ok) return { ok: true, run: current.run, log: current.log, source: 'current' };
  if (current.reason === 'unsupported-version') return current;

  const previous = await readPair(fs, files.previous, files.previousLog, migrations);
  if (previous.ok) {
    return {
      ok: true,
      run: previous.run,
      log: previous.log,
      source: 'previous',
      currentProblem: current.reason,
    };
  }
  // Both are unusable. Report the current pair's problem unless there was no current file at all.
  return current.reason === 'missing' ? previous : current;
}

/**
 * Saves the run, and its event log beside it. The current pair of files is first copied to the previous
 * generation (only when it is itself a good pair, so a bad file never overwrites a good generation), then
 * the log and the state are replaced atomically, the log first. A crash between the two leaves a pair that
 * does not replay, and `loadRun` falls back to the previous generation: one turn is lost, never the save.
 *
 * `log` is optional so that existing callers keep working, and so that a run saved before logs existed,
 * whose early turns can never be recovered, can still be saved. Without it no log file is written and a
 * leftover one is removed, since a stale log would contradict the new state. With it, a log that does not
 * replay to `run` is refused rather than persisted.
 */
export async function saveRun(
  saveDir: string,
  run: DetectiveRunState,
  fs: SaveFs = nodeSaveFs,
  log?: RunLog,
): Promise<void> {
  // Refuses to persist a state the engine would refuse to load, such as a case changed after its seal.
  const text = `${JSON.stringify(DetectiveRunStateSchema.parse(run), null, 2)}\n`;
  let logText: string | undefined;
  if (log !== undefined) {
    const checked = RunLogSchema.parse(log);
    if (!replaysTo(run, checked)) throw new RangeError('The log does not replay to the run being saved.');
    logText = `${JSON.stringify(checked, null, 2)}\n`;
  }
  const files = runFiles(saveDir);
  await fs.mkdir(files.directory);

  const existing = await fs.readFile(files.current).catch(() => undefined);
  const existingLog = await fs.readFile(files.currentLog).catch(() => undefined);
  if (existing !== undefined && parsePair(existing, existingLog, RUN_MIGRATIONS).ok) {
    await replaceFile(fs, files.previous, existing);
    if (existingLog === undefined) await fs.remove(files.previousLog);
    else await replaceFile(fs, files.previousLog, existingLog);
  }
  if (logText === undefined) await fs.remove(files.currentLog);
  else await replaceFile(fs, files.currentLog, logText);
  await replaceFile(fs, files.current, text);
}
