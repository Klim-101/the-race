// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { ClosedFile, DetectiveRunView, TurnView } from '@the-race/engine';
import { clock } from './board-chronicle.js';
import { escapeHtml } from './escape-html.js';
import { named, type TabText } from './tab-text.js';

/**
 * The file of a finished run, drawn from its accusation and from nothing before it: the truth of the case, the
 * course of the crime in order, the clues the hero pinned (the false one that led astray marked) and an empty card
 * for each clue never found. It has no existence while the run is on, since it holds the truth.
 */
export function closedFileOf(turns: readonly TurnView[]): ClosedFile | undefined {
  return turns.flatMap((turn) => (turn.kind === 'accuse' && turn.file ? [turn.file] : []))[0];
}

export function renderClosedFile(view: DetectiveRunView, file: ClosedFile, text: TabText): string {
  const e = escapeHtml;
  const t = text.closedFile;
  const led = new Set(file.misled.map(({ number }) => number));
  // A right culprit and a wrong place is its own heading: the verdict is `wrong` for both, but only one was missed.
  const heading = file.verdict === 'wrong' && file.culpritRight ? 'wrong-place' : file.verdict;
  return `<div class="card">
<h3>${e(named(t.verdicts, heading))}</h3>
<p><span class="tag">${e(t.culprit)}</span> ${e(file.culprit)}</p>
<p><span class="tag">${e(t.motive)}</span> ${e(file.motive)}</p>
<p><span class="tag">${e(t.method)}</span> ${e(file.method)}</p>
<p><span class="tag">${e(file.placeRight === undefined ? t.place : t.placeKept)}</span> ${e(file.place)}</p>
</div>${
    file.course.length === 0
      ? ''
      : `
<h3>${e(t.course)}</h3>
<ol class="course">
${file.course
  .map(
    ({ atMinute, actor, place, action }) =>
      `<li><span class="tag">${clock(atMinute)} · ${e(place)}</span> <strong>${e(actor)}</strong>: ${e(action)}</li>`,
  )
  .join('\n')}
</ol>`
  }
<h3>${e(t.pinned)}</h3>${
    view.clues.length === 0
      ? `\n<p class="empty">${e(t.noneFound)}</p>`
      : `
<div class="cards">
${view.clues
  .map(
    ({ number, description }) =>
      `<div class="card${led.has(number) ? ' led-astray' : ''}"><span class="tag"><span class="num">${e(number)}</span>${led.has(number) ? ` · ${e(t.misled)}` : ''}</span>\n<p class="text">${e(description)}</p></div>`,
  )
  .join('\n')}
</div>`
  }${
    file.missed.length === 0
      ? ''
      : `
<h3>${e(t.missed)}</h3>
<div class="cards">
${file.missed
  .map(
    ({ description, place, obstacle }) =>
      `<div class="card empty-card"><span class="tag">${e(t.neverFound)} · ${e(place)}${obstacle === null ? '' : ` · ${e(named(t.obstacles, obstacle))}`}</span>\n<p class="text">${e(description)}</p></div>`,
  )
  .join('\n')}
</div>`
  }
`;
}
