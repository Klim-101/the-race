// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';
import { ToolFailure } from './tool-error.js';
import { fakeContext } from '../test/fake-context.js';

const echo = defineTool({
  name: 'echo',
  description: 'Echoes a number.',
  inputSchema: z.object({ n: z.number() }),
  outputSchema: z.object({ n: z.number() }),
  handler: ({ n }) => Promise.resolve({ n }),
});

describe('defineTool', () => {
  it('returns compact JSON text and the same value as structured content', async () => {
    const result = await echo.run({ n: 3 }, fakeContext());
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ n: 3 });
    expect(result.content).toEqual([{ type: 'text', text: '{"n":3}' }]);
  });

  it('turns an invalid input into a structured error', async () => {
    const result = await echo.run({ n: 'x' }, fakeContext());
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: 'invalid-input' } });
  });

  it('turns a ToolFailure into the error it carries', async () => {
    const error = { code: 'no-run', message: 'There is no run.', remediation: 'Start one.' };
    const failing = defineTool({
      name: 'failing',
      description: 'Always fails.',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      handler: () => Promise.reject(new ToolFailure(error)),
    });
    const result = await failing.run({}, fakeContext());
    expect(result).toMatchObject({ isError: true, structuredContent: { error } });
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ error }) }]);
  });

  it('does not let a handler that drifts from its output schema through', async () => {
    const drifting = defineTool({
      name: 'drifting',
      description: 'Returns the wrong shape.',
      inputSchema: z.object({}),
      outputSchema: z.object({ n: z.number() }),
      handler: () => Promise.resolve({ n: 'x' } as unknown as { n: number }),
    });
    const result = await drifting.run({}, fakeContext());
    expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: 'invalid-input' } } });
  });

  it('hides an unexpected error', async () => {
    const crashing = defineTool({
      name: 'crashing',
      description: 'Throws.',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      handler: () => Promise.reject(new Error('stack and path')),
    });
    const result = await crashing.run({}, fakeContext());
    expect(JSON.stringify(result)).not.toContain('stack and path');
    expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: 'internal-error' } } });
  });
});
