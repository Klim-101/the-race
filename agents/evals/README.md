# Triggering evals

`triggering.json` is a list of `{ "prompt", "shouldTrigger" }`. The `play-the-race` skill must fire on every prompt with `true` and stay silent on every prompt with `false`: near misses cover other games, this repository's code, and writing detective fiction, in English and Russian.

## Running them by hand

1. Install the plugin built from `agents/` in Claude Code (or start a session in a project that has the skill).
2. Start a fresh session for each prompt, so earlier turns cannot influence the choice.
3. Send the prompt as the first message and watch whether `play-the-race` is invoked.
4. Count a miss when a `true` prompt does not invoke the skill, or a `false` prompt does. Any miss means the `description` in the skill's frontmatter needs tuning.

The file is checked for shape (counts, both languages, both outcomes) by `scripts/lib/agents-lint.test.mjs`.
