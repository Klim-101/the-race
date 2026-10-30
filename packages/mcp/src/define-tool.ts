// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ServerContext } from './context.js';
import { toToolError, type ToolError } from './tool-error.js';

export interface ToolSpec<Input extends z.ZodObject, Output extends z.ZodObject> {
  /** `snake_case`, as in the roadmap's tool list. */
  readonly name: string;
  /** Written for a model: what the tool is for, what must be true before calling it, what the result means. */
  readonly description: string;
  readonly inputSchema: Input;
  readonly outputSchema: Output;
  /** Returns the output or throws; `toToolError` turns a throw into the structured error. */
  readonly handler: (input: z.output<Input>, context: ServerContext) => Promise<z.input<Output>>;
}

/**
 * A tool with its types erased, so that tools of different shapes live in one list. Each tool is one file that
 * exports one `defineTool(...)`; `tools/index.ts` lists them.
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodObject;
  readonly outputSchema: z.ZodObject;
  /** Never rejects: a failure is a `CallToolResult` with `isError` and a `ToolError` in it. */
  readonly run: (rawInput: unknown, context: ServerContext) => Promise<CallToolResult>;
}

function success(output: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
}

export function failure(error: ToolError): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error }) }],
    structuredContent: { error },
  };
}

export function defineTool<Input extends z.ZodObject, Output extends z.ZodObject>(
  spec: ToolSpec<Input, Output>,
): Tool {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    outputSchema: spec.outputSchema,
    async run(rawInput, context) {
      try {
        const input = spec.inputSchema.parse(rawInput);
        // The output is parsed too: a handler that drifts from its schema fails here, not in the agent.
        return success(spec.outputSchema.parse(await spec.handler(input, context)));
      } catch (error) {
        return failure(toToolError(error));
      }
    },
  };
}
