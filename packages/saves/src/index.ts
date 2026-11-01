// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

export {
  chooseSaveDir,
  defaultSaveDir,
  legacySaveDir,
  resolveSaveDir,
  type SaveDirInputs,
} from './save-dir.js';
export { defaultGameFolder, resolveGameFolder } from './game-folder.js';
export { nodeSaveFs, replaceFile, type SaveFs } from './save-fs.js';
export { BOARD_FILE, defaultBoardDir, resolveBoardDir } from './board-dir.js';
export {
  runFiles,
  loadRun,
  saveRun,
  LOAD_FAILURE_REASONS,
  type RunFiles,
  type LoadFailureReason,
  type LoadRunResult,
} from './run-store.js';
export { buildResumeSummary, RESUME_LABELS, type ResumeLabels } from './resume-summary.js';
export {
  loadSeeds,
  saveSeedsForDay,
  seedsFile,
  seedsOnOrBefore,
  SEED_DAYS_KEPT,
  type DaySeeds,
  type SeedsByDay,
} from './seed-store.js';
export {
  loadWorld,
  saveWorld,
  worldFile,
  WORLD_LOAD_FAILURE_REASONS,
  type LoadWorldResult,
  type WorldLoadFailureReason,
} from './world-store.js';
export {
  PROFILE_EXPORT_FILE,
  PROFILE_FILE,
  PROFILE_IMPORT_FILE,
  defaultProfileDir,
  exportProfile,
  importProfile,
  loadProfile,
  recordRun,
  resolveProfileDir,
  type ImportProfileResult,
  type LoadProfileResult,
} from './profile-store.js';
export {
  moveDefaultLegacySaves,
  moveLegacySaves,
  nodeMoveFs,
  type LegacyMove,
  type MoveFs,
} from './legacy-move.js';
