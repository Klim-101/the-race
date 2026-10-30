# 0002. The engine owns dice, state, truth and verdict; the agent narrates

Status: Accepted, 2026-10-29

## Context

A language model tends to agree with the player. In a roguelike where the hero dies for good, an arbiter that can be talked into a better outcome removes the tension the game is built on. A model that plays the dice and keeps the state also drifts: it forgets a wound, an item or a lie it told.

## Decision

A deterministic engine, written in TypeScript and tested, owns everything that decides an outcome:

- the seeded dice and every skill check;
- the state of the hero and the world;
- the hidden traits of the hero and their triggers;
- the sealed solution of a case and the verdict of an accusation;
- the clock and the ways a run is lost.

The agent owns the story: scenes, voices, atmosphere, and turning the player's free text into actions the engine understands. It reports what the engine decided and cannot change it.

## Alternatives rejected

- **The model arbitrates.** Cheap to build, but outcomes become negotiable and replays are impossible.
- **The model keeps the state in the conversation.** Costs more tokens every turn and loses facts as the context grows. State is read from the engine each turn instead.

## Consequences

- Given a seed and a log of actions, a run replays to the same final state. The engine can be tested to 100% coverage, and it is.
- The engine needs a tool surface (MCP) rich enough that the narrator never has to guess.
- Rules live in code, so changing a rule is a code change with tests, not a prompt edit.
- Nothing in the engine reads `Math.random` or the clock; randomness is injected.
