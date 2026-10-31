# 0007. The world dictionary is local and append-only

Status: Accepted, 2026-10-31

## Context

[ADR-0004](0004-full-mirror-world.md) promises a stable dictionary from real names to mirror names, so that the world stays the same between runs and across languages, and the legacy of past heroes keeps meaning. It leaves open who writes the dictionary, where it lives and what may change in it.

## Decision

- **One local file, `world.json`,** beside the runs in the player's own state directory. It is shared by every run of that player. There is no shared or hosted dictionary, since the game has no multiplayer; a curated starting dictionary can be shipped in `content/` later and the local file would extend it.
- **Append-only.** An entry is never edited or removed. The store refuses to save a dictionary that does not keep the file's existing entries as they are. The player can start a new world by moving the file away.
- **An entry** is a kind (country, organisation or role), every spelling of the real entity in the headlines, and one mirror form per language (Вальдмарк and Valdmark are one place). People are not entries; each case invents its own.
- **The agent proposes, the engine decides.** The seed extractor, which sees the headlines (amended 2026-10-31: the case generator no longer sees them, only a seed), proposes entries through `world_propose`. The case generator is shown the mirror side of the dictionary and sets its case among those names. The engine accepts one only if no real entity already has an entry, the mirror forms are in their own scripts, no mirror name is shared by two entities and none is a real name: not the entity's own, not another entry's, not one found in the headlines, in either script and with Russian endings. Later, the engine's own name generator proposes through the same door.
- **The narrator never sees the real side.** The file is in the save directory, which the guard hook closes to the narrator, and the public view (`viewWorld`, the `world_view` tool) holds mirror names only, under the world's one fixed name: "Черновик" and "The Draft".
- **Cases are checked against it.** Every real name in the dictionary is passed to the case validator, so a case that contains one is refused.

## Alternatives rejected

- **A dictionary the agent edits freely.** Names would drift and the legacy would break.
- **A shared dictionary on a server.** No backend is a boundary of the project.
- **Guessing the kind and the spellings in the engine.** Without a dictionary of real names the engine cannot tell a country from a company; the proposer says, and the engine checks.

## Consequences

- Two players have different mirror worlds until a shared starting dictionary exists.
- A dictionary entry is a promise: a wrong proposal can only be undone by starting a new world.
- The file is long-lived state with a schema version and a migration path, like a save.
