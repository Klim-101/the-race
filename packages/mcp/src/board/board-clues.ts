// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { renderLinks } from './board-links.js';
import type { Fresh } from './board-new.js';
import { numberOf } from './board-opened.js';
import { clueTokens, pickableTokens, rel, shownPairs, threadTokens, token } from './board-relations.js';
import type { BoardText } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

type Clue = DetectiveRunView['clues'][number];

/** The links the hero tried, oldest first, with the clues of each and what came of it, and nothing of how close it was. */
function tried(view: DetectiveRunView, text: TabText): string {
  const e = escapeHtml;
  if (view.history.links.length === 0) return `<p class="empty">${e(text.corkboard.noneTried)}</p>`;
  const description = new Map(view.clues.map(({ id, description: line }) => [id, line]));
  const number = numberOf(view);
  const items = view.history.links.map(({ clueIds, result, turn }) => {
    const names = clueIds.map((id) => `<span class="num">${e(number(id))}</span>`).join(' + ');
    // The numbers are the name of each clue; its whole text is one click away.
    const whole = clueIds
      .map((id) => `<p><span class="num">${e(number(id))}</span> ${e(description.get(id) ?? id)}</p>`)
      .join('');
    return `<li data-rel="${e(rel(threadTokens(clueIds)))}">${names} <span class="result">${e(text.corkboard.results[result])}</span> <span class="tag">${e(text.corkboard.step.replace('{n}', String(turn)))}</span>
<details><summary>${e(text.corkboard.fullText)}</summary>${whole}</details></li>`;
  });
  return `<ul class="tried">${items.join('\n')}</ul>`;
}

/** The id of a clue's card, for the style that opens it when the clue is picked. */
export const cardId = (clueId: string): string => `card-${clueId}`;

/** The place a clue was found at: where the hero found it, which is the clue's own. */
const placeOf = (view: DetectiveRunView, clue: Clue): string =>
  view.history.finds.find(({ clueId }) => clueId === clue.id)?.locationId ?? clue.locationId;

const linksOf = (view: DetectiveRunView, clueId: string) =>
  view.history.links.filter(({ clueIds }) => clueIds.includes(clueId));

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

/** One clue as a card: what it says, where and when it was found, and what the hero did with it. */
function card(view: DetectiveRunView, clue: Clue, board: BoardText, text: TabText, fresh: Fresh): string {
  const e = escapeHtml;
  const number = numberOf(view);
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const suspectName = new Map(view.suspects.map(({ id, name }) => [id, name]));
  const turn = view.history.finds.find(({ clueId }) => clueId === clue.id)?.turn;
  const place = placeOf(view, clue);
  const where = `${text.corkboard.foundAt} ${placeName.get(place) ?? place}${turn === undefined ? '' : ` · ${text.corkboard.step.replace('{n}', String(turn))}`}`;
  const shown = shownPairs(view).filter(({ clueId }) => clueId === clue.id);
  const shownLine =
    shown.length === 0
      ? text.corkboard.nobody
      : shown
          .map(
            ({ suspectId, effect }) =>
              `${suspectName.get(suspectId) ?? suspectId} (${text.corkboard.effects[effect]})`,
          )
          .join(', ');
  const links = linksOf(view, clue.id);
  const used =
    links.length === 0
      ? text.clueGrid.notUsed
      : `${text.clueGrid.usedIn.replace('{n}', String(links.length))}: ${links.map(({ clueIds }) => clueIds.map(number).join(' + ')).join('; ')}`;
  const attrs = [
    `id="${e(cardId(clue.id))}"`,
    `data-pick="${e(token('clue', clue.id))}"`,
    `data-rel="${e(rel(clueTokens(view, clue.id)))}"`,
    `data-place="${e(place)}"`,
    `data-shown="${e(shown.map(({ suspectId }) => suspectId).join(' '))}"`,
    `data-garbled="${clue.garbled ? '1' : '0'}"`,
    `data-unused="${links.length === 0 ? '1' : '0'}"`,
    `data-number="${e(clue.number)}"`,
    'tabindex="0" role="button"',
  ].join(' ');
  return `<div class="card clue-card" ${attrs}>
<span class="tag"><span class="num">${e(clue.number)}</span> · ${e(where)}</span>${fresh.clueIds.has(clue.id) ? ` <span class="new">${e(text.fresh.mark)}</span>` : ''}
<p class="text">${e(clue.description)}</p>${clue.garbled ? `\n<p class="warn">${e(board.garbled)}</p>` : ''}
<p class="tag">${e(text.corkboard.shownTo)}: ${e(shownLine)}</p>
<p class="tag">${e(used)}</p>
<p class="tag ways"><a href="#board">${e(text.clueGrid.toBoard)}</a> · <a href="#map">${e(text.clueGrid.toMap)}</a></p>
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

/** The clues and links: the links to be made and tried, a grid of clue cards with filters, and the conclusions. */
export function renderClues(view: DetectiveRunView, board: BoardText, text: TabText, fresh: Fresh): string {
  const e = escapeHtml;
  const description = new Map(view.clues.map(({ id, description: line }) => [id, line]));
  const number = numberOf(view);
  const [first] = view.clues;
  const clues =
    first === undefined
      ? `<p class="empty">${e(board.noClues)}</p>`
      : `${filters(view, text, first.number)}
<div class="grid">${view.clues.map((clue) => card(view, clue, board, text, fresh)).join('\n')}</div>
<p class="empty" id="clue-none" hidden>${e(text.clueGrid.none)}</p>`;
  const insights =
    view.insights.length === 0
      ? `<p class="empty">${e(board.noInsights)}</p>`
      : view.insights
          .map(({ insight, clueIds }) => {
            const sources = clueIds.flatMap((id) => {
              const line = description.get(id);
              return line === undefined
                ? []
                : [`<span class="source"><span class="num">${e(number(id))}</span> ${e(line)}</span>`];
            });
            const from =
              sources.length === 0
                ? ''
                : `\n<p class="tag">${e(text.corkboard.drawnFrom)}:</p>\n${sources.join('\n')}`;
            return `<div class="card" data-rel="${e(rel(threadTokens(clueIds)))}"><p>${e(insight)}</p>${from}</div>`;
          })
          .join('\n');
  return `<h2>${e(text.links.title)}</h2>
${renderLinks(view, text)}
<h2>${e(text.corkboard.tried)}</h2>
${tried(view, text)}
<h2>${e(board.clues)} (${String(view.clues.length)})</h2>
${clues}
<h2>${e(board.insights)} (${String(view.insights.length)})</h2>
${insights}`;
}
