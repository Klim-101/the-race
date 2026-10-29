// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderRoadmap } from '../../.github/scripts/render-roadmap.mjs';

const ROADMAP = [
  '# Roadmap',
  '',
  '<!-- roadmap:progress:start -->',
  '<!-- roadmap:progress:end -->',
  '',
  '## Phase 0 — Foundation',
  '',
].join('\n');

function fakeGithub(milestones) {
  return {
    paginate: () => Promise.resolve(milestones),
    rest: { issues: { listMilestones: () => undefined } },
  };
}

function milestone(title, openIssues, closedIssues, state = 'open') {
  return { title, open_issues: openIssues, closed_issues: closedIssues, state };
}

describe('renderRoadmap', () => {
  let directory;
  let roadmapPath;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'race-roadmap-'));
    roadmapPath = join(directory, 'ROADMAP.md');
    writeFileSync(roadmapPath, ROADMAP);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('renders phases in order with their status, ignoring other milestones', async () => {
    const github = fakeGithub([
      milestone('Phase 1 — Engine core', 9, 0),
      milestone('Defects', 1, 1),
      milestone('Phase 0 — Foundation', 0, 8),
      milestone('Phase 2 — First playable run', 5, 2),
    ]);

    const changed = await renderRoadmap({ github, owner: 'o', repo: 'r', roadmapPath, today: '2026-10-30' });

    expect(changed).toBe(true);
    const lines = readFileSync(roadmapPath, 'utf8').split('\n');
    const rows = lines.filter((line) => line.startsWith('| Phase '));
    expect(
      rows.map((row) =>
        row
          .split('|')
          .map((cell) => cell.trim())
          .slice(1, 4),
      ),
    ).toEqual([
      ['Phase', 'Status', 'Progress'],
      ['Phase 0 — Foundation', 'done', '8 / 8'],
      ['Phase 1 — Engine core', 'planned', '0 / 9'],
      ['Phase 2 — First playable run', 'in progress', '2 / 7'],
    ]);
    expect(lines).toContain('_Last synchronized: 2026-10-30._');
  });

  it('reports no change when only the date would differ', async () => {
    const github = fakeGithub([milestone('Phase 0 — Foundation', 1, 1)]);
    await renderRoadmap({ github, owner: 'o', repo: 'r', roadmapPath, today: '2026-10-30' });

    const changed = await renderRoadmap({ github, owner: 'o', repo: 'r', roadmapPath, today: '2026-10-31' });

    expect(changed).toBe(false);
  });

  it('fails when the markers are missing', async () => {
    writeFileSync(roadmapPath, '# Roadmap\n');

    await expect(
      renderRoadmap({ github: fakeGithub([]), owner: 'o', repo: 'r', roadmapPath, today: '2026-10-30' }),
    ).rejects.toThrow('Roadmap markers are missing');
  });
});
