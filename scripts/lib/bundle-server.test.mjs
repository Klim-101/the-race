// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleServer, findStaleBundle } from './bundle-server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let scratch;
let bundle;
beforeAll(async () => {
  // A folder of its own in the system's temp directory, with no repository and no node_modules near it: what
  // an install of the plugin looks like.
  scratch = mkdtempSync(join(tmpdir(), 'race-bundle-test-'));
  bundle = await bundleServer(root, scratch);
}, 60_000);
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('the server bundle', () => {
  it('starts on its own and lists the tools of the game', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bundle],
      cwd: scratch,
      // The saves of the test, never the player's own.
      env: { RACE_HOME: join(scratch, 'saves'), RACE_GAME_FOLDER: scratch },
    });
    const client = new Client({ name: 'bundle-test', version: '0.0.0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['server_info', 'evidence_board']),
      );
    } finally {
      await client.close();
    }
  }, 30_000);

  it('reads the feed list from beside itself, not from the repository', () => {
    const text = readFileSync(bundle, 'utf8');

    expect(text).toMatch(/new URL\(["']\.\/content\/feeds\.json["'], import\.meta\.url\)/);
    expect(text).not.toContain('../../../content/feeds.json');
    expect(readFileSync(join(scratch, 'server', 'content', 'feeds.json'), 'utf8')).toBe(
      readFileSync(join(root, 'content', 'feeds.json'), 'utf8'),
    );
  });
});

describe('findStaleBundle', () => {
  it('finds nothing when the committed bundle is what the sources give', async () => {
    expect(await findStaleBundle(root, scratch)).toEqual([]);
  }, 60_000);

  it('names a bundle that differs and one that is missing', async () => {
    const other = mkdtempSync(join(tmpdir(), 'race-bundle-stale-'));
    try {
      expect(await findStaleBundle(root, other)).toEqual([
        'missing: server/main.mjs',
        'missing: server/content/feeds.json',
      ]);
      writeFileSync(join(scratch, 'server', 'main.mjs'), '// changed\n');
      expect(await findStaleBundle(root, scratch)).toEqual(['out of date: server/main.mjs']);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  }, 60_000);
});
