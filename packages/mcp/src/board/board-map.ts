// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { escapeHtml, truncate } from './escape-html.js';
import type { TabText } from './tab-text.js';

type MapView = DetectiveRunView['map'];

const NODE_WIDTH = 156;
const NODE_HEIGHT = 56;
const GAP_X = 52;
const GAP_Y = 24;
const MARGIN = 12;
const LABEL_LENGTH = 21;

export interface PlacedPlace {
  readonly place: MapView['places'][number];
  readonly x: number;
  readonly y: number;
}

export interface MapLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PlacedPlace[];
}

/** How many steps each known place is from the hero, over the known ways; a place not reached is one step further than the last. */
function depths(map: MapView): Map<string, number> {
  const next = new Map<string, string[]>();
  for (const { from, to } of map.links) {
    next.set(from, [...(next.get(from) ?? []), to]);
    next.set(to, [...(next.get(to) ?? []), from]);
  }
  const depth = new Map<string, number>([[map.current, 0]]);
  const queue = [{ id: map.current, steps: 0 }];
  for (const { id, steps } of queue) {
    for (const neighbour of next.get(id) ?? []) {
      if (!depth.has(neighbour)) {
        depth.set(neighbour, steps + 1);
        queue.push({ id: neighbour, steps: steps + 1 });
      }
    }
  }
  return depth;
}

/**
 * Where each known place goes: a column for every step from the hero, the places of a column in the order they
 * are listed, the columns centred on each other. Nothing here is random or reads the clock, so the same map
 * always draws the same picture.
 */
export function layoutMap(map: MapView): MapLayout {
  const depth = depths(map);
  const beyond = Math.max(0, ...depth.values()) + 1;
  const columns = new Map<number, MapView['places'][number][]>();
  for (const place of map.places) {
    const column = depth.get(place.id) ?? beyond;
    columns.set(column, [...(columns.get(column) ?? []), place]);
  }
  const heightOf = (count: number): number => count * NODE_HEIGHT + Math.max(0, count - 1) * GAP_Y;
  const tallest = Math.max(0, ...[...columns.values()].map((places) => heightOf(places.length)));
  const nodes = [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, places], index) =>
      places.map((place, row) => ({
        place,
        x: MARGIN + index * (NODE_WIDTH + GAP_X),
        y: MARGIN + (tallest - heightOf(places.length)) / 2 + row * (NODE_HEIGHT + GAP_Y),
      })),
    );
  const width = MARGIN * 2 + columns.size * NODE_WIDTH + Math.max(0, columns.size - 1) * GAP_X;
  return { width, height: MARGIN * 2 + tallest, nodes };
}

const whole = (value: number): string => String(Math.round(value));

/** The known places as an SVG graph: only what the hero has seen, the hero's place marked, shut ways marked. */
export function renderMap(view: DetectiveRunView, text: TabText): string {
  const { map } = view;
  if (map.places.length === 0) return `<p class="empty">${escapeHtml(text.map.empty)}</p>`;
  const layout = layoutMap(map);
  const at = new Map(layout.nodes.map((node) => [node.place.id, node]));
  const cluesAt = new Map<string, number>();
  for (const { locationId } of view.clues) cluesAt.set(locationId, (cluesAt.get(locationId) ?? 0) + 1);

  const edges = map.links.flatMap(({ from, to }) => {
    const a = at.get(from);
    const b = at.get(to);
    return a === undefined || b === undefined
      ? []
      : [
          `<line x1="${whole(a.x + NODE_WIDTH / 2)}" y1="${whole(a.y + NODE_HEIGHT / 2)}" x2="${whole(b.x + NODE_WIDTH / 2)}" y2="${whole(b.y + NODE_HEIGHT / 2)}"/>`,
        ];
  });

  const nodes = layout.nodes.map(({ place, x, y }) => {
    const current = place.id === map.current;
    const state = current
      ? text.map.you
      : place.blocked === 'locked'
        ? text.map.locked
        : place.blocked === 'closed'
          ? text.map.closed
          : place.visited
            ? ''
            : text.map.unvisited;
    const clues = cluesAt.get(place.id) ?? 0;
    const classes = [
      'node',
      place.visited ? 'visited' : 'unvisited',
      current ? 'current' : '',
      place.blocked ?? '',
    ]
      .filter((name) => name !== '')
      .join(' ');
    const badge =
      clues === 0
        ? ''
        : `<circle class="badge" cx="${whole(x + NODE_WIDTH)}" cy="${whole(y)}" r="11"><title>${escapeHtml(text.map.cluesHere)}: ${String(clues)}</title></circle><text class="badge-n" x="${whole(x + NODE_WIDTH)}" y="${whole(y + 4)}" text-anchor="middle">${String(clues)}</text>`;
    return `<g class="${classes}"><title>${escapeHtml(place.name)}${state === '' ? '' : ` (${escapeHtml(state)})`}</title><rect x="${whole(x)}" y="${whole(y)}" width="${String(NODE_WIDTH)}" height="${String(NODE_HEIGHT)}" rx="8"/><text class="name" x="${whole(x + NODE_WIDTH / 2)}" y="${whole(y + 24)}" text-anchor="middle">${escapeHtml(truncate(place.name, LABEL_LENGTH))}</text><text class="state" x="${whole(x + NODE_WIDTH / 2)}" y="${whole(y + 43)}" text-anchor="middle">${escapeHtml(state)}</text>${badge}</g>`;
  });

  return `<div class="graph"><svg class="map" viewBox="0 0 ${String(layout.width)} ${String(layout.height)}" role="img" aria-label="${escapeHtml(text.map.title)}" style="min-width:${String(Math.min(layout.width, 520))}px"><g class="edges">${edges.join('')}</g>${nodes.join('')}</svg></div>
<p class="tag">${escapeHtml(text.map.legend)}</p>`;
}
