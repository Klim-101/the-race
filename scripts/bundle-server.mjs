// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// `node scripts/bundle-server.mjs` bundles the MCP server into plugins/the-race/server/, where the plugin's
// launcher finds it. Run it (`npm run bundle`) and commit the result when the server changes. With `--check` it
// writes nothing and fails when the committed bundle differs from the sources (`npm run bundle:check`).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleServer, findStaleBundle } from './lib/bundle-server.mjs';
import { PLUGIN_DIR } from './lib/plugin-generator.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = join(root, PLUGIN_DIR);
if (process.argv.includes('--check')) {
  const problems = await findStaleBundle(root, pluginDir);
  if (problems.length > 0) {
    console.error(`The server bundle is stale:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    console.error('Run `npm run bundle` and commit the result.');
    process.exit(1);
  }
  console.log('The server bundle is current.');
} else {
  console.log(`Wrote ${await bundleServer(root, pluginDir)}`);
}
