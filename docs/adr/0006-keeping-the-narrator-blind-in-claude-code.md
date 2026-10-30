# 0006. Keeping the narrator blind in Claude Code

Status: Accepted, 2026-10-30

## Context

[ADR 0003](0003-isolated-generator-blind-narrator.md) says the narrator never sees the truth. In Claude Code the narrator is an agent with file tools, and the game's saves hold the sealed truth in plain JSON. The seal gives tamper evidence, not secrecy: anyone who can read the file can read the culprit. A narrator told "do not open the saves" has only been asked, not stopped.

## Decision

Four layers, none of which is enough alone.

- **Saves live outside the project.** They are kept in a per-user state directory (`RACE_HOME`, else the platform's local state directory, then `the-race` inside it), not in the folder the agent is working in. A search of the project cannot stumble on them.
- **A plugin `PreToolUse` hook denies access.** `agents/hooks/spoiler-guard.mjs` runs before every tool call and denies the file tools, shell commands and any other tool whose input names the save directory, with a short fixed reason that points to the game tools. It resolves the directory with the same rules as the saves package, and a test checks the two agree. It reads only the hook input, never the saves, and never prints what it read.
- **The generator is isolated.** The case is built in its own context with two tools, and the engine takes the case straight from it ([ADR 0003](0003-isolated-generator-blind-narrator.md)).
- **Tool results never carry the truth.** The narrator's tools return the public view only; the sealed solution leaves the engine in the verdict alone.

The narrator skill states the rule as a third line of defence, and its wording matches the hook.

## Alternatives rejected

- **Instruction only.** A model can read a file it was told to avoid, out of habit or while "just checking".
- **Encrypt the saves with a key the engine holds.** The key sits on the same machine and in the same process tree as the agent, so it only moves the secret one file over.
- **A remote service that holds the truth.** Ruled out by [ADR 0001](0001-no-model-calls.md): no hosted services.

## Consequences

- An accidental spoiler needs three independent slips: a path outside the project, a hook that fails to match, and a skill rule that is ignored.
- **Honest limits.** The game is single player. The guard stops the narrator, not the player: whoever opens the files, or disables the hook, sees the truth, and that is accepted.
- Obfuscated shell commands (a path assembled from pieces, an encoded string) can defeat a string check. The hook errs towards denying a doubtful command, and fails open on input it cannot parse, so that a malformed call is never the reason a game stops.
- A hook is not a sandbox. Hooks run in local and Remote Control sessions, but a cloud session does not install plugins, so there the hook does not run. A project-level `.claude/settings.json` hook would cover it; that is a follow-up and is not implemented.
- The hook matches every tool call and denies a command that merely names the save directory. Someone developing this repository with the plugin installed will meet the denial when editing about it with the shell; disable the plugin for that work.
- Other hosts need their own guard, to be checked for each one.
