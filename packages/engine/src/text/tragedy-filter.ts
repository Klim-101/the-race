// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// The filter that stands between the news and any model (ADR-0004). It reads a headline, in Russian or
// English whatever the language of the run, and says whether it may go on. It is strict on purpose:
// a headline dropped by mistake costs one story out of a hundred, a tragedy that gets through becomes a
// plot. The rule has no score and no threshold. One trigger is enough, in the title or in the summary.
//
// Armed conflict is the one thing that is not dropped but reduced. The world has wars in it, and a
// detective may work in one or far from one; but not a place, a side, a weapon or a number gets through,
// only the fact that a conflict is going on somewhere. Anything that also hurts people is dropped whole.

/** Why a headline was dropped. */
export const TRAGEDY_CATEGORIES = [
  'casualties',
  'terror',
  'violence',
  'crime-against-people',
  'children',
  'disaster',
  'self-harm',
  'grim',
] as const;
export type TragedyCategory = (typeof TRAGEDY_CATEGORIES)[number];

export type TragedyVerdict =
  | { readonly verdict: 'keep' }
  | { readonly verdict: 'drop'; readonly category: TragedyCategory }
  /** The headline is gone; only the fact that an armed conflict is going on survives. */
  | { readonly verdict: 'abstract'; readonly category: 'armed-conflict' };

interface Terms {
  /** Lower case, `е` for `ё`. A stem takes any ending: `убий` catches "убийство". */
  readonly stems: readonly string[];
  /** Whole words only, for what is also the start of a harmless one ("die" in "diesel"). */
  readonly words: readonly string[];
}

const DROP_TERMS: Readonly<Record<TragedyCategory, Terms>> = {
  casualties: {
    stems: [
      'kill',
      'fatal',
      'casualt',
      'injur',
      'wound',
      'victim',
      'massacre',
      'corpse',
      'drown',
      'погиб',
      'гибел',
      'жертв',
      'убит',
      'убий',
      'убил',
      'смерт',
      'умер',
      'мертв',
      'ранен',
      'ранил',
      'пострада',
      'труп',
      'утонул',
      'утонуть',
    ],
    words: ['dead', 'death', 'deaths', 'die', 'dies', 'died', 'dying', 'perish', 'perished', 'perishes'],
  },
  terror: {
    stems: [
      'terror',
      'extremis',
      'jihad',
      'hostage',
      'hijack',
      'bomb',
      'explosion',
      'blast',
      'теракт',
      'террор',
      'экстремис',
      'заложник',
      'смертник',
      'взрыв',
      'подрыв',
    ],
    words: [],
  },
  violence: {
    stems: [
      'shooting',
      'gunman',
      'gunfire',
      'gunshot',
      'assault',
      'beaten',
      'brutal',
      'riot',
      'torture',
      'lynch',
      'стрельб',
      'застрел',
      'расстрел',
      'перестрелк',
      'избит',
      'избиен',
      'пытк',
      'насили',
      'бойн',
      'побои',
      'резн',
      'зарезан',
      'поножовщ',
      'нападен',
      'беспорядк',
    ],
    words: [
      'shot',
      'gun',
      'guns',
      'clash',
      'clashes',
      'stab',
      'stabs',
      'stabbed',
      'stabbing',
      'драка',
      'драки',
      'драку',
      'дракой',
      'драке',
      'драк',
    ],
  },
  'crime-against-people': {
    stems: [
      'murder',
      'homicide',
      'manslaughter',
      'kidnap',
      'abduct',
      'traffick',
      'molest',
      'domestic violence',
      'sexual',
      'изнасил',
      'киднап',
      'работорговл',
      'торговля людьми',
      'торговли людьми',
    ],
    words: ['rape', 'raped', 'rapes', 'rapist', 'ransom', 'stalker', 'stalking'],
  },
  children: {
    stems: [
      'child',
      'baby',
      'babies',
      'infant',
      'toddler',
      'teenager',
      'schoolchild',
      'orphan',
      'underage',
      'ребен',
      'малыш',
      'младен',
      'несовершеннолет',
      'школьни',
      'школьниц',
      'подрост',
      'сирот',
      'детск',
    ],
    words: [
      'kid',
      'kids',
      'minors',
      'boy',
      'girl',
      'boys',
      'girls',
      'teen',
      'teens',
      'pupil',
      'pupils',
      'дети',
      'детей',
      'детям',
      'детьми',
      'детях',
      'дитя',
      'мальчик',
      'девочка',
      'мальчика',
      'девочки',
      'мальчиков',
      'девочку',
      'мальчику',
    ],
  },
  disaster: {
    stems: [
      'earthquake',
      'tsunami',
      'wildfire',
      'hurricane',
      'typhoon',
      'derail',
      'shipwreck',
      'plane crash',
      'air crash',
      'building collapse',
      'catastroph',
      'землетрясен',
      'цунами',
      'наводнен',
      'пожар',
      'ураган',
      'тайфун',
      'крушен',
      'обрушен',
      'катастроф',
      'затоплен',
      'оползн',
      'лавин',
    ],
    words: ['flood', 'floods', 'flooding', 'blaze', 'disaster', 'disasters'],
  },
  'self-harm': {
    stems: ['suicid', 'self-harm', 'overdos', 'самоубий', 'суицид', 'передозиров', 'самоповрежд'],
    words: [],
  },
  grim: {
    stems: [
      'genocide',
      'famine',
      'starv',
      'epidemic',
      'pandemic',
      'cholera',
      'ebola',
      'war crime',
      'геноцид',
      'голодомор',
      'эпидеми',
      'пандеми',
      'холер',
    ],
    words: ['plague', 'голод', 'голода', 'голодом', 'чума', 'чуму', 'чумы', 'чумой'],
  },
};

const CONFLICT_TERMS: Terms = {
  stems: [
    'invasion',
    'invade',
    'airstrike',
    'air strike',
    'shelling',
    'missile',
    'troops',
    'ceasefire',
    'cease-fire',
    'frontline',
    'front line',
    'battlefield',
    'warfare',
    'wartime',
    'warplane',
    'armed conflict',
    'вторжен',
    'обстрел',
    'линии фронта',
    'линия фронта',
    'линию фронта',
    'ракетн',
    'перемири',
    'боевы',
    'боевых',
    'вооружен',
    'солдат',
    'войн',
  ],
  words: ['war', 'wars'],
};

// A war of prices or of trade is business, and good material for a plot: it is not an armed conflict.
const FIGURATIVE_WAR = new RegExp(
  [
    '(?<![\\p{L}])(?:price|trade|tariff|bidding|culture|turf|currency|streaming|chip|tax|cola|star)\\s+wars?(?![\\p{L}])',
    '(?:ценов|торгов|тарифн|налогов|валютн|информационн|культурн|газов)[\\p{L}]*\\s+войн[\\p{L}]*',
    'войн[\\p{L}]*\\s+(?:цен|тарифов|санкций)',
  ].join('|'),
  'giu',
);

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcher({ stems, words }: Terms): RegExp {
  const stem = stems.map(escape).join('|');
  const whole = words.map(escape).join('|');
  const stemPart = `(?<![\\p{L}\\p{N}])(?:${stem})[\\p{L}]*`;
  const wholePart = `(?<![\\p{L}\\p{N}])(?:${whole})(?![\\p{L}\\p{N}])`;
  // A category with no whole words has only its stems.
  return new RegExp(whole === '' ? stemPart : `${stemPart}|${wholePart}`, 'iu');
}

const DROP_MATCHERS = TRAGEDY_CATEGORIES.map((category) => ({
  category,
  pattern: matcher(DROP_TERMS[category]),
}));
const CONFLICT_MATCHER = matcher(CONFLICT_TERMS);

/**
 * Whether a headline, with its summary if it has one, may go on. Pure and the same for every language of
 * the run: both vocabularies are always looked for.
 */
export function judgeHeadline(text: string): TragedyVerdict {
  const folded = text.normalize('NFKC').toLowerCase().replaceAll('ё', 'е');
  const dropped = DROP_MATCHERS.find(({ pattern }) => pattern.test(folded));
  if (dropped !== undefined) return { verdict: 'drop', category: dropped.category };
  if (CONFLICT_MATCHER.test(folded.replace(FIGURATIVE_WAR, ' ')))
    return { verdict: 'abstract', category: 'armed-conflict' };
  return { verdict: 'keep' };
}
