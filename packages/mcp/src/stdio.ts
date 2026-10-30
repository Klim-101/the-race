// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { nodeSaveFs, defaultSaveDir } from '@the-race/saves';
import type { ServerContext } from './context.js';
import { createServer } from './server.js';
import type { Tool } from './define-tool.js';

/**
 * The context of a real session: saves in the player's own state directory (never the working directory, see
 * `resolveSaveDir`), and seeds from the operating system's entropy.
 */
export function createDefaultContext(saveDir: string = defaultSaveDir()): ServerContext {
  return {
    saveDir,
    saveFs: nodeSaveFs,
    newSeed: () => randomBytes(8).toString('hex'),
  };
}

export interface StdioStreams {
  readonly stdin: Readable;
  readonly stdout: Writable;
}

/**
 * Serves MCP over the given streams: the only way in or out. Nothing listens on a port and nothing is
 * called over the network. Stdout carries the protocol, so nothing else may ever be written to it.
 */
export async function serveStdio(
  streams: StdioStreams,
  context: ServerContext,
  tools?: readonly Tool[],
): Promise<McpServer> {
  const server = createServer(context, tools);
  await server.connect(new StdioServerTransport(streams.stdin, streams.stdout));
  return server;
}
