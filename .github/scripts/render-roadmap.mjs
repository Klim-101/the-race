// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { readFile, writeFile } from 'node:fs/promises';
import prettier from 'prettier';

const START_MARKER = '<!-- roadmap:progress:start -->';
const END_MARKER = '<!-- roadmap:progress:end -->';
const PHASE_TITLE_PATTERN = /^Phase (\d+) — /;

/**
 * Rewrites the generated progress table in the roadmap from repository milestones.
 * Returns true when the file content changed.
 */
export async function renderRoadmap({ github, owner, repo, roadmapPath, today }) {
  const milestones = await github.paginate(github.rest.issues.listMilestones, {
    owner,
    repo,
    state: 'all',
    per_page: 100,
  });

  const phases = milestones
    .map((milestone) => ({ milestone, match: PHASE_TITLE_PATTERN.exec(milestone.title) }))
    .filter(({ match }) => match !== null)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]))
    .map(({ milestone }) => milestone);

  const rows = phases.map((milestone) => {
    const total = milestone.open_issues + milestone.closed_issues;
    return `| ${milestone.title} | ${describeStatus(milestone, total)} | ${milestone.closed_issues} / ${total} |`;
  });

  const section = [
    START_MARKER,
    '| Phase | Status | Progress |',
    '|---|---|---|',
    ...rows,
    '',
    `_Last synchronized: ${today}._`,
    END_MARKER,
  ].join('\n');

  const current = await readFile(roadmapPath, 'utf8');
  const startIndex = current.indexOf(START_MARKER);
  const endIndex = current.indexOf(END_MARKER);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`Roadmap markers are missing in ${roadmapPath}.`);
  }

  const rawNext = current.slice(0, startIndex) + section + current.slice(endIndex + END_MARKER.length);
  // Format before comparing, not after: `current` is already Prettier-formatted (CI checks it),
  // so comparing it against unformatted `rawNext` reported a change on every run, even when
  // nothing but table whitespace would differ, and left nothing for git to commit.
  const next = await prettier.format(rawNext, {
    ...(await prettier.resolveConfig(roadmapPath)),
    filepath: roadmapPath,
  });
  // The date line changes every day, so compare without it to avoid daily no-op pull requests.
  if (withoutSyncDate(next) === withoutSyncDate(current)) {
    return false;
  }
  await writeFile(roadmapPath, next);
  return true;
}

function describeStatus(milestone, total) {
  if (milestone.state === 'closed' || (total > 0 && milestone.open_issues === 0)) {
    return 'done';
  }
  return milestone.closed_issues > 0 ? 'in progress' : 'planned';
}

function withoutSyncDate(content) {
  return content.replace(/_Last synchronized: [^_]*_/, '');
}
