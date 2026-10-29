// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findDeniedDependencies, findManifestPaths, isDeniedPackageName } from './llm-denylist.mjs';

describe('isDeniedPackageName', () => {
  it('denies LLM SDKs by exact name and by scope', () => {
    expect(isDeniedPackageName('openai')).toBe(true);
    expect(isDeniedPackageName('@anthropic-ai/sdk')).toBe(true);
    expect(isDeniedPackageName('@langchain/core')).toBe(true);
  });

  it('allows unrelated packages with similar names', () => {
    expect(isDeniedPackageName('zod')).toBe(false);
    expect(isDeniedPackageName('aid')).toBe(false);
  });
});

describe('findDeniedDependencies', () => {
  it('checks every dependency field', () => {
    const manifest = {
      dependencies: { zod: '4.6.7', openai: '1.0.0' },
      devDependencies: { '@anthropic-ai/sdk': '1.0.0' },
    };

    expect(findDeniedDependencies(manifest)).toEqual([
      { name: 'openai', field: 'dependencies' },
      { name: '@anthropic-ai/sdk', field: 'devDependencies' },
    ]);
  });
});

describe('findManifestPaths', () => {
  let root;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds nested manifests and skips node_modules', () => {
    root = mkdtempSync(join(tmpdir(), 'race-denylist-'));
    mkdirSync(join(root, 'packages', 'engine'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'openai'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(join(root, 'packages', 'engine', 'package.json'), '{}');
    writeFileSync(join(root, 'node_modules', 'openai', 'package.json'), '{}');

    expect(findManifestPaths(root).sort()).toEqual(
      [join(root, 'package.json'), join(root, 'packages', 'engine', 'package.json')].sort(),
    );
  });
});
