// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { clock } from './board-chronicle.js';
import type { Fresh } from './board-new.js';
import { numberOf } from './board-opened.js';
import { clueTokens, rel, suspectTokens, token } from './board-relations.js';
import type { BoardText } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

type Suspect = DetectiveRunView['suspects'][number];

const MOOD_STEPS = ['calm', 'shaken', 'cornered', 'broken'] as const;
const PORTRAITS = 6;

/** A small number from the id, so a person keeps the same colour; nothing random and nothing from the case's truth. */
function portraitOf(id: string): number {
  return (
    Array.from(id, (character) => character.charCodeAt(0)).reduce((sum, code) => sum + code, 0) % PORTRAITS
  );
}

/** A drawn silhouette with the person's initial: the case has no pictures, and a portrait must say nothing true. */
function portrait(suspect: Suspect): string {
  const initial = suspect.name.charAt(0);
  return `<svg class="portrait p${String(portraitOf(suspect.id))}" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="27"/><circle class="head" cx="28" cy="21" r="9"/><path class="body" d="M10 52c1-12 8-18 18-18s17 6 18 18z"/><text x="28" y="25" text-anchor="middle">${escapeHtml(initial.toUpperCase())}</text></svg>`;
}

/** The mood as a gauge of four steps and a word; the steps say how far, the word says what. */
function gauge(suspect: Suspect, text: TabText): string {
  const reached = MOOD_STEPS.indexOf(suspect.mood);
  const steps = MOOD_STEPS.map((_, index) => `<span class="step${index <= reached ? ' on' : ''}"></span>`);
  return `<span class="gauge mood-${suspect.mood}" role="img" aria-label="${escapeHtml(text.statements.moods[suspect.mood])}">${steps.join('')}</span> <span class="tag">${escapeHtml(text.statements.mood)}: ${escapeHtml(text.statements.moods[suspect.mood])}</span>`;
}

/** The clue chip: its number and what it did, tied to the clue wherever the clue is shown. */
function chip(view: DetectiveRunView, clueId: string, label: string, effect: string): string {
  const e = escapeHtml;
  const number = numberOf(view)(clueId);
  return `<span class="chip fx-${e(effect)}" data-pick="${e(token('clue', clueId))}" data-rel="${e(rel(clueTokens(view, clueId)))}" tabindex="0" role="button"><span class="num">${e(number)}</span> ${e(label)}</span>`;
}

/**
 * What the person has claimed, as they said it. A claim that was a lie and has fallen is struck through and tied to
 * the clues that broke it; a true one, and a lie that still stands, look the same as the day it was made.
 */
function claimed(view: DetectiveRunView, suspect: Suspect, text: TabText): string {
  if (suspect.claims.length === 0) return '';
  const e = escapeHtml;
  const t = text.statements;
  const lines = suspect.claims.map(({ day, text: line, broken }) =>
    broken === null
      ? `<p class="claim"><span class="tag">${e(t.day)} ${String(day)}</span> ${e(line)}</p>`
      : `<p class="claim fell"><span class="tag">${e(t.day)} ${String(day)} · ${e(t.lieFell)}</span><br><s>${e(line)}</s>${
          broken.clueIds.length === 0
            ? ''
            : `<br><span class="tag">${e(t.brokenBy)}:</span> ${broken.clueIds.map((id) => chip(view, id, '', 'breaks-lie')).join(' ')}`
        }</p>`,
  );
  return `<h3>${e(t.claims)}</h3>\n${lines.join('\n')}\n`;
}

/** What the person said, day by day; a lie that fell is struck through and tied to the clues that broke lies for them. */
function said(view: DetectiveRunView, suspect: Suspect, text: TabText): string {
  const e = escapeHtml;
  const t = text.statements;
  if (suspect.statements.length === 0) return `<p class="empty">${e(t.none)}</p>`;
  const breakers = [
    ...new Set(
      view.history.shown
        .filter(({ suspectId, effect }) => suspectId === suspect.id && effect === 'breaks-lie')
        .map(({ clueId }) => clueId),
    ),
  ];
  const days = [...new Set(suspect.statements.map(({ day }) => day))];
  return days
    .map((day) => {
      const lines = suspect.statements
        .filter((statement) => statement.day === day)
        .map(({ kind, text: line }) =>
          kind === 'conceded' && suspect.claims.length > 0
            ? `<p class="statement"><span class="tag">${e(t.kinds[kind])} · ${e(t.lieFell)}</span><br>${e(line)}</p>`
            : kind === 'conceded'
              ? `<p class="statement fell"><span class="tag">${e(t.kinds[kind])} · ${e(t.lieFell)}</span><br><s>${e(line)}</s>${
                  breakers.length === 0
                    ? ''
                    : `<br><span class="tag">${e(t.brokenBy)}:</span> ${breakers.map((id) => chip(view, id, '', 'breaks-lie')).join(' ')}`
                }</p>`
              : `<p class="statement"><span class="tag">${e(t.kinds[kind])}</span><br>${e(line)}</p>`,
        );
      return `<div class="day"><span class="tag">${e(t.day)} ${String(day)}</span>\n${lines.join('\n')}</div>`;
    })
    .join('\n');
}

/** What the person was shown, in the order it was shown, as chips coloured by what each did. */
function shown(view: DetectiveRunView, suspect: Suspect, text: TabText): string {
  const e = escapeHtml;
  const entries = view.history.shown.filter(({ suspectId }) => suspectId === suspect.id);
  if (entries.length === 0) return `<p class="empty">${e(text.statements.noneShown)}</p>`;
  return `<p class="chips">${entries
    .map(
      ({ clueId, effect, turn, reaction }) =>
        chip(
          view,
          clueId,
          `${text.corkboard.effects[effect]} · ${text.corkboard.step.replace('{n}', String(turn))}`,
          effect,
        ) + (reaction === undefined ? '' : ` <span class="reaction">${e(reaction)}</span>`),
    )
    .join(' ')}</p>`;
}

/** The suspects: a card for each, with a portrait, the place, the mood, what they said and what they were shown. */
export function renderSuspects(
  view: DetectiveRunView,
  board: BoardText,
  text: TabText,
  fresh: Fresh,
): string {
  const e = escapeHtml;
  return view.suspects
    .map((suspect) => {
      const where =
        suspect.place === null
          ? board.anywhere
          : suspect.place.id === view.location.id
            ? board.here
            : suspect.place.name;
      const closed = suspect.talksAgain
        ? `\n<p class="warn">${e(
            text.statements.closedUntil
              .replace('{day}', String(suspect.talksAgain.day))
              .replace('{time}', clock(suspect.talksAgain.minute)),
          )}</p>`
        : '';
      const mark =
        fresh.moods.has(suspect.id) || fresh.lieSuspectIds.has(suspect.id)
          ? ` <span class="new">${e(text.fresh.mark)}</span>`
          : '';
      const attrs = `data-pick="${e(token('suspect', suspect.id))}" data-rel="${e(rel(suspectTokens(view, suspect.id)))}" tabindex="0" role="button"`;
      return `<div class="card suspect${suspect.cleared ? ' cleared' : ''}" ${attrs}>
<div class="who">${portrait(suspect)}<div><strong>${e(suspect.name)}</strong>${mark}
<p>${e(suspect.persona)}</p>
<p class="tag">${e(board.whereabouts)}: ${e(where)}</p>${
        suspect.cleared ? `\n<p class="tag cleared-tag">${e(text.statements.cleared)}</p>` : ''
      }
<p>${gauge(suspect, text)}</p></div></div>${closed}
${claimed(view, suspect, text)}<h3>${e(text.statements.title)}</h3>
${said(view, suspect, text)}
<h3>${e(text.statements.shown)}</h3>
${shown(view, suspect, text)}
</div>`;
    })
    .join('\n');
}
