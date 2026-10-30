# 0005. JSON is canonical; Markdown and HTML are rendered from it

Status: Accepted, 2026-10-29

## Context

The game moves structured data between the engine, the agent and the player: cases, run state, saves, reports. People also read it: a run report, a hall of fallen heroes, a roadmap. The same facts could be kept as prose, as markup or as data.

## Decision

Structured JSON, described by a schema, is the single source of truth. Anything meant to be read is rendered from it:

- **Cases, runs and saves** are JSON validated by Zod schemas at the boundary. The type is inferred from the schema, so the two cannot drift apart.
- **Reports and views** (a run report in HTML, a status line, a roadmap table) are generated from the data and never edited by hand.
- **Schemas carry a version.** An old document is migrated or rejected with a clear error, never guessed at.
- **Content is data, not code.** Traits, heroes, achievements and templates live in catalogues, and their texts in locale files.

## Alternatives rejected

- **Markdown as the source.** Pleasant to write, but there is nothing to validate, and a model can break the structure silently.
- **Prose state kept by the agent.** Unverifiable, and it drifts from the engine.

## Consequences

- A document that does not parse is rejected before it can affect a run.
- A new view of the same data (another report, another language) needs a renderer and no change to the data.
- Hand-written files that are shown to people are limited to documentation. Generated sections, such as the progress table in the roadmap, are marked and not edited by hand.
