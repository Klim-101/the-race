// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { renderOpenSlots } from './board-links.js';
import { numberOf } from './board-opened.js';
import { clueTokens, rel, threadTokens, token } from './board-relations.js';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

// The way from the clues to a conclusion, read left to right: the clues of a link the hero tried, the link,
// the conclusion it gave and the lead the conclusion earned. It is the hero's own history and what the view
// already says, so a link that gave nothing is drawn pale and says nothing about what it nearly was.

type Insight = DetectiveRunView['insights'][number];
type Lead = DetectiveRunView['leads'][number];

/** Two lists of clue ids are the same set, whatever the order. */
const sameClues = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

function leadCard(lead: Lead, text: TabText): string {
  const words = text.leadPins;
  const [state, status] = lead.done
    ? ['done', words.doneNow]
    : !lead.openNow
      ? ['shut', words.shutNow]
      : lead.opens.length === 0
        ? ['idle', words.opensNothing]
        : ['', words.followNow];
  return `<div class="lead ${state}" data-pick="${escapeHtml(token('lead', lead.id))}" data-rel="${escapeHtml(token('lead', lead.id))}" tabindex="0" role="button"><b>${escapeHtml(words.tag.toUpperCase())}</b>${escapeHtml(lead.reason)}<br><span class="tag">${escapeHtml(status)}</span></div>`;
}

/** One branch: the clues, the link or nothing where a conclusion came another way, the conclusion and its leads. */
function branch(
  view: DetectiveRunView,
  text: TabText,
  clueIds: readonly string[],
  tried: { n: number; turn: number; result: 'insight' | 'already-known' | 'nothing' } | null,
  insight: Insight | undefined,
): string {
  const e = escapeHtml;
  const number = numberOf(view);
  const description = new Map(view.clues.map(({ id, description: line }) => [id, line]));
  const sources = clueIds
    .map((id) => {
      const line = description.get(id) ?? id;
      return `<div class="src" data-pick="${e(token('clue', id))}" data-rel="${e(rel(clueTokens(view, id)))}" tabindex="0" role="button"><span class="num">${e(number(id))}</span><span class="t">${e(line)}</span></div>`;
    })
    .join('');
  const link =
    tried === null
      ? ''
      : `<div class="linkbox"><b>${e(text.tree.linkStep.replace('{n}', String(tried.n)).replace('{turn}', String(tried.turn)))}</b>${e(text.corkboard.results[tried.result])}</div>`;
  const leads =
    insight === undefined
      ? []
      : view.leads.filter(({ source }) => source?.kind === 'deduction' && source.insightId === insight.id);
  const cold = tried?.result === 'nothing';
  return `<div class="branch${cold ? ' cold' : ''}" data-rel="${e(rel(threadTokens(clueIds)))}">
<div class="srcs">${sources}</div><div class="arrow" aria-hidden="true">▶</div>${link === '' ? '<div></div>' : link}<div class="arrow" aria-hidden="true">▶</div>
<div class="insight">${insight === undefined ? '—' : e(insight.insight)}</div><div class="arrow" aria-hidden="true">${leads.length === 0 ? '' : '▶'}</div>
<div class="leads">${leads.map((lead) => leadCard(lead, text)).join('')}</div>
</div>`;
}

/** The tried links as branches, oldest first, then the links still to be made as empty slots. */
export function renderTree(view: DetectiveRunView, text: TabText): string {
  const e = escapeHtml;
  const t = text.tree;
  const matched = new Set<string>();
  const branches = view.history.links.map(({ clueIds, result, turn }, index) => {
    const insight = view.insights.find((entry) => sameClues(entry.clueIds, clueIds));
    if (insight !== undefined) matched.add(insight.id);
    return branch(view, text, clueIds, { n: index + 1, turn, result }, insight);
  });
  // A conclusion with no link in the history: shown by its clues alone, so none is lost.
  for (const insight of view.insights) {
    if (!matched.has(insight.id)) branches.push(branch(view, text, insight.clueIds, null, insight));
  }
  const body =
    branches.length === 0
      ? `<p class="empty">${e(text.corkboard.noneTried)}</p>`
      : `<div class="cols"><span>${e(t.clues)}</span><span>${e(t.link)}</span><span>${e(t.insight)}</span><span>${e(t.lead)}</span></div>
<div class="tree">${branches.join('\n')}</div>`;
  return `<h2>${e(text.corkboard.tried)}</h2>
${body}
${renderOpenSlots(view, text)}`;
}
