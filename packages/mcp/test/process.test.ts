// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { LOCALES, RULESET_VERSION } from '@the-race/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const tscBin = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
const entry = join(packageDir, 'dist', 'main.js');

let workingDirectory: string;
let client: Client;

beforeAll(async () => {
  // The spawned server is the built one, exactly what `node packages/mcp/dist/main.js` runs.
  execFileSync(process.execPath, [tscBin, '-b', 'tsconfig.build.json'], { cwd: packageDir, stdio: 'pipe' });
  workingDirectory = mkdtempSync(join(tmpdir(), 'race-mcp-'));
  // The SDK passes the child only a short allowlist of variables, so no API key reaches the server.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    cwd: workingDirectory,
  });
  client = new Client({ name: 'process-test', version: '0.0.0' });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
  rmSync(workingDirectory, { recursive: true, force: true });
});

describe('the server as a child process over stdio', () => {
  it('names itself the-race', () => {
    expect(client.getServerVersion()).toMatchObject({ name: 'the-race' });
  });

  it('lists its tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('server_info');
  });

  it('answers server_info', async () => {
    const result = await client.callTool({ name: 'server_info', arguments: {} });
    expect(result.structuredContent).toMatchObject({
      name: 'the-race',
      rulesetVersion: RULESET_VERSION,
      locales: [...LOCALES],
    });
  });

  it('answers a call to a tool that does not exist with an error, and stays up', async () => {
    const outcome = await client.callTool({ name: 'no_such_tool', arguments: {} }).then(
      (result) => JSON.stringify(result),
      (error: unknown) => String(error),
    );
    expect(outcome).toMatch(/no_such_tool|not found/i);
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});
