// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView, StripKind, StripTurn, TurnView } from '@the-race/engine';
import { clock, turnText, windowText } from './board-chronicle.js';
import { leadTokens, isSafeId, litRules, rel, token } from './board-relations.js';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

// The days of the run as strips: the hours of a day across, the night shaded, each turn a bar from where it began
// to where it ended with a symbol at its end, the hours of the leads that have a window under them, and the
// events of the world as flags. Everything comes from the public view and the turns the player took. Picking a
// turn lights what it touched, on every tab (see `turnRules`).

const WIDTH = 960;
const LEFT = 36;
const RIGHT = 12;
const SPAN = WIDTH - LEFT - RIGHT;
const MINUTES = 1440;
const NIGHT_UNTIL = 480;
const BAR_TOP = 40;
const BAR_HEIGHT = 22;
const LEAD_TOP = 76;
const LEAD_STEP = 9;
const MIN_BAR = 4;

/** A glyph for each kind of turn; it names nothing in words, so it needs no translation. */
export const STRIP_SYMBOLS: Record<StripKind, string> = {
  move: '→',
  look: '◎',
  search: '⌕',
  ask: '?',
  study: '◐',
  talk: '“',
  deduce: '∴',
  reread: '↺',
  sit: '≈',
  use: '+',
  take: '▣',
  rest: '☾',
  'stay-up': '☼',
  accuse: '!',
};

const x = (minute: number): number => LEFT + (minute / MINUTES) * SPAN;
const whole = (value: number): string => String(Math.round(value));
const fill = (line: string, values: Readonly<Record<string, string>>): string =>
  Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), line);

/** The tokens a turn lights when it is picked: the clues, the place and the person it touched. */
function touchedTokens(turn: StripTurn): string[] {
  const { clueIds, placeId, suspectId } = turn.touched;
  return [
    ...clueIds.map((id) => token('clue', id)),
    ...(placeId === null ? [] : [token('place', placeId)]),
    ...(suspectId === null ? [] : [token('suspect', suspectId)]),
  ].filter((entry) => isSafeId(entry.slice(entry.indexOf(':') + 1)));
}

/**
 * The CSS that lights what a turn touched when the turn is picked. Cards, photographs and places are lit by their
 * own pick, since none of them carries the turn in its relations; the turn itself and its line light by `data-rel`.
 */
export function turnRules(strip: readonly StripTurn[]): string {
  return strip
    .flatMap((turn) => {
      const self = `turn:${String(turn.turn)}`;
      return [
        litRules(self, `[data-rel~="${self}"]`),
        ...touchedTokens(turn).map((entry) => litRules(self, `[data-pick="${entry}"]`)),
      ];
    })
    .join('\n');
}

function rect(className: string, from: number, to: number, y: number, height: number): string {
  return `<rect class="${className}" x="${whole(x(from))}" y="${String(y)}" width="${whole(Math.max(0, x(to) - x(from)))}" height="${String(height)}"/>`;
}

/** One turn: a bar over the hours it took, the part spent in a detention, and its symbol where it ended. */
function turnBar(turn: StripTurn, line: string, text: TabText): string {
  const e = escapeHtml;
  const words = text.strip;
  const width = Math.max(MIN_BAR, x(turn.endMinute) - x(turn.startMinute));
  const left = x(turn.startMinute);
  const classes = [
    'turn',
    `k-${turn.kind}`,
    turn.crossedMidnight ? 'crossed' : '',
    turn.detainedMinutes === null ? '' : 'held',
    turn.endedInNight ? 'night-after' : '',
  ].filter((name) => name !== '');
  const notes = [
    ...(turn.detainedMinutes === null ? [] : [words.held]),
    ...(turn.crossedMidnight ? [words.intoNight] : []),
    ...(turn.endedInNight ? [words.nightFollowed] : []),
  ];
  const held =
    turn.detainedMinutes === null
      ? ''
      : rect(
          'detention',
          Math.max(turn.startMinute, turn.endMinute - turn.detainedMinutes),
          turn.endMinute,
          BAR_TOP,
          BAR_HEIGHT,
        );
  const self = `turn:${String(turn.turn)}`;
  const end = left + width;
  const title = `${words.kinds[turn.kind]}: ${line}${notes.length === 0 ? '' : ` (${notes.join('; ')})`}`;
  return `<g class="${classes.join(' ')}" data-pick="${self}" data-rel="${self}" tabindex="0" role="button" aria-label="${e(title)}"><title>${e(title)}</title><rect class="bar" x="${whole(left)}" y="${String(BAR_TOP)}" width="${whole(width)}" height="${String(BAR_HEIGHT)}" rx="3"/>${held}<circle class="end" cx="${whole(end)}" cy="${String(BAR_TOP + BAR_HEIGHT / 2)}" r="9"/><text class="symbol" x="${whole(end)}" y="${String(BAR_TOP + BAR_HEIGHT / 2 + 4)}" text-anchor="middle">${e(STRIP_SYMBOLS[turn.kind])}</text></g>`;
}

/** The hours of each lead that has a window, one row for each, wrapping across midnight where it does. */
function leadBands(view: DetectiveRunView, text: TabText): { markup: string; rows: number } {
  const e = escapeHtml;
  const windowed = view.leads.flatMap((lead) =>
    lead.window === null ? [] : [{ lead, window: lead.window }],
  );
  const markup = windowed.map(({ lead, window }, row) => {
    const y = LEAD_TOP + row * LEAD_STEP;
    const parts =
      window.fromMinute < window.untilMinute
        ? [rect('lead-hours', window.fromMinute, window.untilMinute, y, 6)]
        : [
            rect('lead-hours', window.fromMinute, MINUTES, y, 6),
            rect('lead-hours', 0, window.untilMinute, y, 6),
          ];
    const title = `${text.strip.leadHours}: ${lead.reason} (${windowText(window, text.chronicle)})`;
    return `<g class="lead-band${lead.openNow ? '' : ' shut'}" data-pick="${e(token('lead', lead.id))}" data-rel="${e(rel(leadTokens(view, lead.id)))}" tabindex="0" role="button" aria-label="${e(title)}"><title>${e(title)}</title>${parts.join('')}</g>`;
  });
  return { markup: markup.join(''), rows: windowed.length };
}

/** The ticks of the hours, every three hours, with the night shaded from midnight to the start of the day. */
function axis(text: TabText): string {
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => {
    const minute = hour * 60;
    return `<line class="tick" x1="${whole(x(minute))}" y1="${String(BAR_TOP - 6)}" x2="${whole(x(minute))}" y2="${String(BAR_TOP + BAR_HEIGHT + 6)}"/><text class="hour" x="${whole(x(minute))}" y="${String(BAR_TOP + BAR_HEIGHT + 20)}" text-anchor="middle">${String(hour).padStart(2, '0')}</text>`;
  });
  return `${rect('night-shade', 0, NIGHT_UNTIL, BAR_TOP - 6, BAR_HEIGHT + 12)}<text class="night-label" x="${whole(x(NIGHT_UNTIL / 2))}" y="${String(BAR_TOP - 12)}" text-anchor="middle">${escapeHtml(text.strip.night)}</text>${ticks.join('')}`;
}

function dayStrip(
  day: number,
  view: DetectiveRunView,
  turns: readonly StripTurn[],
  listed: readonly TurnView[],
  lines: ReadonlyMap<number, string>,
  text: TabText,
): string {
  const e = escapeHtml;
  const words = text.strip;
  const today = day === view.clock.day;
  const bands = leadBands(view, text);
  const events = view.chronicle.events.filter((event) => event.day === day);
  const flags = events.map(
    (event, index) =>
      `<g class="flag" tabindex="0"><title>${e(`${words.world}: ${event.text}`)}</title><path d="M${whole(x(NIGHT_UNTIL) + index * 14)} ${String(BAR_TOP - 8)} v-22 l12 6 l-12 6"/></g>`,
  );
  const left = today
    ? `<rect class="time-left" x="${whole(x(view.clock.minute))}" y="8" width="${whole(x(MINUTES) - x(view.clock.minute))}" height="6"><title>${e(words.timeLeft)}</title></rect><line class="now" x1="${whole(x(view.clock.minute))}" y1="${String(BAR_TOP - 10)}" x2="${whole(x(view.clock.minute))}" y2="${String(BAR_TOP + BAR_HEIGHT + 10)}"/>`
    : '';
  const height = LEAD_TOP + Math.max(1, bands.rows) * LEAD_STEP + 6;
  const bars = turns.map((turn) => turnBar(turn, lines.get(turn.turn) ?? '', text)).join('');
  const label = fill(words.day, { n: String(day) });
  const items = listed.map(
    (turn) =>
      `<li data-pick="turn:${String(turn.turn)}" data-rel="turn:${String(turn.turn)}" tabindex="0" role="button"><span class="tag">${e(clock(turn.minute))}</span> ${e(turnText(turn, text))}</li>`,
  );
  return `<details class="day-strip"${today ? ' open' : ''}>
<summary>${e(label)}${today ? ` · ${e(words.today)}` : ''}</summary>
<div class="graph"><svg class="strip" viewBox="0 0 ${String(WIDTH)} ${String(height)}" role="group" aria-label="${e(label)}">${axis(text)}${left}${bands.markup}${flags.join('')}${bars}</svg></div>
${items.length === 0 ? '' : `<ol class="day-turns">${items.join('')}</ol>`}
</details>`;
}

/** The strips of every day the hero has lived, the current one open and the earlier ones folded. */
export function renderStrips(
  view: DetectiveRunView,
  strip: readonly StripTurn[],
  turns: readonly TurnView[],
  text: TabText,
): string {
  const lines = new Map(turns.map((turn) => [turn.turn, turnText(turn, text)]));
  // A turn is listed on the day its bar is drawn on; one the strip does not know goes on the day it ended.
  const barDay = new Map(strip.map((turn) => [turn.turn, turn.day]));
  const oldestFirst = turns.toReversed();
  const days = Array.from({ length: view.clock.day }, (_, index) => index + 1);
  return `<p class="note">${escapeHtml(text.strip.legend)}</p>
${days
  .map((day) =>
    dayStrip(
      day,
      view,
      strip.filter((turn) => turn.day === day),
      oldestFirst.filter((turn) => (barDay.get(turn.turn) ?? turn.day) === day),
      lines,
      text,
    ),
  )
  .join('\n')}`;
}
