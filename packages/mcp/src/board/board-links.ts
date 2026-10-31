// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { escapeHtml, truncate } from './escape-html.js';
import type { TabText } from './tab-text.js';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 40;
const GAP_X = 70;
const GAP_Y = 14;
const MARGIN = 12;
const LABEL_LENGTH = 34;
const COLUMN_STEP = NODE_WIDTH + GAP_X;

interface Node {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

const whole = (value: number): string => String(Math.round(value));

/** The items of one column as boxes, one under the other; whatever else an item carries stays on its box. */
function column<T extends { readonly id: string; readonly label: string }>(
  items: readonly T[],
  index: number,
): (T & Node)[] {
  return items.map((item, row) => ({
    ...item,
    x: MARGIN + index * COLUMN_STEP,
    y: MARGIN + row * (NODE_HEIGHT + GAP_Y),
  }));
}

/** A curve from the right edge of one box to the left edge of the next column's box. */
function curve(from: Node, to: Node): string {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const middle = (x1 + x2) / 2;
  return `<path d="M${whole(x1)} ${whole(y1)} C${whole(middle)} ${whole(y1)} ${whole(middle)} ${whole(y2)} ${whole(x2)} ${whole(y2)}"/>`;
}

function box(node: Node, kind: string): string {
  return `<g class="box ${kind}"><title>${escapeHtml(node.label)}</title><rect x="${whole(node.x)}" y="${whole(node.y)}" width="${String(NODE_WIDTH)}" height="${String(NODE_HEIGHT)}" rx="6"/><text x="${whole(node.x + 10)}" y="${whole(node.y + 25)}">${escapeHtml(truncate(node.label, LABEL_LENGTH))}</text></g>`;
}

/**
 * The conclusions, the clues and the places as three columns, joined by what the player did: a conclusion to
 * each clue it was drawn from, a clue to the place it was found. Nothing says what a clue points at.
 */
export function renderLinks(view: DetectiveRunView, text: TabText): string {
  if (view.clues.length === 0 && view.insights.length === 0) {
    return `<p class="empty">${escapeHtml(text.links.none)}</p>`;
  }
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const placeIds = [...new Set(view.clues.map(({ locationId }) => locationId))];

  const conclusions = column(
    view.insights.map(({ id, insight, clueIds }) => ({ id, label: insight, clueIds })),
    0,
  );
  const clues = column(
    view.clues.map(({ id, description, locationId }) => ({ id, label: description, locationId })),
    1,
  );
  const places = column(
    placeIds.map((id) => ({ id, label: placeName.get(id) ?? id })),
    2,
  );

  const clueAt = new Map(clues.map((node) => [node.id, node]));
  const edges = [
    ...conclusions.flatMap((from) =>
      from.clueIds.flatMap((clueId) => {
        const to = clueAt.get(clueId);
        return to === undefined ? [] : [`<g class="conclusion-link">${curve(from, to)}</g>`];
      }),
    ),
    ...places.flatMap((to) =>
      clues
        .filter(({ locationId }) => locationId === to.id)
        .map((from) => `<g class="place-link">${curve(from, to)}</g>`),
    ),
  ];

  const rows = Math.max(conclusions.length, clues.length, places.length);
  const width = MARGIN * 2 + 3 * NODE_WIDTH + 2 * GAP_X;
  const height = MARGIN * 2 + rows * NODE_HEIGHT + Math.max(0, rows - 1) * GAP_Y;
  const heading = (index: number, label: string): string =>
    `<span style="left:${whole(((MARGIN + index * COLUMN_STEP) / width) * 100)}%">${escapeHtml(label)}</span>`;

  return `<div class="columns" aria-hidden="true">${heading(0, text.links.conclusions)}${heading(1, text.links.evidence)}${heading(2, text.links.places)}</div>
<div class="graph"><svg class="links" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="${escapeHtml(text.links.title)}" style="min-width:${String(Math.min(width, 640))}px"><g class="edges">${edges.join('')}</g>${conclusions.map((node) => box(node, 'conclusion')).join('')}${clues.map((node) => box(node, 'clue')).join('')}${places.map((node) => box(node, 'place')).join('')}</svg></div>`;
}
