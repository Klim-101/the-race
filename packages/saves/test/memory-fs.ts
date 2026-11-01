// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { isAbsolute, relative, sep } from 'node:path';
import type { SaveFs } from '../src/save-fs.js';

export type MemoryFs = SaveFs & {
  files: Map<string, string>;
  failRename: (path: string | undefined) => void;
  failRead: (path: string | undefined) => void;
  failRemove: () => void;
  directories: string[];
};

/** An in-memory disk whose operations can be made to fail, to stand in for a crash. */
export function memoryFs(): MemoryFs {
  const files = new Map<string, string>();
  const directories: string[] = [];
  let renameFails: string | undefined;
  let readFails: string | undefined;
  let removeFails = false;
  return {
    files,
    directories,
    failRename(path) {
      renameFails = path;
    },
    failRead(path) {
      readFails = path;
    },
    failRemove() {
      removeFails = true;
    },
    mkdir(directory) {
      directories.push(directory);
      return Promise.resolve();
    },
    readFile(path) {
      if (path === readFails) return Promise.reject(new Error('EACCES'));
      return Promise.resolve(files.get(path));
    },
    writeFileSynced(path, data) {
      files.set(path, data);
      return Promise.resolve();
    },
    rename(from, to) {
      if (to === renameFails) return Promise.reject(new Error('rename failed'));
      const data = files.get(from);
      if (data === undefined) return Promise.reject(new Error('ENOENT'));
      files.delete(from);
      files.set(to, data);
      return Promise.resolve();
    },
    list(directory) {
      const names = new Set<string>();
      for (const path of files.keys()) {
        const inside = relative(directory, path);
        if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside))
          names.add(inside.split(sep)[0] ?? inside);
      }
      return Promise.resolve([...names]);
    },
    remove(path) {
      if (removeFails) return Promise.reject(new Error('remove failed'));
      files.delete(path);
      return Promise.resolve();
    },
  };
}
