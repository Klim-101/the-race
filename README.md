<div align="center">

# the RACE

**Run Across a Changing Earth**

_The world changed overnight. Run._

[![CI](https://github.com/Klim-101/the-race/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Klim-101/the-race/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.12-339933?logo=nodedotjs&logoColor=white)](.node-version)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Engine coverage](https://img.shields.io/badge/engine%20coverage-100%25-brightgreen.svg)](vitest.config.ts)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](.github/workflows/ci.yml)
[![Status: early prototype](https://img.shields.io/badge/status-early%20prototype-orange.svg)](docs/public/ROADMAP.md)
[![Conventional Commits](https://img.shields.io/badge/commits-conventional-fe5196.svg)](https://www.conventionalcommits.org)

</div>

A text roguelike that runs inside [Claude Code](https://claude.com/claude-code) on your own subscription. Every run is one hero in a **mirror world** rebuilt from today's world news: the conflicts are real, the names are fictional. The hero dies for good. Tomorrow the world is different.

> **Status:** early prototype, playable. A detective run works from the tavern to the final accusation inside Claude Code, in Russian or English, on a case built from the day's news. The roguelike loop around it (the hall of fallen heroes, legacy between runs) and further archetypes are still ahead. See the [roadmap](docs/public/ROADMAP.md).

## Getting started

You need [Claude Code](https://claude.com/claude-code) on your own subscription and [Node.js](https://nodejs.org) 22.12 or newer. There is nothing else to sign up for: no account, no API key.

1. **Get the code and build it**

   ```sh
   git clone https://github.com/Klim-101/the-race.git
   cd the-race
   npm ci
   npm run build
   ```

2. **Install the plugin.** In Claude Code, in any folder:

   ```
   /plugin marketplace add <path to the cloned repository>
   /plugin install the-race@the-race
   ```

3. **Choose the game folder** when Claude Code asks. It keeps your saves and the evidence board, which you can open in any browser. Pick a plain folder without a cloud drive in the path. You can change it later in `/config`.

4. **Start a new Claude Code session** so the plugin's server loads, then run:

   ```
   /race
   ```

   `/race` starts a new run or resumes the current one. `/race-help` explains how to play in a few lines.

The game is played in **your language**: the narrator answers in the language you write in (Russian and English are supported), and you describe what you do in your own words. Headlines are fetched from public feeds; if they cannot be reached, the run still starts, just without the day's news. More on the plugin, the game folder and the HUD: [PLUGIN.md](docs/public/PLUGIN.md).

## The idea

**The news is the seed of the day.** Today's run cannot be played tomorrow, because the world has moved on with the headlines.

- **One hero, one life.** You pick from three heroes in a tavern, spend your skill points, and head out. Death is permanent; the next hero starts in a different world.
- **A mirror world.** A stock-market crash becomes a crash on the exchange of a country that does not exist, caused by a company that is not real. The substance stays, the names change. Real names are rejected by the engine, and recent tragedies never become a plot.
- **Hidden traits.** Every hero carries traits you cannot see and did not choose. You find out who you are by playing.
- **A hero is more than numbers.** Long days, rough luck and hard conversations leave a mark, and the story shows it.
- **Play in your own words.** You describe what you do in free text. The agent turns it into an action, the engine rolls the dice, the agent tells you what happened.
- **The world remembers.** Fallen heroes leave notes and a reputation behind for the ones who come after.

### The first archetype: the detective

A headline like _"Exchange halted after a sudden crash"_ turns into a case: who profited from the panic? Each case has suspects with secrets and lies, locations with locks, clues (some of them false trails) and a clock ticking on world events drawn from the news. Tone ranges from a serious insider-trading hunt to a comic one, where a trading bot has fallen in love with a meme coin.

Later archetypes: the **survivor** leading a group through a crisis, and the **trader** building a fortune in a market shaped by the news.

## Scope

the RACE targets **Claude Code only**. Support for other agent hosts, Codex included, is explicitly **out of scope** and is not on the roadmap. The engine is plain TypeScript with no host dependency, so a fork that adds another host is welcome and is allowed by the license; it will not be maintained here.

## How it works

The model tends to agree with the player, and in a roguelike with permadeath that kills the tension. So the truth lives in code, not in the model.

|                | The engine (code, deterministic)                                | The agent (your Claude Code session)             |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| **Owns**       | Dice, state, hidden traits, the sealed solution and the verdict | The story: scenes, voices, atmosphere            |
| **Does**       | Validates every scenario, rolls checks, decides win and loss    | Turns headlines into seeds, narrates, role-plays |
| **Never does** | Call a model                                                    | See who the culprit is                           |

- A scenario is a JSON document the engine validates **before** a run starts: every location reachable, every lie breakable, at least two independent ways to solve the case, no real names. If validation fails, the errors go back to the generator.
- The case is generated by a separate subagent in its own context and handed straight to the engine. The narrator only gets the public view through typed tools, so it cannot give the culprit away.
- Every run is reproducible: the same seed and the same choices give the same result, and a run is saved locally so it can be resumed in a new session.
- Headlines come from RSS feeds and are treated as untrusted input. Only titles and short summaries are read, never full articles.

**No servers, no API keys, no model calls from the code.** Everything runs on your own subscription, and a CI check keeps LLM SDKs out of the dependency tree.

## Project layout

```
packages/engine   Deterministic game rules, the case schema and the solvability validator
packages/news     Headlines from feeds, cleaned before any model sees them
packages/saves    Saving and resuming a run, as a local file
packages/mcp      The local server that gives the agent its typed tools and draws the evidence board
agents            The plugin's source: the narrator, the subagents, commands and the HUD
plugins           The installable plugin, generated from agents/
content           Feeds and hand-written sample cases in English and Russian
docs/public       Public documentation, including the roadmap
docs/adr          Records of the decisions that are hard to reverse
scripts           Repository checks (LLM SDK denylist, license allowlist)
```

## Roadmap

| Phase | Goal                                                       |
| ----- | ---------------------------------------------------------- |
| 0     | Foundation: monorepo, CI, case schema and validator        |
| 1     | Engine core: dice, heroes, run state, verdict              |
| 2     | First playable run in Claude Code from a hand-written case |
| 3     | News and the mirror world                                  |
| 4     | Roguelike loop: tavern, permadeath, hall of fallen heroes  |
| 5     | New archetypes: survivor, trader                           |
| 6     | Public release and plugin marketplace listing              |

Details and live progress: [ROADMAP.md](docs/public/ROADMAP.md) and the [project board](https://github.com/users/Klim-101/projects/3).

## Development

You need Node.js 22.12 or newer. The local gate is the same one CI runs on Linux, macOS and Windows:

```sh
npm ci
npm run lint            # LLM SDK denylist, ESLint (incl. SPDX headers), Prettier
npm run typecheck
npm run test:coverage   # the engine stays at 100% coverage
npm run build
npm run licenses:check  # runtime dependency licenses against the allowlist
```

CI also scans for secrets (gitleaks), checks pull request titles (Conventional Commits) and the DCO sign-off on every commit (`git commit -s`), and lints workflows (actionlint, zizmor).

## License

Code is licensed under [Apache-2.0](LICENSE).
