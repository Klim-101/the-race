# the RACE — Run Across a Changing Earth

_The world changed overnight. Run._

A text roguelike that runs inside your coding agent (Claude Code first, Codex later) on your own subscription. Every run is one hero in a mirror world rebuilt from today's world news: real conflicts, fictional names. The hero dies for good; tomorrow the world is different.

**Status:** early prototype. Nothing is playable yet.

## How it works

- A deterministic **engine** owns the truth: dice, state, hidden traits, the secret solution of a case and the verdict.
- The **agent** owns the story: it turns headlines into a scenario, narrates and voices the characters.
- A scenario is a JSON document the engine validates before a run starts: every location reachable, every lie breakable, at least two independent ways to solve the case, no real names.

No servers, no API keys, no model calls from the code.

## Development

The local gate, the same one CI runs on Linux, macOS and Windows:

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
