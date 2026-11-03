// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { ModifierEffect } from '../meters.js';
import type { ModifierItem } from '../modifiers.js';
import { createRng } from '../dice.js';
import type { ObstacleKind, SkillCheck } from './case-schema.js';
import { LIFE_STATE_SHIFTS, type LifeState } from './life-state.js';

// Gear is what the hero carries: data, like a condition, that moves a check only through `collectModifier`.
// It never touches evidence. A robbery or a spill takes a piece of gear, and the piece stays lost, as a
// penalty, until it is replaced. Another archetype adds its own gear and backgrounds by data.

export const GEAR_IDS = [
  'phone',
  'notebook',
  'laptop',
  'picks',
  'magnifier',
  'knife',
  'test-kit',
  'uv-lamp',
  'powder',
  'tape-measure',
  'crowbar',
  'mirror',
  'binoculars',
  'cash',
] as const;
export const GearIdSchema = z.enum(GEAR_IDS);
export type GearId = z.infer<typeof GearIdSchema>;

/**
 * How a piece of gear gets past obstacles. A tool is data: the kinds it removes, the check it takes (none for a
 * torch), what a failure costs in minutes, how it wears and whether using it is lawful. A piece that removes
 * nothing yet is for the studying of clues, which is still to come.
 * - `lasting`: never wears; `may-break`: a blunder breaks it; `used-up`: each use takes one of its charges.
 */
export interface ToolRules {
  readonly removes: readonly ObstacleKind[];
  readonly check: SkillCheck | null;
  readonly failureMinutes: number;
  readonly wear: 'lasting' | 'may-break' | 'used-up';
  /** Uses of a piece that is used up; 0 for the rest. */
  readonly charges: number;
  /** Whether using it is within the law; what that costs is for the rules of risk. */
  readonly lawful: boolean;
  /** The check of studying a clue with it for a lead; absent for a piece that is no use for that. */
  readonly study?: SkillCheck;
  /** What it adds to a contacts roll when the hero asks the locals, using up a charge; absent for the rest. */
  readonly askBonus?: number;
}

export interface GearDefinition {
  /** Key of the piece's name in the locale files; the engine holds no player-facing text. */
  readonly nameKey: string;
  /** What the piece gives while the hero has it. */
  readonly effects: readonly ModifierEffect[];
  /** What its loss costs on top of the bonus that is gone; empty for a piece that is only missed. */
  readonly lostEffects: readonly ModifierEffect[];
  /** How the piece gets past obstacles, if it does. */
  readonly tool: ToolRules | null;
}

const NO_EFFECTS = { effects: [], lostEffects: [] } as const;

export const DETECTIVE_GEAR: Readonly<Record<GearId, GearDefinition>> = {
  phone: {
    nameKey: 'gear.phone',
    effects: [{ skills: ['contacts'], amount: 1 }],
    lostEffects: [{ skills: ['contacts'], amount: -1 }],
    // The torch: light for the dark, with nothing to roll.
    // A camera as well: with it any clue can be looked at again, though not closely.
    tool: {
      removes: ['dark'],
      check: null,
      failureMinutes: 0,
      wear: 'lasting',
      charges: 0,
      lawful: true,
      study: { skill: 'perception', difficulty: 12 },
    },
  },
  notebook: {
    nameKey: 'gear.notebook',
    effects: [{ skills: ['reasoning'], amount: 1 }],
    lostEffects: [],
    tool: null,
  },
  laptop: {
    nameKey: 'gear.laptop',
    effects: [{ skills: ['tech'], amount: 1 }],
    lostEffects: [{ skills: ['tech'], amount: -1 }],
    tool: {
      removes: ['digital'],
      check: { skill: 'tech', difficulty: 10 },
      failureMinutes: 10,
      wear: 'lasting',
      charges: 0,
      lawful: true,
    },
  },
  picks: {
    nameKey: 'gear.picks',
    effects: [{ skills: ['perception'], amount: 1 }],
    lostEffects: [],
    tool: {
      removes: ['locked'],
      check: { skill: 'tech', difficulty: 10 },
      failureMinutes: 15,
      wear: 'may-break',
      charges: 0,
      lawful: false,
    },
  },
  magnifier: {
    nameKey: 'gear.magnifier',
    ...NO_EFFECTS,
    tool: {
      removes: ['trace'],
      check: { skill: 'perception', difficulty: 9 },
      failureMinutes: 10,
      wear: 'lasting',
      charges: 0,
      lawful: true,
      study: { skill: 'perception', difficulty: 7 },
    },
  },
  knife: {
    nameKey: 'gear.knife',
    ...NO_EFFECTS,
    tool: {
      removes: ['soft'],
      check: { skill: 'perception', difficulty: 8 },
      failureMinutes: 10,
      wear: 'lasting',
      charges: 0,
      lawful: false,
    },
  },
  'test-kit': {
    nameKey: 'gear.test-kit',
    ...NO_EFFECTS,
    tool: {
      removes: ['trace'],
      check: { skill: 'reasoning', difficulty: 9 },
      failureMinutes: 15,
      wear: 'used-up',
      charges: 2,
      lawful: true,
      study: { skill: 'reasoning', difficulty: 8 },
    },
  },
  'uv-lamp': {
    nameKey: 'gear.uv-lamp',
    ...NO_EFFECTS,
    tool: {
      removes: ['trace', 'dark'],
      check: { skill: 'perception', difficulty: 8 },
      failureMinutes: 10,
      wear: 'lasting',
      charges: 0,
      lawful: true,
      study: { skill: 'perception', difficulty: 8 },
    },
  },
  powder: {
    nameKey: 'gear.powder',
    ...NO_EFFECTS,
    tool: {
      removes: ['trace'],
      check: { skill: 'perception', difficulty: 8 },
      failureMinutes: 10,
      wear: 'used-up',
      charges: 3,
      lawful: true,
    },
  },
  'tape-measure': {
    nameKey: 'gear.tape-measure',
    ...NO_EFFECTS,
    tool: { ...studyOnly('lasting'), study: { skill: 'reasoning', difficulty: 8 } },
  },
  crowbar: {
    nameKey: 'gear.crowbar',
    ...NO_EFFECTS,
    tool: {
      removes: ['locked', 'sealed'],
      check: { skill: 'pressure', difficulty: 9 },
      failureMinutes: 20,
      wear: 'lasting',
      charges: 0,
      lawful: false,
    },
  },
  mirror: { nameKey: 'gear.mirror', ...NO_EFFECTS, tool: studyOnly('lasting') },
  binoculars: { nameKey: 'gear.binoculars', ...NO_EFFECTS, tool: studyOnly('lasting') },
  cash: { nameKey: 'gear.cash', ...NO_EFFECTS, tool: { ...studyOnly('used-up', 2), askBonus: 3 } },
};

/** A piece that gets past no obstacle yet: it is for what the hero will do with clues and people. */
function studyOnly(wear: ToolRules['wear'], charges = 0): ToolRules {
  return {
    removes: [],
    check: null,
    failureMinutes: 0,
    wear,
    charges,
    lawful: true,
  };
}

export const BACKGROUNDS = [
  'police',
  'journalist',
  'locksmith',
  'analyst',
  'bus-driver',
  'nurse',
  'schoolteacher',
  'electrician',
  'sommelier',
  'accountant',
  'courier',
  'bailiff',
  'translator',
  'librarian',
  'pharmacist',
  'radio-presenter',
  'retired-inspector',
  'dismissed-auditor',
  'investigative-blogger',
  'street-private-eye',
] as const;
export const BackgroundSchema = z.enum(BACKGROUNDS);
export type Background = z.infer<typeof BackgroundSchema>;
/** A hero who names no background was a policeman. */
export const DEFAULT_BACKGROUND: Background = 'police';

/** What each background starts with: the kit comes from who the hero was, never from a die. */
export const BACKGROUND_KITS: Readonly<Record<Background, readonly GearId[]>> = {
  police: ['phone', 'notebook'],
  journalist: ['phone', 'notebook', 'laptop'],
  locksmith: ['phone', 'picks'],
  analyst: ['notebook', 'laptop'],
  'bus-driver': ['phone'],
  nurse: ['phone', 'notebook'],
  schoolteacher: ['notebook'],
  electrician: ['phone', 'picks'],
  sommelier: ['phone'],
  accountant: ['notebook', 'laptop'],
  courier: ['phone'],
  bailiff: ['phone', 'notebook'],
  translator: ['laptop', 'notebook'],
  librarian: ['notebook', 'laptop'],
  pharmacist: ['notebook', 'phone'],
  'radio-presenter': ['phone', 'laptop'],
  'retired-inspector': ['notebook', 'phone'],
  'dismissed-auditor': ['notebook', 'laptop'],
  'investigative-blogger': ['phone', 'laptop'],
  'street-private-eye': ['phone', 'picks'],
};

/** `spent`: used up; `broken`: it broke. Neither can be used again. */
export const GearStateSchema = z.enum(['owned', 'lost', 'spent', 'broken']);
export type GearState = z.infer<typeof GearStateSchema>;

export const KitItemSchema = z.object({
  id: GearIdSchema,
  state: GearStateSchema,
  /** Uses left of a piece that is used up; absent for the rest, and for a kit from before the tools. */
  charges: z.int().min(0).optional(),
  /** Set for a tool in the suitcase, which takes a slot; the phone and what the hero's trade gave take none. */
  suitcase: z.boolean().optional(),
});
export type KitItem = z.infer<typeof KitItemSchema>;

/** The kit of a background, with the piece a life state adds when the hero does not already carry it. */
export function initialKit(background: Background, lifeState?: LifeState): KitItem[] {
  const own = BACKGROUND_KITS[background];
  const added = lifeState === undefined ? undefined : LIFE_STATE_SHIFTS[lifeState].gear;
  const kit = added === undefined || own.includes(added) ? own : [...own, added];
  return kit.map((id) => ({ id, state: 'owned' }));
}

/** The same kit with one piece set to `state`; a piece that is not in the kit is a bug in the caller. */
export function withGearState(kit: readonly KitItem[], id: GearId, state: GearState): KitItem[] {
  if (!kit.some((item) => item.id === id)) {
    throw new RangeError(`The hero has no gear "${id}" in their kit.`);
  }
  return kit.map((item) => (item.id === id ? { ...item, id, state } : item));
}

/** The kit as modifier items: a piece in hand gives its bonus, a lost one only its penalty. */
export function gearModifiers(kit: readonly KitItem[]): ModifierItem[] {
  return kit.map(({ id, state }) => ({
    id,
    effects:
      state === 'owned' ? DETECTIVE_GEAR[id].effects : state === 'lost' ? DETECTIVE_GEAR[id].lostEffects : [],
  }));
}

export interface KitView {
  readonly id: GearId;
  readonly nameKey: string;
  readonly state: GearState;
  /** The obstacles the piece gets past, which the hero knows of their own kit. */
  readonly removes: readonly ObstacleKind[];
  /** Uses left of a piece that is used up; `null` for the rest. */
  readonly charges: number | null;
  /** Whether using it is within the law; a piece that is not risks being seen (see `risk.ts`). */
  readonly lawful: boolean;
  /** Whether the piece is in the suitcase and takes a slot. */
  readonly suitcase: boolean;
  /** Whether a clue can be studied with it for a lead. */
  readonly study: boolean;
  /** Whether it helps when the hero asks the locals (cash does). */
  readonly helpsAsking: boolean;
}

export function viewKit(kit: readonly KitItem[]): KitView[] {
  return kit.map((item) => ({
    id: item.id,
    nameKey: DETECTIVE_GEAR[item.id].nameKey,
    state: item.state,
    removes: DETECTIVE_GEAR[item.id].tool?.removes ?? [],
    charges: chargesLeft(item),
    lawful: DETECTIVE_GEAR[item.id].tool?.lawful ?? true,
    suitcase: item.suitcase === true,
    study: DETECTIVE_GEAR[item.id].tool?.study !== undefined,
    helpsAsking: DETECTIVE_GEAR[item.id].tool?.askBonus !== undefined,
  }));
}

/** Uses left of a piece that is used up, counting a piece not yet used as full; `null` for a piece that is not. */
export function chargesLeft(item: KitItem): number | null {
  const rules = DETECTIVE_GEAR[item.id].tool;
  return rules?.wear === 'used-up' ? (item.charges ?? rules.charges) : null;
}

/** What using a tool does to it: a used-up piece loses a charge, a lockpick breaks on a blunder. */
export function worn(item: KitItem, blundered: boolean): { item: KitItem; wear: 'spent' | 'broken' | null } {
  const rules = DETECTIVE_GEAR[item.id].tool;
  if (rules?.wear === 'used-up') {
    const charges = (item.charges ?? rules.charges) - 1;
    return charges > 0
      ? { item: { ...item, charges }, wear: null }
      : { item: { ...item, charges: 0, state: 'spent' }, wear: 'spent' };
  }
  if (rules?.wear === 'may-break' && blundered) return { item: { ...item, state: 'broken' }, wear: 'broken' };
  return { item, wear: null };
}

/** The tools a hero may be handed on top of what their background gives; the kit they come with is never a die. */
const EXTRA_TOOLS: readonly GearId[] = GEAR_IDS.filter(
  (id) => id !== 'phone' && id !== 'notebook' && id !== 'laptop' && id !== 'picks',
);

/** What each background leans towards: a tool it is likelier to be handed, three times as likely as any other. */
export const BACKGROUND_TOOL_LEAN: Readonly<Record<Background, readonly GearId[]>> = {
  police: ['crowbar', 'powder'],
  journalist: ['mirror', 'binoculars'],
  locksmith: ['crowbar', 'mirror'],
  analyst: ['magnifier', 'tape-measure'],
  'bus-driver': ['binoculars', 'cash'],
  nurse: ['test-kit', 'knife'],
  schoolteacher: ['magnifier', 'tape-measure'],
  electrician: ['tape-measure', 'mirror'],
  sommelier: ['test-kit', 'magnifier'],
  accountant: ['magnifier', 'cash'],
  courier: ['cash', 'binoculars'],
  bailiff: ['crowbar', 'powder'],
  translator: ['cash', 'magnifier'],
  librarian: ['magnifier', 'uv-lamp'],
  pharmacist: ['test-kit', 'uv-lamp'],
  'radio-presenter': ['cash', 'binoculars'],
  'retired-inspector': ['powder', 'magnifier'],
  'dismissed-auditor': ['magnifier', 'cash'],
  'investigative-blogger': ['binoculars', 'mirror'],
  'street-private-eye': ['powder', 'binoculars'],
};

const LEAN_WEIGHT = 3;

/**
 * The kit a hero starts a run with: what their background gives, the phone in any case, and a tool in each free
 * slot of the suitcase, drawn from the seed with a lean towards the background and never the same tool twice. The
 * case generator never sees it.
 */
export function startingKit(
  background: Background,
  lifeState: LifeState | undefined,
  seed: string,
  slots = 1,
): KitItem[] {
  const own = initialKit(background, lifeState);
  const withPhone: KitItem[] = own.some(({ id }) => id === 'phone')
    ? own
    : [{ id: 'phone', state: 'owned' }, ...own];
  const rng = createRng(`${seed}:kit`);
  const drawn: KitItem[] = [];
  let pool = EXTRA_TOOLS.filter((id) => !withPhone.some((item) => item.id === id)).flatMap((id) =>
    Array.from({ length: BACKGROUND_TOOL_LEAN[background].includes(id) ? LEAN_WEIGHT : 1 }, () => id),
  );
  for (let slot = 0; slot < slots; slot += 1) {
    const at = rng.roll(pool.length) - 1;
    const picked = pool.slice(at, at + 1);
    drawn.push(...picked.map((id): KitItem => ({ id, state: 'owned', suitcase: true })));
    pool = pool.filter((other) => !picked.includes(other));
  }
  return [...withPhone, ...drawn].map((item) => {
    const rules = DETECTIVE_GEAR[item.id].tool;
    return rules?.wear === 'used-up' ? { ...item, charges: rules.charges } : item;
  });
}
