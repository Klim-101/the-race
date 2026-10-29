// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// The licenses a runtime dependency may carry without further sign-off.
export const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Python-2.0',
];

// A license outside the allowlist ships only with explicit maintainer approval, pinned to the
// exact approved `name@version`: an upgrade needs a fresh approval, not a silent pass.
const APPROVED_LICENSE_EXCEPTIONS = new Set([]);

/**
 * Recursively collects every non-workspace `name@version` pair out of an `npm ls --json` tree.
 * Skips `@the-race/*` entries: this project's own packages.
 */
export function collectProductionDependencies(dependencies) {
  const found = new Map();
  walk(dependencies);
  return found;

  function walk(node) {
    if (node === undefined) {
      return;
    }
    for (const [name, info] of Object.entries(node)) {
      if (!name.startsWith('@the-race/') && typeof info.version === 'string') {
        found.set(`${name}@${info.version}`, { name, version: info.version });
      }
      walk(info.dependencies);
    }
  }
}

/**
 * Whether a license expression (`"MIT"`, `"(MIT OR Apache-2.0)"`) satisfies `allowedLicenses`: an
 * OR-expression is satisfied by any one of its alternatives.
 */
export function isLicenseAllowed(licenseExpression, allowedLicenses = ALLOWED_LICENSES) {
  if (typeof licenseExpression !== 'string') {
    return false;
  }
  const alternatives = licenseExpression.replace(/[()]/g, '').split(/\s+OR\s+/i);
  return alternatives.some((license) => allowedLicenses.includes(license.trim()));
}

/**
 * Cross-references every production dependency against a `license-checker-rseidelsohn --json`
 * report. A dependency absent from the report is itself a violation, not silently skipped.
 */
export function findLicenseViolations(
  dependencyVersions,
  licenseReport,
  allowedLicenses = ALLOWED_LICENSES,
  approvedExceptions = APPROVED_LICENSE_EXCEPTIONS,
) {
  const violations = [];
  for (const key of dependencyVersions.keys()) {
    if (approvedExceptions.has(key)) {
      continue;
    }
    const entry = licenseReport[key];
    if (entry === undefined) {
      violations.push({ dependency: key, reason: 'not found in the license report' });
      continue;
    }
    if (!isLicenseAllowed(entry.licenses, allowedLicenses)) {
      violations.push({ dependency: key, reason: `disallowed license "${String(entry.licenses)}"` });
    }
  }
  return violations.sort((a, b) => a.dependency.localeCompare(b.dependency));
}
