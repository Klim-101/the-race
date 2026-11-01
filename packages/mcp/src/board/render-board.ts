// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import type { DetectiveRunView, TurnView } from '@the-race/engine';
import { renderChronicle } from './board-chronicle.js';
import { renderCork } from './board-cork.js';
import { renderHero } from './board-hero.js';
import { renderLinks } from './board-links.js';
import { renderMap } from './board-map.js';
import {
  clueTokens,
  highlightRules,
  rel,
  shownPairs,
  suspectTokens,
  threadTokens,
} from './board-relations.js';
import { BOARD_TEXT, type BoardText } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import { TAB_TEXT, type TabText } from './tab-text.js';

export { escapeHtml } from './escape-html.js';

const TAB_IDS = ['board', 'suspects', 'clues', 'map', 'chronicle', 'hero'] as const;

// The tabs need no script: a panel is shown while it is the target of the address, and the first one when
// none is, so a reload keeps the tab the player was on. A browser without `:has` shows every panel in turn.
const tabRules = TAB_IDS.map(
  (id) =>
    `main:has(#${id}:target) nav a[href="#${id}"]{background:var(--accent);color:var(--card);border-color:var(--accent)}`,
).join('\n');

// Picking is the only thing the script does: it says which token is picked, and the style sheet lights what
// is related to it (see board-relations.ts). Without the script the page is the same page, with nothing lit.
// Its hash is in the page's content security policy, so no other script can run.
export const SCRIPT = `(function(){var m=document.querySelector('main');if(!m)return;
function pick(t){if(m.getAttribute('data-sel')===t){m.removeAttribute('data-sel')}else{m.setAttribute('data-sel',t)}}
document.addEventListener('click',function(e){var el=e.target.closest&&e.target.closest('[data-pick]');if(el){pick(el.getAttribute('data-pick'))}else if(!(e.target.closest&&e.target.closest('a'))){m.removeAttribute('data-sel')}});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){m.removeAttribute('data-sel');return}if(e.key==='Enter'||e.key===' '){var el=e.target.closest&&e.target.closest('[data-pick]');if(el){e.preventDefault();pick(el.getAttribute('data-pick'))}}});
})();`;
const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');

const STYLE = `
:root{color-scheme:light dark;--bg:#f4efe6;--card:#fffdf8;--ink:#2a2622;--muted:#7a7066;--line:#ddd3c3;--accent:#8a3b2a;--warn:#b26a00;--soft:#efe6d6;--paper:#fffef6;--paper-ink:#2a2622;--paper-tag:#7a6a58;--paper-rule:rgba(70,110,180,.22);--margin:#c2574a;--red:#b3261e;--blue:#2b5fa3;--shadow:rgba(0,0,0,.18)}
@media (prefers-color-scheme:dark){:root{--bg:#1b1917;--card:#252220;--ink:#ece4d8;--muted:#a09484;--line:#3a3430;--accent:#e08a70;--warn:#e0a040;--soft:#312c28;--paper:#2a2622;--paper-ink:#ece4d8;--paper-tag:#a8998a;--paper-rule:rgba(140,170,220,.16);--margin:#d9786a;--red:#f08a80;--blue:#8ab4f0;--shadow:rgba(0,0,0,.5)}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 48px;background:var(--bg);color:var(--ink);font:16px/1.5 Georgia,'Times New Roman',serif;overflow-wrap:anywhere}
main{max-width:1040px;margin:0 auto}
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
.note{font:13px/1.4 system-ui,sans-serif;color:var(--muted);margin:6px 0}
nav.tabs{display:flex;gap:8px;overflow-x:auto;padding:4px 0 12px;margin:0 -2px}
nav.tabs a{flex:0 0 auto;padding:6px 14px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);text-decoration:none;font:14px/1.3 system-ui,sans-serif;white-space:nowrap}
.tab{display:none}
.tab:target{display:block}
main:not(:has(.tab:target)) #board{display:block}
main:not(:has(.tab:target)) nav a[href="#board"]{background:var(--accent);color:var(--card);border-color:var(--accent)}
${tabRules}
@supports not selector(:has(*)){.tab{display:block}nav.tabs{display:none}}
.graph{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--card);padding:6px}
svg{display:block;width:100%;height:auto;font:13px system-ui,sans-serif}
svg text{fill:var(--ink)}
.edges line{stroke:var(--muted);stroke-width:2}
.edges path{fill:none;stroke-width:1.6}
.node rect{fill:var(--soft);stroke:var(--line);stroke-width:1.5}
.node.unvisited rect{fill:var(--card);stroke-dasharray:5 4}
.node.current rect{stroke:var(--accent);stroke-width:3}
.node.locked rect,.node.closed rect{stroke:var(--warn)}
.node .state{font-size:11px;fill:var(--muted)}
.badge{fill:var(--accent)}
.badge-n{fill:var(--card);font-size:12px;font-weight:700}
.statement{margin:4px 0}
meter{width:9em;vertical-align:middle}
.meter span:first-child{display:inline-block;min-width:7em}
.cork{border:10px solid #6b4a2b;border-radius:4px;background-color:#b88a5a;background-image:radial-gradient(rgba(60,35,10,.28) 1px,transparent 1.5px),radial-gradient(rgba(255,235,200,.22) 1px,transparent 1.5px);background-size:9px 9px,13px 13px;background-position:0 0,4px 6px;box-shadow:inset 0 0 18px rgba(0,0,0,.35);overflow-x:auto}
svg.board{display:block;width:100%;min-width:640px;height:auto;font:13px 'Segoe Print','Bradley Hand','Comic Sans MS',cursive,system-ui}
svg.board .paper{fill:#fffdf4;stroke:#d6c9a8;stroke-width:1;filter:drop-shadow(2px 3px 2px rgba(0,0,0,.35))}
svg.board .print{fill:#cfc6b2}
svg.board .initial{font:700 44px Georgia,serif;fill:#6b6354}
svg.board .line{fill:#2a2622}
svg.board .caption{fill:#2a2622;paint-order:stroke;stroke:#f1e1c0;stroke-width:3px;stroke-linejoin:round}
svg.board .where text{font-size:11px;fill:#6b4a2b}
svg.board .garbled .paper{stroke-dasharray:5 3;stroke:#b26a00}
svg.board .pin{fill:#c0392b;stroke:#7b1f14;stroke-width:1.5}
svg.board .thread{fill:none;stroke-linecap:round}
svg.board .thread.made{stroke:#b3261e;stroke-width:2.5}
svg.board .thread.cold{stroke:#b3261e;stroke-width:1.5;stroke-dasharray:3 6;opacity:.7}
svg.board .thread.shown{stroke:#2b5fa3;stroke-width:2}
svg.board .thread.shown.plain{stroke-dasharray:2 5}
[data-pick]{cursor:pointer}
[data-pick]:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
main[data-sel] [data-rel]{opacity:.3;transition:opacity .15s}
/* A dimmed card keeps its paper opaque, so the thread behind it never shows through its text. */
main[data-sel] svg.board g[data-rel]{opacity:1;filter:grayscale(.7) brightness(.7)}
.notebook{max-width:640px;margin-left:auto;margin-right:auto}
.notebook .card{background-color:var(--paper);background-image:linear-gradient(to bottom,transparent 27px,var(--paper-rule) 28px);background-size:100% 28px;border:0;border-left:3px double var(--margin);border-radius:2px;font-family:'Segoe Print','Bradley Hand',Georgia,serif;line-height:28px;padding:0 14px 0 18px;color:var(--paper-ink);box-shadow:1px 2px 4px var(--shadow)}
.notebook .card p{margin:0}
.notebook .tag,.notebook h3{font-family:system-ui,sans-serif;line-height:28px;margin:0}
.notebook .tag{color:var(--paper-tag)}
.notebook h3{color:var(--margin)}
.notebook .card strong{font-size:1.1em}
.notebook .warn{line-height:28px}
.shown-line{display:block}
.effect{font:12px system-ui,sans-serif;color:var(--blue)}
.notebook .card .source{display:block;padding-left:12px;border-left:2px solid var(--paper-rule)}
ul.tried{list-style:none;padding:0;margin:0 0 10px}
ul.tried li{margin:0 0 8px;padding:6px 14px 6px 18px;border-left:3px double var(--margin);background:var(--paper);color:var(--paper-ink);box-shadow:1px 2px 4px var(--shadow)}
ul.tried .result{font:12px system-ui,sans-serif;color:var(--red);text-transform:uppercase;letter-spacing:.05em}
ul.tried .tag{color:var(--paper-tag)}
@media (max-width:560px){body{padding:16px}h1{font-size:1.5rem}}
@media print{body{background:#fff;color:#000}.tab{display:block!important}nav.tabs{display:none}.card,.graph,.cork{break-inside:avoid}}
`;

/** The clues a person was shown, in the order they were shown, with what each did. */
function shownTo(view: DetectiveRunView, suspectId: string, text: TabText): string {
  const e = escapeHtml;
  const shown = view.history.shown.filter((entry) => entry.suspectId === suspectId);
  if (shown.length === 0) return '';
  const description = new Map(view.clues.map(({ id, description: line }) => [id, line]));
  const lines = shown.map(
    ({ clueId, effect, turn }) =>
      `<p class="shown-line"><span class="tag">${e(text.corkboard.step.replace('{n}', String(turn)))}</span> ${e(description.get(clueId) ?? clueId)} <span class="effect">${e(text.corkboard.effects[effect])}</span></p>`,
  );
  return `<h3>${e(text.corkboard.shownHere)}</h3>\n${lines.join('\n')}\n`;
}

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
      const attrs = `data-pick="suspect:${e(suspect.id)}" data-rel="${e(rel(suspectTokens(view, suspect.id)))}" tabindex="0" role="button"`;
      return `<div class="card" ${attrs}>
<strong>${e(suspect.name)}</strong>
<p>${e(suspect.persona)}</p>
<p class="tag">${e(board.whereabouts)}: ${e(where)}</p>
<h3>${e(text.statements.title)}</h3>
${said}
${shownTo(view, suspect.id, text)}</div>`;
    })
    .join('\n');
}

/** The links the hero tried, oldest first, with the clues of each and what came of it, and nothing of how close it was. */
function tried(view: DetectiveRunView, text: TabText): string {
  const e = escapeHtml;
  if (view.history.links.length === 0) return `<p class="empty">${e(text.corkboard.noneTried)}</p>`;
  const description = new Map(view.clues.map(({ id, description: line }) => [id, line]));
  const items = view.history.links.map(({ clueIds, result, turn }) => {
    const names = clueIds.map((id) => e(description.get(id) ?? id)).join(' + ');
    return `<li data-rel="${e(rel(threadTokens(clueIds)))}">${names} <span class="result">${e(text.corkboard.results[result])}</span> <span class="tag">${e(text.corkboard.step.replace('{n}', String(turn)))}</span></li>`;
  });
  return `<ul class="tried">${items.join('\n')}</ul>`;
}

function renderClues(view: DetectiveRunView, board: BoardText, text: TabText): string {
  const e = escapeHtml;
  const placeName = new Map(view.map.places.map(({ id, name }) => [id, name]));
  const suspectName = new Map(view.suspects.map(({ id, name }) => [id, name]));
  const description = new Map(view.clues.map(({ id, description: line }) => [id, line]));
  const clues =
    view.clues.length === 0
      ? `<p class="empty">${e(board.noClues)}</p>`
      : view.clues
          .map((clue) => {
            const attrs = `data-pick="clue:${e(clue.id)}" data-rel="${e(rel(clueTokens(view, clue.id)))}" tabindex="0" role="button"`;
            const turn = view.history.finds.find(({ clueId }) => clueId === clue.id)?.turn;
            const place = placeName.get(clue.locationId) ?? clue.locationId;
            const where = `${text.corkboard.foundAt} ${place}${turn === undefined ? '' : ` · ${text.corkboard.step.replace('{n}', String(turn))}`}`;
            const shown = shownPairs(view)
              .filter(({ clueId }) => clueId === clue.id)
              .map(
                ({ suspectId, effect }) =>
                  `${suspectName.get(suspectId) ?? suspectId} (${text.corkboard.effects[effect]})`,
              );
            const shownLine = shown.length === 0 ? text.corkboard.nobody : shown.join(', ');
            return `<div class="card" ${attrs}>
<span class="tag">${e(where)}</span>
<p>${e(clue.description)}</p>${clue.garbled ? `\n<p class="warn">${e(board.garbled)}</p>` : ''}
<p class="tag">${e(text.corkboard.shownTo)}: ${e(shownLine)}</p>
</div>`;
          })
          .join('\n');
  const insights =
    view.insights.length === 0
      ? `<p class="empty">${e(board.noInsights)}</p>`
      : view.insights
          .map(({ insight, clueIds }) => {
            const sources = clueIds.flatMap((id) => {
              const line = description.get(id);
              return line === undefined ? [] : [`<span class="source">${e(line)}</span>`];
            });
            const from =
              sources.length === 0
                ? ''
                : `\n<p class="tag">${e(text.corkboard.drawnFrom)}:</p>\n${sources.join('\n')}`;
            return `<div class="card"><p>${e(insight)}</p>${from}</div>`;
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

/**
 * The player's evidence board: one self-contained page (no outside resource, and one small script that only
 * picks) made from the public view of the run and the turns the player took, so it can hold nothing the
 * narrator may not know. Six tabs switched by the address alone: the corkboard (the people and the clues,
 * with thread for the links tried and the clues shown), the suspects and the clues as notebooks, the known
 * map, the chronicle, and the hero. Picking a clue, a person or a place lights what ties to it.
 */
export function renderEvidenceBoard(view: DetectiveRunView, turns: readonly TurnView[] = []): string {
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${SCRIPT_HASH}'">
<title>${e(board.pageTitle)}: ${e(view.title)}</title>
<style>${STYLE}
${highlightRules(view)}</style>
</head>
<body>
<main>
<h1>${e(view.title)}</h1>
<p class="meta">${e(board.day)} ${String(view.clock.day)} ${e(board.of)} ${String(view.clock.totalDays)}, ${hour}:${minute} · ${e(board.status[view.status])} · ${e(board.detective)}: ${e(view.hero.name)}</p>
<p class="premise">${e(view.premise)}</p>
<p class="meta">${e(board.nowAt)}: <strong>${e(view.location.name)}</strong></p>
<nav class="tabs" aria-label="${e(text.nav)}">${TAB_IDS.map((id) => `<a href="#${id}">${e(text.tabs[id])}</a>`).join('')}</nav>
<section class="tab" id="board">
<h2>${e(text.corkboard.title)}</h2>
${renderCork(view, text)}
</section>
<section class="tab notebook" id="suspects">
<h2>${e(board.suspects)}</h2>
${renderSuspects(view, board, text)}
</section>
<section class="tab notebook" id="clues">
${renderClues(view, board, text)}
</section>
<section class="tab" id="map">
<h2>${e(text.map.title)}</h2>
${renderMap(view, text)}
${news}
</section>
<section class="tab" id="chronicle">
<h2>${e(text.tabs.chronicle)}</h2>
${renderChronicle(view, turns, text)}
</section>
<section class="tab" id="hero">
<h2>${e(text.tabs.hero)}</h2>
${renderHero(view, board, text)}
</section>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
