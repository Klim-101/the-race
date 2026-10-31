// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// A name in one script turns up in the other ("Путин", "Putin"), and there is no single spelling between
// them. So a name gives a handful of likely spellings, most likely first, and the real-name check looks
// for each. A wrong guess only adds a spelling that matches nothing.

const MAX_VARIANTS = 8;

const TO_LATIN: Readonly<Record<string, readonly string[]>> = {
  а: ['a'],
  б: ['b'],
  в: ['v'],
  г: ['g'],
  д: ['d'],
  е: ['e'],
  ё: ['yo', 'e'],
  ж: ['zh'],
  з: ['z'],
  и: ['i'],
  й: ['y', 'i'],
  к: ['k'],
  л: ['l'],
  м: ['m'],
  н: ['n'],
  о: ['o'],
  п: ['p'],
  р: ['r'],
  с: ['s'],
  т: ['t'],
  у: ['u'],
  ф: ['f'],
  х: ['kh', 'h'],
  ц: ['ts', 'c'],
  ч: ['ch'],
  ш: ['sh'],
  щ: ['shch', 'sch'],
  ъ: [''],
  ы: ['y', 'i'],
  ь: [''],
  э: ['e'],
  ю: ['yu', 'iu'],
  я: ['ya', 'ia'],
};

// Longest first, so that "shch" is read before "sh".
const TO_CYRILLIC: readonly (readonly [string, readonly string[]])[] = [
  ['shch', ['щ']],
  ['sch', ['щ']],
  ['zh', ['ж']],
  ['kh', ['х']],
  ['ts', ['ц']],
  ['ch', ['ч']],
  ['sh', ['ш']],
  ['yo', ['ё', 'йо']],
  ['yu', ['ю']],
  ['ya', ['я']],
  ['ye', ['е']],
  ['ck', ['к']],
  ['ph', ['ф']],
  ['th', ['т']],
  ['qu', ['кв']],
  ['oo', ['у']],
  ['ee', ['и']],
  ['a', ['а']],
  ['b', ['б']],
  ['c', ['к', 'ц', 'с']],
  ['d', ['д']],
  ['e', ['е', 'э']],
  ['f', ['ф']],
  ['g', ['г', 'дж']],
  ['h', ['х', 'г']],
  ['i', ['и']],
  ['j', ['дж', 'й']],
  ['k', ['к']],
  ['l', ['л']],
  ['m', ['м']],
  ['n', ['н']],
  ['o', ['о']],
  ['p', ['п']],
  ['q', ['к']],
  ['r', ['р']],
  ['s', ['с']],
  ['t', ['т']],
  ['u', ['у']],
  ['v', ['в']],
  ['w', ['в', 'у']],
  ['x', ['кс']],
  ['y', ['и', 'й', 'ы']],
  ['z', ['з']],
];

/** Every spelling made of one choice per slot, the first choices first, at most `MAX_VARIANTS`. */
function spellings(slots: readonly (readonly string[])[]): string[] {
  return slots.reduce<string[]>(
    (so_far, choices) =>
      so_far.flatMap((prefix) => choices.map((choice) => prefix + choice)).slice(0, MAX_VARIANTS),
    [''],
  );
}

function toLatin(name: string): string[] {
  // `Array.from` walks code points; a letter with no entry (a hyphen, a digit) stays as it is.
  return spellings(Array.from(name, (letter) => TO_LATIN[letter] ?? [letter]));
}

function toCyrillic(name: string): string[] {
  const slots: (readonly string[])[] = [];
  for (let at = 0; at < name.length;) {
    const known = TO_CYRILLIC.find(([latin]) => name.startsWith(latin, at));
    slots.push(known?.[1] ?? [name.charAt(at)]);
    at += known?.[0].length ?? 1;
  }
  return spellings(slots);
}

/**
 * The likely spellings of a name in the other script, lower case. A name with letters of both scripts, or of
 * neither, has none: only a name that is plainly in one script is carried over.
 */
export function transliterate(name: string): string[] {
  const lower = name.toLowerCase();
  const cyrillic = /\p{Script=Cyrillic}/u.test(lower);
  const latin = /\p{Script=Latin}/u.test(lower);
  if (cyrillic === latin) return [];
  return cyrillic ? toLatin(lower) : toCyrillic(lower);
}
