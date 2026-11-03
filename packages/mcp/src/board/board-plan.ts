// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView, ObstacleKind } from '@the-race/engine';
import { numberOf } from './board-opened.js';
import { clueTokens, isSafeId, placeTokens, rel, token } from './board-relations.js';
import { escapeHtml, truncate } from './escape-html.js';
import { named, type TabText } from './tab-text.js';

// The plan of a building, opened by a click on its block on the map: its rooms as boxes with the doors between
// them, and in each room the parts the hero has noticed, with what stands in the way of each, the tool the kit has
// for it, and the clues a search gave. It holds what the public view holds and nothing a part has not given up.

type Place = DetectiveRunView['map']['places'][number];

const ROOM_W = 252;
const ROOM_GAP = 72;
const MARGIN = 14;
const HEAD = 34;
const ROW = 36;
const PLAIN_H = 52;
const NAME_LENGTH = 30;
const TOOL_LENGTH = 40;

/** A glyph for the obstacles that have no drawing of their own; the lock is drawn. */
const OBSTACLE_GLYPH: Record<ObstacleKind, string> = {
  locked: '',
  dark: '◐',
  soft: '~',
  trace: '∴',
  sealed: '#',
  digital: '@',
};

/** The id of the plan of a building, and the key that opens it. */
export const planKey = (head: string): string => `plan-${head}`;
export const planId = (head: string): string => `open-${planKey(head)}`;

/** The CSS that shows the plan that is open, for each building whose id may be written into a selector. */
export function planRules(view: DetectiveRunView): string {
  return [...new Set(view.map.places.map(({ building }) => building))]
    .filter(isSafeId)
    .map((head) => `main[data-open="${planKey(head)}"] #${planId(head)}{display:block}`)
    .join('\n');
}

interface Room {
  readonly place: Place;
  readonly depth: number;
  x: number;
  y: number;
  height: number;
}

/** The rooms of a building laid out in columns by the steps from the door, in the order the map lists them. */
function layoutRooms(
  view: DetectiveRunView,
  rooms: readonly Place[],
  door: Place,
  partsOf: ReadonlyMap<string, DetectiveRunView['placeParts'][number]['parts']>,
): { rooms: Room[]; width: number; height: number } {
  const ids = new Set(rooms.map(({ id }) => id));
  const next = new Map<string, string[]>();
  for (const { from, to } of view.map.links) {
    if (!ids.has(from) || !ids.has(to)) continue;
    next.set(from, [...(next.get(from) ?? []), to]);
    next.set(to, [...(next.get(to) ?? []), from]);
  }
  const reached = new Set([door.id]);
  const placed: Room[] = [];
  const queue: Room[] = [{ place: door, depth: 0, x: 0, y: 0, height: 0 }];
  for (const room of queue) {
    placed.push(room);
    for (const other of rooms.filter(({ id }) => (next.get(room.place.id) ?? []).includes(id))) {
      if (reached.has(other.id)) continue;
      reached.add(other.id);
      queue.push({ place: other, depth: room.depth + 1, x: 0, y: 0, height: 0 });
    }
  }
  // A room the doors do not reach from the first is laid in the last column, as the rooms beyond a reached one.
  const beyond = Math.max(0, ...placed.map(({ depth }) => depth)) + 1;
  for (const room of rooms.filter(({ id }) => !reached.has(id))) {
    placed.push({ place: room, depth: beyond, x: 0, y: 0, height: 0 });
  }
  const columns = Math.max(...placed.map(({ depth }) => depth)) + 1;
  let tallest = 0;
  for (let depth = 0; depth < columns; depth += 1) {
    let y = MARGIN;
    for (const room of placed.filter((candidate) => candidate.depth === depth)) {
      const parts = partsOf.get(room.place.id) ?? [];
      room.height = room.place.visited ? HEAD + Math.max(1, parts.length) * ROW + 10 : PLAIN_H;
      room.x = MARGIN + depth * (ROOM_W + ROOM_GAP);
      room.y = y;
      y += room.height + 18;
    }
    tallest = Math.max(tallest, y);
  }
  return {
    rooms: placed,
    width: MARGIN * 2 + columns * ROOM_W + (columns - 1) * ROOM_GAP,
    height: tallest + MARGIN - 18,
  };
}

const whole = (value: number): string => String(Math.round(value));

function lock(x: number, y: number): string {
  return `<g class="sign locked" transform="translate(${whole(x)} ${whole(y)})"><rect x="-6" y="-2" width="12" height="9" rx="1.5"/><path d="M-4 -2v-3a4 4 0 0 1 8 0v3"/></g>`;
}

/** What stands in the way of a part, as a mark: the lock drawn, the rest a glyph, an open part a plain dot. */
function obstacleMark(obstacle: ObstacleKind | null, searched: boolean, x: number, y: number): string {
  if (searched) {
    return `<g class="mark done" transform="translate(${whole(x)} ${whole(y)})"><circle r="9"/><path d="M-4 0l3 3l5 -6"/></g>`;
  }
  if (obstacle === null) {
    return `<g class="mark open" transform="translate(${whole(x)} ${whole(y)})"><circle r="9"/><circle r="3" class="dot"/></g>`;
  }
  return `<g class="mark shut" transform="translate(${whole(x)} ${whole(y)})"><circle r="9"/>${
    obstacle === 'locked' ? lock(0, 1) : `<text y="4" text-anchor="middle">${OBSTACLE_GLYPH[obstacle]}</text>`
  }</g>`;
}

/** The tool of the kit that gets past an obstacle, if the hero has one in hand. */
function toolFor(view: DetectiveRunView, obstacle: ObstacleKind): string | undefined {
  return view.kit.find(({ state, removes }) => state === 'owned' && removes.includes(obstacle))?.id;
}

function roomBox(
  view: DetectiveRunView,
  room: Room,
  parts: DetectiveRunView['placeParts'][number]['parts'],
  text: TabText,
): string {
  const e = escapeHtml;
  const t = text.plan;
  const { place } = room;
  const number = numberOf(view);
  const current = place.id === view.map.current;
  const classes = ['room', place.visited ? 'visited' : 'unvisited', current ? 'current' : '']
    .filter((name) => name !== '')
    .join(' ');
  const rows = parts.map((part, index) => {
    const top = room.y + HEAD + index * ROW;
    const tool = part.obstacle === null ? undefined : toolFor(view, part.obstacle);
    const status = part.searched
      ? `${t.searched} · ${part.gave.length === 0 ? t.gaveNothing : t.gave}`
      : part.obstacle === null
        ? ''
        : `${named(t.obstacles, part.obstacle)} · ${tool === undefined ? t.noTool : t.tool.replace('{tool}', named(text.hero.gear, tool))}`;
    const chips = part.gave.map((clueId, chip) => {
      const attrs = `data-pick="${e(token('clue', clueId))}" data-rel="${e(rel(clueTokens(view, clueId)))}" tabindex="0" role="button"`;
      return `<g class="clue-chip" ${attrs}><text x="${whole(room.x + 150 + chip * 70)}" y="${whole(top + 29)}">${e(number(clueId))}</text></g>`;
    });
    return `<g class="part${part.searched ? ' searched' : ''}${part.obstacle === null ? '' : ` ${part.obstacle}`}"><title>${e(`${part.name}${status === '' ? '' : `: ${status}`}`)}</title>${obstacleMark(part.obstacle, part.searched, room.x + 20, top + 14)}<text class="part-name" x="${whole(room.x + 38)}" y="${whole(top + 12)}">${e(truncate(part.name, NAME_LENGTH))}</text><text class="part-state" x="${whole(room.x + 38)}" y="${whole(top + 29)}">${e(truncate(status, TOOL_LENGTH))}</text>${chips.join('')}</g>`;
  });
  const body = !place.visited
    ? `<text class="part-state" x="${whole(room.x + 14)}" y="${whole(room.y + 42)}">${e(place.lead ?? t.notEntered)}</text>`
    : parts.length === 0
      ? `<text class="part-state" x="${whole(room.x + 14)}" y="${whole(room.y + HEAD + 20)}">${e(t.noParts)}</text>`
      : rows.join('');
  const lead =
    place.lead === null || place.visited
      ? ''
      : `<g class="lead-mark" transform="translate(${whole(room.x + ROOM_W - 16)} ${whole(room.y + 16)})"><title>${e(place.lead)}</title><circle r="8"/><text y="4" text-anchor="middle">?</text></g>`;
  const attrs = `data-rel="${e(rel(placeTokens(view, place.id)))}"`;
  return `<g class="${classes}" ${attrs}><title>${e(place.name)}</title><rect class="walls" x="${whole(room.x)}" y="${whole(room.y)}" width="${String(ROOM_W)}" height="${whole(room.height)}" rx="4"/><text class="room-name" x="${whole(room.x + 14)}" y="${whole(room.y + 22)}">${e(truncate(place.name, NAME_LENGTH))}</text>${current ? `<circle class="here-dot" cx="${whole(room.x + ROOM_W - 16)}" cy="${whole(room.y + 16)}" r="5"/>` : ''}${lead}${body}</g>`;
}

/** The plan of one building: the rooms with the doors between them, and the street it opens onto. */
export function renderPlan(
  view: DetectiveRunView,
  rooms: readonly Place[],
  door: Place,
  head: string,
  street: string | null,
  text: TabText,
): string {
  const e = escapeHtml;
  const t = text.plan;
  const partsOf = new Map(view.placeParts.map(({ placeId, parts }) => [placeId, parts]));
  const layout = layoutRooms(view, rooms, door, partsOf);
  const at = new Map(layout.rooms.map((room) => [room.place.id, room]));
  const doors = view.map.links.flatMap(({ from, to }) => {
    const a = at.get(from);
    const b = at.get(to);
    if (a === undefined || b === undefined) return [];
    const [left, right] = a.depth <= b.depth ? [a, b] : [b, a];
    const sideways = left.depth !== right.depth;
    const x1 = sideways ? left.x + ROOM_W : left.x + ROOM_W / 2;
    const y1 = sideways ? left.y + left.height / 2 : left.y + left.height;
    const x2 = sideways ? right.x : right.x + ROOM_W / 2;
    const y2 = sideways ? right.y + right.height / 2 : right.y;
    const label = t.doorTo.replace('{a}', a.place.name).replace('{b}', b.place.name);
    return [
      `<g class="door-way"><title>${e(label)}</title><line x1="${whole(x1)}" y1="${whole(y1)}" x2="${whole(x2)}" y2="${whole(y2)}"/><rect x="${whole((x1 + x2) / 2 - 5)}" y="${whole((y1 + y2) / 2 - 8)}" width="10" height="16" rx="2"/></g>`,
    ];
  });
  const title = t.title.replace('{name}', door.name);
  const opens = street === null ? '' : ` · ${t.opensOnto}: ${street}`;
  return `<div class="plan" id="${e(planId(head))}" role="dialog" aria-label="${e(title)}" tabindex="-1">
<p class="tag">${e(title)}${e(opens)}</p>
<div class="graph paper-map"><svg class="plan-svg" viewBox="0 0 ${String(layout.width)} ${String(layout.height)}" role="img" aria-label="${e(title)}" style="min-width:${String(Math.min(layout.width, 520))}px"><g class="doors">${doors.join('')}</g>${layout.rooms.map((room) => roomBox(view, room, partsOf.get(room.place.id) ?? [], text)).join('')}</svg></div>
<p class="note">${e(t.closeHint)}</p>
</div>`;
}
