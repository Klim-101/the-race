# Contributing

Thanks for helping. The working agreement is in [AGENTS.md](AGENTS.md); it is written for agents and humans alike, and this page is the short version.

## Before you start

- Work comes from issues titled `[P<phase>-<nn>] Title`, grouped by milestone in the [roadmap](docs/public/ROADMAP.md). Pick one whose blockers are closed, or open an issue to discuss an idea first.
- Read the **Boundaries** in [AGENTS.md](AGENTS.md). They are decisions, not preferences: no model calls from the code, no hosted services, the engine owns the truth, the narrator never sees the truth, mirror world only, headlines are untrusted, and the engine is deterministic.

## Making a change

1. Fork, then branch from an up-to-date `main`: `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `ci/…`, `chore/…`.
2. Run the local gate before pushing (Node version in [.node-version](.node-version)):

   ```sh
   npm ci
   npm run lint
   npm run typecheck
   npm run test:coverage   # the engine stays at 100% coverage
   npm run build
   npm run licenses:check
   ```

3. Commit with a sign-off, using Conventional Commits: `git commit -s -m "feat(engine): add a thing"`. Types and scopes are listed in [AGENTS.md](AGENTS.md).
4. Open a pull request against `main` with `Closes #<issue>` in the body. Do not stack pull requests. The pull request title becomes the commit on `main`, so it follows the same format.

## Sign-off (DCO)

Every commit carries a `Signed-off-by` line, certifying the [Developer Certificate of Origin](https://developercertificate.org). `git commit -s` adds it; CI checks it.

## Licensing

Contributions are licensed under [Apache-2.0](LICENSE), like the rest of the project.
