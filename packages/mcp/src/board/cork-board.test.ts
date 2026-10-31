// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveRunView } from '@the-race/engine';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { wrap } from './board-cork.js';
import {
  clueTokens,
  highlightRules,
  pickableTokens,
  placeTokens,
  rel,
  shownPairs,
  suspectTokens,
  threadTokens,
} from './board-relations.js';
import { SCRIPT, renderEvidenceBoard } from './render-board.js';

type View = DetectiveRunView;

function viewOf(overrides: Record<string, unknown> = {}): View {
  return {
    title: 'The Vanishing Wheel',
    premise: 'A wheel of cheese is gone.',
    locale: 'en',
    turn: 3,
    status: 'active',
    clock: { day: 2, minute: 545, totalDays: 3 },
    reputation: 7,
    condition: { nerves: 8, maxNerves: 10, sleepDebt: 1, maxSleepDebt: 10, conditions: [] },
    kit: [],
    supplies: [],
    pending: [],
    warnings: [],
    hero: {
      name: 'Mira',
      gender: 'female',
      archetype: 'detective',
      skills: { perception: 4 },
      background: 'police',
    },
    history: { finds: [], shown: [], links: [] },
    signal: null,
    signalEvents: [],
    hiddenTraitCount: 2,
    revealedTraits: [],
    setting: null,
    inspiration: null,
    news: [],
    location: { id: 'market', name: 'Market', description: '', exits: [] },
    map: {
      current: 'market',
      places: [
        { id: 'market', name: 'Market', visited: true, blocked: null },
        { id: 'stall', name: 'Stall', visited: true, blocked: null },
        { id: 'cellar', name: 'Cellar', visited: false, blocked: 'locked' },
        { id: 'chapel', name: 'Chapel', visited: false, blocked: 'closed' },
      ],
      links: [
        { from: 'market', to: 'stall' },
        { from: 'market', to: 'cellar' },
      ],
    },
    suspects: [
      { id: 'a', name: 'Anna', persona: 'Baker', place: { id: 'market', name: 'Market' }, statements: [] },
      { id: 'b', name: 'Boris', persona: 'Rival', place: { id: 'stall', name: 'Stall' }, statements: [] },
      { id: 'c', name: 'Cora', persona: 'Mayor', place: null, statements: [] },
    ],
    clues: [],
    openLinks: [],
    insights: [],
    chronicle: { activeMinutesLeft: 600, events: [] },
    ...overrides,
  } as unknown as View;
}

/** The markup of one tab, to be read by itself. */
function tab(page: string, id: string): string {
  const match = new RegExp(`<section class="tab(?: notebook)?" id="${id}">([\\s\\S]*?)</section>`).exec(page);
  if (match?.[1] === undefined) throw new Error(`No tab ${id}.`);
  return match[1];
}

// A play that found three clues, showed two of them to Anna and one to Boris, and tried three links.
const PLAYED = {
  clues: [
    { id: 'key', locationId: 'stall', description: 'A rusty key under the counter.', garbled: false },
    { id: 'flour', locationId: 'market', description: 'Flour on the cellar steps.', garbled: false },
    { id: 'glove', locationId: 'market', description: 'A blue glove by the till.', garbled: true },
  ],
  history: {
    finds: [
      { clueId: 'key', locationId: 'stall', turn: 2 },
      { clueId: 'flour', locationId: 'market', turn: 4 },
      { clueId: 'glove', locationId: 'market', turn: 5 },
    ],
    shown: [
      { suspectId: 'a', clueId: 'flour', effect: 'breaks-lie', turn: 6 },
      { suspectId: 'a', clueId: 'flour', effect: 'no-effect', turn: 7 },
      { suspectId: 'b', clueId: 'key', effect: 'no-effect', turn: 8 },
    ],
    links: [
      { clueIds: ['key', 'flour'], result: 'nothing', turn: 9 },
      { clueIds: ['flour', 'glove'], result: 'insight', turn: 10 },
      { clueIds: ['flour', 'glove'], result: 'already-known', turn: 11 },
    ],
  },
  insights: [{ id: 'liar', insight: 'The baker lied about the flour.', clueIds: ['flour', 'glove'] }],
};

describe('what lights up when something is picked', () => {
  const view = viewOf(PLAYED);

  it('lights a clue with the place it was found at and each person it was shown to', () => {
    expect(clueTokens(view, 'flour')).toEqual(['clue:flour', 'place:market', 'suspect:a']);
    expect(clueTokens(view, 'key')).toEqual(['clue:key', 'place:stall', 'suspect:b']);
    expect(clueTokens(view, 'glove')).toEqual(['clue:glove', 'place:market']);
    // A clue the view does not know has nowhere it was found.
    expect(clueTokens(view, 'ghost')).toEqual(['clue:ghost']);
  });

  it('lights a person with the clues they were shown, and a place with the clues found there', () => {
    expect(suspectTokens(view, 'a')).toEqual(['suspect:a', 'clue:flour']);
    expect(suspectTokens(view, 'c')).toEqual(['suspect:c']);
    expect(placeTokens(view, 'market')).toEqual(['place:market', 'clue:flour', 'clue:glove']);
    expect(placeTokens(view, 'chapel')).toEqual(['place:chapel']);
  });

  it('counts a clue shown twice to one person once, as a break if it ever broke a lie', () => {
    expect(shownPairs(view)).toEqual([
      { clueId: 'flour', suspectId: 'a', effect: 'breaks-lie' },
      { clueId: 'key', suspectId: 'b', effect: 'no-effect' },
    ]);
  });

  it("falls back on the clue's own place when the history does not know where it was found", () => {
    const old = viewOf({ ...PLAYED, history: { finds: [], shown: [], links: [] } });

    expect(clueTokens(old, 'key')).toEqual(['clue:key', 'place:stall']);
    expect(placeTokens(old, 'stall')).toEqual(['place:stall', 'clue:key']);
  });

  it('lights a thread with the clues it joins and, for a thread to a person, the person', () => {
    expect(threadTokens(['key', 'flour'])).toEqual(['clue:key', 'clue:flour']);
    expect(threadTokens(['flour'], 'a')).toEqual(['clue:flour', 'suspect:a']);
    expect(rel(['clue:a', 'suspect:b'])).toBe('clue:a suspect:b');
  });

  it('has one rule for each token that can be picked, and never lets an odd id into a selector', () => {
    const rules = highlightRules(view);

    for (const entry of ['clue:key', 'suspect:a', 'place:market', 'place:cellar']) {
      expect(rules).toContain(`main[data-sel="${entry}"] [data-rel~="${entry}"]{opacity:1`);
    }
    const hostile = viewOf({
      clues: [{ id: 'x"] , body{display:none', locationId: 'stall', description: 'x', garbled: false }],
    });
    expect(pickableTokens(hostile).join(' ')).not.toContain('display:none');
    expect(highlightRules(hostile)).not.toContain('display:none');
  });
});

describe('the corkboard tab', () => {
  const cork = (view: View) => tab(renderEvidenceBoard(view), 'board');

  it('pins each person as a photograph and each clue as a card, in the order they were found', () => {
    const html = cork(viewOf(PLAYED));

    expect(html.match(/class="photo"/g)).toHaveLength(3);
    expect(html.match(/class="card-pin/g)).toHaveLength(3);
    expect(html.indexOf('A rusty key')).toBeLessThan(html.indexOf('Flour on the cellar'));
    expect(html).toContain('found at Stall · turn 2');
    expect(html).toContain('found at Market · turn 5');
    expect(html).toContain('class="card-pin garbled"');
  });

  it('draws a red thread for each link tried and a blue one to each person a clue was shown to', () => {
    const html = cork(viewOf(PLAYED));

    expect(html.match(/class="thread cold"/g)).toHaveLength(1);
    expect(html.match(/class="thread made"/g)).toHaveLength(2);
    expect(html.match(/class="thread shown breaks"/g)).toHaveLength(1);
    expect(html.match(/class="thread shown plain"/g)).toHaveLength(1);
    expect(html).toContain('Red thread: a link tried');
  });

  it('says nothing of how close a link was: a link that led nowhere is one look', () => {
    expect(cork(viewOf(PLAYED))).not.toMatch(/close|almost|near/i);
  });

  it('can be picked and used from the keyboard, with a name for each pin', () => {
    const html = cork(viewOf(PLAYED));

    expect(html).toContain('data-pick="clue:key"');
    expect(html).toContain('data-pick="suspect:a"');
    expect(html).toContain('data-pick="place:market"');
    expect(html).toContain('tabindex="0" role="button" aria-label="Anna"');
    expect(html).toContain('aria-label="A rusty key under the counter."');
    expect(html).toContain('data-rel="clue:flour place:market suspect:a"');
  });

  it('says so when nothing is pinned, and still shows the people before any clue is found', () => {
    expect(cork(viewOf({ suspects: [] }))).toContain('Nothing is pinned yet.');
    const people = cork(viewOf());

    expect(people.match(/class="photo"/g)).toHaveLength(3);
    expect(people).not.toContain('card-pin');
  });

  it('spreads one person alone in the middle, and shows clues without any person', () => {
    const one = cork(viewOf({ ...PLAYED, suspects: [viewOf().suspects[0]] }));
    const none = cork(viewOf({ ...PLAYED, suspects: [] }));

    expect(one.match(/class="photo"/g)).toHaveLength(1);
    expect(none).not.toContain('class="photo"');
    expect(none.match(/class="card-pin/g)).toHaveLength(3);
  });

  it('skips a thread to a clue or a person that is not on the board', () => {
    const odd = viewOf({
      ...PLAYED,
      history: {
        finds: [],
        shown: [{ suspectId: 'ghost', clueId: 'key', effect: 'no-effect', turn: 1 }],
        links: [{ clueIds: ['key', 'ghost'], result: 'nothing', turn: 2 }],
      },
    });

    expect(cork(odd)).not.toContain('class="thread');
  });

  it('puts the clues in rows of four', () => {
    const many = Array.from({ length: 6 }, (_, index) => ({
      id: `c${String(index)}`,
      locationId: 'market',
      description: `Clue ${String(index)}`,
      garbled: false,
    }));

    expect(cork(viewOf({ clues: many })).match(/class="card-pin/g)).toHaveLength(6);
  });

  it('wraps a long clue onto a few lines and cuts what does not fit', () => {
    expect(wrap('one two three', 20, 4)).toEqual(['one two three']);
    expect(wrap('alpha beta gamma delta epsilon zeta', 12, 4)).toEqual([
      'alpha beta',
      'gamma delta',
      'epsilon zeta',
    ]);
    const cut = wrap('a b c d e f g h i j k l m n o p', 3, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1]?.endsWith('…')).toBe(true);
    expect(wrap('abcdefghijklmnop', 6, 2)).toEqual(['abcde…']);
    expect(wrap('   ', 6, 2)).toEqual([]);
  });

  it('is written in Russian when the run is', () => {
    const html = cork(viewOf({ ...PLAYED, locale: 'ru' }));

    expect(html).toContain('найдено: Stall · ход 2');
    expect(html).toContain('Красная нитка');
  });

  it("puts the map's places under the same picking, so a place can be picked from the map", () => {
    const map = tab(renderEvidenceBoard(viewOf(PLAYED)), 'map');

    expect(map).toContain('data-pick="place:market"');
    expect(map).toContain('data-rel="place:market clue:flour clue:glove"');
  });
});

describe('the notebooks', () => {
  const page = renderEvidenceBoard(viewOf(PLAYED));

  it('tell each clue where it was found, on which turn and to whom it was shown, with what that did', () => {
    const clues = tab(page, 'clues');

    expect(clues).toContain('found at Stall · turn 2');
    expect(clues).toContain('Shown to: Anna (broke a lie)');
    expect(clues).toContain('Shown to: Boris (no effect)');
    expect(clues).toContain('Shown to: not shown to anyone yet');
  });

  it('list the links tried, oldest first, with what came of each and nothing of how close it was', () => {
    const clues = tab(page, 'clues');
    const tried = /<ul class="tried">([\s\S]*?)<\/ul>/.exec(clues)?.[1] ?? '';

    expect(tried.match(/<li /g)).toHaveLength(3);
    expect(tried.indexOf('led nowhere')).toBeLessThan(tried.indexOf('a conclusion'));
    expect(tried.indexOf('a conclusion')).toBeLessThan(tried.indexOf('already known'));
    expect(tried).toContain('A rusty key under the counter. + Flour on the cellar steps.');
    expect(tried).toContain('turn 9');
    expect(tried).not.toMatch(/close|almost|near/i);
  });

  it('say so when no link has been tried', () => {
    expect(tab(renderEvidenceBoard(viewOf()), 'clues')).toContain('No link has been tried yet.');
  });

  it('tell each person the clues they were shown, in order, and say nothing of a person shown nothing', () => {
    const suspects = tab(page, 'suspects');

    expect(suspects).toContain('Clues shown to them');
    expect(suspects).toContain('Flour on the cellar steps. <span class="effect">broke a lie</span>');
    expect(suspects).toContain('A rusty key under the counter. <span class="effect">no effect</span>');
    const cora = /Cora<\/strong>[\s\S]*?<\/div>/.exec(suspects)?.[0] ?? '';
    expect(cora).not.toContain('Clues shown to them');
  });

  it('name a clue by its id when its text is gone, and keep the story whole without the script', () => {
    const lost = renderEvidenceBoard(viewOf({ ...PLAYED, clues: [PLAYED.clues[0]] }));

    expect(tab(lost, 'suspects')).toContain('flour');
    expect(tab(lost, 'clues')).toContain('flour');
    expect(page).toContain('Shown to: Anna (broke a lie)');
    // Nothing is picked until the script runs.
    expect(page).not.toMatch(/<main[^>]*data-sel/);
  });
});

describe('the script that picks', () => {
  /** A page with just enough of a document to run the script on: a main, and listeners to call. */
  function run() {
    const attrs = new Map<string, string>();
    const main = {
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => void attrs.set(name, value),
      removeAttribute: (name: string) => void attrs.delete(name),
    };
    const listeners = new Map<string, (event: unknown) => void>();
    const document = {
      querySelector: () => main,
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        void listeners.set(type, handler),
    };
    runInNewContext(SCRIPT, { document });
    const pickable = (value: string) => ({
      closest: (selector: string) => (selector === '[data-pick]' ? { getAttribute: () => value } : null),
    });
    const bare = { closest: () => null };
    const link = { closest: (selector: string) => (selector === 'a' ? {} : null) };
    return {
      picked: () => attrs.get('data-sel'),
      click: (target: unknown) => listeners.get('click')?.({ target }),
      key: (key: string, target: unknown = bare) => {
        let prevented = false;
        listeners.get('keydown')?.({ key, target, preventDefault: () => (prevented = true) });
        return prevented;
      },
      pickable,
      bare,
      link,
    };
  }

  it('picks what is clicked, and clicking it again, or the table, or Escape lets go', () => {
    const page = run();

    page.click(page.pickable('clue:key'));
    expect(page.picked()).toBe('clue:key');
    page.click(page.pickable('suspect:a'));
    expect(page.picked()).toBe('suspect:a');
    page.click(page.pickable('suspect:a'));
    expect(page.picked()).toBeUndefined();

    page.click(page.pickable('place:market'));
    page.click(page.bare);
    expect(page.picked()).toBeUndefined();
    page.click(page.pickable('place:market'));
    page.key('Escape');
    expect(page.picked()).toBeUndefined();
  });

  it('leaves a click on a link alone, and picks with Enter or Space from the keyboard', () => {
    const page = run();

    page.click(page.pickable('clue:key'));
    page.click(page.link);
    expect(page.picked()).toBe('clue:key');
    page.key('Escape');
    expect(page.key('Enter', page.pickable('clue:flour'))).toBe(true);
    expect(page.picked()).toBe('clue:flour');
    expect(page.key(' ', page.pickable('clue:flour'))).toBe(true);
    expect(page.picked()).toBeUndefined();
    expect(page.key('Enter', page.bare)).toBe(false);
    expect(page.key('a', page.pickable('clue:key'))).toBe(false);
  });
});
