// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

export const STATUS = Object.freeze({
  todo: 'Todo',
  ready: 'Ready',
  inProgress: 'In progress',
  inReview: 'In review',
  blocked: 'Blocked',
  done: 'Done',
});

const BLOCKED_LABEL = 'blocked';
const ROADMAP_LABEL = 'roadmap';
const BRANCH_ISSUE_PATTERN = /^[a-z]+\/(\d+)-/;

/**
 * Keeps the project board Status field in sync with issue, pull request, branch and dependency events.
 * Waiting on open dependencies is `Todo`; all dependencies closed is `Ready`; the `blocked` label is `Blocked`.
 */
export async function syncProjectStatus({ github, context, core, projectOwner, projectNumber }) {
  const project = await loadProject(github, projectOwner, projectNumber);
  const board = createBoard(github, project, core);
  const { owner, repo } = context.repo;
  const payload = context.payload;

  switch (context.eventName) {
    case 'issues':
      await handleIssueEvent({ github, owner, repo, board, payload });
      return;
    case 'pull_request_target':
      await handlePullRequestEvent({ github, owner, repo, board, payload });
      return;
    case 'create':
      await handleBranchCreated({ github, owner, repo, board, payload });
      return;
    case 'schedule':
    case 'workflow_dispatch':
      await reconcileOpenIssues({ github, owner, repo, board });
      return;
    default:
      core.info(`Event ${context.eventName} is not handled.`);
  }
}

async function handleIssueEvent({ github, owner, repo, board, payload }) {
  const { issue, action, label } = payload;
  if (issue.pull_request) {
    return;
  }

  if (action === 'closed') {
    await board.setStatus(issue.node_id, STATUS.done);
    await promoteUnblockedDependents({ github, owner, repo, board, issueNumber: issue.number });
    return;
  }

  const isBlockedLabelChange =
    (action === 'labeled' || action === 'unlabeled') && label?.name === BLOCKED_LABEL;
  if (action === 'opened' || action === 'reopened' || isBlockedLabelChange) {
    // Two webhook deliveries for the same issue (for example a stale "labeled" event queued
    // behind a "closed" one) can process out of order under this workflow's concurrency group;
    // re-reading the issue here stops a late, no-longer-accurate event from undoing Done.
    const { data: current } = await github.rest.issues.get({ owner, repo, issue_number: issue.number });
    if (current.state === 'closed') {
      await board.setStatus(issue.node_id, STATUS.done);
      return;
    }
    await board.setStatus(issue.node_id, await resolveOpenStatus({ github, owner, repo, issue: current }));
  }
}

async function handlePullRequestEvent({ github, owner, repo, board, payload }) {
  const { pull_request: pullRequest, action } = payload;
  const linkedIssues = await loadClosingIssues(github, owner, repo, pullRequest.number);
  if (linkedIssues.length === 0) {
    return;
  }

  let status;
  if (action === 'closed') {
    // A merged pull request closes its issues, and the issue `closed` event marks them Done.
    if (pullRequest.merged) {
      return;
    }
    status = STATUS.ready;
  } else if (pullRequest.draft || action === 'converted_to_draft') {
    status = STATUS.inProgress;
  } else {
    status = STATUS.inReview;
  }

  for (const issue of linkedIssues) {
    if (issue.state === 'OPEN') {
      await board.setStatus(issue.id, status);
    }
  }
}

async function handleBranchCreated({ github, owner, repo, board, payload }) {
  if (payload.ref_type !== 'branch') {
    return;
  }
  const match = BRANCH_ISSUE_PATTERN.exec(payload.ref);
  if (!match) {
    return;
  }
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: Number(match[1]) });
  if (issue.state === 'open' && !issue.pull_request) {
    await board.setStatus(issue.node_id, STATUS.inProgress);
  }
}

async function reconcileOpenIssues({ github, owner, repo, board }) {
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });
  for (const issue of issues) {
    if (issue.pull_request) {
      continue;
    }
    const current = await board.getStatus(issue.node_id);
    // Active work is driven by branch and pull request events; reconciliation only fixes waiting states.
    if (current === STATUS.inProgress || current === STATUS.inReview) {
      continue;
    }
    await board.setStatus(issue.node_id, await resolveOpenStatus({ github, owner, repo, issue }));
  }

  // A `closed` event whose run failed (for example an expired project token) is never replayed,
  // so a closed roadmap task would stay on its last status forever.
  const closedTasks = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'closed',
    labels: ROADMAP_LABEL,
    per_page: 100,
  });
  for (const issue of closedTasks) {
    if (issue.pull_request) {
      continue;
    }
    if ((await board.getStatus(issue.node_id)) !== STATUS.done) {
      await board.setStatus(issue.node_id, STATUS.done);
    }
  }
}

async function promoteUnblockedDependents({ github, owner, repo, board, issueNumber }) {
  const dependents = await listDependencies(github, owner, repo, issueNumber, 'blocking');
  for (const dependent of dependents) {
    if (dependent.state !== 'open') {
      continue;
    }
    const current = await board.getStatus(dependent.node_id);
    if (current === STATUS.inProgress || current === STATUS.inReview) {
      continue;
    }
    await board.setStatus(
      dependent.node_id,
      await resolveOpenStatus({ github, owner, repo, issue: dependent }),
    );
  }
}

async function resolveOpenStatus({ github, owner, repo, issue }) {
  if (issue.labels.some((label) => (typeof label === 'string' ? label : label.name) === BLOCKED_LABEL)) {
    return STATUS.blocked;
  }
  const blockers = await listDependencies(github, owner, repo, issue.number, 'blocked_by');
  return blockers.some((blocker) => blocker.state === 'open') ? STATUS.todo : STATUS.ready;
}

async function listDependencies(github, owner, repo, issueNumber, relation) {
  return github.paginate(`GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/${relation}`, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
}

async function loadClosingIssues(github, owner, repo, pullRequestNumber) {
  const result = await github.graphql(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          closingIssuesReferences(first: 20) { nodes { id state } }
        }
      }
    }`,
    { owner, repo, number: pullRequestNumber },
  );
  return result.repository.pullRequest.closingIssuesReferences.nodes;
}

async function loadProject(github, projectOwner, projectNumber) {
  const result = await github.graphql(
    `query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id
          field(name: "Status") {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
        }
      }
    }`,
    { login: projectOwner, number: projectNumber },
  );
  const project = result.user?.projectV2;
  if (!project?.field) {
    throw new Error(`Project ${projectOwner}/${projectNumber} or its Status field was not found.`);
  }
  const missing = Object.values(STATUS).filter(
    (name) => !project.field.options.some((option) => option.name === name),
  );
  if (missing.length > 0) {
    throw new Error(`Status field is missing options: ${missing.join(', ')}.`);
  }
  return project;
}

function createBoard(github, project, core) {
  const optionIdByName = new Map(project.field.options.map((option) => [option.name, option.id]));
  const itemIdByContentId = new Map();

  async function ensureItem(contentId) {
    const cached = itemIdByContentId.get(contentId);
    if (cached) {
      return cached;
    }
    // Adding an existing item is idempotent and returns the existing item ID.
    const result = await github.graphql(
      `mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
      }`,
      { projectId: project.id, contentId },
    );
    const itemId = result.addProjectV2ItemById.item.id;
    itemIdByContentId.set(contentId, itemId);
    return itemId;
  }

  return {
    async getStatus(contentId) {
      const itemId = await ensureItem(contentId);
      const result = await github.graphql(
        `query($itemId: ID!) {
          node(id: $itemId) {
            ... on ProjectV2Item {
              fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            }
          }
        }`,
        { itemId },
      );
      return result.node?.fieldValueByName?.name ?? null;
    },

    async setStatus(contentId, statusName) {
      const itemId = await ensureItem(contentId);
      await github.graphql(
        `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
            value: { singleSelectOptionId: $optionId }
          }) { projectV2Item { id } }
        }`,
        {
          projectId: project.id,
          itemId,
          fieldId: project.field.id,
          optionId: optionIdByName.get(statusName),
        },
      );
      core.info(`${contentId} -> ${statusName}`);
    },
  };
}
