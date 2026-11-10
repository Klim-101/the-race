// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProfile, replaceFile, runBoardFile } from '@the-race/saves';
import type { ServerContext } from './context.js';
import { renderHallPage } from './hall-page.js';

export const HALL_PAGE = 'hall.html';

/** The page of the hall of heroes: in the profile folder, beside `profile.json` and out of the saves. */
export const hallFile = (profileDir: string): string => join(profileDir, HALL_PAGE);

/** Where the hall is, as a path to show in words and as a `file://` address to give as a link. */
export const hallLocation = (context: ServerContext): { path: string; link: string } => {
  const path = hallFile(context.profileDir);
  return { path, link: pathToFileURL(path).href };
};

/**
 * Writes the hall from the records of the profile, replaced whole. Throws when the profile cannot be read or the
 * folder cannot be written. A record links to the board of its run when that board is still on disk.
 */
export async function writeHall(context: ServerContext): Promise<void> {
  const loaded = await loadProfile(context.profileDir, context.saveFs);
  if (!loaded.ok) throw new Error(`The profile cannot be read (${loaded.reason}).`);
  const boards = new Map<string, string>();
  for (const { folder } of loaded.records) {
    if (folder === undefined) continue;
    const board = runBoardFile(context.saveDir, folder);
    if ((await context.saveFs.readFile(board).catch(() => undefined)) !== undefined) {
      boards.set(folder, relative(context.profileDir, board).split(sep).join('/'));
    }
  }
  const page = renderHallPage(loaded.records, context.today(), ({ folder }) =>
    folder === undefined ? undefined : boards.get(folder),
  );
  await context.saveFs.mkdir(context.profileDir);
  await replaceFile(context.saveFs, hallFile(context.profileDir), page);
}

/**
 * Keeps the hall current when a run ends. It is a keepsake, so a failure to write it (a full disk, a profile that
 * cannot be read) never costs the player the turn: the next run that ends writes it again. Says whether the page
 * is there, so that the narrator gives a link only to a page that exists.
 */
export async function keepHall(context: ServerContext): Promise<boolean> {
  try {
    await writeHall(context);
    return true;
  } catch {
    return false;
  }
}
