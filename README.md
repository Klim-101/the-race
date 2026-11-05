<div align="center">

# the RACE

**Run Across a Changing Earth**

_The world changed overnight. Run._

[![CI](https://github.com/Klim-101/the-race/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Klim-101/the-race/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)](.node-version)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](.github/workflows/ci.yml)
[![Status: alpha](https://img.shields.io/badge/status-alpha-yellow.svg)](docs/public/ROADMAP.md)

</div>

A detective game with one rule that most detective games avoid: **the narrator is not allowed to know who did it.**

the RACE is a text roguelike that runs inside [Claude Code](https://claude.com/claude-code), on your own subscription. Each day's headlines are rebuilt into a case in a **mirror world**: the conflicts are real, the names are not. A handful of suspects, most of whom lie about something, and exactly one of whom did it. Your Claude Code plays the narrator. A piece of plain code that has never met a language model decides what is true.

> **Status: alpha.** One full detective run is playable, from the tavern to the final accusation, in English or Russian. Rules and saves may still change between versions. See [what to expect](#what-to-expect).

## How a round goes

1. **The tavern.** The narrator tells you what the town is talking about today (the day's news, retold in the mirror world), and three people offer themselves as your detective (a pharmacist, a schoolteacher and a translator, say). You pick one. Every hero carries traits you cannot see and did not choose; you find out who you are by playing.
2. **The case.** A separate agent, in a context of its own, turns one of the day's seeds into a case and hands it straight to the engine. The engine checks that the case can be solved by anyone, whatever their kit and traits, before the run begins. You get a premise, a cast and a clock.
3. **The investigation.** You walk a small town, glance round a room, then search one thing at a time: a desk, a cabinet, a bin, a safe. You talk to suspects, show them what you found, and watch lies fall. You link clues into conclusions. The board in your browser keeps the corkboard, the map and the notes.
4. **The accusation.** You name the culprit, the motive and the evidence. The engine rules: proven, unproven or wrong. Only then does the story tell you what really happened.
5. **The tally.** The run is written into a local profile. A win opens more tool slots for the next hero.

You play by picking from a short list of moves or by saying what you want in your own words. Either way, one action goes to the engine, the engine rolls the dice, and the narrator tells you what came of it.

**A real example.** One English-language playtest started from the tavern rumour of an editor fined for running a news site without a licence, with a licensing office that could not say where one is obtained. It became _The Fee That Was Never Filed_, a case in the invented town of Tosora: the editor swears she paid, the office has no record of it, and the detective, a retired police officer who is low on nerve and quick to lean on people, is sent to find where the money went. Four suspects, a licensing office with a records room, a bank, a notary, a teahouse, a canal yard and a sealed newsroom, three days of autumn storms.

The run ended in the way a run can: the detective named the right culprit, but with no conclusion drawn for the motive and one key clue never found (the engine called it _unproven_). The evidence board it left behind, with the map, the suspects and every clue in the order it was found, is in [`docs/public/Examples/evidence.html`](docs/public/Examples/evidence.html). Download it and open it in a browser.

## What makes it different

- **The truth lives in code.** A model tends to agree with the player, which is a poor quality in a detective story. So dice, hidden traits, the sealed solution and the verdict belong to a deterministic engine. The narrator gets only what you are allowed to know, and a hook refuses any tool call that names the saves.
- **The plot is tonight's news.** Headlines are cleaned, turned into abstract seeds and rebuilt with invented names. The substance stays, the names change, real names are rejected by the engine and recent tragedies never become a plot.
- **You are not a spreadsheet.** Long days, rough luck and hard conversations leave a mark on the hero, and the story shows it. Weather and the road cost time and nerve, and an icy day is worse than a rainy one. A tool that is not quite lawful may get you noticed.

## What to expect

This is an alpha, and it says so.

- **One archetype.** Only the detective is playable. The survivor and the trader are on the [roadmap](docs/public/ROADMAP.md), not in the game.
- **Claude Code only.** Other agent hosts are out of scope; see [Scope](#scope).
- **A hero lives one case.** The hero never dies: a run ends with a verdict, the end of the days, a breakdown or giving up, and that hero is not played again. A hall of fallen heroes and legacy between runs are planned and not built.
- **Cases are written by a model.** The engine can prove that a case is solvable, fair and free of real names. It cannot prove that it is any good. Some will be better than others.
- **It spends your usage.** The case is written by a subagent, which takes a few minutes, and the narration is your Claude Code session. Nothing here is billed by the project: there is no server, no account and no API key.
- **The news may not arrive.** Headlines come from public RSS feeds. If they cannot be reached the run still starts, just without the day's news, and says so.
- **Things move.** Rules and saves may change between versions.

## Getting started

You need [Claude Code](https://claude.com/claude-code) on your own subscription and [Node.js](https://nodejs.org) 24 (the current LTS) or newer, except 25, with npm 11 (it comes with Node 24). There is nothing else to sign up for.

1. **Install the plugin.** In a terminal, in any folder:

   ```sh
   claude plugin marketplace add Klim-101/the-race
   claude plugin install the-race@the-race
   ```

   The plugin carries its own server, so there is nothing to clone or build.

2. **Choose the game folder** when Claude Code asks. It keeps your saves and the evidence board, which you can open in any browser. Pick a plain folder without a cloud drive in the path. You can change it later in `/config`.

3. **Start a new Claude Code session** so the plugin's server loads, then run:

   ```
   /race
   ```

   `/race` starts a new run or resumes the current one. `/race-help` explains how to play in a few lines.

4. **Update later.** A new version reaches you only after the marketplace is refreshed. In a terminal:

   ```sh
   claude plugin marketplace update the-race
   claude plugin update the-race@the-race
   ```

   Then start a new Claude Code session, because the server is loaded once per session. To check which build a session runs, ask the narrator to call `server_info`: it reports the plugin's version and the version of the rules.

The language of a run (Russian or English) is the one you start it in, and it stays for that run. Headlines are fetched from public feeds. More on the plugin, the game folder and the HUD: [PLUGIN.md](docs/public/PLUGIN.md).

## How it works

The model tends to agree with the player, and in a game about catching liars that kills the tension. So the truth lives in code, not in the model.

|                | The engine (code, deterministic)                                | The agent (your Claude Code session)             |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| **Owns**       | Dice, state, hidden traits, the sealed solution and the verdict | The story: scenes, voices, atmosphere            |
| **Does**       | Validates every scenario, rolls checks, decides win and loss    | Turns headlines into seeds, narrates, role-plays |
| **Never does** | Call a model                                                    | See who the culprit is                           |

- A scenario is a JSON document the engine validates **before** a run starts: every location reachable, every lie breakable, at least two independent ways to solve the case, every clue behind an obstacle also within reach without a tool, every lead earnable, no real names. The generator never sees the hero's kit or traits; the validator checks that the case can be solved whatever they are. If validation fails, the errors go back to the generator.
- The case is generated by a separate subagent in its own context and handed straight to the engine. The narrator only gets the public view through typed tools, so it cannot give the culprit away.
- Every run is reproducible: the same seed and the same choices give the same result, and a run is saved locally so it can be resumed in a new session.
- Headlines come from RSS feeds and are treated as untrusted input. Only titles and short summaries are read, never full articles.
- The engine is plain TypeScript, deterministic, and held at 100% test coverage.

**No servers, no API keys, no model calls from the code.** Everything runs on your own subscription, and a CI check keeps LLM SDKs out of the dependency tree.

## Scope

the RACE targets **Claude Code only**. Support for other agent hosts, Codex included, is explicitly **out of scope** and is not on the roadmap. The engine is plain TypeScript with no host dependency, so a fork that adds another host is welcome and is allowed by the license; it will not be maintained here.

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

## Contributing

Want to change something? [CONTRIBUTING.md](CONTRIBUTING.md) has the short version and [AGENTS.md](AGENTS.md) the working agreement, including the boundaries that are decisions and not preferences.

## License

Code is licensed under [Apache-2.0](LICENSE).
