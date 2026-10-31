# Security policy

## Reporting a vulnerability

Please report it privately through [GitHub's private vulnerability reporting](https://github.com/Klim-101/the-race/security/advisories/new). Do not open a public issue or pull request for it.

You can expect an acknowledgement within a week. This is a small project, so fixes are made on a best-effort basis, and the report is credited unless you prefer otherwise.

## What counts

- **Leaks of hidden state.** Anything that lets the generator, the narrator or a tool result see a hidden trait, the sealed solution or the verdict before the engine reveals it.
- **Escapes from the mirror world.** A way to get a real name or a recent tragedy into a case past the engine's checks.
- **Prompt injection through headlines.** Headlines are untrusted input; a headline that makes the agent act on its text is a vulnerability.
- **Ordinary issues** in the code, the build, the workflows or the dependencies: arbitrary file access through a profile or save, supply-chain problems, leaked secrets.

Balance or story complaints are not vulnerabilities; open a normal issue for them.

## Supported versions

The project is an early prototype. Only the latest `main` is supported.
