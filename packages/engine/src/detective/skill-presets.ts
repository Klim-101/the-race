// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import type { DetectiveSkill } from './archetype.js';
import type { Background } from './gear.js';

// Ready-made ways to spend the skill points, so that making a hero is a choice among a few builds and not a
// sum to get right. They are data of the engine, not something the narrator writes: the narrator names them
// in the player's language and may not make up another. A player who wants a build of their own gives the
// points one by one and hero creation checks the total as always.

export interface SkillPreset {
  /** Key of the build in the locale files; the engine holds no player-facing text. */
  readonly id: string;
  readonly skills: Readonly<Record<DetectiveSkill, number>>;
}

export const DETECTIVE_SKILL_PRESETS: readonly SkillPreset[] = [
  {
    id: 'observer',
    skills: { perception: 4, reasoning: 3, social: 1, pressure: 0, tech: 1, contacts: 1 },
  },
  {
    id: 'interrogator',
    skills: { perception: 2, reasoning: 2, social: 2, pressure: 3, tech: 0, contacts: 1 },
  },
  {
    id: 'analyst',
    skills: { perception: 2, reasoning: 4, social: 0, pressure: 0, tech: 3, contacts: 1 },
  },
  {
    id: 'networker',
    skills: { perception: 2, reasoning: 2, social: 3, pressure: 0, tech: 0, contacts: 3 },
  },
];

/**
 * The ready-made builds that suit each background, the better fit first: the tavern draws a hero's build from
 * these two, so who the hero was shows in what they are good at.
 */
export const BACKGROUND_BUILDS: Readonly<Record<Background, readonly [string, string]>> = {
  police: ['interrogator', 'observer'],
  journalist: ['networker', 'observer'],
  locksmith: ['observer', 'interrogator'],
  analyst: ['analyst', 'observer'],
  'bus-driver': ['observer', 'networker'],
  nurse: ['observer', 'networker'],
  schoolteacher: ['networker', 'interrogator'],
  electrician: ['observer', 'analyst'],
  sommelier: ['observer', 'networker'],
  accountant: ['analyst', 'observer'],
  courier: ['networker', 'observer'],
  bailiff: ['interrogator', 'networker'],
  translator: ['networker', 'analyst'],
  librarian: ['analyst', 'observer'],
  pharmacist: ['analyst', 'observer'],
  'radio-presenter': ['networker', 'interrogator'],
  'retired-inspector': ['interrogator', 'observer'],
  'dismissed-auditor': ['analyst', 'interrogator'],
  'investigative-blogger': ['networker', 'analyst'],
  'street-private-eye': ['interrogator', 'networker'],
};
