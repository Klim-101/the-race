// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { collectProductionDependencies, findLicenseViolations, isLicenseAllowed } from './license-policy.mjs';

describe('collectProductionDependencies', () => {
  it('collects a dependency and its transitive dependency, deduplicated by name@version', () => {
    const tree = {
      zod: { version: '4.6.7' },
      '@the-race/engine': {
        version: '0.0.0',
        dependencies: { zod: { version: '4.6.7' }, tslib: { version: '2.8.1' } },
      },
    };

    expect([...collectProductionDependencies(tree).keys()].sort()).toEqual(['tslib@2.8.1', 'zod@4.6.7']);
  });

  it("skips this project's own workspace packages", () => {
    expect(collectProductionDependencies({ '@the-race/engine': { version: '0.0.0' } }).size).toBe(0);
  });

  it('returns an empty map for an undefined dependency tree', () => {
    expect(collectProductionDependencies(undefined).size).toBe(0);
  });
});

describe('isLicenseAllowed', () => {
  it('accepts a license on the allowlist and rejects one outside it', () => {
    expect(isLicenseAllowed('MIT')).toBe(true);
    expect(isLicenseAllowed('GPL-3.0')).toBe(false);
  });

  it('accepts an OR-expression when one alternative is allowed', () => {
    expect(isLicenseAllowed('(GPL-3.0 OR MIT)')).toBe(true);
  });

  it('rejects a non-string license value', () => {
    expect(isLicenseAllowed(undefined)).toBe(false);
  });
});

describe('findLicenseViolations', () => {
  const dependencyVersions = collectProductionDependencies({ zod: { version: '4.6.7' } });

  it('reports nothing when every dependency has an allowed license', () => {
    expect(findLicenseViolations(dependencyVersions, { 'zod@4.6.7': { licenses: 'MIT' } })).toEqual([]);
  });

  it('reports a disallowed license and a dependency missing from the report', () => {
    const versions = collectProductionDependencies({ zod: { version: '4.6.7' }, gpl: { version: '1.0.0' } });

    expect(findLicenseViolations(versions, { 'gpl@1.0.0': { licenses: 'GPL-3.0' } })).toEqual([
      { dependency: 'gpl@1.0.0', reason: 'disallowed license "GPL-3.0"' },
      { dependency: 'zod@4.6.7', reason: 'not found in the license report' },
    ]);
  });

  it('lets an approved exact version through', () => {
    expect(findLicenseViolations(dependencyVersions, {}, undefined, new Set(['zod@4.6.7']))).toEqual([]);
  });
});
