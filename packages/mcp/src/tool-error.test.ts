// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  TOOL_ERROR_CODES,
  ToolErrorSchema,
  ToolFailure,
  refusalToToolError,
  toToolError,
} from './tool-error.js';

describe('toToolError', () => {
  it('passes a ToolFailure through unchanged', () => {
    const toolError = { code: 'no-run', message: 'There is no run.', remediation: 'Start one.' };
    expect(toToolError(new ToolFailure(toolError))).toEqual(toolError);
  });

  it('turns an engine refusal into a structured error that keeps the refusal code', () => {
    const result = toToolError({ code: 'locked', message: 'The way is locked.' });
    expect(result.code).toBe('locked');
    expect(result.message).toBe('The way is locked.');
    expect(result.remediation).not.toBe('');
    expect(result).toEqual(refusalToToolError({ code: 'locked', message: 'The way is locked.' }));
  });

  it('names the invalid fields of a bad input', () => {
    const parsed = z.object({ a: z.string(), b: z.object({ c: z.number() }) }).safeParse({ b: { c: 'x' } });
    const result = toToolError(parsed.error);
    expect(result.code).toBe(TOOL_ERROR_CODES.invalidInput);
    expect(result.message).toContain('a, b.c');
  });

  it('names the whole input when the failure has no path', () => {
    const result = toToolError(z.object({}).safeParse(1).error);
    expect(result.message).toContain('(input)');
  });

  it('never describes an unexpected error', () => {
    const boom = new Error('ENOENT: C:\\secret\\path', { cause: 'x' });
    for (const thrown of [boom, 'a string', undefined, { code: '', message: '' }]) {
      const result = toToolError(thrown);
      expect(result.code).toBe(TOOL_ERROR_CODES.internal);
      expect(JSON.stringify(result)).not.toContain('secret');
      expect(ToolErrorSchema.safeParse(result).success).toBe(true);
    }
  });
});
