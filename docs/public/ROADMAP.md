# Roadmap

the RACE is built in phases. Each phase ends with something you can run: the engine on its own first, then a playable case in Claude Code, then a world rebuilt from today's news.

Live task status is on the [project board](https://github.com/users/Klim-101/projects/3) and in [milestones](https://github.com/Klim-101/the-race/milestones). The progress table below is updated automatically from the milestones; do not edit it by hand.

<!-- roadmap:progress:start -->

| Phase                           | Status      | Progress |
| ------------------------------- | ----------- | -------- |
| Phase 0 — Foundation            | done        | 8 / 8    |
| Phase 1 — Engine core           | in progress | 27 / 34  |
| Phase 2 — First playable run    | in progress | 1 / 7    |
| Phase 3 — News and mirror world | planned     | 0 / 11   |
| Phase 4 — Roguelike loop        | planned     | 0 / 15   |
| Phase 5 — New archetypes        | planned     | 0 / 5    |
| Phase 6 — Public release        | planned     | 0 / 6    |

_Last synchronized: 2026-10-30._
<!-- roadmap:progress:end -->

## Phase 0 — Foundation

The project skeleton everything else depends on.

- Monorepo with strict TypeScript and CI on Windows, macOS and Linux
- Lint, formatting, license and secret checks; no LLM SDK may ever become a dependency
- Project board, roadmap and decision records
- The detective case schema and a validator that accepts a case only when the hero it is made for can solve it

## Phase 1 — Engine core

The rules of the game, deterministic and testable without a model.

- Seeded dice: d20 plus a skill against a difficulty
- Heroes with skills the player distributes and hidden traits the engine rolls
- Run state, saves and resuming in a new session
- Actions, interrogation, deductions and the accusation verdict
- A sealed truth the narrator never sees
- The clock, world events and the ways a run is lost

## Phase 2 — First playable run

A hand-written case, played from start to verdict inside Claude Code.

- Local MCP server with typed tools
- The narrator skill and an isolated case generator
- Claude Code plugin generated from one canonical source
- Sample cases in Russian and English

## Phase 3 — News and mirror world

Every run starts from today's headlines.

- Headlines from RSS feeds, cached once a day, treated as untrusted input
- A mirror world: real conflicts, fictional names, kept stable between runs
- Real names never reach the player; recent tragedies never become a plot
- Cases seeded from the news and shaped by the hero's background

## Phase 4 — Roguelike loop

One hero, one life, a world that remembers.

- The tavern: three heroes offered per run
- Hidden traits revealed by what happens in play
- Permadeath, a hall of fallen heroes and legacy between runs
- Run reports, a status line, small per-turn token cost
- Russian and English, with room for more languages

## Phase 5 — New archetypes

More than detective work.

- The survivor: lead a group through a crisis
- The trader: build a fortune in a market shaped by the news
- After enough runs, choose the event for a hero of another archetype

## Phase 6 — Public release

- Community files, content licence and an open repository
- Automated releases
- Claude Code plugin marketplace listing
- Player documentation in Russian and English

## Not planned

- **Model calls from the code.** All reasoning runs in your own agent host on your own subscription.
- **Hosted services.** No backend, accounts, telemetry or API keys.
- **Real people and organisations in play.** The world is always a mirror; real names are rejected by the engine.
- **Article texts.** Only headlines and short summaries are read, never full articles.
