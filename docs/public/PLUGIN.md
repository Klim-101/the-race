# The Claude Code plugin

The RACE ships as a Claude Code plugin. Its source is the `agents/` directory (skills, subagents, commands, hooks and plugin metadata); the installable tree in `plugins/the-race/` is generated from it by `npm run generate` and checked in CI by `npm run lint:generated`. The plugin's MCP server is the engine's front door, declared in the generated `.mcp.json`.

To install from a local checkout, build the repository, then in Claude Code run `/plugin marketplace add <path to the repository>` followed by `/plugin install the-race@the-race`.

The plugin also ships a `PreToolUse` hook, `spoiler-guard`, that refuses any tool call naming the game's save directory, so the narrator cannot read the sealed truth by accident. It guards against a spoiler from the narrator, not against a player who opens the files or disables the hook; see [ADR 0006](../adr/0006-keeping-the-narrator-blind-in-claude-code.md).

The guard denies a shell command only when a recursive tool (`find`, `grep -r`, `ls -R`, `Get-ChildItem -Recurse` and the like) is actually run over a parent of the saves, or when a path names the saves. A recursive word in prose, in a comment or in the body of a heredoc that `cat` or `tee` only writes to a file does not count, so writing a mod or a document that mentions them is not refused. To write a mod it is simplest to use the file tools, which the guard checks by path alone.

## The game folder

At the first start Claude Code asks for the **Game folder** (a `userConfig` option of the plugin, `C:\the-race` by default). It holds two things: `saves/`, which is closed to the narrator, and `board/`, where the evidence board is written so that you can open it in any browser. The answer reaches the server as `RACE_GAME_FOLDER` and the spoiler guard as `CLAUDE_PLUGIN_OPTION_GAME_FOLDER`; both read it with the same rules. Change it later in `/config` (the plugin's rows) and start a new session. On macOS and Linux the default is a Windows path and is ignored: the folder is `the-race` in your home directory, unless you enter another.

Saves made by an earlier version, in the platform's state directory, are **moved** into `saves/` once, when the server starts: the old folder is copied whole into a temporary folder next to the new one, every file is checked against its copy, the copy is renamed into place and only then is the old folder removed. If any step fails nothing is removed and the old folder keeps being used until the next start tries again. The first `run_view` after a move says once where the saves are now; the guard keeps the old place closed as well. `RACE_HOME` (the save directory itself) and `RACE_BOARD_DIR` (the board folder) still override the two subfolders. To move to a new folder, copy the old saves into its `saves/` first.

## The news, and how to tell that it worked

Each day a subagent reads the cleaned headlines once and leaves a handful of **seeds** (a kind of trouble, a tone and one invented sentence, never a headline or a real name). The tavern tells them as rumours, and the case of a run grows from the one seed the engine chooses for the hero. What it grew from is shown in the **Chronicle** tab of the evidence board ("What in the news the case grew from") and kept in the run (`inspiration`).

If the feed did not answer, the narrator says so in one line and the case is built without a seed; the board then says the case was not built on the news. The seeds of the last two weeks are in `seeds/seeds.json` inside the saves folder of your game folder: if it is missing or has no entry for the day, nothing was extracted that day. The file is yours to open; the narrator is kept out of it, like the rest of the saves. `RACE_NEWS_LAG_DAYS` (0 to 14) sets how many days behind the news a run is.

## The HUD

The plugin ships a HUD for Claude Code, a mod written against Claude Code's hooks-module API (early access). It has two parts, both listening to the game's own tools, so the narrator passes it nothing and it costs no turn:

- **A line above the prompt**, once a game tool has answered: the day and its bar, the hour, the place the detective is at and the number of clues, for example `Day 2/7 ▓▓░░░░░ 14:20 · Lobby · clues 2` (`День 2/7 … · улик 2` in a Russian run). It is shown in the terminal and in the desktop app, and it gives way to a survey.
- **A pane**, opened with `/race-hud`: the title, the same day line, and the known map as a tree from the detective's place, marking where the detective is (`◆`), places seen (`●`), places not yet visited (`○`) and ways that are locked or closed (`✖`).

The HUD reads only the public view of the run, the same as `run_view` and the evidence board: it holds the title, the language, the clock, the number of clues and the known map as the game sent it, and no state meter, hidden trait or number the narrator may not show. The map is `view.map`, taken whole from `run_view` and from the short view that every turn tool returns, so it never goes stale between calls and is never rebuilt from the exits. A new run, a given-up run, a verdict and a `run_view` that reports no run close the HUD, and the next case starts with an empty map; a tool error, a refusal or an answer that is not a view leaves it as it was.

The mod is part of the generated plugin: `agents/hooks/register.tsx` and `hud-model.ts`, listed under `modules` in `agents/hooks/hooks.json` beside the spoiler guard, with the contract of what it keeps in `agents/types/index.d.ts`. `claude plugin validate plugins/the-race` checks it, `claude plugin test plugins/the-race` runs its surface tests, and `scripts/lib/hud-model.test.mjs` tests its model with the repository's own tests, including a check that it holds only fields of the public view.

The layout of `agents/` and of the generated tree is described in [`agents/README.md`](../../agents/README.md).
