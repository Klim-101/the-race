// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { Refusal } from '@the-race/engine';

/**
 * What a tool tells the agent when it cannot do what was asked. The `code` is stable and machine-readable,
 * the `message` says what happened, the `remediation` says what to do next. Neither may carry a stack trace,
 * a file path or an engine internal: the agent relays this text to the player.
 */
export const ToolErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  remediation: z.string().min(1),
});
export type ToolError = z.infer<typeof ToolErrorSchema>;

/** Codes that belong to the server itself; an engine refusal keeps the engine's own code. */
export const TOOL_ERROR_CODES = {
  invalidInput: 'invalid-input',
  internal: 'internal-error',
} as const;

/** Thrown by a tool handler to fail with a message written for the agent. */
export class ToolFailure extends Error {
  readonly toolError: ToolError;

  constructor(toolError: ToolError) {
    super(toolError.message);
    this.name = 'ToolFailure';
    this.toolError = toolError;
  }
}

/** The engine's refusal of an action: nothing changed, and the agent may try something else. */
export function refusalToToolError(refusal: Pick<Refusal, 'message'> & { code: string }): ToolError {
  return {
    code: refusal.code,
    message: refusal.message,
    remediation: 'Nothing changed. Choose a different action that the current view of the run allows.',
  };
}

const RefusalShapeSchema = z.object({ code: z.string().min(1), message: z.string().min(1) });

/**
 * The one place where anything that went wrong becomes a `ToolError`. A thrown `ToolFailure` passes through,
 * a bad input becomes `invalid-input` with the offending fields, and everything else collapses to a fixed
 * message: an unexpected error is never described to the agent, so no stack or internal can leak.
 */
export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolFailure) return error.toolError;
  if (error instanceof z.ZodError) {
    const fields = error.issues.map((issue) => issue.path.join('.') || '(input)').join(', ');
    return {
      code: TOOL_ERROR_CODES.invalidInput,
      message: `The tool input is not valid: ${fields}.`,
      remediation: "Read the tool's input schema from tools/list and call it again with valid arguments.",
    };
  }
  const refusal = RefusalShapeSchema.safeParse(error);
  if (refusal.success) return refusalToToolError(refusal.data);
  return {
    code: TOOL_ERROR_CODES.internal,
    message: 'The server could not complete the request.',
    remediation: 'Try again. If it keeps failing, tell the player the game server has a problem.',
  };
}
