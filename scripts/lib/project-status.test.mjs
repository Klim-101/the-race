// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { STATUS, syncProjectStatus } from '../../.github/scripts/project-status.mjs';

function createFakeGithub({ openIssues, closedIssues, statusByNodeId }) {
  const writes = [];
  const listForRepo = Symbol('listForRepo');
  const github = {
    rest: { issues: { listForRepo } },
    paginate: async (route, parameters) => {
      if (route === listForRepo) {
        return parameters.state === 'closed' ? closedIssues : openIssues;
      }
      return [];
    },
    graphql: async (query, variables) => {
      if (query.includes('projectV2(number')) {
        const options = Object.values(STATUS).map((name) => ({ id: `option-${name}`, name }));
        return { user: { projectV2: { id: 'project', field: { id: 'field', options } } } };
      }
      if (query.includes('addProjectV2ItemById')) {
        return { addProjectV2ItemById: { item: { id: `item-${variables.contentId}` } } };
      }
      if (query.includes('fieldValueByName')) {
        const nodeId = variables.itemId.replace('item-', '');
        const name = statusByNodeId[nodeId];
        return { node: { fieldValueByName: name === undefined ? null : { name } } };
      }
      writes.push({ itemId: variables.itemId, optionId: variables.optionId });
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.itemId } } };
    },
  };
  return { github, writes };
}

const noopCore = { info: () => undefined };

async function reconcile(fake) {
  await syncProjectStatus({
    github: fake.github,
    context: { eventName: 'schedule', repo: { owner: 'o', repo: 'r' }, payload: {} },
    core: noopCore,
    projectOwner: 'o',
    projectNumber: 1,
  });
}

describe('reconciling the board', () => {
  it('marks a closed roadmap task Done when its status is not Done', async () => {
    const fake = createFakeGithub({
      openIssues: [],
      closedIssues: [{ node_id: 'stale', number: 1 }],
      statusByNodeId: { stale: STATUS.ready },
    });

    await reconcile(fake);

    expect(fake.writes).toEqual([{ itemId: 'item-stale', optionId: `option-${STATUS.done}` }]);
  });

  it('leaves a closed task that is already Done, a status-less one aside, and skips pull requests', async () => {
    const fake = createFakeGithub({
      openIssues: [],
      closedIssues: [
        { node_id: 'done', number: 1 },
        { node_id: 'unset', number: 2 },
        { node_id: 'pr', number: 3, pull_request: {} },
      ],
      statusByNodeId: { done: STATUS.done },
    });

    await reconcile(fake);

    expect(fake.writes).toEqual([{ itemId: 'item-unset', optionId: `option-${STATUS.done}` }]);
  });
});
