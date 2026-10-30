// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MCP_LAUNCHER, PLUGIN_DIR, buildPlugin } from './plugin-generator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, '..', 'test', 'fixtures', 'plugin-agents');

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'race-launcher-test-'));
  cpSync(fixture, join(root, 'agents'), { recursive: true });
  const launcher = buildPlugin(join(root, 'agents')).get(`${PLUGIN_DIR}/${MCP_LAUNCHER}`);
  mkdirSync(dirname(join(root, PLUGIN_DIR, MCP_LAUNCHER)), { recursive: true });
  writeFileSync(join(root, PLUGIN_DIR, MCP_LAUNCHER), launcher);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const run = () => spawnSync(process.execPath, [join(root, PLUGIN_DIR, MCP_LAUNCHER)], { encoding: 'utf8' });

describe('the plugin launcher of the MCP server', () => {
  it('starts the built server of the repository it sits in', () => {
    mkdirSync(join(root, 'packages', 'mcp', 'dist'), { recursive: true });
    writeFileSync(join(root, 'packages', 'mcp', 'dist', 'main.js'), "console.log('server started');\n");
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('server started');
  });

  it('says what to do when the server is not built, on stderr and not on the protocol stream', () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('npm run build');
  });
});
