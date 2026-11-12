// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView, LinkKind } from '@the-race/engine';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

/**
 * The links still to be made as empty slots, one box for each clue the link takes, smallest first, grouped by size
 * and by what the link is about. They are the engine's counts, sizes and kinds and nothing more: never which clues,
 * and never which suspect or what the answer is.
 */
export function renderOpenSlots(view: DetectiveRunView, text: TabText): string {
  const { open, size, group, kinds, allDrawn } = text.links;
  // The engine keeps the kinds in the order of the sizes, so the same index is the same conclusion.
  const counts = new Map<string, { n: number; kind: LinkKind | undefined; count: number }>();
  view.openLinks.forEach((n, index) => {
    const kind = view.openLinkKinds[index];
    const key = `${String(n)}:${kind ?? ''}`;
    const entry = counts.get(key) ?? { n, kind, count: 0 };
    counts.set(key, { ...entry, count: entry.count + 1 });
  });
  const slots = [...counts.values()].map(({ n, kind, count }) => {
    const label = group.replace('{count}', String(count)).replace('{size}', size.replace('{n}', String(n)));
    return `<span class="open-slot">${'<i></i>'.repeat(n)} ${escapeHtml(kind === undefined ? label : `${label}, ${kinds[kind]}`)}</span>`;
  });
  return `<h2>${escapeHtml(text.tree.open)}</h2>
<div class="open-slots" aria-label="${escapeHtml(open)}">${view.openLinks.length === 0 ? `<span class="empty">${escapeHtml(allDrawn)}</span>` : slots.join('')}</div>
<p class="note">${escapeHtml(text.tree.note)}</p>`;
}
