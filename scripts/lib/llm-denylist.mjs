// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const DENIED_EXACT_NAMES = new Set(['openai', 'ai', 'langchain', 'ollama']);
const DENIED_NAME_PREFIXES = [
  '@anthropic-ai/',
  '@google/genai',
  '@google/generative-ai',
  '@google-cloud/vertexai',
  '@azure/openai',
  '@langchain/',
  '@mistralai/',
  'cohere-ai',
];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const SKIPPED_DIRECTORY_NAMES = new Set(['node_modules', '.git', 'dist', 'coverage']);

export function isDeniedPackageName(name) {
  return DENIED_EXACT_NAMES.has(name) || DENIED_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Every denied dependency a manifest declares, in any dependency field. */
export function findDeniedDependencies(manifest) {
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.keys(manifest[field] ?? {})
      .filter(isDeniedPackageName)
      .map((name) => ({ name, field })),
  );
}

export function findManifestPaths(directory) {
  const manifestPaths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        manifestPaths.push(...findManifestPaths(join(directory, entry.name)));
      }
    } else if (entry.name === 'package.json') {
      manifestPaths.push(join(directory, entry.name));
    }
  }
  return manifestPaths;
}
