// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { assertNever, type DetectiveRunView, type TurnView } from '@the-race/engine';
import { escapeHtml, truncate } from './escape-html.js';
import { named, type TabText } from './tab-text.js';

const REREAD_LENGTH = 70;

const list = (items: readonly string[]): string =>
  `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** The working time left as hours and minutes. */
function duration(minutes: number, text: TabText['chronicle']): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours)} ${text.hours} ${String(minutes % 60)} ${text.minutes}`;
}

/** One turn in the player's own terms, from the words of the language. The text of a conclusion is the player's own. */
function turnText(turn: TurnView, text: TabText): string {
  const t = text.chronicle.turn;
  const fill = (line: string, values: Readonly<Record<string, string>>): string =>
    Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), line);
  switch (turn.kind) {
    case 'look':
      return fill(t.look, { n: String(turn.found) });
    case 'move':
      return fill(turn.entered ? t.move : t.moveFailed, { name: turn.to });
    case 'search':
      return fill(t.search, { n: String(turn.found) });
    case 'rest':
      return t.rest;
    case 'interrogate':
      return fill(t.interrogate, {
        name: turn.suspect,
        approach: named(text.chronicle.approaches, turn.approach),
        n: String(turn.showed),
      });
    case 'deduce':
      return turn.result === 'insight'
        ? fill(t.insight, { text: turn.insight ?? '' })
        : turn.result === 'already-known'
          ? t.alreadyKnown
          : t.nothing;
    case 'reread':
      return fill(t.reread, { text: truncate(turn.clue, REREAD_LENGTH) });
    case 'use':
      return fill(t.use, { name: named(text.hero.consumables, turn.item) });
    case 'accuse':
      return t.accuse;
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(turn);
  }
}

/** What is still open, from the public view alone: places not seen, ways shut, people not asked, clues to reread. */
function openQuestions(view: DetectiveRunView, text: TabText['chronicle']): string[] {
  const places = view.map.places.filter(({ visited }) => !visited);
  const name = (place: { readonly name: string }): string => escapeHtml(place.name);
  return [
    ...places
      .filter(({ blocked }) => blocked === null)
      .map((place) => `${escapeHtml(text.unvisited)}: ${name(place)}`),
    ...places
      .filter(({ blocked }) => blocked === 'locked')
      .map((place) => `${escapeHtml(text.locked)}: ${name(place)}`),
    ...places
      .filter(({ blocked }) => blocked === 'closed')
      .map((place) => `${escapeHtml(text.closed)}: ${name(place)}`),
    ...view.suspects
      .filter(({ statements }) => statements.length === 0)
      .map((suspect) => `${escapeHtml(text.unquestioned)}: ${escapeHtml(suspect.name)}`),
    ...view.clues
      .filter(({ garbled }) => garbled)
      .map(
        ({ description }) =>
          `${escapeHtml(text.reread)}: ${escapeHtml(truncate(description, REREAD_LENGTH))}`,
      ),
  ];
}

/**
 * The chronicle: the day and the working time left, what the world has done, what is still open and the last
 * turns the player took. Nothing in it says which statement is false or which suspect is guilty: the open
 * questions are only what has not been tried.
 */
export function renderChronicle(view: DetectiveRunView, turns: readonly TurnView[], text: TabText): string {
  const t = text.chronicle;
  const e = escapeHtml;
  const open = openQuestions(view, t);
  return `<div class="card">
<p>${e(t.now)}: ${e(t.day)} ${String(view.clock.day)} / ${String(view.clock.totalDays)}, ${clock(view.clock.minute)}</p>
<p>${e(t.left)}: <strong>${e(duration(view.chronicle.activeMinutesLeft, t))}</strong></p>${
    view.weather === null ? '' : `\n<p>${e(t.weatherToday)}: ${e(named(t.weathers, view.weather))}</p>`
  }
</div>
<h3>${e(t.inspired)}</h3>
${
  view.inspiration === null
    ? `<p class="empty">${e(t.inspiredNone)}</p>`
    : `<p><span class="tag">${e(named(t.seedKinds, view.inspiration.kind))}</span> ${e(view.inspiration.premise)}</p>`
}
<h3>${e(t.events)}</h3>
${
  view.chronicle.events.length === 0
    ? `<p class="empty">${e(t.noEvents)}</p>`
    : list(
        view.chronicle.events.map(
          ({ day, text: event }) => `<span class="tag">${e(t.day)} ${String(day)}</span> ${e(event)}`,
        ),
      )
}
<h3>${e(t.open)}</h3>
${open.length === 0 ? `<p class="empty">${e(t.nothingOpen)}</p>` : list(open)}
<h3>${e(t.turns)}</h3>
${
  turns.length === 0
    ? `<p class="empty">${e(t.noTurns)}</p>`
    : list(
        turns.map(
          (turn) =>
            `<span class="tag">${e(t.day)} ${String(turn.day)} · ${clock(turn.minute)}</span> ${e(turnText(turn, text))}`,
        ),
      )
}`;
}
