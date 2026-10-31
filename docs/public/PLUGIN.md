# The Claude Code plugin

The RACE ships as a Claude Code plugin. Its source is the `agents/` directory (skills, subagents, commands, hooks and plugin metadata); the installable tree in `plugins/the-race/` is generated from it by `npm run generate` and checked in CI by `npm run lint:generated`. The plugin's MCP server is the engine's front door, declared in the generated `.mcp.json`.

To install from a local checkout, build the repository, then in Claude Code run `/plugin marketplace add <path to the repository>` followed by `/plugin install the-race@the-race`.

The plugin also ships a `PreToolUse` hook, `spoiler-guard`, that refuses any tool call naming the game's save directory, so the narrator cannot read the sealed truth by accident. It guards against a spoiler from the narrator, not against a player who opens the files or disables the hook; see [ADR 0006](../adr/0006-keeping-the-narrator-blind-in-claude-code.md).

The guard denies a shell command only when a recursive tool (`find`, `grep -r`, `ls -R`, `Get-ChildItem -Recurse` and the like) is actually run over a parent of the saves, or when a path names the saves. A recursive word in prose, in a comment or in the body of a heredoc that `cat` or `tee` only writes to a file does not count, so writing a mod or a document that mentions them is not refused. To write a mod it is simplest to use the file tools, which the guard checks by path alone.

## The HUD

The plugin ships a HUD for Claude Code, a mod written against Claude Code's hooks-module API (early access). It has two parts, both listening to the game's own tools, so the narrator passes it nothing and it costs no turn:

- **A line above the prompt**, once a game tool has answered: the day and its bar, the hour, the place the detective is at and the number of clues, for example `Day 2/7 ▓▓░░░░░ 14:20 · Lobby · clues 2` (`День 2/7 … · улик 2` in a Russian run). It is shown in the terminal and in the desktop app, and it gives way to a survey.
- **A pane**, opened with `/race-hud`: the title, the same day line, and the known map as a tree from the detective's place, marking where the detective is (`◆`), places seen (`●`), places not yet visited (`○`) and ways that are locked or closed (`✖`).

The HUD reads only the public view of the run, the same as `run_view` and the evidence board: it holds the title, the language, the clock, the number of clues and the known map as the game sent it, and no state meter, hidden trait or number the narrator may not show. The map is `view.map`, taken whole from `run_view` and from the short view that every turn tool returns, so it never goes stale between calls and is never rebuilt from the exits. A new run, a given-up run, a verdict and a `run_view` that reports no run close the HUD, and the next case starts with an empty map; a tool error, a refusal or an answer that is not a view leaves it as it was.

The mod is part of the generated plugin: `agents/hooks/register.tsx` and `hud-model.ts`, listed under `modules` in `agents/hooks/hooks.json` beside the spoiler guard, with the contract of what it keeps in `agents/types/index.d.ts`. `claude plugin validate plugins/the-race` checks it, `claude plugin test plugins/the-race` runs its surface tests, and `scripts/lib/hud-model.test.mjs` tests its model with the repository's own tests, including a check that it holds only fields of the public view.

The layout of `agents/` and of the generated tree is described in [`agents/README.md`](../../agents/README.md).
