// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { SaveFs } from '@the-race/saves';
import type { ServerContext } from '../src/context.js';

const unused = (): never => {
  throw new Error('This test does not touch the disk.');
};

/** What a context needs of the news; a test that does not read the news is given a network that fails. */
export function offlineNews(): Pick<ServerContext, 'today' | 'httpGet' | 'feeds' | 'newsLagDays'> {
  return {
    today: () => '2026-10-31',
    httpGet: () => Promise.reject(new Error('This test does not touch the network.')),
    feeds: () => Promise.resolve([]),
    newsLagDays: 0,
  };
}

/** A context whose disk fails loudly and whose seeds count up, so a test never touches either for real. */
export function fakeContext(): ServerContext {
  const saveFs: SaveFs = {
    mkdir: unused,
    readFile: unused,
    writeFileSynced: unused,
    rename: unused,
    remove: unused,
  };
  let counter = 0;
  return {
    saveDir: 'fake-save-dir',
    saveFs,
    newSeed: () => `seed-${String(++counter)}`,
    ...offlineNews(),
  };
}
