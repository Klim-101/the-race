// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

/** The links still to be made by size, as the engine says them: counts only, smallest first, never which clues. */
function openLinks(view: DetectiveRunView, text: TabText): string {
  const { open, size, group, allDrawn } = text.links;
  const counts = new Map<number, number>();
  for (const n of view.openLinks) counts.set(n, (counts.get(n) ?? 0) + 1);
  const groups = [...counts]
    .map(([n, count]) =>
      escapeHtml(group.replace('{count}', String(count)).replace('{size}', size.replace('{n}', String(n)))),
    )
    .join(', ');
  return `<p class="card"><strong>${escapeHtml(open)}:</strong> ${view.openLinks.length === 0 ? escapeHtml(allDrawn) : groups}</p>
`;
}

/** What is still to be linked; what each conclusion was drawn from is on the conclusion itself. */
export function renderLinks(view: DetectiveRunView, text: TabText): string {
  const open = openLinks(view, text);
  if (view.clues.length === 0 && view.insights.length === 0) {
    return `${open}<p class="empty">${escapeHtml(text.links.none)}</p>`;
  }
  return open;
}
