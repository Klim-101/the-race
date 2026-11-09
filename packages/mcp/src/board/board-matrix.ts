// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { clueTokens, rel, shownPairs, suspectTokens, token } from './board-relations.js';
import type { BoardText } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import type { TabText } from './tab-text.js';

// The table of a case file: the people down the side, the clues across the top, and in each cell what showing
// that clue to that person did. It is made of what the hero did (`history.shown`) and of what a clue bears on,
// which the view already says: a dashed cell is a clue that bears on a person and was never shown to them. It
// never says whether a clue breaks a lie before it has been shown, and never who did it.

type Clue = DetectiveRunView['clues'][number];
type ShownEffect = DetectiveRunView['history']['shown'][number]['effect'];

const SYMBOL: Record<ShownEffect, string> = {
  'breaks-lie': '✕',
  confirms: '✓',
  implicates: '!',
  'no-effect': '·',
};
const KIND: Record<ShownEffect, string> = {
  'breaks-lie': 'c-breaks',
  confirms: 'c-conf',
  implicates: 'c-impl',
  'no-effect': 'c-none',
};

/** The place a clue was found at: where the hero found it, which is the clue's own. */
export const placeOf = (view: DetectiveRunView, clue: Clue): string =>
  view.history.finds.find(({ clueId }) => clueId === clue.id)?.locationId ?? clue.locationId;

/** The links the hero tried that a clue is in, by their order from one. */
export const linkNumbers = (view: DetectiveRunView, clueId: string): number[] =>
  view.history.links.flatMap(({ clueIds }, index) => (clueIds.includes(clueId) ? [index + 1] : []));

/** The clues that bear on a person and were never shown to them, in the order they were found. */
export function unshownFor(view: DetectiveRunView, suspectId: string): Clue[] {
  const shown = new Set(
    shownPairs(view)
      .filter((pair) => pair.suspectId === suspectId)
      .map(({ clueId }) => clueId),
  );
  return view.clues.filter((clue) => clue.bearsOn.includes(suspectId) && !shown.has(clue.id));
}

/** The people by the clues (the page asks for it only when a clue is found), the clues grouped by the place they were found, and a last row of the links of each clue. */
export function renderMatrix(view: DetectiveRunView, board: BoardText, text: TabText): string {
  const e = escapeHtml;
  const t = text.matrix;
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const places = [...new Set(view.clues.map((clue) => placeOf(view, clue)))];
  const clues = places.flatMap((place) => view.clues.filter((clue) => placeOf(view, clue) === place));
  const pairs = new Map(shownPairs(view).map((pair) => [`${pair.clueId}\n${pair.suspectId}`, pair.effect]));
  const picking = (entry: string, tokens: readonly string[]): string =>
    `data-pick="${e(entry)}" data-rel="${e(rel(tokens))}" tabindex="0" role="button"`;

  const groups = places
    .map((place) => {
      const span = view.clues.filter((clue) => placeOf(view, clue) === place).length;
      return `<th colspan="${String(span)}" scope="colgroup">${e(placeName.get(place) ?? place)}</th>`;
    })
    .join('');
  const heads = clues
    .map(
      (clue) =>
        `<th scope="col" class="clue" ${picking(token('clue', clue.id), clueTokens(view, clue.id))}><span class="num">${e(clue.number)}</span>${
          clue.witness === null
            ? ''
            : `<div class="mks"><span class="mk w" title="${e(text.clueGrid.heardFrom.replace('{name}', clue.witness))}">${e(t.status.witness)}</span></div>`
        }</th>`,
    )
    .join('');

  const rows = view.suspects
    .map((suspect) => {
      const where =
        suspect.place === null
          ? board.anywhere
          : suspect.place.id === view.location.id
            ? board.here
            : suspect.place.name;
      const cells = clues
        .map((clue) => {
          const effect = pairs.get(`${clue.id}\n${suspect.id}`);
          if (effect !== undefined) {
            const label = text.corkboard.effects[effect];
            return `<td><span class="cell ${KIND[effect]}" role="img" aria-label="${e(label)}" title="${e(label)}">${SYMBOL[effect]}</span></td>`;
          }
          return clue.bearsOn.includes(suspect.id)
            ? `<td><span class="cell c-todo" role="img" aria-label="${e(t.unshown)}" title="${e(t.unshown)}">?</span></td>`
            : '<td></td>';
        })
        .join('');
      return `<tr${suspect.cleared ? ' class="cleared"' : ''}><th scope="row" class="who" ${picking(token('suspect', suspect.id), suspectTokens(view, suspect.id))}>${e(suspect.name)}<small>${e(board.whereabouts)}: ${e(where)}</small></th>${cells}</tr>`;
    })
    .join('\n');

  const used = clues
    .map((clue) => {
      const numbers = linkNumbers(view, clue.id);
      return numbers.length === 0
        ? `<td class="unused" title="${e(t.none)}">—</td>`
        : `<td class="used">${numbers.map(String).join(' ')}</td>`;
    })
    .join('');

  const legend = [
    ...(Object.keys(SYMBOL) as ShownEffect[]).map(
      (effect) =>
        `<span><b class="cell ${KIND[effect]}">${SYMBOL[effect]}</b>${e(text.corkboard.effects[effect])}</span>`,
    ),
    `<span><b class="cell c-todo">?</b>${e(t.unshown)}</span>`,
  ].join('');

  return `<h2>${e(t.title)}</h2>
<div class="legend">${legend}</div>
<div class="wrapx"><table class="matrix">
<thead><tr class="place"><th class="who"></th>${groups}</tr><tr><th class="who"></th>${heads}</tr></thead>
<tbody>
${rows}
<tr class="foot"><th scope="row" class="who">${e(t.linkedIn)}</th>${used}</tr>
</tbody></table></div>
<p class="note">${e(t.hint)}</p>`;
}
