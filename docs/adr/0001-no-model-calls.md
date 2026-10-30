# 0001. No model calls from the code

Status: Accepted, 2026-10-29

## Context

The game needs a model for language: turning headlines into a world, voicing characters, telling what happened. There are two ways to get one: the project calls a model API, or the game runs inside an agent host the player already pays for.

## Decision

The code never calls a model. All reasoning runs in the player's own agent host, on the player's own subscription. The project has no API keys, no servers and no accounts.

CI enforces it: `npm run lint` fails when any `package.json` in the repository depends on an LLM SDK.

## Alternatives rejected

- **The project calls a model API.** Needs keys, billing and a backend, and makes the maintainer pay for the players' games. It also turns a game into a service that can be switched off.
- **Optional model calls behind a flag.** A flag is a door. One optional path becomes the default path, and the guarantee is gone.

## Consequences

- Playing costs the player nothing beyond the subscription they have, and the project has nothing to host, secure or bill.
- The game works only where an agent host with tools is available, and token cost per turn is a design constraint, not an afterthought.
- Everything a model must do is reached through typed tools exposed by the engine, never through the engine reaching out.
- Telemetry, accounts and cloud saves are out of scope. A profile is a local file.
