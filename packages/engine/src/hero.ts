// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { ArchetypeDefinition } from './archetype.js';
import { DETECTIVE, DetectiveHeroSchema } from './detective/archetype.js';

export const ArchetypeSchema = z.enum(['detective']);
export type Archetype = z.infer<typeof ArchetypeSchema>;

/** Every archetype the engine can run; the compiler insists that each id of the schema has a definition. */
export const ARCHETYPES = { detective: DETECTIVE } as const satisfies Record<
  Archetype,
  ArchetypeDefinition<string, string>
>;

export const HeroSchema = z.discriminatedUnion('archetype', [DetectiveHeroSchema]);
export type Hero = z.infer<typeof HeroSchema>;
