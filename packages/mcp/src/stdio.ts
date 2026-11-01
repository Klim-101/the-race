// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS, createHttpGet, loadShippedFeeds } from '@the-race/news';
import { defaultBoardDir, defaultProfileDir, defaultSaveDir, nodeSaveFs } from '@the-race/saves';
import type { ServerContext, StartupNotices } from './context.js';
import { createServer } from './server.js';
import type { Tool } from './define-tool.js';

/**
 * The context of a real session: saves in the player's own state directory (never the working directory, see
 * `resolveSaveDir`), and seeds from the operating system's entropy.
 */
export function createDefaultContext(
  saveDir: string = defaultSaveDir(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  boardDir: string = defaultBoardDir(),
  profileDir: string = defaultProfileDir(),
  notices: StartupNotices = {},
): ServerContext {
  return {
    saveDir,
    saveFs: nodeSaveFs,
    boardDir,
    profileDir,
    notices,
    newSeed: () => randomBytes(8).toString('hex'),
    today: () => new Date().toISOString().slice(0, 10),
    now: () => new Date(),
    httpGet: createHttpGet({ timeoutMs: DEFAULT_TIMEOUT_MS, maxBytes: DEFAULT_MAX_BYTES }),
    feeds: loadShippedFeeds,
    newsLagDays: newsLagDays(env.RACE_NEWS_LAG_DAYS),
  };
}

export const MAX_NEWS_LAG_DAYS = 14;

/** The `RACE_NEWS_LAG_DAYS` setting: a whole number of days up to two weeks. Anything else means today's news. */
export function newsLagDays(setting: string | undefined): number {
  const days = Number(setting);
  return Number.isInteger(days) && days > 0 ? Math.min(days, MAX_NEWS_LAG_DAYS) : 0;
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
