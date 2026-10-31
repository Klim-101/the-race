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

function continuesRun(piece: Piece | undefined): boolean {
  return piece?.joined === true && isCapitalised(piece.word) && !isAcronym(piece.word);
}

function isName(word: string): boolean {
  return word.length >= MIN_NAME_LENGTH && !NOT_NAMES.has(word.toLowerCase());
}

function namesInText(text: string): string[] {
  const names: string[] = [];
  const pieces = piecesOf(text);
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
