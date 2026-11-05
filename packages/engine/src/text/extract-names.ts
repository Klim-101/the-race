// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { transliterate } from './transliterate.js';

// There is no dictionary of names here, by decision: a name is found by how it is written. Anything that
// stands capitalised in the middle of a sentence is a name, and so is a run of capitalised words. The only
// doubtful case is a single word that opens a sentence ("Цены упали", "Putin says"): it counts only when a
// verb of speech follows it. A name that only ever opens a sentence and is followed by something else is
// missed, and the validator's other checks have to catch it. A word that is also a common word ("Apple")
// is still a name when it stands capitalised in the middle of a sentence: a needless rejection is cheaper
// than a real name that reaches the player.

const TOKEN = /[\p{L}][\p{L}\p{M}'’-]*/gu;
const BREAKS_SENTENCE = /[.!?…:;«»"“”()[\]—–\n]/u;
const MIN_NAME_LENGTH = 2;
const MAX_RUN_PARTS = 4;
// A headline of at least this many words after the first, of which this share stand capitalised, is written in
// Title Case ("Man Shocked As Dog Barks At Mailman"): there a capital says nothing of a name.
const MIN_TITLE_CASE_WORDS = 6;
const TITLE_CASE_SHARE = 0.8;

// Stems of the verbs that follow a speaker in a headline.
const SPEECH_VERB =
  /^(?:заяв|сообщ|назвал|призв|пообещ|объяв|отказ|подтверд|предлож|счита|расска|отмет|сказ|пригроз|предупред|ответ|says?$|said$|warns?$|warned$|announces?$|announced$|denies$|denied$|admits?$|admitted$|claims?$|claimed$|urges?$|urged$|confirms?$|confirmed$|promises?$|promised$|insists?$|insisted$|rejects?$|rejected$|vows?$|vowed$|tells$|told$|suggests?$)/u;

// Words that stand capitalised without being a name, and the heads of organisations and offices, which
// say nothing alone ("Банк России" is a name; "Банк" is not).
const NOT_NAMES = new Set(
  (
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july ' +
    'august september october november december mr mrs ms dr sir president minister prime chancellor king ' +
    'queen mayor governor senator judge general colonel captain minister ministry bank university company ' +
    'group city republic state council committee court agency office department police party union ' +
    'президент министр премьер канцлер король королева мэр губернатор сенатор судья генерал полковник ' +
    'капитан министерство банк университет компания группа город республика государство совет ' +
    'комитет суд агентство управление полиция партия союз ' +
    'agreement treaty accord pact summit commission authority administration ' +
    // Function words: a feed's summary may run two sentences together with no full stop between them, and the
    // first word of the second ("The African National Congress") then stands in the middle of what looks like
    // one run. These are words of the language and no name alone, in the languages of the shipped feeds.
    'the an on in at as of to for by with from into onto over under about after before during between among ' +
    'against and or but nor so yet if than that this these those there here then who whom whose which what when ' +
    'where why how while although because since until ' +
    'der die das den dem des ein eine einen einem und oder aber mit von zu im am auf für nicht ' +
    'el la los las un una unos unas y o pero con por para del al en que ' +
    'соглашение договор саммит комиссия администрация ' +
    'he she it they we you i он она оно они мы вы я ' +
    'gdp ceo cfo ai it tv pr ok vat ввп ии жкх ндс сми ит тв дтп чп'
  ).split(' '),
);

interface Piece {
  readonly word: string;
  /** The word opens a sentence. */
  readonly opens: boolean;
  /** Only whitespace lies between this word and the one before. */
  readonly joined: boolean;
}

function piecesOf(text: string): Piece[] {
  const pieces: Piece[] = [];
  const normalized = text.normalize('NFKC');
  let previousEnd = 0;
  for (const match of normalized.matchAll(TOKEN)) {
    const gap = normalized.slice(previousEnd, match.index);
    const word = match[0].replace(/[-'’]+$/u, '');
    pieces.push({
      word,
      opens: pieces.length === 0 || BREAKS_SENTENCE.test(gap),
      joined: pieces.length > 0 && /^\s+$/u.test(gap),
    });
    previousEnd = match.index + match[0].length;
  }
  return pieces;
}

const isCapitalised = (word: string): boolean => /^\p{Lu}/u.test(word);
const isAcronym = (word: string): boolean =>
  word.length >= 2 && word === word.toUpperCase() && /\p{L}/u.test(word);

/**
 * Whether the text is in Title Case. Every word of it would be taken for a name, and the real names of the day
 * would hold "as", "at", "newsroom" and "independent", which no case could be written without. Only acronyms
 * ("UK") are taken from such a text; a name that stands in one and nowhere else is missed, which the dictionary
 * of the world and the validator's other checks have to catch.
 */
function isTitleCase(pieces: readonly Piece[]): boolean {
  const rest = pieces.slice(1);
  if (rest.length < MIN_TITLE_CASE_WORDS) return false;
  const capitalised = rest.filter(({ word }) => isCapitalised(word) && !isAcronym(word)).length;
  return capitalised / rest.length >= TITLE_CASE_SHARE;
}

function continuesRun(piece: Piece | undefined): boolean {
  return piece?.joined === true && isCapitalised(piece.word) && !isAcronym(piece.word);
}

function isName(word: string): boolean {
  return word.length >= MIN_NAME_LENGTH && !NOT_NAMES.has(word.toLowerCase());
}

function namesInText(text: string): string[] {
  const names: string[] = [];
  const pieces = piecesOf(text);
  if (isTitleCase(pieces))
    return pieces
      .map(({ word }) => word)
      .filter(isAcronym)
      .filter(isName);
  let resumeAt = 0;
  for (const [at, first] of pieces.entries()) {
    if (at < resumeAt || !isCapitalised(first.word)) continue;
    if (isAcronym(first.word)) {
      names.push(first.word);
      continue;
    }
    // A run: capitalised, not shouted, and only a space from the one before.
    let end = at + 1;
    while (continuesRun(pieces[end])) end += 1;
    resumeAt = end;
    const speaks = SPEECH_VERB.test((pieces[end]?.word ?? '').toLowerCase());
    // A capitalised word that opens a sentence may be nothing but its first word ("Сегодня Москва"): unless
    // a verb of speech follows the run, it is not taken for a name.
    const words = pieces.slice(first.opens && !speaks ? at + 1 : at, end).map(({ word }) => word);
    if (words.length > 0) {
      names.push(words.join(' '), ...(words.length > 1 ? words.slice(0, MAX_RUN_PARTS) : []));
    }
  }
  return names.filter(isName);
}

/**
 * The proper names of some source texts (headlines and their summaries), in Russian or English, each with
 * the likely spellings of it in the other script. Sorted and without repeats: the same texts always give the
 * same list. Case endings are left to the real-name check, which matches a name by its stem.
 */
export function extractRealNames(texts: readonly string[]): string[] {
  const found = texts.flatMap(namesInText);
  const names = new Set(found.map((name) => name.toLowerCase()));
  for (const name of found) for (const spelling of transliterate(name)) names.add(spelling);
  return [...names].filter(isName).sort();
}
