// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { win32, posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBoardDir } from './board-dir.js';
import { resolveGameFolder } from './game-folder.js';
import { resolveProfileDir } from './profile-store.js';
import { resolveSaveDir } from './save-dir.js';

// Everything the game writes is under the game folder: the saves (with the world and the seeds), the board and the
// profile. Nothing is left in a per-user state folder once the saves have been moved (see `legacy-move.ts`).
describe('the game folder', () => {
  const cases = [
    { platform: 'win32', homedir: 'C:\\Users\\ann', env: {}, path: win32 },
    { platform: 'win32', homedir: 'C:\\Users\\ann', env: { RACE_GAME_FOLDER: 'D:\\play' }, path: win32 },
    { platform: 'darwin', homedir: '/Users/ann', env: {}, path: posix },
    { platform: 'linux', homedir: '/home/ann', env: { RACE_GAME_FOLDER: '/srv/race' }, path: posix },
  ] as const;

  it.each(cases)(
    'holds the saves, the board and the profile, on $platform with $env',
    ({ path, ...inputs }) => {
      const folder = resolveGameFolder(inputs);

      for (const dir of [resolveSaveDir(inputs), resolveBoardDir(inputs), resolveProfileDir(inputs)]) {
        expect(path.dirname(dir)).toBe(folder);
      }
      expect(
        [resolveSaveDir(inputs), resolveBoardDir(inputs), resolveProfileDir(inputs)].map((dir) =>
          path.basename(dir),
        ),
      ).toEqual(['saves', 'board', 'profile']);
    },
  );
});
