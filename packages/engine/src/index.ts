// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

export * from './locale.js';
export * from './archetype.js';
export * from './hero.js';
export * from './assemble-hero.js';
export * from './dice.js';
export { canonicalJson, sha256Hex } from './canonical-json.js';
export * from './traits.js';
export * from './meters.js';
export * from './modifiers.js';
export * from './signals.js';
export * from './run.js';
export * from './migrations.js';
export * from './detective/archetype.js';
export * from './detective/traits.js';
export * from './detective/case-schema.js';
export * from './detective/case-issue.js';
export * from './detective/condition.js';
export * from './detective/gear.js';
export * from './detective/skill-presets.js';
export * from './detective/consumables.js';
export * from './detective/use-item.js';
export * from './detective/run-state.js';
export * from './detective/actions.js';
export * from './detective/interrogation.js';
export * from './detective/verdict.js';
export * from './detective/fatigue.js';
export * from './detective/clock.js';
export * from './detective/random-events.js';
export * from './detective/night.js';
export * from './detective/signals.js';
export * from './detective/signal-events.js';
export * from './detective/event-log.js';
export { sealCase, isCaseSealIntact, assertCaseSealIntact } from './detective/seal.js';
export * from './world/world.js';
export * from './news/seed.js';
export * from './news/choose-seed.js';
export * from './news/tavern-feed.js';
export {
  judgeHeadline,
  TRAGEDY_CATEGORIES,
  type TragedyCategory,
  type TragedyVerdict,
} from './text/tragedy-filter.js';
export { extractRealNames } from './text/extract-names.js';
export { findRealName } from './text/real-names.js';
export {
  validateCase,
  type CaseValidationContext,
  type CaseValidationResult,
} from './detective/case-validator.js';
