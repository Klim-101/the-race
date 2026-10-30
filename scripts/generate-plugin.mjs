// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// `node scripts/generate-plugin.mjs` writes plugins/the-race/ and the marketplace manifest from agents/.
// With `--check` it writes nothing and fails when the committed tree differs from what agents/ yields.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GeneratorError,
  MARKETPLACE_PATH,
  PLUGIN_DIR,
  buildPlugin,
  findStaleFiles,
  writePlugin,
} from './lib/plugin-generator.mjs';

// `--root <dir>` redirects the whole run (agents/ in, plugins/ out), so the CLI can be tried on a copy.
const rootFlag = process.argv.indexOf('--root');
const root =
  rootFlag === -1
    ? join(dirname(fileURLToPath(import.meta.url)), '..')
    : resolve(process.argv[rootFlag + 1] ?? '');
const check = process.argv.includes('--check');

// Bootstrap: before the agent layer lands there is nothing to generate and nothing committed to be stale.
if (
  check &&
  !existsSync(join(root, 'agents', 'plugin.json')) &&
  !existsSync(join(root, PLUGIN_DIR)) &&
  !existsSync(join(root, MARKETPLACE_PATH))
) {
  console.log('No agents/plugin.json yet: nothing to check.');
  process.exit(0);
}

try {
  const expected = buildPlugin(join(root, 'agents'));
  if (check) {
    const problems = findStaleFiles(root, expected);
    if (problems.length > 0) {
      console.error(`The generated plugin is stale:\n${problems.map((p) => `  ${p}`).join('\n')}`);
      console.error('Run `npm run generate` and commit the result.');
      process.exit(1);
    }
    console.log(`Generated plugin is current (${expected.size} files).`);
  } else {
    writePlugin(root, expected);
    console.log(`Wrote ${expected.size} files.`);
  }
} catch (error) {
  if (error instanceof GeneratorError) {
    console.error(`Cannot generate the plugin: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
