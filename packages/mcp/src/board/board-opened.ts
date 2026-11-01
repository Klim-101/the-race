// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { pickableTokens, shownPairs } from './board-relations.js';
import { escapeHtml } from './escape-html.js';
import type { BoardText } from './board-text.js';
import type { TabText } from './tab-text.js';

// A clue card on the corkboard is a small pinned card; a click opens a larger one over the board with the whole
// clue and everything the hero did with it. The cards are plain markup, hidden until the script sets
// `data-open` on the page, and the style sheet shows the one that matches, so nothing here needs more from the
// script than an id. All of it is the hero's own doing, read from the public view.

/** The id of the opened card of a clue. */
export const openedId = (clueId: string): string => `open-${clueId}`;

/** The number of every clue found, by id; an id the view does not know is its own name. */
export function numberOf(view: DetectiveRunView): (clueId: string) => string {
  const numbers = new Map(view.clues.map(({ id, number }) => [id, number]));
  return (clueId) => numbers.get(clueId) ?? clueId;
}

/** The clue cards, opened: number, whole text, where and when found, to whom shown, and the links it took part in. */
export function renderOpened(view: DetectiveRunView, board: BoardText, text: TabText): string {
  const e = escapeHtml;
  const words = text.corkboard;
  const number = numberOf(view);
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const suspectName = new Map(view.suspects.map(({ id, name }) => [id, name]));
  const step = (turn: number): string => words.step.replace('{n}', String(turn));
  return view.clues
    .map((clue) => {
      const find = view.history.finds.find(({ clueId }) => clueId === clue.id);
      const place = placeName.get(find?.locationId ?? clue.locationId) ?? clue.locationId;
      const where = `${words.foundAt} ${place}${find === undefined ? '' : ` · ${step(find.turn)}`}`;
      const shown = shownPairs(view)
        .filter(({ clueId }) => clueId === clue.id)
        .map(
          ({ suspectId, effect }) => `${suspectName.get(suspectId) ?? suspectId} (${words.effects[effect]})`,
        );
      const links = view.history.links
        .filter(({ clueIds }) => clueIds.includes(clue.id))
        .map(
          ({ clueIds, result, turn }) =>
            `<li>${e(clueIds.map(number).join(' + '))} <span class="result">${e(words.results[result])}</span> <span class="tag">${e(step(turn))}</span></li>`,
        );
      const tried =
        links.length === 0 ? ` ${e(words.noLinks)}</p>` : `</p>\n<ul class="tried">${links.join('\n')}</ul>`;
      return `<div class="opened" id="${e(openedId(clue.id))}" role="dialog" aria-label="${e(clue.number)}" tabindex="-1">
<p class="tag">${e(clue.number)}</p>
<p class="whole">${e(clue.description)}</p>${clue.garbled ? `\n<p class="warn">${e(board.garbled)}</p>` : ''}
<p class="tag">${e(where)}</p>
<p class="tag">${e(words.shownTo)}: ${e(shown.length === 0 ? words.nobody : shown.join(', '))}</p>
<p class="tag">${e(words.linksOf)}:${tried}
<p class="note">${e(words.closeHint)}</p>
</div>`;
    })
    .join('\n');
}

/** The CSS that shows the card that is open, one rule for each clue whose id is allowed in a selector. */
export function openedRules(view: DetectiveRunView): string {
  const allowed = new Set(pickableTokens(view));
  return view.clues
    .filter(({ id }) => allowed.has(`clue:${id}`))
    .map(({ id }) => `main[data-open="${id}"] #${openedId(id)}{display:block}`)
    .join('\n');
}
