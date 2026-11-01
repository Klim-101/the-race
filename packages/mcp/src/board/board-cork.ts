// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { clueTokens, placeTokens, rel, shownPairs, suspectTokens, threadTokens } from './board-relations.js';
import { escapeHtml, truncate } from './escape-html.js';
import { openedId, renderOpened } from './board-opened.js';
import type { BoardText } from './board-text.js';
import type { TabText } from './tab-text.js';

// The corkboard of a film detective: the people pinned up as photographs along the top, the clues below them
// as index cards, and thread between them. A red thread joins the clues of a link the hero tried; a blue one
// runs from a clue to each person it was shown to. It is drawn from what the hero did and nothing else, so a
// thread never says whether a link was right or what a clue points at.

const COLUMNS = 4;
const CARD_W = 210;
const CARD_H = 134;
const GAP = 34;
const MARGIN = 24;
const PHOTO_W = 104;
const PHOTO_H = 104;
// The caption sits below the frame, with room for two lines.
const CAPTION_LINES = 2;
const CAPTION_STEP = 15;
const CAPTION_H = CAPTION_LINES * CAPTION_STEP + 12;
const WHERE_LENGTH = 30;
const WHERE_LINES = 3;
const LINE_LENGTH = 22;
const LINES = 3;
const WIDTH = MARGIN * 2 + COLUMNS * CARD_W + (COLUMNS - 1) * GAP;
const ROW_STEP = CARD_H + GAP + 8;

const whole = (value: number): string => String(Math.round(value));

/** The text cut into at most `lines` lines of about `length` characters at word breaks; the last ends in an ellipsis if cut. */
export function wrap(text: string, length: number, lines: number): string[] {
  const out: string[] = [];
  let current = '';
  const words = text.split(/\s+/).filter((word) => word !== '');
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`;
    if (Array.from(next).length <= length) {
      current = next;
      continue;
    }
    if (current !== '') out.push(current);
    // A word longer than a line is cut on the line itself.
    current = truncate(word, length);
  }
  if (current !== '') out.push(current);
  if (out.length <= lines) return out;
  return [
    ...out.slice(0, lines - 1),
    ...out.slice(lines - 1, lines).map((last) => truncate(`${last} …`, length)),
  ];
}

/** A small, fixed tilt for each card, so the board looks pinned by hand and always the same. */
const tilt = (index: number): number => ((index * 37) % 7) * 0.7 - 2.1;

interface Pin {
  readonly x: number;
  readonly y: number;
}

/** The corkboard as one SVG, with a line of how to use it and what the threads are. */
export function renderCork(view: DetectiveRunView, board: BoardText, text: TabText): string {
  const e = escapeHtml;
  const words = text.corkboard;
  if (view.clues.length === 0 && view.suspects.length === 0) {
    return `<p class="empty">${e(words.empty)}</p>`;
  }
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const turnOf = new Map(view.history.finds.map(({ clueId, turn }) => [clueId, turn]));

  // The people along the top.
  const people = view.suspects.length;
  const step = people > 1 ? Math.min(PHOTO_W + 40, (WIDTH - 2 * MARGIN - PHOTO_W) / (people - 1)) : 0;
  const startX = (WIDTH - ((people - 1) * step + PHOTO_W)) / 2;
  const photoTop = MARGIN;
  // About 7.5 units a character at the caption's size, and no wider than the room between two photographs.
  const captionLength = Math.max(8, Math.floor((people > 1 ? step : PHOTO_W + 40) / 7.5));
  const photoPin = new Map<string, Pin>();
  const photos = view.suspects.map((suspect, index) => {
    const x = startX + index * step;
    // The thread ends under the caption, so it never runs across a name.
    photoPin.set(suspect.id, { x: x + PHOTO_W / 2, y: photoTop + PHOTO_H + CAPTION_H });
    const caption = wrap(suspect.name, captionLength, CAPTION_LINES)
      .map(
        (line, row) =>
          `<text class="caption" x="${whole(x + PHOTO_W / 2)}" y="${whole(photoTop + PHOTO_H + 18 + row * CAPTION_STEP)}" text-anchor="middle">${e(line)}</text>`,
      )
      .join('');
    const initial = Array.from(suspect.name).slice(0, 1).join('').toUpperCase();
    const attrs = `data-pick="suspect:${e(suspect.id)}" data-rel="${e(rel(suspectTokens(view, suspect.id)))}" tabindex="0" role="button" aria-label="${e(suspect.name)}"`;
    return `<g class="photo" ${attrs}><title>${e(suspect.name)}</title><rect class="paper" x="${whole(x)}" y="${whole(photoTop)}" width="${String(PHOTO_W)}" height="${String(PHOTO_H)}" rx="3"/><rect class="print" x="${whole(x + 8)}" y="${whole(photoTop + 8)}" width="${String(PHOTO_W - 16)}" height="${String(PHOTO_H - 16)}" rx="2"/><text class="initial" x="${whole(x + PHOTO_W / 2)}" y="${whole(photoTop + 8 + (PHOTO_H - 16) / 2 + 14)}" text-anchor="middle">${e(initial)}</text>${caption}<circle class="pin" cx="${whole(x + PHOTO_W / 2)}" cy="${whole(photoTop)}" r="6"/></g>`;
  });

  // The clues as cards below them.
  const cardsTop = photoTop + (people > 0 ? PHOTO_H + CAPTION_H + 56 : 0);
  const cluePin = new Map<string, Pin>();
  const cards = view.clues.map((clue, index) => {
    const x = MARGIN + (index % COLUMNS) * (CARD_W + GAP);
    const y = cardsTop + Math.floor(index / COLUMNS) * ROW_STEP;
    cluePin.set(clue.id, { x: x + CARD_W / 2, y });
    const place = placeName.get(clue.locationId) ?? clue.locationId;
    const turn = turnOf.get(clue.id);
    const where = `${words.foundAt} ${place}${turn === undefined ? '' : ` · ${words.step.replace('{n}', String(turn))}`}`;
    // The place hangs from the bottom of the card, so a short one still sits at its foot.
    const placed = wrap(where, WHERE_LENGTH, WHERE_LINES);
    const whereLines = placed
      .map(
        (line, row) =>
          `<text x="${whole(x + 12)}" y="${whole(y + CARD_H - 14 - (placed.length - 1 - row) * 14)}">${e(line)}</text>`,
      )
      .join('');
    const lines = wrap(clue.description, LINE_LENGTH, LINES)
      .map(
        (line, row) =>
          `<text class="line" x="${whole(x + 12)}" y="${whole(y + 46 + row * 17)}">${e(truncate(line, LINE_LENGTH))}</text>`,
      )
      .join('');
    const attrs = `data-pick="clue:${e(clue.id)}" data-rel="${e(rel(clueTokens(view, clue.id)))}" tabindex="0" role="button" aria-controls="${e(openedId(clue.id))}" data-open="${e(clue.id)}" aria-label="${e(`${clue.number}: ${truncate(clue.description, 90)}`)}"`;
    const placeAttrs = `data-pick="place:${e(clue.locationId)}" data-rel="${e(rel(placeTokens(view, clue.locationId)))}"`;
    const turned = `rotate(${tilt(index).toFixed(1)} ${whole(x + CARD_W / 2)} ${whole(y + CARD_H / 2)})`;
    return `<g class="card-pin${clue.garbled ? ' garbled' : ''}" transform="${turned}" ${attrs}><title>${e(clue.description)}</title><rect class="paper" x="${whole(x)}" y="${whole(y)}" width="${String(CARD_W)}" height="${String(CARD_H)}" rx="3"/><text class="num" x="${whole(x + 12)}" y="${whole(y + 26)}">${e(clue.number)}</text>${lines}<g class="where" ${placeAttrs}>${whereLines}</g><circle class="pin" cx="${whole(x + CARD_W / 2)}" cy="${whole(y)}" r="6"/></g>`;
  });

  // The thread, drawn under the cards and the photographs so that it comes out from behind them.
  const threads: string[] = [];
  const links = [...view.history.links].sort(
    (a, b) => Number(a.result !== 'nothing') - Number(b.result !== 'nothing'),
  );
  for (const link of links) {
    const points = link.clueIds.flatMap((id) => {
      const at = cluePin.get(id);
      return at === undefined ? [] : [at];
    });
    if (points.length < 2) continue;
    const d = points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${whole(x)} ${whole(y)}`).join(' ');
    const kind = link.result === 'nothing' ? 'cold' : 'made';
    threads.push(`<path class="thread ${kind}" d="${d}" data-rel="${e(rel(threadTokens(link.clueIds)))}"/>`);
  }
  for (const { clueId, suspectId, effect } of shownPairs(view)) {
    const from = cluePin.get(clueId);
    const to = photoPin.get(suspectId);
    if (from === undefined || to === undefined) continue;
    const d = `M${whole(from.x)} ${whole(from.y)} C${whole(from.x)} ${whole(from.y - 70)} ${whole(to.x)} ${whole(to.y + 70)} ${whole(to.x)} ${whole(to.y)}`;
    threads.push(
      `<path class="thread shown ${effect === 'breaks-lie' ? 'breaks' : 'plain'}" d="${d}" data-rel="${e(rel(threadTokens([clueId], suspectId)))}"/>`,
    );
  }

  const rows = Math.max(1, Math.ceil(view.clues.length / COLUMNS));
  const height = cardsTop + (view.clues.length === 0 ? 0 : rows * ROW_STEP) + MARGIN;
  return `<p class="note">${e(words.hint)}</p>
<div class="cork-wrap"><div class="cork"><svg class="board" viewBox="0 0 ${String(WIDTH)} ${String(height)}" role="group" aria-label="${e(words.title)}">${threads.join('')}${photos.join('')}${cards.join('')}</svg></div>
${renderOpened(view, board, text)}</div>
<p class="note">${e(words.legend)}</p>`;
}
