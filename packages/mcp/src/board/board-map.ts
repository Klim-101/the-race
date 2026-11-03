// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { wrap } from './board-cork.js';
import { planId, planKey, renderPlan } from './board-plan.js';
import { isSafeId, placeTokens, rel, token } from './board-relations.js';
import { escapeHtml, truncate } from './escape-html.js';
import type { TabText } from './tab-text.js';

// The town as a paper map. The places out of doors (streets, squares, yards) are the spine: bands in rows, each
// walked on from the one before it. The rooms that touch are one building, drawn as one block standing along the
// street it opens onto, above it and below it in turn. Nothing here is random and nothing reads the clock: the
// same view always draws the same picture, and the case holds no coordinates.

type MapView = DetectiveRunView['map'];
type Place = MapView['places'][number];

const MARGIN = 24;
const STREET_W = 176;
const STREET_H = 30;
const COLUMN_GAP = 56;
const BLOCK_W = 84;
const BLOCK_H = 56;
const BLOCK_GAP = 8;
const DOOR = 14;
const ROW_GAP = 30;
const PER_TIER = 2;
const ELSEWHERE_COLUMNS = 6;
const LABEL_LENGTH = 13;
const STREET_LABEL_LENGTH = 24;
const TITLE_LENGTH = 160;

export interface Street {
  readonly place: Place;
  readonly x: number;
  readonly y: number;
}

export interface Block {
  /** The room that opens onto the street, which names the block. */
  readonly door: Place;
  /** Every known room of the building, the door first. */
  readonly rooms: readonly Place[];
  /** The street the building opens onto, or `null` for a building whose street the hero does not know. */
  readonly street: Street | null;
  readonly x: number;
  readonly y: number;
}

/** A way between two streets: from the right of the first to the left of the second, round the gap between them. */
export interface Lane {
  readonly from: Street;
  readonly to: Street;
  readonly kind: 'walked' | 'across';
}

export interface TownLayout {
  readonly width: number;
  readonly height: number;
  readonly streets: readonly Street[];
  readonly blocks: readonly Block[];
  readonly lanes: readonly Lane[];
  /** Where the caption of the buildings with no street goes, or `null` when there are none. */
  readonly elsewhere: { readonly x: number; readonly y: number } | null;
}

const BLOCK_SPAN = BLOCK_H + DOOR;

/** A street while it is being laid out: where it is reached from, how deep, and where it ends up. */
interface Node {
  readonly place: Place;
  readonly depth: number;
  readonly parent: Node | null;
  x: number;
  y: number;
}

/** The streets in the order they are walked from the first, each one reached from the street before it. */
function walk(streets: readonly Place[], links: MapView['links']): Node[] {
  const next = new Map<string, string[]>();
  const ids = new Set(streets.map(({ id }) => id));
  for (const { from, to } of links) {
    if (!ids.has(from) || !ids.has(to)) continue;
    next.set(from, [...(next.get(from) ?? []), to]);
    next.set(to, [...(next.get(to) ?? []), from]);
  }
  const reached = new Set<string>();
  const order: Node[] = [];
  for (const root of streets) {
    if (reached.has(root.id)) continue;
    reached.add(root.id);
    const queue: Node[] = [{ place: root, depth: 0, parent: null, x: 0, y: 0 }];
    for (const node of queue) {
      order.push(node);
      for (const neighbour of streets.filter(({ id }) => (next.get(node.place.id) ?? []).includes(id))) {
        if (reached.has(neighbour.id)) continue;
        reached.add(neighbour.id);
        queue.push({ place: neighbour, depth: node.depth + 1, parent: node, x: 0, y: 0 });
      }
    }
  }
  return order;
}

/**
 * The buildings of the known map: the rooms that share a building, with the street each opens onto (the first
 * street a room of it is joined to, by the room that opens onto it).
 */
function buildings(map: MapView): { door: Place; rooms: Place[]; street: string | null }[] {
  const outdoor = new Set(map.places.filter(({ exposure }) => exposure === 'outdoor').map(({ id }) => id));
  // A building is named by its first known room, so that room is the head of every room of it.
  return map.places
    .filter(({ id, building }) => building === id)
    .map((head) => {
      const rooms = map.places.filter(({ building }) => building === head.building);
      const doors = rooms.flatMap((room) =>
        map.links.flatMap(({ from, to }) => {
          const other = from === room.id ? to : to === room.id ? from : undefined;
          return other !== undefined && outdoor.has(other) ? [{ room, street: other }] : [];
        }),
      );
      const [open] = doors;
      return open === undefined
        ? { door: head, rooms, street: null }
        : {
            door: open.room,
            rooms: [open.room, ...rooms.filter(({ id }) => id !== open.room.id)],
            street: open.street,
          };
    });
}

/**
 * Where each known street and building goes. The streets are cut into rows, each row the first branch of a street
 * followed to its end, and a row of the town is as tall as the buildings along it. Two buildings never overlap and
 * neither does a building and a street.
 */
export function layoutTown(map: MapView): TownLayout {
  const nodes = walk(
    map.places.filter(({ exposure }) => exposure === 'outdoor'),
    map.links,
  );
  const byId = new Map(nodes.map((node) => [node.place.id, node]));
  const attached = new Map<string, number>();
  // Each building with its street and its turn along that street: even turns stand above it, odd ones below.
  const standing = buildings(map).map((building) => {
    const turn = attached.get(building.street ?? '') ?? 0;
    if (building.street !== null) attached.set(building.street, turn + 1);
    return { ...building, turn };
  });

  // The rows: a street and the first street walked on from it make a row; each other street starts one of its own.
  const children = new Map<Node, Node[]>();
  for (const node of nodes) {
    if (node.parent !== null) children.set(node.parent, [...(children.get(node.parent) ?? []), node]);
  }
  const rows: Node[][] = [];
  const lay = (head: Node): void => {
    const row: Node[] = [];
    for (let at: Node | undefined = head; at !== undefined; at = children.get(at)?.[0]) row.push(at);
    rows.push(row);
    for (const node of row) for (const rest of (children.get(node) ?? []).slice(1)) lay(rest);
  };
  for (const node of nodes) if (node.parent === null) lay(node);

  // How many tiers of buildings stand above and below each street.
  const above = new Map<string, number>();
  const below = new Map<string, number>();
  for (const { street, turn } of standing) {
    if (street === null) continue;
    const tiers = Math.floor(Math.floor(turn / 2) / PER_TIER) + 1;
    const into = turn % 2 === 0 ? above : below;
    into.set(street, Math.max(into.get(street) ?? 0, tiers));
  }

  let top = MARGIN;
  for (const row of rows) {
    const high = Math.max(0, ...row.map(({ place }) => above.get(place.id) ?? 0));
    const low = Math.max(0, ...row.map(({ place }) => below.get(place.id) ?? 0));
    const y = top + high * BLOCK_SPAN;
    for (const node of row) {
      node.x = MARGIN + node.depth * (STREET_W + COLUMN_GAP);
      node.y = y;
    }
    top = y + STREET_H + low * BLOCK_SPAN + ROW_GAP;
  }

  const blocks: Block[] = [];
  const homeless: { door: Place; rooms: readonly Place[] }[] = [];
  for (const { door, rooms, street, turn } of standing) {
    const home = street === null ? undefined : byId.get(street);
    if (home === undefined) {
      homeless.push({ door, rooms });
      continue;
    }
    const slot = Math.floor(turn / 2);
    const tier = Math.floor(slot / PER_TIER);
    blocks.push({
      door,
      rooms,
      street: home,
      x: home.x + (slot % PER_TIER) * (BLOCK_W + BLOCK_GAP),
      y: turn % 2 === 0 ? home.y - (tier + 1) * BLOCK_SPAN : home.y + STREET_H + DOOR + tier * BLOCK_SPAN,
    });
  }

  // The buildings whose street the hero does not know stand together below the town.
  const caption = homeless.length === 0 ? null : { x: MARGIN, y: top + 6 };
  homeless.forEach(({ door, rooms }, index) => {
    blocks.push({
      door,
      rooms,
      street: null,
      x: MARGIN + (index % ELSEWHERE_COLUMNS) * (BLOCK_W + BLOCK_GAP * 2),
      y: top + 16 + Math.floor(index / ELSEWHERE_COLUMNS) * (BLOCK_H + BLOCK_GAP * 2),
    });
  });

  // A lane for each way between streets: the ones walked on, and any other as a lane across.
  const lanes: Lane[] = nodes.flatMap((node) =>
    node.parent === null ? [] : [{ from: node.parent, to: node, kind: 'walked' as const }],
  );
  for (const { from, to } of map.links) {
    const a = byId.get(from);
    const b = byId.get(to);
    if (a === undefined || b === undefined || a.parent === b || b.parent === a) continue;
    lanes.push({ from: a, to: b, kind: 'across' });
  }

  const right = Math.max(
    MARGIN,
    ...nodes.map(({ x: left }) => left + STREET_W),
    ...blocks.map(({ x: left }) => left + BLOCK_W),
  );
  const bottom = Math.max(top - ROW_GAP, ...blocks.map(({ y: lower }) => lower + BLOCK_H));
  return {
    width: right + MARGIN,
    height: bottom + MARGIN,
    streets: nodes,
    blocks,
    lanes,
    elsewhere: caption,
  };
}

const whole = (value: number): string => String(Math.round(value));

/** The state of a place in words, for its tooltip: where the hero is, a shut way, a lead, or not yet seen. */
function stateOf(place: Place, current: boolean, text: TabText): string {
  return current
    ? text.map.you
    : place.blocked === 'locked'
      ? text.map.locked
      : place.blocked === 'closed'
        ? text.map.closed
        : place.visited
          ? ''
          : place.lead === null
            ? text.map.unvisited
            : text.map.lead;
}

function sign(blocked: Place['blocked'], x: number, y: number, label: string): string {
  if (blocked === null) return '';
  const e = escapeHtml(label);
  return blocked === 'locked'
    ? `<g class="sign locked" transform="translate(${whole(x)} ${whole(y)})"><title>${e}</title><rect x="-6" y="-2" width="12" height="9" rx="1.5"/><path d="M-4 -2v-3a4 4 0 0 1 8 0v3"/></g>`
    : `<g class="sign closed" transform="translate(${whole(x)} ${whole(y)})"><title>${e}</title><circle r="7"/><path d="M-3.5 -3.5l7 7M3.5 -3.5l-7 7"/></g>`;
}

/** A red pin where the hero is. */
function pin(x: number, y: number, label: string): string {
  return `<g class="here" transform="translate(${whole(x)} ${whole(y)})"><title>${escapeHtml(label)}</title><circle r="6"/><circle r="2.2" class="dot"/></g>`;
}

function leadMark(place: Place, x: number, y: number): string {
  return place.lead === null
    ? ''
    : `<g class="lead-mark" transform="translate(${whole(x)} ${whole(y)})"><title>${escapeHtml(place.lead)}</title><circle r="8"/><text y="4" text-anchor="middle">?</text></g>`;
}

function badge(count: number, x: number, y: number, label: string): string {
  return count === 0
    ? ''
    : `<g class="badge-wrap"><circle class="badge" cx="${whole(x)}" cy="${whole(y)}" r="11"><title>${escapeHtml(label)}: ${String(count)}</title></circle><text class="badge-n" x="${whole(x)}" y="${whole(y + 4)}" text-anchor="middle">${String(count)}</text></g>`;
}

/** The compass, in the corner of the sheet. */
function compass(width: number, north: string): string {
  const cx = width - 44;
  return `<g class="compass" transform="translate(${whole(cx)} 54)"><circle r="20"/><path class="needle" d="M0 -16l5 16h-10z"/><path d="M0 16l5 -16h-10z" class="south"/><text y="-27" text-anchor="middle">${escapeHtml(north)}</text></g>`;
}

/**
 * The known part of the town as a paper map: the streets as bands, the buildings as blocks along them, the ways
 * between the streets as lanes, the hero where they stand, shut doors as signs, the clues found in each place as a
 * count, and a mark with the reason of a lead for a place it named and the hero has not seen yet.
 */
export function renderMap(view: DetectiveRunView, text: TabText): string {
  const { map } = view;
  if (map.places.length === 0) return `<p class="empty">${escapeHtml(text.map.empty)}</p>`;
  const e = escapeHtml;
  const layout = layoutTown(map);
  const cluesAt = new Map<string, number>();
  for (const { locationId } of view.clues) cluesAt.set(locationId, (cluesAt.get(locationId) ?? 0) + 1);
  const lanes = layout.lanes.map(({ from: a, to: b, kind }) => {
    const startY = a.y + STREET_H / 2;
    const endY = b.y + STREET_H / 2;
    const d =
      kind === 'across'
        ? `M${whole(a.x + STREET_W / 2)} ${whole(startY)} L${whole(b.x + STREET_W / 2)} ${whole(endY)}`
        : `M${whole(a.x + STREET_W)} ${whole(startY)} H${whole(a.x + STREET_W + COLUMN_GAP / 2)} V${whole(endY)} H${whole(b.x)}`;
    return `<path class="lane ${kind}" d="${d}"/>`;
  });

  const streets = layout.streets.map(({ place, x: left, y: top }) => {
    const current = place.id === map.current;
    const state = stateOf(place, current, text);
    const clues = cluesAt.get(place.id) ?? 0;
    const classes = [
      'street',
      place.visited ? 'visited' : 'unvisited',
      current ? 'current' : '',
      place.blocked ?? '',
    ]
      .filter((name) => name !== '')
      .join(' ');
    const pick = `data-pick="${e(token('place', place.id))}" data-rel="${e(rel(placeTokens(view, place.id)))}" tabindex="0" role="button"`;
    return `<g class="${classes}" ${pick}><title>${e(place.name)}${state === '' ? '' : ` (${e(state)})`}${place.lead === null ? '' : `: ${e(place.lead)}`}</title><rect x="${whole(left)}" y="${whole(top)}" width="${String(STREET_W)}" height="${String(STREET_H)}" rx="7"/><text class="name" x="${whole(left + STREET_W / 2)}" y="${whole(top + STREET_H / 2 + 4)}" text-anchor="middle">${e(truncate(place.name, STREET_LABEL_LENGTH))}</text>${current ? pin(left + 12, top + STREET_H / 2, text.map.you) : ''}${sign(place.blocked, left + STREET_W - 12, top + STREET_H / 2, state)}${leadMark(place, left + 12, top + STREET_H / 2)}${badge(clues, left + STREET_W, top, text.map.cluesHere)}</g>`;
  });

  const blocks = layout.blocks.map(({ door, rooms, street: home, x: left, y: top }) => {
    const current = rooms.some(({ id }) => id === map.current);
    const visited = rooms.some((room) => room.visited);
    const state = stateOf(door, current, text);
    const clues = rooms.reduce((sum, room) => sum + (cluesAt.get(room.id) ?? 0), 0);
    const tokens = [...new Set(rooms.flatMap((room) => placeTokens(view, room.id)))];
    const classes = ['block', visited ? 'visited' : 'unvisited', current ? 'current' : '', door.blocked ?? '']
      .filter((name) => name !== '')
      .join(' ');
    const opens = isSafeId(door.building) ? door.building : null;
    const plan =
      opens === null ? '' : ` data-open="${e(planKey(opens))}" aria-controls="${e(planId(opens))}"`;
    const pick = `data-pick="${e(token('place', door.id))}" data-rel="${e(rel(tokens))}" tabindex="0" role="button"${plan}`;
    // The door is a short line from the block to the band it stands on.
    const doorLine =
      home === null
        ? ''
        : top < home.y
          ? `<line class="door" x1="${whole(left + BLOCK_W / 2)}" y1="${whole(top + BLOCK_H)}" x2="${whole(left + BLOCK_W / 2)}" y2="${whole(top + BLOCK_H + DOOR)}"/>`
          : `<line class="door" x1="${whole(left + BLOCK_W / 2)}" y1="${whole(top - DOOR)}" x2="${whole(left + BLOCK_W / 2)}" y2="${whole(top)}"/>`;
    const names = rooms.map(({ name }) => name).join(', ');
    const label = wrap(door.name, LABEL_LENGTH, 2);
    const rest = rooms.length > 1 ? text.map.rooms.replace('{n}', String(rooms.length)) : '';
    return `${doorLine}<g class="${classes}" ${pick}><title>${e(truncate(names, TITLE_LENGTH))}${state === '' ? '' : ` (${e(state)})`}${door.lead === null ? '' : `: ${e(door.lead)}`}</title><rect class="walls" x="${whole(left)}" y="${whole(top)}" width="${String(BLOCK_W)}" height="${String(BLOCK_H)}" rx="3"/><path class="roof" d="M${whole(left)} ${whole(top + 10)}h${String(BLOCK_W)}"/>${label
      .map(
        (line, row) =>
          `<text class="name" x="${whole(left + BLOCK_W / 2)}" y="${whole(top + 26 + row * 12)}" text-anchor="middle">${e(line)}</text>`,
      )
      .join(
        '',
      )}<text class="state" x="${whole(left + BLOCK_W / 2)}" y="${whole(top + 51)}" text-anchor="middle">${e(rest)}</text>${current ? pin(left + 10, top + BLOCK_H - 10, text.map.you) : ''}${sign(door.blocked, left + BLOCK_W - 10, top + 10, state)}${leadMark(door, left + 10, top + 10)}${badge(clues, left + BLOCK_W, top, text.map.cluesHere)}</g>`;
  });

  // The plan of each building, hidden until its block is clicked (see `planRules`).
  const plans = layout.blocks.flatMap(({ door, rooms, street }) =>
    isSafeId(door.building)
      ? [renderPlan(view, rooms, door, door.building, street?.place.name ?? null, text)]
      : [],
  );
  const caption =
    layout.elsewhere === null
      ? ''
      : `<text class="elsewhere" x="${whole(layout.elsewhere.x)}" y="${whole(layout.elsewhere.y)}">${e(text.map.elsewhere)}</text>`;
  return `<div class="graph paper-map"><svg class="map" viewBox="0 0 ${String(layout.width)} ${String(layout.height)}" role="img" aria-label="${e(text.map.title)}" style="min-width:${String(Math.min(layout.width, 720))}px">${compass(layout.width, text.map.north)}<g class="lanes">${lanes.join('')}</g>${streets.join('')}${blocks.join('')}${caption}</svg></div>
<p class="tag">${e(text.map.legend)}</p>
${plans.join('\n')}`;
}
