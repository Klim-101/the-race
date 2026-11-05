// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import type { DetectiveRunView, StripTurn, TurnView } from '@the-race/engine';
import { renderChronicle } from './board-chronicle.js';
import { closedFileOf, renderClosedFile } from './board-closed-file.js';
import { cardRules, renderClues } from './board-clues.js';
import { renderCork } from './board-cork.js';
import { renderHeader } from './board-header.js';
import { freshSince } from './board-new.js';
import { openedRules } from './board-opened.js';
import { renderHero } from './board-hero.js';
import { renderMap } from './board-map.js';
import { renderSuspects } from './board-suspects.js';
import { planRules } from './board-plan.js';
import { turnRules } from './board-strip.js';
import { highlightRules } from './board-relations.js';
import { BOARD_TEXT } from './board-text.js';
import { escapeHtml } from './escape-html.js';
import { TAB_TEXT } from './tab-text.js';

export { escapeHtml } from './escape-html.js';

const TAB_IDS = ['board', 'suspects', 'clues', 'map', 'chronicle', 'hero', 'file'] as const;

// The tabs need no script: a panel is shown while it is the target of the address, and the first one when
// none is, so a reload keeps the tab the player was on. A browser without `:has` shows every panel in turn.
const tabRules = TAB_IDS.map(
  (id) =>
    `main:has(#${id}:target) nav a[href="#${id}"]{background:var(--accent);color:var(--card);border-color:var(--accent)}`,
).join('\n');

// Picking is the only thing the script does: it says which token is picked, and the style sheet lights what
// is related to it (see board-relations.ts). Without the script the page is the same page, with nothing lit.
// Its hash is in the page's content security policy, so no other script can run.
export const SCRIPT = `(function(){var m=document.querySelector('main');if(!m)return;var back=null;
function shut(restore){if(m.getAttribute('data-open')===null)return;m.removeAttribute('data-open');if(restore&&back&&back.focus)back.focus();back=null}
function pick(t){if(m.getAttribute('data-sel')===t){m.removeAttribute('data-sel')}else{m.setAttribute('data-sel',t)}}
function show(el){var id=el.getAttribute('data-open');if(!id){shut(false);return}if(m.getAttribute('data-open')===id){shut(true);return}m.setAttribute('data-open',id);back=el;var card=document.getElementById('open-'+id);if(card&&card.focus)card.focus()}
function choose(el){pick(el.getAttribute('data-pick'));if(el.closest&&el.closest('.plan'))return;show(el)}
document.addEventListener('click',function(e){var t=e.target;if(t.closest&&t.closest('.opened')){m.removeAttribute('data-sel');shut(true);return}if(t.closest&&t.closest('nav.tabs')){shut(false);return}var el=t.closest&&t.closest('[data-pick]');if(el&&t.closest('a')){m.setAttribute('data-sel',el.getAttribute('data-pick'));return}if(el){choose(el)}else if(!(t.closest&&(t.closest('a')||t.closest('.filters')||t.closest('.plan')))){m.removeAttribute('data-sel');shut(false)}});
function fit(c,v){var g=function(n){return c.getAttribute('data-'+n)||''};return(!v.p||g('place')===v.p)&&(!v.s||(' '+g('shown')+' ').indexOf(' '+v.s+' ')>=0)&&(!v.g||g('garbled')==='1')&&(!v.u||g('unused')==='1')&&(!v.q||g('number').toLowerCase().indexOf(v.q)>=0)}
function filter(){var f=function(i){return document.getElementById(i)};if(!f('f-place'))return;var v={p:f('f-place').value,s:f('f-suspect').value,g:f('f-garbled').checked,u:f('f-unused').checked,q:f('f-number').value.trim().toLowerCase()};var cards=document.querySelectorAll('.clue-card'),n=0;for(var i=0;i<cards.length;i++){var ok=fit(cards[i],v);cards[i].hidden=!ok;if(ok)n++}var none=f('clue-none');if(none)none.hidden=n>0}
document.addEventListener('input',filter);document.addEventListener('change',filter);
document.addEventListener('keydown',function(e){if(e.key==='Escape'){m.removeAttribute('data-sel');shut(true);return}if(e.key==='Enter'||e.key===' '){var el=e.target.closest&&e.target.closest('[data-pick]');if(el){e.preventDefault();choose(el)}}});
})();`;
const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');

const STYLE = `
:root{color-scheme:light dark;--bg:#f4efe6;--card:#fffdf8;--ink:#2a2622;--muted:#7a7066;--line:#ddd3c3;--accent:#8a3b2a;--warn:#b26a00;--soft:#efe6d6;--paper:#fffef6;--paper-ink:#2a2622;--paper-tag:#7a6a58;--paper-rule:rgba(70,110,180,.22);--margin:#c2574a;--red:#b3261e;--blue:#2b5fa3;--shadow:rgba(0,0,0,.18);--parch:#efe3c4;--parch-edge:#b9a678;--street:#f8f1dd;--roof:#d6c298;--hatch:#9c8656}
@media (prefers-color-scheme:dark){:root{--bg:#1b1917;--card:#252220;--ink:#ece4d8;--muted:#a09484;--line:#3a3430;--accent:#e08a70;--warn:#e0a040;--soft:#312c28;--paper:#2a2622;--paper-ink:#ece4d8;--paper-tag:#a8998a;--paper-rule:rgba(140,170,220,.16);--margin:#d9786a;--red:#f08a80;--blue:#8ab4f0;--shadow:rgba(0,0,0,.5);--parch:#2b2619;--parch-edge:#5a4d33;--street:#3d3524;--roof:#4a3f29;--hatch:#7a6a45}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 48px;background:var(--bg);color:var(--ink);font:16px/1.5 Georgia,'Times New Roman',serif;overflow-wrap:anywhere}
main{max-width:1040px;margin:0 auto}
h1{margin:0 0 4px;font-size:1.8rem}
.head{border-bottom:2px solid var(--line);margin:0 0 12px;padding:0 0 8px}
.head .meta{margin:0 0 4px}
.fresh{margin:6px 0 0;padding:6px 12px;background:var(--paper);color:var(--paper-ink);border-left:3px double var(--margin);box-shadow:1px 2px 4px var(--shadow);font-family:'Segoe Print','Bradley Hand',Georgia,serif}
.fresh ul{margin:2px 0 0}
.new{display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;background:var(--margin);color:var(--card);font:700 11px/1.6 system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase;vertical-align:middle}
h2{margin:28px 0 12px;font-size:1.1rem;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
h3{margin:22px 0 8px;font-size:1rem;color:var(--accent)}
.meta{color:var(--muted);margin:0 0 16px}
.premise{border-left:3px solid var(--accent);padding-left:12px;margin:16px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:0 0 10px}
.empty-card{border-style:dashed;background:transparent}
.led-astray{border-left:4px solid var(--warn)}
.course{padding-left:1.4em}
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
.paper-map{background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--hatch) 22%,transparent) 0 1px,transparent 1px 7px),var(--parch);border-color:var(--parch-edge);box-shadow:inset 0 0 40px rgba(120,90,40,.25)}
svg.map .lane{fill:none;stroke:var(--street);stroke-width:12;stroke-linecap:round;stroke-linejoin:round}
svg.map .lane.across{stroke-dasharray:1 10;stroke-width:6}
svg.map .street rect{fill:var(--street);stroke:var(--ink);stroke-width:1.5}
svg.map .street.unvisited rect{stroke-dasharray:6 4}
svg.map .street.current rect{stroke:var(--accent);stroke-width:3}
svg.map .block .walls{fill:var(--roof);stroke:var(--ink);stroke-width:1.8}
svg.map .block .roof{fill:none;stroke:var(--ink);stroke-width:1}
svg.map .block.unvisited .walls{fill:var(--parch);stroke-dasharray:5 3}
svg.map .block.current .walls{stroke:var(--accent);stroke-width:3.5}
svg.map .door{stroke:var(--ink);stroke-width:2.5}
svg.map .name{font-weight:600;font-size:11px}
svg.map .street .name{font-size:12px}
svg.map .block .state{font-size:10px;fill:var(--muted)}
svg.map .here circle{fill:var(--accent);stroke:var(--card);stroke-width:1.5}
svg.map .here .dot{fill:var(--card);stroke:none}
svg.map .elsewhere{font:italic 12px Georgia,serif;fill:var(--muted)}
svg.map .sign.locked rect{fill:var(--warn);stroke:var(--ink);stroke-width:1}
svg.map .sign.locked path{fill:none;stroke:var(--ink);stroke-width:1.6}
svg.map .sign.closed circle{fill:var(--red)}
svg.map .sign.closed path{stroke:#fff;stroke-width:2}
svg.map .lead-mark circle{fill:var(--card);stroke:var(--accent);stroke-width:1.5}
svg.map .lead-mark text{fill:var(--accent);font-weight:700}
svg.map .compass circle{fill:none;stroke:var(--ink);stroke-width:1.5}
svg.map .compass .needle{fill:var(--ink)}
svg.map .compass .south{fill:none;stroke:var(--ink);stroke-width:1}
svg.map .compass text{font:700 12px Georgia,serif}
.badge{fill:var(--accent)}
.badge-n{fill:var(--card);font-size:12px;font-weight:700}
.statement{margin:4px 0}
meter{width:9em;vertical-align:middle}
.meter span:first-child{display:inline-block;min-width:7em}
.cork{border:10px solid #6b4a2b;border-radius:4px;background-color:#b88a5a;background-image:radial-gradient(rgba(60,35,10,.28) 1px,transparent 1.5px),radial-gradient(rgba(255,235,200,.22) 1px,transparent 1.5px);background-size:9px 9px,13px 13px;background-position:0 0,4px 6px;box-shadow:inset 0 0 18px rgba(0,0,0,.35);overflow-x:auto}
svg.board{display:block;width:100%;min-width:640px;height:auto;font:13px 'Segoe Print','Bradley Hand','Comic Sans MS',cursive,system-ui}
svg.board .paper{fill:#fffdf4;stroke:#d6c9a8;stroke-width:1;filter:drop-shadow(2px 3px 2px rgba(0,0,0,.35))}
svg.board .print{fill:#cfc6b2}
svg.board .card-pin.sighting .paper{fill:#dfe8ea;stroke:#7a8a90;stroke-dasharray:5 3}
.card.sighting{border-left:4px solid #7a8a90}
.witness-tag{font-style:italic}
svg.board .photo.cleared .paper,svg.board .photo.cleared .print{opacity:.55}
svg.board .photo.cleared .initial{opacity:.4}
.reaction{font-style:italic;color:#4a4338}
.reaction::before{content:"“"}
.reaction::after{content:"”"}
.cleared-tag{color:#2f6a3a;font-weight:700}
.card.suspect.cleared{opacity:.85}
svg.board .initial{font:700 44px Georgia,serif;fill:#6b6354}
svg.board .line{fill:#2a2622}
svg.board .num{font:700 13px system-ui,sans-serif;fill:#8a3b2a;letter-spacing:.04em}
svg.board .caption{fill:#2a2622;paint-order:stroke;stroke:#f1e1c0;stroke-width:3px;stroke-linejoin:round}
svg.board .where text{font-size:11px;fill:#6b4a2b}
svg.board .garbled .paper{stroke-dasharray:5 3;stroke:#b26a00}
svg.board .lead-pin .paper{fill:#e8f1f8;stroke:#9db8d6;stroke-width:1;filter:drop-shadow(2px 3px 2px rgba(0,0,0,.35))}
svg.board .lead-pin .num{font:700 12px system-ui,sans-serif;fill:#2b5fa3;letter-spacing:.08em}
svg.board .lead-pin text{fill:#2a2622;font-size:11px}
svg.board .lead-pin text.line{font-size:13px}
svg.board .lead-pin text.status{fill:#2f6a3a;font-weight:700}
svg.board .lead-pin.idle .paper{stroke-dasharray:5 3}
svg.board .lead-pin.idle text.status{fill:#6b6354}
svg.board .lead-pin.shut .paper{fill:#dcd9d2;stroke:#a39e92;stroke-dasharray:5 3}
svg.board .lead-pin.shut text.status{fill:#b26a00}
svg.board .lead-pin.done .paper{fill:#e3e0d8;stroke:#a39e92}
svg.board .lead-pin.done text.status{fill:#6b6354}
svg.board .thread.earned{stroke:#2f7a4a;stroke-width:2;stroke-dasharray:8 4}
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
.cork-wrap{position:relative}
.opened{--note:#fff3a8;--note-ink:#2a2622;--note-tag:#7a6a3a;--note-rule:rgba(70,110,180,.3);display:none;position:absolute;left:50%;top:16px;transform:translateX(-50%) rotate(-1deg);width:min(460px,92%);z-index:3;padding:34px 20px 16px 24px;background-color:var(--note);background-image:linear-gradient(to bottom,transparent 25px,var(--note-rule) 26px);background-size:100% 26px;color:var(--note-ink);border-left:3px double var(--margin);border-radius:2px 2px 6px 2px;box-shadow:2px 3px 3px rgba(0,0,0,.25),0 12px 28px var(--shadow);cursor:pointer;font-family:'Segoe Print','Bradley Hand',Georgia,serif;font-size:14px;line-height:26px}
.opened::before{content:'';position:absolute;top:-4px;left:50%;width:84px;height:20px;transform:translateX(-50%) rotate(2deg);background:rgba(255,255,255,.45);box-shadow:0 1px 2px rgba(0,0,0,.2)}
.opened p{margin:0}
.opened .tag{color:var(--note-tag);font-size:12px;line-height:26px}
.opened .whole{font-size:1.1em}
.opened .note{color:var(--note-tag);line-height:26px;margin:0}
.opened ul.tried .result{color:#b3261e}
.opened .num{color:#8a3b2a}
.opened:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.opened ul.tried{margin:0}
.opened ul.tried li{margin:0;padding:0 0 0 8px;background:none;color:var(--note-ink);box-shadow:none;border-left:2px solid var(--margin)}
.num{font:700 12px system-ui,sans-serif;letter-spacing:.04em;color:var(--margin)}
details{margin:4px 0 0}
details summary{cursor:pointer;font:12px system-ui,sans-serif;color:var(--paper-tag)}
details p{margin:4px 0}
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
[hidden]{display:none!important}
.plan{display:none;margin:12px 0;padding:8px 10px;border:1px solid var(--parch-edge);border-radius:6px;background:var(--card)}
.plan:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
svg.plan-svg{display:block;width:100%;height:auto;font:12px system-ui,sans-serif}
svg.plan-svg text{fill:var(--ink)}
svg.plan-svg .room .walls{fill:var(--roof);stroke:var(--ink);stroke-width:1.8}
svg.plan-svg .room.unvisited .walls{fill:var(--parch);stroke-dasharray:5 3}
svg.plan-svg .room.current .walls{stroke:var(--accent);stroke-width:3.5}
svg.plan-svg .room-name{font-weight:700;font-size:13px}
svg.plan-svg .part-name{font-weight:600}
svg.plan-svg .part-state{font-size:11px;fill:var(--muted)}
svg.plan-svg .door-way line{stroke:var(--ink);stroke-width:2;stroke-dasharray:4 3}
svg.plan-svg .door-way rect{fill:var(--street);stroke:var(--ink);stroke-width:1.5}
svg.plan-svg .mark circle{fill:var(--card);stroke:var(--ink);stroke-width:1.5}
svg.plan-svg .mark.done circle{fill:#2f6a3a;stroke:#2f6a3a}
svg.plan-svg .mark.done path{fill:none;stroke:#fff;stroke-width:2}
svg.plan-svg .mark.open .dot{fill:var(--ink);stroke:none}
svg.plan-svg .mark.shut circle{stroke:var(--warn);stroke-width:2}
svg.plan-svg .mark text{font-size:11px;fill:var(--ink)}
svg.plan-svg .sign.locked rect{fill:var(--warn);stroke:var(--ink);stroke-width:1}
svg.plan-svg .sign.locked path{fill:none;stroke:var(--ink);stroke-width:1.6}
svg.plan-svg .clue-chip text{font-weight:700;fill:var(--accent);cursor:pointer;text-decoration:underline}
svg.plan-svg .here-dot{fill:var(--accent)}
svg.plan-svg .lead-mark circle{fill:var(--card);stroke:var(--accent);stroke-width:1.5}
svg.plan-svg .lead-mark text{fill:var(--accent);font-weight:700}
details.day-strip{margin:0 0 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);padding:6px 10px}
details.day-strip>summary{cursor:pointer;font:600 14px system-ui,sans-serif;color:var(--accent)}
svg.strip{display:block;width:100%;min-width:720px;height:auto;font:11px system-ui,sans-serif}
svg.strip text{fill:var(--ink)}
svg.strip .night-shade{fill:var(--soft)}
svg.strip .night-label,svg.strip .hour{fill:var(--muted)}
svg.strip .tick{stroke:var(--line);stroke-width:1}
svg.strip .time-left{fill:var(--accent)}
svg.strip .now{stroke:var(--accent);stroke-width:2;stroke-dasharray:3 3}
svg.strip .turn .bar{fill:var(--paper);stroke:var(--muted);stroke-width:1.5}
svg.strip .turn .end{fill:var(--card);stroke:var(--muted);stroke-width:1.5}
svg.strip .turn .symbol{font:700 12px system-ui,sans-serif}
svg.strip .turn.k-move .bar{fill:#dbe7f3}
svg.strip .turn.k-look .bar,svg.strip .turn.k-search .bar{fill:#e8e2c8}
svg.strip .turn.k-talk .bar,svg.strip .turn.k-ask .bar{fill:#f1d9d3}
svg.strip .turn.k-deduce .bar,svg.strip .turn.k-study .bar,svg.strip .turn.k-reread .bar{fill:#dcebd6}
svg.strip .turn.k-rest .bar,svg.strip .turn.k-sit .bar{fill:#e1dcef}
svg.strip .turn.held .detention{fill:var(--red);opacity:.55}
svg.strip .turn.held .bar{stroke:var(--red);stroke-width:2.5}
svg.strip .turn.crossed .bar{stroke-dasharray:6 3}
svg.strip .turn.night-after .end{stroke:var(--accent);stroke-width:3}
svg.strip .lead-hours{fill:#2b5fa3;opacity:.7}
svg.strip .lead-band.shut .lead-hours{fill:var(--muted)}
svg.strip .flag path{fill:var(--accent);stroke:var(--accent)}
.day-turns{list-style:none;padding:0;margin:6px 0 0}
.day-turns li{padding:2px 8px;border-left:3px double var(--margin)}
.suspect .who{display:flex;gap:12px;align-items:center}
.suspect .who p{margin:0}
svg.portrait{flex:0 0 56px;width:56px;height:56px;font:700 22px Georgia,serif}
svg.portrait circle:first-child{fill:var(--tone,#c9b99b)}
svg.portrait .head,svg.portrait .body{fill:rgba(0,0,0,.28)}
svg.portrait text{fill:#fffdf4}
svg.portrait.p0{--tone:#8a3b2a}svg.portrait.p1{--tone:#2b5fa3}svg.portrait.p2{--tone:#5a7a3a}svg.portrait.p3{--tone:#7a5a8a}svg.portrait.p4{--tone:#b26a00}svg.portrait.p5{--tone:#3a7a7a}
.gauge{display:inline-flex;gap:3px;vertical-align:middle}
.gauge .step{width:18px;height:8px;border-radius:2px;background:var(--line)}
.gauge.mood-shaken .on{background:var(--warn)}
.gauge.mood-cornered .on{background:var(--margin)}
.gauge.mood-broken .on{background:var(--red)}
.gauge.mood-calm .on{background:var(--blue)}
.statement.fell s{color:var(--muted)}
.day{margin:0 0 6px}
.chips{margin:0}
.chip{display:inline-block;margin:2px 4px 2px 0;padding:0 8px;border-radius:999px;border:1px solid currentColor;font:12px/22px system-ui,sans-serif;cursor:pointer}
.chip.fx-breaks-lie{color:var(--red)}
.chip.fx-confirms{color:var(--blue)}
.chip.fx-implicates{color:var(--warn)}
.chip.fx-no-effect{color:var(--muted)}
.filters{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:0 0 12px;font:13px system-ui,sans-serif}
.filters select,.filters input[type=search]{font:inherit}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.grid .card{margin:0}
.clue-card .text{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ways a{color:var(--accent)}
@media (max-width:560px){body{padding:16px}h1{font-size:1.5rem}}
@media print{body{background:#fff;color:#000}.opened{display:none!important}.tab{display:block!important}nav.tabs{display:none}.card,.graph,.cork{break-inside:avoid}}
`;

/**
 * The player's evidence board: one self-contained page (no outside resource, and one small script that only
 * picks) made from the public view of the run and the turns the player took, so it can hold nothing the
 * narrator may not know. Six tabs switched by the address alone: the corkboard (the people and the clues,
 * with thread for the links tried and the clues shown), the suspects and the clues as notebooks, the known
 * map, the chronicle, and the hero, under one header. Picking a clue, a person, a place or a lead lights what
 * ties to it on any tab. Given the view before the last turn, it marks what that turn changed.
 */
export function renderEvidenceBoard(
  view: DetectiveRunView,
  turns: readonly TurnView[] = [],
  previous?: DetectiveRunView,
  strip: readonly StripTurn[] = [],
): string {
  const board = BOARD_TEXT[view.locale];
  const text = TAB_TEXT[view.locale];
  const e = escapeHtml;
  const fresh = freshSince(view, previous);
  const closed = closedFileOf(turns);

  const news =
    view.news.length === 0
      ? ''
      : `<h2>${e(board.news)}</h2>\n<ul>${view.news.map((line) => `<li>${e(line)}</li>`).join('\n')}</ul>`;

  return `<!doctype html>
<html lang="${view.locale}">
<head>
<meta charset="utf-8">
<meta name="turn" content="${String(view.turn)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${SCRIPT_HASH}'">
<title>${e(board.pageTitle)}: ${e(view.title)}</title>
<style>${STYLE}
${highlightRules(view)}
${openedRules(view)}
${cardRules(view)}
${turnRules(strip)}
${planRules(view)}</style>
</head>
<body>
<main>
${renderHeader(view, board, text, fresh)}
<p class="premise">${e(view.premise)}</p>
<p class="meta">${e(board.nowAt)}: <strong>${e(view.location.name)}</strong></p>
<nav class="tabs" aria-label="${e(text.nav)}">${TAB_IDS.filter((id) => id !== 'file' || closed !== undefined)
    .map((id) => `<a href="#${id}">${e(text.tabs[id])}</a>`)
    .join('')}</nav>
<section class="tab" id="board">
<h2>${e(text.corkboard.title)}</h2>
${renderCork(view, board, text)}
</section>
<section class="tab notebook" id="suspects">
<h2>${e(board.suspects)}</h2>
${renderSuspects(view, board, text, fresh)}
</section>
<section class="tab notebook" id="clues">
${renderClues(view, board, text, fresh)}
</section>
<section class="tab" id="map">
<h2>${e(text.map.title)}</h2>
${renderMap(view, text)}
${news}
</section>
<section class="tab" id="chronicle">
<h2>${e(text.tabs.chronicle)}</h2>
${renderChronicle(view, turns, text, fresh, strip)}
</section>
<section class="tab" id="hero">
<h2>${e(text.tabs.hero)}</h2>
${renderHero(view, board, text, fresh)}
</section>${
    closed === undefined
      ? ''
      : `
<section class="tab" id="file">
<h2>${e(text.closedFile.title)}</h2>
${renderClosedFile(view, closed, text)}
</section>`
  }
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
