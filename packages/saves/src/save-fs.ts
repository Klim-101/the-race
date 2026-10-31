// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';

/**
 * The file operations a save needs, behind an interface so that tests can make any one of them fail
 * (a crash after the temp file, a failed rename) without touching a real disk.
 */
export interface SaveFs {
  mkdir(directory: string): Promise<void>;
  /** The text of the file, or `undefined` when it does not exist. Any other failure throws. */
  readFile(path: string): Promise<string | undefined>;
  /** Writes the file and flushes it to disk before returning. */
  writeFileSynced(path: string, data: string): Promise<void>;
  /** Replaces `to` if it exists. */
  rename(from: string, to: string): Promise<void>;
  /** Removes the file; a file that is already gone is not an error. */
  remove(path: string): Promise<void>;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export const nodeSaveFs: SaveFs = {
  async mkdir(directory) {
    await mkdir(directory, { recursive: true });
  },
  async readFile(path) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
  async writeFileSynced(path, data) {
    const handle = await open(path, 'w');
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async remove(path) {
    await rm(path, { force: true });
  },
};

/** Writes `data` so that `path` holds either its old content or the whole new content, never a mix. */
export async function replaceFile(fs: SaveFs, path: string, data: string): Promise<void> {
  const temporary = `${path}.tmp`;
  try {
    await fs.writeFileSynced(temporary, data);
    await fs.rename(temporary, path);
  } catch (error) {
    await fs.remove(temporary).catch(() => undefined);
    throw error;
  }
}
