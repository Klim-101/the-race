// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from './context.js';
import type { Tool } from './define-tool.js';
import { SERVER_NAME, SERVER_VERSION } from './server-identity.js';
import { TOOLS } from './tools/index.js';

/** An MCP server with the given tools; nothing is connected yet, so a test can pick its own transport. */
export function createServer(context: ServerContext, tools: readonly Tool[] = TOOLS): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema },
      (input: unknown) => tool.run(input, context),
    );
  }
  return server;
}
