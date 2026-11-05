# Contributing

Thanks for helping. The working agreement is in [AGENTS.md](AGENTS.md); it is written for agents and humans alike, and this page is the short version.

## Before you start

- Work comes from issues titled `[P<phase>-<nn>] Title`, grouped by milestone in the [roadmap](docs/public/ROADMAP.md). Pick one whose blockers are closed, or open an issue to discuss an idea first.
- Read the **Boundaries** in [AGENTS.md](AGENTS.md). They are decisions, not preferences: no model calls from the code, no hosted services, the engine owns the truth, the narrator never sees the truth, mirror world only, headlines are untrusted, and the engine is deterministic.

## Making a change

1. Fork, then branch from an up-to-date `main`: `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `ci/…`, `chore/…`.
2. Run the local gate before pushing. You need Node.js 24 (see [.node-version](.node-version)); 25 is not supported, because the test runner skips odd releases, and npm must be 11 or newer, which Node 24 brings. The gate is the same one CI runs on Linux, macOS and Windows:

   ```sh
   npm ci
   npm run lint            # LLM SDK denylist, ESLint (incl. SPDX headers), Prettier
   npm run typecheck
   npm run test:coverage   # the engine stays at 100% coverage
   npm run build
   npm run bundle:check    # the server bundled into the plugin is current (npm run bundle rewrites it)
   npm run licenses:check  # runtime dependency licenses against the allowlist
   ```

   The plugin in `plugins/` is generated: after changing `agents/` run `npm run generate`, and after changing the engine or the server run `npm run bundle`. CI fails when either is stale. `npm run lint:fix` fixes what it can.

3. Commit with a sign-off, using Conventional Commits: `git commit -s -m "feat(engine): add a thing"`. Types and scopes are listed in [AGENTS.md](AGENTS.md).
4. Open a pull request against `main` with `Closes #<issue>` in the body. Do not stack pull requests. The pull request title becomes the commit on `main`, so it follows the same format.

CI also scans for secrets (gitleaks), checks pull request titles (Conventional Commits) and the DCO sign-off on every commit, and lints workflows (actionlint, zizmor).

## Sign-off (DCO)

Every commit carries a `Signed-off-by` line, certifying the [Developer Certificate of Origin](https://developercertificate.org). `git commit -s` adds it; CI checks it.

## Licensing

Contributions are licensed under [Apache-2.0](LICENSE), like the rest of the project.
