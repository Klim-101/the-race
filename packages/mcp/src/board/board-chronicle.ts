// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import {
  assertNever,
  type DetectiveRunView,
  type Shortfall,
  type StripTurn,
  type TurnView,
} from '@the-race/engine';
import { escapeHtml, truncate } from './escape-html.js';
import { clueTokens, leadTokens, placeTokens, rel, suspectTokens, token } from './board-relations.js';
import { NOTHING_NEW, type Fresh } from './board-new.js';
import { renderStrips } from './board-strip.js';
import { named, type TabText } from './tab-text.js';

const REREAD_LENGTH = 70;

const list = (items: readonly string[]): string =>
  `<ul>${items.map((item) => (item.startsWith('<li') ? item : `<li>${item}</li>`)).join('')}</ul>`;

/** A list item that can be picked: it lights what ties to it, on this tab and on the others. */
const pickable = (
  entity: 'clue' | 'suspect' | 'place' | 'lead',
  id: string,
  tokens: readonly string[],
  body: string,
): string =>
  `<li data-pick="${escapeHtml(token(entity, id))}" data-rel="${escapeHtml(rel(tokens))}" tabindex="0" role="button">${body}</li>`;

export function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** The working time left as hours and minutes. */
export function duration(minutes: number, text: TabText['chronicle']): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours)} ${text.hours} ${String(minutes % 60)} ${text.minutes}`;
}

/** The deadline of an abduction on a line of its own: the day and the hour it falls at, and the time left; none for another case. */
export function deadlineLine(view: DetectiveRunView, text: TabText): string {
  const { deadline, minutesToDeadline } = view.chronicle;
  if (deadline === null || minutesToDeadline === null) return '';
  const t = text.chronicle;
  const left = t.deadlineIn.replace('{time}', duration(minutesToDeadline, t));
  return `<p>${escapeHtml(t.deadline)}: <strong>${escapeHtml(`${t.day} ${String(deadline.day)}, ${clock(deadline.minute)}`)}</strong> (${escapeHtml(left)})</p>`;
}

/** One turn in the player's own terms, from the words of the language. The text of a conclusion is the player's own. */
export function turnText(turn: TurnView, text: TabText): string {
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
    case 'stay-up':
      return t.stayUp;
    case 'sit':
      return fill(t.sit, { n: String(turn.restored) });
    case 'ask':
      return fill(t.ask, { result: turn.succeeded ? t.gotSomething : t.gotNothing });
    case 'study':
      return fill(t.study, { result: turn.succeeded ? t.gotSomething : t.gotNothing });
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
    case 'take':
      return fill(turn.how === 'sold' ? t.bought : t.found, {
        name: named(turn.itemKind === 'tool' ? text.hero.gear : text.hero.consumables, turn.item),
      });
    case 'accuse':
      return t.accuse;
    /* v8 ignore next 2 -- unreachable: the compiler proves the switch exhaustive */
    default:
      return assertNever(turn);
  }
}

/** The hours of a window as clock times, from the words of the language. */
export function windowText(
  window: { readonly fromMinute: number; readonly untilMinute: number },
  text: TabText['chronicle'],
): string {
  return text.window
    .replaceAll('{from}', clock(window.fromMinute))
    .replaceAll('{until}', clock(window.untilMinute));
}

/** What is still open, from the public view alone: places not seen, ways shut, people not asked, clues to reread. */
function openQuestions(view: DetectiveRunView, text: TabText['chronicle']): string[] {
  const places = view.map.places.filter(({ visited }) => !visited);
  const name = (place: { readonly name: string }): string => escapeHtml(place.name);
  const atPlace = (word: string) => (place: (typeof places)[number]) =>
    pickable('place', place.id, placeTokens(view, place.id), `${escapeHtml(word)}: ${name(place)}`);
  return [
    ...places.filter(({ blocked }) => blocked === null).map(atPlace(text.unvisited)),
    ...places.filter(({ blocked }) => blocked === 'locked').map(atPlace(text.locked)),
    ...places.filter(({ blocked }) => blocked === 'closed').map(atPlace(text.closed)),
    ...places.flatMap((place) =>
      place.blocked === 'closed-hours' && place.hours !== null
        ? [atPlace(`${text.closedHours}, ${windowText(place.hours, text)}`)(place)]
        : [],
    ),
    ...view.suspects
      .filter(({ statements }) => statements.length === 0)
      .map((suspect) =>
        pickable(
          'suspect',
          suspect.id,
          suspectTokens(view, suspect.id),
          `${escapeHtml(text.unquestioned)}: ${escapeHtml(suspect.name)}`,
        ),
      ),
    ...view.clues
      .filter(({ garbled }) => garbled)
      .map(({ id, description }) =>
        pickable(
          'clue',
          id,
          clueTokens(view, id),
          `${escapeHtml(text.reread)}: ${escapeHtml(truncate(description, REREAD_LENGTH))}`,
        ),
      ),
  ];
}

/** What the proof of a right accusation lacked, from the words of the language; the run is over, so nothing is spared. */
function renderShortfall(shortfall: Shortfall, t: TabText['chronicle']['shortfall']): string {
  const e = escapeHtml;
  const { motive, evidence } = shortfall;
  const motiveLine = motive.held
    ? t.motiveHeld
    : motive.offered
      ? motive.drawn
        ? t.motiveWrongDrawn
        : t.motiveWrongUndrawn
      : motive.drawn
        ? t.motiveNoneDrawn
        : t.motiveNoneUndrawn;
  return `<div class="card">
<h3>${e(t.title)}</h3>
<p>${e(motiveLine)}</p>${
    shortfall.place === undefined
      ? ''
      : `
<p>${e(shortfall.place.drawn ? t.placeDrawn : t.placeUndrawn)}</p>`
  }${
    evidence.held
      ? `
<p>${e(t.evidenceHeld)}</p>`
      : `
<p>${e(t.evidenceNearest)}</p>
${list(
  evidence.clues.map(
    ({ state, description, number }) =>
      `<span class="tag">${e(named(t.states, state))}</span> ${number === null ? '' : `${e(number)}: `}${e(description)}`,
  ),
)}`
  }
</div>
`;
}

/**
 * The chronicle: the day and the working time left, what the world has done, what is still open and the last
 * turns the player took. Nothing in it says which statement is false or which suspect is guilty: the open
 * questions are only what has not been tried.
 */
export function renderChronicle(
  view: DetectiveRunView,
  turns: readonly TurnView[],
  text: TabText,
  fresh: Fresh = NOTHING_NEW,
  strip: readonly StripTurn[] = [],
): string {
  const t = text.chronicle;
  const e = escapeHtml;
  const open = openQuestions(view, t);
  const shortfall = turns.flatMap((turn) =>
    turn.kind === 'accuse' && turn.shortfall ? [turn.shortfall] : [],
  )[0];
  return `<div class="card">
<p>${e(t.now)}: ${e(t.day)} ${String(view.clock.day)} / ${String(view.clock.totalDays)}, ${clock(view.clock.minute)}</p>
<p>${e(t.left)}: <strong>${e(duration(view.chronicle.activeMinutesLeft, t))}</strong></p>${deadlineLine(view, text)}${view.weather === null ? '' : `\n<p>${e(t.weatherToday)}: ${e(named(t.weathers, view.weather))}</p>`}
</div>
${shortfall === undefined ? '' : renderShortfall(shortfall, t.shortfall)}<h3>${e(text.strip.title)}</h3>
${turns.length === 0 ? `<p class="empty">${e(t.noTurns)}</p>` : ''}${renderStrips(view, strip, turns, text)}
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
<h3>${e(t.leads)}</h3>
${
  view.leads.length === 0
    ? `<p class="empty">${e(t.noLeads)}</p>`
    : list(
        view.leads.map(({ id, reason, window }) =>
          pickable(
            'lead',
            id,
            leadTokens(view, id),
            `${e(reason)}${window === null ? '' : ` <span class="tag">${e(windowText(window, t))}</span>`}${fresh.leadIds.has(id) ? ` <span class="new">${e(text.fresh.mark)}</span>` : ''}`,
          ),
        ),
      )
}
<h3>${e(t.open)}</h3>
${open.length === 0 ? `<p class="empty">${e(t.nothingOpen)}</p>` : list(open)}`;
}
