// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { BOARD_TEXT } from './board-text.js';

/** Case text, headlines and names are data that may carry markup or instructions: nothing goes in raw. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f4efe6;--card:#fffdf8;--ink:#2a2622;--muted:#7a7066;--line:#ddd3c3;--accent:#8a3b2a;--warn:#b26a00}
@media (prefers-color-scheme:dark){:root{--bg:#1b1917;--card:#252220;--ink:#ece4d8;--muted:#a09484;--line:#3a3430;--accent:#e08a70;--warn:#e0a040}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 48px;background:var(--bg);color:var(--ink);font:16px/1.5 Georgia,'Times New Roman',serif}
main{max-width:860px;margin:0 auto}
h1{margin:0 0 4px;font-size:1.8rem}
h2{margin:32px 0 12px;font-size:1.1rem;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.meta{color:var(--muted);margin:0 0 16px}
.premise{border-left:3px solid var(--accent);padding-left:12px;margin:16px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:0 0 10px}
.card p{margin:4px 0}
.tag{font:12px/1.2 system-ui,sans-serif;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.warn{color:var(--warn);font:14px/1.4 system-ui,sans-serif}
ul{padding-left:20px;margin:6px 0}
.empty{color:var(--muted);font-style:italic}
`;

/**
 * The player's evidence board: one self-contained page (no script, no outside resource) made from the public
 * view of the run, so it can hold nothing the narrator may not know.
 */
export function renderEvidenceBoard(view: DetectiveRunView, placeNames: ReadonlyMap<string, string>): string {
  const text = BOARD_TEXT[view.locale];
  const e = escapeHtml;
  const hour = String(Math.floor(view.clock.minute / 60)).padStart(2, '0');
  const minute = String(view.clock.minute % 60).padStart(2, '0');

  const clues =
    view.clues.length === 0
      ? `<p class="empty">${e(text.noClues)}</p>`
      : view.clues
          .map(
            (clue) => `<div class="card">
<span class="tag">${e(placeNames.get(clue.locationId) ?? clue.locationId)}</span>
<p>${e(clue.description)}</p>${clue.garbled ? `\n<p class="warn">${e(text.garbled)}</p>` : ''}
</div>`,
          )
          .join('\n');

  const insights =
    view.insights.length === 0
      ? `<p class="empty">${e(text.noInsights)}</p>`
      : view.insights.map(({ insight }) => `<div class="card"><p>${e(insight)}</p></div>`).join('\n');

  const suspects = view.suspects
    .map((suspect) => {
      const where =
        suspect.place === null
          ? text.anywhere
          : suspect.place.id === view.location.id
            ? text.here
            : suspect.place.name;
      return `<div class="card">
<strong>${e(suspect.name)}</strong>
<p>${e(suspect.persona)}</p>
<p class="tag">${e(text.whereabouts)}: ${e(where)}</p>
</div>`;
    })
    .join('\n');

  const exits = view.location.exits
    .map(
      ({ name, visited }) =>
        `<li>${e(name)}${visited ? '' : ` <span class="tag">${e(text.unvisited)}</span>`}</li>`,
    )
    .join('\n');

  const climate =
    view.setting === null
      ? ''
      : `<h2>${e(text.climate.title)}</h2>
<div class="card">
<p>${e(text.climate.setIn)}: <strong>${e(view.setting.name)}</strong></p>
<p class="tag">${e(text.climate.zone)}: ${e(text.climate.zones[view.setting.climate.zone])}</p>
<p>${e(text.climate.seasons)}:</p>
<ul>${view.setting.climate.seasons
          .map(
            ({ id, weather }) =>
              `<li>${e(text.climate.seasonNames[id])}: ${e(text.climate.weathers[weather])}</li>`,
          )
          .join('')}</ul>
<p>${e(text.climate.hazards)}: ${e(
          view.setting.climate.hazards.length === 0
            ? text.climate.noHazards
            : view.setting.climate.hazards.map((hazard) => text.climate.hazardNames[hazard]).join(', '),
        )}</p>
</div>`;

  const news =
    view.news.length === 0
      ? ''
      : `<h2>${e(text.news)}</h2>\n<ul>${view.news.map((line) => `<li>${e(line)}</li>`).join('\n')}</ul>`;

  return `<!doctype html>
<html lang="${view.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${e(text.pageTitle)}: ${e(view.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${e(view.title)}</h1>
<p class="meta">${e(text.day)} ${String(view.clock.day)} ${e(text.of)} ${String(view.clock.totalDays)}, ${hour}:${minute} · ${e(text.status[view.status])} · ${e(text.detective)}: ${e(view.hero.name)}</p>
<p class="premise">${e(view.premise)}</p>
<p class="meta">${e(text.nowAt)}: <strong>${e(view.location.name)}</strong></p>
<ul>${exits}</ul>
<h2>${e(text.clues)} (${String(view.clues.length)})</h2>
${clues}
<h2>${e(text.insights)} (${String(view.insights.length)})</h2>
${insights}
<h2>${e(text.suspects)}</h2>
${suspects}
${climate}
${news}
</main>
</body>
</html>
`;
}
