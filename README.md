# the RACE — Run Across a Changing Earth

*The world changed overnight. Run.*

A text roguelike that runs inside your coding agent (Claude Code first, Codex later) on your own subscription. Every run is one hero in a mirror world rebuilt from today's world news: real conflicts, fictional names. The hero dies for good; tomorrow the world is different.

**Status:** early prototype. Nothing is playable yet.

## How it works

- A deterministic **engine** owns the truth: dice, state, hidden traits, the secret solution of a case and the verdict.
- The **agent** owns the story: it turns headlines into a scenario, narrates and voices the characters.
- A scenario is a JSON document the engine validates before a run starts: every location reachable, every lie breakable, at least two independent ways to solve the case, no real names.

No servers, no API keys, no model calls from the code.

## Development

```sh
npm install
npm run typecheck
npm run test
npm run build
```

## License

Code is licensed under [Apache-2.0](LICENSE).
