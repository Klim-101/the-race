// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { DETECTIVE, DetectiveHeroSchema } from './detective/archetype.js';

/** Every archetype the engine can run; adding one here makes its heroes valid. */
export const ARCHETYPES = [DETECTIVE] as const;

export const ArchetypeSchema = z.enum(['detective']);
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const HeroSchema = z.discriminatedUnion('archetype', [DetectiveHeroSchema]);
export type Hero = z.infer<typeof HeroSchema>;
