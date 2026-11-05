// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { createRng } from '../dice.js';
import { TraitTriggerSchema, type Trait, type TraitTrigger } from '../traits.js';
import type { DetectiveCase, Location } from './case-schema.js';
import { scheduledClosures } from './solvability.js';

// A hidden trait fires only in a scene that matches its trigger. The engine brings four of the triggers by
// itself (a talk, a second search, the evening, the second day), but the rest belong to a place, and the case
// generator never sees the hero's traits, so a case may hold no such place at all. The engine therefore gives
// each of the hero's place-bound traits a place of its own at the start of a run, on dice of the run's seed.
// The case is not touched (it is sealed, and the validator must not name a trait); the extra scene lives in
// the run, and the narrator is never told why a place feels the way it does.

/** Runs started before this version play as they did: the engine adds no scene to any place. */
export const TRAIT_SCENES_RULESET_VERSION = 25;

/** The triggers that only a place can bring. */
export const PLACE_BOUND_TRIGGERS = [
  'financial-documents',
  'confined-space',
  'police-contact',
  'digital-evidence',
  'crowd',
  'high-society',
] as const satisfies readonly TraitTrigger[];

/** A scene the engine added to a place for this run. */
export const TraitSceneSchema = z.object({
  locationId: z.string().min(1),
  trigger: TraitTriggerSchema,
});
export type TraitScene = z.infer<typeof TraitSceneSchema>;

const isPlaceBound = (trigger: TraitTrigger): boolean =>
  (PLACE_BOUND_TRIGGERS as readonly TraitTrigger[]).includes(trigger);

/**
 * The places a scene may be put in, best first: not where the hero starts, not a place an event closes, and
 * by preference one that is open to walk into and known without a lead. A case with no such place still gives
 * the scene somewhere (a hero must have an occasion), the start of the case being the last resort.
 */
function placesFor(detectiveCase: DetectiveCase): readonly string[] {
  const closing = scheduledClosures(detectiveCase);
  const usable = detectiveCase.locations.filter(
    ({ id }) => id !== detectiveCase.startLocationId && !closing.has(id),
  );
  const easy = usable.filter(
    ({ access, requiresLead }) => access.kind === 'open' && requiresLead === undefined,
  );
  const chosen = easy.length > 0 ? easy : usable;
  return (chosen.length > 0 ? chosen : detectiveCase.locations.filter(({ id }) => !closing.has(id))).map(
    ({ id }) => id,
  );
}

/**
 * A place for each place-bound trigger among the hero's traits, one scene a trigger. The same seed and the
 * same case always give the same places; it reads no clock and no shared dice, so the run's own rolls are not
 * moved by it.
 */
export function drawTraitScenes(
  detectiveCase: DetectiveCase,
  traits: readonly Trait[],
  seed: string,
): TraitScene[] {
  const rng = createRng(`${seed}:trait-scenes`);
  const places = placesFor(detectiveCase);
  const triggers = [...new Set(traits.map(({ trigger }) => trigger).filter(isPlaceBound))];
  return triggers.flatMap((trigger) => {
    const pick = rng.roll(places.length || 1) - 1;
    return places.filter((_, at) => at === pick).map((locationId) => ({ locationId, trigger }));
  });
}

/** The scenes the engine added in this run: none for a run of an older ruleset, whatever its state holds. */
export const scenesOf = (run: {
  readonly rulesetVersion: number;
  readonly traitScenes: readonly TraitScene[];
}): readonly TraitScene[] => (run.rulesetVersion >= TRAIT_SCENES_RULESET_VERSION ? run.traitScenes : []);

/**
 * What a place is like for this hero: its own situations and the scene the engine added to it. This is the
 * scene a roll is made in, and the one the hero's traits react to. The validator does not use it: it judges
 * the case alone.
 */
export function locationScene(
  run: { readonly rulesetVersion: number; readonly traitScenes: readonly TraitScene[] },
  location: Pick<Location, 'id' | 'situations'>,
): readonly TraitTrigger[] {
  const added = scenesOf(run).filter(({ locationId }) => locationId === location.id);
  if (added.length === 0) return location.situations;
  return [...new Set([...location.situations, ...added.map(({ trigger }) => trigger)])];
}
