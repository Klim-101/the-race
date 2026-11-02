// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { SERVER_DIR } from './plugin-generator.mjs';

// The plugin is installed by copying its own folder, so the MCP server cannot be started from a checkout of
// the repository: it is bundled, with every dependency, into one file inside the plugin, and so is the one
// data file it reads. The bundle is made from the sources, so it needs no earlier `npm run build`.

/** The bundle, in the plugin's `server/` folder, which the plugin generator leaves alone. */
export const SERVER_FILE = 'main.mjs';

const WORKSPACE_PACKAGES = ['engine', 'news', 'saves', 'mcp'];

/** The line of `shipped-feeds.ts` that names where the feed list is: three levels up from the source. */
const FEEDS_IN_REPOSITORY = "new URL('../../../content/feeds.json', import.meta.url)";
/** Beside the bundle, in the plugin: `server/main.mjs` and `server/content/feeds.json`. */
const FEEDS_IN_PLUGIN = "new URL('./content/feeds.json', import.meta.url)";

/** An esbuild plugin that points the feed list at the copy that sits beside the bundle. */
const feedsBesideBundle = {
  name: 'feeds-beside-bundle',
  setup(buildContext) {
    buildContext.onLoad({ filter: /shipped-feeds\.ts$/ }, async (args) => {
      const { readFile } = await import('node:fs/promises');
      const source = await readFile(args.path, 'utf8');
      if (!source.includes(FEEDS_IN_REPOSITORY)) {
        throw new Error('shipped-feeds.ts no longer names the feed list the way the bundle expects.');
      }
      return { contents: source.replace(FEEDS_IN_REPOSITORY, FEEDS_IN_PLUGIN), loader: 'ts' };
    });
  },
};

/**
 * Bundles the MCP server of the repository at `root` into `<pluginDir>/server/` and returns the bundle's path.
 * The workspace packages are read from their sources, so that nothing needs to be built first.
 */
export async function bundleServer(root, pluginDir) {
  const outdir = join(pluginDir, SERVER_DIR);
  mkdirSync(join(outdir, 'content'), { recursive: true });
  await build({
    entryPoints: { main: join(root, 'packages', 'mcp', 'src', 'main.ts') },
    outdir,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // An ES module has no `require`, which some of the bundled dependencies still use.
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
    },
    alias: Object.fromEntries(
      WORKSPACE_PACKAGES.map((name) => [
        `@the-race/${name}`,
        join(root, 'packages', name, 'src', 'index.ts'),
      ]),
    ),
    plugins: [feedsBesideBundle],
    legalComments: 'none',
    logLevel: 'silent',
  });
  cpSync(join(root, 'content', 'feeds.json'), join(outdir, 'content', 'feeds.json'));
  return join(outdir, SERVER_FILE);
}

const BUNDLED_FILES = [SERVER_FILE, 'content/feeds.json'];

/**
 * Bundles into a folder of its own and compares with what is committed under `pluginDir`; returns the files
 * that are missing or differ, which is empty when the bundle is current.
 */
export async function findStaleBundle(root, pluginDir) {
  const scratch = mkdtempSync(join(tmpdir(), 'race-bundle-'));
  try {
    await bundleServer(root, scratch);
    return BUNDLED_FILES.flatMap((file) => {
      const committed = join(pluginDir, SERVER_DIR, file);
      if (!existsSync(committed)) return [`missing: ${SERVER_DIR}/${file}`];
      const same = readFileSync(committed, 'utf8') === readFileSync(join(scratch, SERVER_DIR, file), 'utf8');
      return same ? [] : [`out of date: ${SERVER_DIR}/${file}`];
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
