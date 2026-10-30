# The Claude Code plugin

The RACE ships as a Claude Code plugin. Its source is the `agents/` directory (skills, subagents, commands, hooks and plugin metadata); the installable tree in `plugins/the-race/` is generated from it by `npm run generate` and checked in CI by `npm run lint:generated`. The plugin's MCP server is the engine's front door, declared in the generated `.mcp.json`.

To install from a local checkout, build the repository, then in Claude Code run `/plugin marketplace add <path to the repository>` followed by `/plugin install the-race@the-race`.

The plugin also ships a `PreToolUse` hook, `spoiler-guard`, that refuses any tool call naming the game's save directory, so the narrator cannot read the sealed truth by accident. It guards against a spoiler from the narrator, not against a player who opens the files or disables the hook; see [ADR 0006](../adr/0006-keeping-the-narrator-blind-in-claude-code.md).

The layout of `agents/` and of the generated tree is described in [`agents/README.md`](../../agents/README.md).
