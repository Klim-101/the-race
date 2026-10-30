// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOCALES, RULESET_VERSION } from '@the-race/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';
import { SERVER_NAME, SERVER_VERSION } from './server-identity.js';
import { createDefaultContext, serveStdio } from './stdio.js';
import { TOOLS } from './tools/index.js';
import { ToolFailure } from './tool-error.js';
import { fakeContext } from '../test/fake-context.js';
import { Peer } from '../test/peer.js';

const refusing = defineTool({
  name: 'refusing',
  description: 'Always refuses.',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({}),
  handler: () =>
    Promise.reject(
      new ToolFailure({ code: 'no-run', message: 'There is no run.', remediation: 'Start one.' }),
    ),
});

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function start(tools = TOOLS): Promise<Peer> {
  const peer = new Peer();
  const server = await serveStdio(peer, fakeContext(), tools);
  closers.push(() => server.close());
  return peer;
}

describe('serveStdio', () => {
  it('introduces itself as the-race', async () => {
    const peer = await start();
    const reply = await peer.initialize();
    expect(reply.result).toMatchObject({ serverInfo: { name: 'the-race', version: SERVER_VERSION } });
  });

  it('lists server_info with schemas and a description for a model', async () => {
    const peer = await start();
    await peer.initialize();
    const reply = await peer.request('tools/list', {});
    const tools = (reply.result as { tools: Record<string, unknown>[] }).tools;
    expect(tools.map((tool) => tool.name)).toContain('server_info');
    expect(tools.find((tool) => tool.name === 'server_info')).toMatchObject({
      description: expect.stringContaining('safe to call') as unknown,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    });
  });

  it('answers server_info with structured content and the same JSON as text', async () => {
    const peer = await start();
    await peer.initialize();
    const reply = await peer.request('tools/call', { name: 'server_info', arguments: {} });
    const expected = {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      rulesetVersion: RULESET_VERSION,
      locales: [...LOCALES],
    };
    expect(reply.result).toEqual({
      content: [{ type: 'text', text: JSON.stringify(expected) }],
      structuredContent: expected,
    });
  });

  it('answers a failing tool with a structured error, not a protocol error', async () => {
    const peer = await start([refusing]);
    await peer.initialize();
    const reply = await peer.request('tools/call', { name: 'refusing', arguments: { id: 'x' } });
    expect(reply.error).toBeUndefined();
    const result = reply.result as {
      isError?: boolean;
      structuredContent?: unknown;
      content: { text: string }[];
    };
    expect(result.isError).toBe(true);
    // Plain text only: structured content would be checked against the output schema by the client.
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({
      error: { code: 'no-run', message: 'There is no run.', remediation: 'Start one.' },
    });
  });

  it('refuses an input that breaks the schema before the handler runs', async () => {
    const peer = await start([refusing]);
    await peer.initialize();
    const reply = await peer.request('tools/call', { name: 'refusing', arguments: { id: 7 } });
    expect(JSON.stringify(reply)).toMatch(/invalid|error/i);
    expect(JSON.stringify(reply)).not.toContain('no-run');
  });
});

describe('createDefaultContext', () => {
  it('keeps saves in the directory it is given and draws a different seed each time', () => {
    const context = createDefaultContext('some-dir');
    expect(context.saveDir).toBe('some-dir');
    expect(context.newSeed()).toMatch(/^[0-9a-f]{16}$/);
    expect(context.newSeed()).not.toBe(context.newSeed());
  });

  it('defaults to the save directory resolved from the environment', () => {
    const home = resolve('temp-race-home');
    vi.stubEnv('RACE_HOME', home);
    try {
      expect(createDefaultContext().saveDir).toBe(home);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('the server version', () => {
  it('is the version in package.json', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(SERVER_VERSION).toBe(manifest.version);
  });
});

describe('the tool list', () => {
  it('has unique snake_case names and a described schema on every tool', () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });
});
