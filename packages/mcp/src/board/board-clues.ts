// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { linkNumbers, placeOf, renderMatrix } from './board-matrix.js';
import type { Fresh } from './board-new.js';
import { clueTokens, pickableTokens, rel, shownPairs, token } from './board-relations.js';
import type { BoardText } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

type Clue = DetectiveRunView['clues'][number];

/** The id of a clue's card, for the style that opens it when the clue is picked. */
export const cardId = (clueId: string): string => `card-${clueId}`;

/** The controls over the grid; the page's script shows only the cards that fit them (see `SCRIPT`). */
function filters(view: DetectiveRunView, text: TabText, example: string): string {
  const e = escapeHtml;
  const t = text.clueGrid;
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const places = [...new Set(view.clues.map((clue) => placeOf(view, clue)))];
  const shownTo = new Set(view.history.shown.map(({ suspectId }) => suspectId));
  const option = (value: string, label: string): string => `<option value="${e(value)}">${e(label)}</option>`;
  const suspects = view.suspects.filter(({ id }) => shownTo.has(id));
  return `<div class="filters" role="search" aria-label="${e(t.filters)}">
<label>${e(t.place)} <select id="f-place">${option('', t.any)}${places.map((id) => option(id, placeName.get(id) ?? id)).join('')}</select></label>
<label>${e(t.suspect)} <select id="f-suspect">${option('', t.any)}${suspects.map(({ id, name }) => option(id, name)).join('')}</select></label>
<label><input type="checkbox" id="f-garbled"> ${e(t.garbled)}</label>
<label><input type="checkbox" id="f-unused"> ${e(t.unused)}</label>
<label>${e(t.number)} <input type="search" id="f-number" placeholder="${e(t.numberHint.replace('{example}', example))}" size="12"></label>
</div>`;
}

/** One clue as a short card: what it says, where and when it was found, and marks for what is still to do with it. */
function card(view: DetectiveRunView, clue: Clue, board: BoardText, text: TabText, fresh: Fresh): string {
  const e = escapeHtml;
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const turn = view.history.finds.find(({ clueId }) => clueId === clue.id)?.turn;
  const place = placeOf(view, clue);
  const where = `${text.corkboard.foundAt} ${placeName.get(place) ?? place}${turn === undefined ? '' : ` · ${text.corkboard.step.replace('{n}', String(turn))}`}`;
  const shown = shownPairs(view).filter(({ clueId }) => clueId === clue.id);
  const linked = linkNumbers(view, clue.id).length > 0;
  const status = text.matrix.status;
  const marks = [
    ...(shown.length === 0 ? [status.notShown] : []),
    ...(linked ? [] : [status.notLinked]),
    ...(clue.witness === null ? [] : [text.clueGrid.heardFrom.replace('{name}', clue.witness)]),
  ];
  const attrs = [
    `id="${e(cardId(clue.id))}"`,
    `data-pick="${e(token('clue', clue.id))}"`,
    `data-rel="${e(rel(clueTokens(view, clue.id)))}"`,
    `data-place="${e(place)}"`,
    `data-shown="${e(shown.map(({ suspectId }) => suspectId).join(' '))}"`,
    `data-garbled="${clue.garbled ? '1' : '0'}"`,
    `data-unused="${linked ? '0' : '1'}"`,
    `data-number="${e(clue.number)}"`,
    'tabindex="0" role="button"',
  ].join(' ');
  return `<div class="card clue-card${clue.witness === null ? '' : ' sighting'}" ${attrs}>
<span class="tag"><span class="num">${e(clue.number)}</span> · ${e(where)}</span>${fresh.clueIds.has(clue.id) ? ` <span class="new">${e(text.fresh.mark)}</span>` : ''}
<p class="text">${e(clue.description)}</p>${clue.garbled ? `\n<p class="warn">${e(board.garbled)}</p>` : ''}${
    marks.length === 0
      ? ''
      : `\n<p class="marks">${marks.map((mark) => `<span class="mk">${e(mark)}</span>`).join(' ')}</p>`
  }
</div>`;
}

/** The style that opens the card of the picked clue in full, one rule for each clue whose id is allowed in a selector. */
export function cardRules(view: DetectiveRunView): string {
  const allowed = new Set(pickableTokens(view));
  return view.clues
    .filter(({ id }) => allowed.has(token('clue', id)))
    .map(
      ({ id }) =>
        `main[data-sel="${token('clue', id)}"] #${cardId(id)} .text{display:block;overflow:visible}`,
    )
    .join('\n');
}

/** The clues: the table of who was shown what, and under it the short cards of every clue with filters. */
export function renderClues(view: DetectiveRunView, board: BoardText, text: TabText, fresh: Fresh): string {
  const e = escapeHtml;
  const [first] = view.clues;
  const clues =
    first === undefined
      ? ''
      : `<h2>${e(text.matrix.cards)} (${String(view.clues.length)})</h2>
${filters(view, text, first.number)}
<div class="grid">${view.clues.map((clue) => card(view, clue, board, text, fresh)).join('\n')}</div>
<p class="empty" id="clue-none" hidden>${e(text.clueGrid.none)}</p>`;
  return `${view.clues.length === 0 ? `<p class="empty">${e(board.noClues)}</p>` : renderMatrix(view, board, text)}
${clues}`;
}
