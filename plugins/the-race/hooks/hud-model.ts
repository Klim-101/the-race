// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { Hud, HudPlace } from '../types';

// The HUD's model: what the game's own tools say, folded into a few fields. It reads the public view of the
// run and nothing else (the answers of run_view and of the turn tools), so it can hold nothing the narrator
// may not tell. The map comes from `view.map` whole each time; it is never rebuilt from the exits.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The tool's answer as JSON, or undefined when it is not (an error text, a refusal). */
export function parseResult(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const data: unknown = JSON.parse(text);
    return isRecord(data) ? data : undefined;
  } catch {
    return undefined;
  }
}

/** The language a tool answered in, when it said one. */
export function localeOf(data: Record<string, unknown>): 'ru' | 'en' | undefined {
  const view = isRecord(data['view']) ? data['view'] : data;
  const locale = view['locale'];
  return locale === 'ru' || locale === 'en' ? locale : undefined;
}

function placeOf(value: unknown): HudPlace | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, visited, blocked } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof visited !== 'boolean') return undefined;
  return { id, name, visited, blocked: blocked === 'locked' || blocked === 'closed' ? blocked : null };
}

/**
 * Folds what a game tool said into the HUD. `run_view` is the full public view and the turn tools carry a
 * short `view` of the same run, both with the known map. An answer that is not a view of a run in progress
 * leaves the HUD as it was, except that a run which is over, or no run at all, closes it.
 */
export function applyResult(hud: Hud | null, data: Record<string, unknown>): Hud | null {
  const view = isRecord(data['view']) ? data['view'] : data;
  const status = view['status'];
  if (typeof status === 'string' && status !== 'active') return null;

  const { clock, map, title } = view;
  if (!isRecord(clock) || !isRecord(map) || typeof title !== 'string') return hud;
  const { current } = map;
  if (typeof current !== 'string' || !Array.isArray(map['places']) || !Array.isArray(map['links']))
    return hud;
  const day = clock['day'];
  const minute = clock['minute'];
  const totalDays = clock['totalDays'];
  if (typeof day !== 'number' || typeof minute !== 'number' || typeof totalDays !== 'number') return hud;

  const places = map['places'].flatMap((value): HudPlace[] => {
    const place = placeOf(value);
    return place === undefined ? [] : [place];
  });
  if (!places.some(({ id }) => id === current)) return hud;
  const links = map['links'].flatMap((value): Hud['links'] =>
    isRecord(value) && typeof value['from'] === 'string' && typeof value['to'] === 'string'
      ? [{ from: value['from'], to: value['to'] }]
      : [],
  );

  const clues = view['clues'];
  const clueCount = Array.isArray(clues) ? clues.length : view['clueCount'];
  return {
    locale: localeOf(data) ?? hud?.locale ?? 'en',
    title,
    day,
    totalDays,
    minute,
    turn: typeof view['turn'] === 'number' ? view['turn'] : (hud?.turn ?? 0),
    locationId: current,
    clueCount: typeof clueCount === 'number' ? clueCount : (hud?.clueCount ?? 0),
    places,
    links,
  };
}

export const LABELS = {
  ru: {
    day: 'День',
    clues: 'улик',
    map: 'Карта',
    here: 'вы здесь',
    unvisited: 'не посещено',
    locked: 'заперто',
    closed: 'закрыто',
    none: 'Забег ещё не начался.',
    open: 'Открыто окно the RACE.',
  },
  en: {
    day: 'Day',
    clues: 'clues',
    map: 'Map',
    here: 'you are here',
    unvisited: 'not visited',
    locked: 'locked',
    closed: 'closed',
    none: 'No run yet.',
    open: 'The RACE pane opened.',
  },
} as const;

export function clockText(hud: Pick<Hud, 'minute'>): string {
  const hour = String(Math.floor(hud.minute / 60)).padStart(2, '0');
  const minute = String(hud.minute % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

/** Day progress as a bar, e.g. `▓▓▓░░░░`. */
export function dayBar(hud: Pick<Hud, 'day' | 'totalDays'>): string {
  const total = Math.max(1, hud.totalDays);
  const filled = Math.min(total, Math.max(0, hud.day));
  return '▓'.repeat(filled) + '░'.repeat(total - filled);
}

export type MapRow = { prefix: string; place: HudPlace; here: boolean };

/** The known places as a tree grown from the hero's place, branch by branch; each place appears once. */
export function mapRows(hud: Hud): MapRow[] {
  const byId = new Map(hud.places.map((place) => [place.id, place]));
  const neighbours = (id: string): string[] =>
    hud.links.flatMap(({ from, to }) => (from === id ? [to] : to === id ? [from] : []));
  const rows: MapRow[] = [];
  const seen = new Set<string>([hud.locationId]);

  const walk = (id: string, indent: string, isLast: boolean, isRoot: boolean): void => {
    const place = byId.get(id);
    if (place === undefined) return;
    rows.push({
      prefix: isRoot ? '' : `${indent}${isLast ? '└─ ' : '├─ '}`,
      place,
      here: id === hud.locationId,
    });
    const next = neighbours(id).filter((other) => !seen.has(other) && byId.has(other));
    for (const other of next) seen.add(other);
    const childIndent = isRoot ? '' : `${indent}${isLast ? '   ' : '│  '}`;
    next.forEach((other, index) => walk(other, childIndent, index === next.length - 1, false));
  };
  walk(hud.locationId, '', true, true);
  return rows;
}
