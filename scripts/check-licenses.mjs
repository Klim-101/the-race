// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// license-checker-rseidelsohn only walks node_modules physically nested under its own --start:
// from a workspace package directory it misses everything npm's hoisting placed at the
// repo root, and from the repo root itself `--production` finds nothing because the root
// package.json declares no "dependencies" of its own to seed the walk with. This script instead
// asks npm — which already resolves hoisting correctly — for the real, per-workspace production
// dependency graph, then cross-references it against one unfiltered, repo-root license scan (which
// does see every hoisted and nested package, since nothing here restricts what it walks).
import { execFileSync } from 'node:child_process';
import { collectProductionDependencies, findLicenseViolations } from './lib/license-policy.mjs';

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  console.error('check-licenses.mjs must be invoked through an npm script (npm_execpath is unset).');
  process.exit(1);
}

const dependencyTree = runNpm([
  'ls',
  '--omit=dev',
  '--all',
  '--json',
  '--workspaces',
  '--include-workspace-root=false',
]);
const dependencyVersions = collectProductionDependencies(dependencyTree.dependencies);
const licenseReport = runNpm([
  'exec',
  '--yes=false',
  '--',
  'license-checker-rseidelsohn',
  '--json',
  '--start',
  '.',
]);
const violations = findLicenseViolations(dependencyVersions, licenseReport);

if (violations.length > 0) {
  console.error(`${String(violations.length)} production dependency license violation(s):`);
  for (const violation of violations) {
    console.error(`  ${violation.dependency}: ${violation.reason}`);
  }
  process.exit(1);
}

console.log(`${String(dependencyVersions.size)} production dependencies checked, all licenses allowed.`);

/**
 * Runs an npm subcommand through the exact npm CLI already running this script (see
 * `run-workspaces.mjs` for why: on Windows, npm's real entry point is `npm.cmd`, which
 * `execFileSync` cannot resolve without a shell, and this project never spawns one). `npm ls` can
 * exit non-zero on an unrelated tree issue (an extraneous or invalid package) while still printing
 * valid JSON to stdout, so only a JSON parse failure is treated as fatal here.
 */
function runNpm(args) {
  let output;
  try {
    output = execFileSync(process.execPath, [npmExecPath, ...args], { encoding: 'utf-8' });
  } catch (error) {
    output = typeof error.stdout === 'string' ? error.stdout : '';
    if (output === '') {
      console.error(`npm ${args.join(' ')} failed:`, error.message);
      process.exit(1);
    }
  }
  try {
    return JSON.parse(output);
  } catch (error) {
    console.error(`npm ${args.join(' ')} did not produce valid JSON:`, error.message);
    process.exit(1);
  }
}
