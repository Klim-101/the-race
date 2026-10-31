// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { renderHero } from './board-hero.js';
import { renderLinks } from './board-links.js';
import { renderMap } from './board-map.js';
import { BOARD_TEXT, type BoardText } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import { TAB_TEXT, type TabText } from './tab-text.js';

export { escapeHtml } from './escape-html.js';

const TAB_IDS = ['map', 'suspects', 'clues', 'hero'] as const;

// The tabs need no script: a panel is shown while it is the target of the address, and the first one when
// none is, so a reload keeps the tab the player was on. A browser without `:has` shows every panel in turn.
const tabRules = TAB_IDS.map(
  (id) =>
    `main:has(#${id}:target) nav a[href="#${id}"]{background:var(--accent);color:var(--card);border-color:var(--accent)}`,
).join('\n');

const STYLE = `
:root{color-scheme:light dark;--bg:#f4efe6;--card:#fffdf8;--ink:#2a2622;--muted:#7a7066;--line:#ddd3c3;--accent:#8a3b2a;--warn:#b26a00;--soft:#efe6d6}
@media (prefers-color-scheme:dark){:root{--bg:#1b1917;--card:#252220;--ink:#ece4d8;--muted:#a09484;--line:#3a3430;--accent:#e08a70;--warn:#e0a040;--soft:#312c28}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 48px;background:var(--bg);color:var(--ink);font:16px/1.5 Georgia,'Times New Roman',serif}
main{max-width:920px;margin:0 auto}
h1{margin:0 0 4px;font-size:1.8rem}
h2{margin:28px 0 12px;font-size:1.1rem;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
h3{margin:22px 0 8px;font-size:1rem;color:var(--accent)}
.meta{color:var(--muted);margin:0 0 16px}
.premise{border-left:3px solid var(--accent);padding-left:12px;margin:16px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:0 0 10px}
.card p{margin:4px 0}
.tag{font:12px/1.2 system-ui,sans-serif;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.warn{color:var(--warn);font:14px/1.4 system-ui,sans-serif}
ul{padding-left:20px;margin:6px 0}
.empty{color:var(--muted);font-style:italic}
nav.tabs{display:flex;gap:8px;overflow-x:auto;padding:4px 0 12px;margin:0 -2px}
nav.tabs a{flex:0 0 auto;padding:6px 14px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);text-decoration:none;font:14px/1.3 system-ui,sans-serif;white-space:nowrap}
.tab{display:none}
.tab:target{display:block}
main:not(:has(.tab:target)) #map{display:block}
main:not(:has(.tab:target)) nav a[href="#map"]{background:var(--accent);color:var(--card);border-color:var(--accent)}
${tabRules}
@supports not selector(:has(*)){.tab{display:block}nav.tabs{display:none}}
.graph{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--card);padding:6px}
svg{display:block;width:100%;height:auto;font:13px system-ui,sans-serif}
svg text{fill:var(--ink)}
.edges line{stroke:var(--muted);stroke-width:2}
.edges path{fill:none;stroke-width:1.6}
.conclusion-link path{stroke:var(--accent)}
.place-link path{stroke:var(--muted);stroke-dasharray:4 3}
.node rect{fill:var(--soft);stroke:var(--line);stroke-width:1.5}
.node.unvisited rect{fill:var(--card);stroke-dasharray:5 4}
.node.current rect{stroke:var(--accent);stroke-width:3}
.node.locked rect,.node.closed rect{stroke:var(--warn)}
.node .state{font-size:11px;fill:var(--muted)}
.badge{fill:var(--accent)}
.badge-n{fill:var(--card);font-size:12px;font-weight:700}
.box rect{fill:var(--card);stroke:var(--line);stroke-width:1.5}
.box.conclusion rect{stroke:var(--accent)}
.columns{position:relative;height:1.6em;font:12px/1.2 system-ui,sans-serif;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.columns span{position:absolute;top:0}
.statement{margin:4px 0}
meter{width:9em;vertical-align:middle}
.meter span:first-child{display:inline-block;min-width:7em}
@media (max-width:560px){body{padding:16px}h1{font-size:1.5rem}}
@media print{body{background:#fff;color:#000}.tab{display:block!important}nav.tabs{display:none}.card,.graph{break-inside:avoid}}
`;

function renderSuspects(view: DetectiveRunView, board: BoardText, text: TabText): string {
  const e = escapeHtml;
  return view.suspects
    .map((suspect) => {
      const where =
        suspect.place === null
          ? board.anywhere
          : suspect.place.id === view.location.id
            ? board.here
            : suspect.place.name;
      const said =
        suspect.statements.length === 0
          ? `<p class="empty">${e(text.statements.none)}</p>`
          : suspect.statements
              .map(
                ({ day, kind, text: line }) =>
                  `<p class="statement"><span class="tag">${e(text.statements.day)} ${String(day)} · ${e(text.statements.kinds[kind])}</span><br>${e(line)}</p>`,
              )
              .join('\n');
      return `<div class="card">
<strong>${e(suspect.name)}</strong>
<p>${e(suspect.persona)}</p>
<p class="tag">${e(board.whereabouts)}: ${e(where)}</p>
<h3>${e(text.statements.title)}</h3>
${said}
</div>`;
    })
    .join('\n');
}

function renderClues(view: DetectiveRunView, board: BoardText, text: TabText): string {
  const e = escapeHtml;
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const clues =
    view.clues.length === 0
      ? `<p class="empty">${e(board.noClues)}</p>`
      : view.clues
          .map(
            (clue) => `<div class="card">
<span class="tag">${e(placeName.get(clue.locationId) ?? clue.locationId)}</span>
<p>${e(clue.description)}</p>${clue.garbled ? `\n<p class="warn">${e(board.garbled)}</p>` : ''}
</div>`,
          )
          .join('\n');
  const insights =
    view.insights.length === 0
      ? `<p class="empty">${e(board.noInsights)}</p>`
      : view.insights.map(({ insight }) => `<div class="card"><p>${e(insight)}</p></div>`).join('\n');
  return `<h2>${e(text.links.title)}</h2>
${renderLinks(view, text)}
<h2>${e(board.clues)} (${String(view.clues.length)})</h2>
${clues}
<h2>${e(board.insights)} (${String(view.insights.length)})</h2>
${insights}`;
}

/**
 * The player's evidence board: one self-contained page (no script, no outside resource) made from the public
 * view of the run, so it can hold nothing the narrator may not know. Four tabs switched by the address alone:
 * the known map, the suspects with what they said, the clues with how they hang together, and the hero.
 */
export function renderEvidenceBoard(view: DetectiveRunView): string {
  const board = BOARD_TEXT[view.locale];
  const text = TAB_TEXT[view.locale];
  const e = escapeHtml;
  const hour = String(Math.floor(view.clock.minute / 60)).padStart(2, '0');
  const minute = String(view.clock.minute % 60).padStart(2, '0');

  const news =
    view.news.length === 0
      ? ''
      : `<h2>${e(board.news)}</h2>\n<ul>${view.news.map((line) => `<li>${e(line)}</li>`).join('\n')}</ul>`;

  return `<!doctype html>
<html lang="${view.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${e(board.pageTitle)}: ${e(view.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${e(view.title)}</h1>
<p class="meta">${e(board.day)} ${String(view.clock.day)} ${e(board.of)} ${String(view.clock.totalDays)}, ${hour}:${minute} · ${e(board.status[view.status])} · ${e(board.detective)}: ${e(view.hero.name)}</p>
<p class="premise">${e(view.premise)}</p>
<p class="meta">${e(board.nowAt)}: <strong>${e(view.location.name)}</strong></p>
<nav class="tabs" aria-label="${e(text.nav)}">${TAB_IDS.map((id) => `<a href="#${id}">${e(text.tabs[id])}</a>`).join('')}</nav>
<section class="tab" id="map">
<h2>${e(text.map.title)}</h2>
${renderMap(view, text)}
${news}
</section>
<section class="tab" id="suspects">
<h2>${e(board.suspects)}</h2>
${renderSuspects(view, board, text)}
</section>
<section class="tab" id="clues">
${renderClues(view, board, text)}
</section>
<section class="tab" id="hero">
<h2>${e(text.tabs.hero)}</h2>
${renderHero(view, board, text)}
</section>
</main>
</body>
</html>
`;
}
