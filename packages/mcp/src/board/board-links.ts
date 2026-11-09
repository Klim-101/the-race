// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

/**
 * The links still to be made as empty slots, one box for each clue the link takes, smallest first. They are the
 * engine's counts and sizes and nothing more: never which clues, and never which conclusion a link would draw.
 */
export function renderOpenSlots(view: DetectiveRunView, text: TabText): string {
  const { open, size, group, allDrawn } = text.links;
  const counts = new Map<number, number>();
  for (const n of view.openLinks) counts.set(n, (counts.get(n) ?? 0) + 1);
  const slots = [...counts].map(
    ([n, count]) =>
      `<span class="open-slot">${'<i></i>'.repeat(n)} ${escapeHtml(group.replace('{count}', String(count)).replace('{size}', size.replace('{n}', String(n))))}</span>`,
  );
  return `<h2>${escapeHtml(text.tree.open)}</h2>
<div class="open-slots" aria-label="${escapeHtml(open)}">${view.openLinks.length === 0 ? `<span class="empty">${escapeHtml(allDrawn)}</span>` : slots.join('')}</div>
<p class="note">${escapeHtml(text.tree.note)}</p>`;
}
