// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// The game makes no model calls: every bit of reasoning runs in the player's own agent host on
// their own subscription. No package.json in the repository may depend on an LLM SDK.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDeniedDependencies, findManifestPaths } from './lib/llm-denylist.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
let hasViolation = false;

for (const manifestPath of findManifestPaths(repoRoot)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const { name, field } of findDeniedDependencies(manifest)) {
    console.error(`${relative(repoRoot, manifestPath)}: "${name}" in ${field} is an LLM SDK dependency.`);
    hasViolation = true;
  }
}

if (hasViolation) process.exit(1);
console.log('No LLM SDK dependencies found.');
