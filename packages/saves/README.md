# @the-race/saves

Save and resume runs. The engine is pure and does no I/O; this package owns the files.

## Layout of `.race/`

`.race/` is git-ignored. `defaultSaveDir(cwd)` returns it for a working directory.

```
.race/
  run/
    state.json        the current save of the active run (JSON of the engine's run state)
    state.prev.json   the generation before it
```

One active run is supported for now.

## Guarantees

- **Atomic writes.** A file is written as `<name>.tmp` in the same directory, flushed to disk, then renamed over the
  target. The current file is first copied to `state.prev.json` the same way, and only when it is itself a good save,
  so a corrupt file never overwrites a good previous generation. At every point of a crash one of the two files is a
  whole save.
- **Fallback.** `loadRun` uses `state.prev.json` when the current file is missing, corrupt or unreadable, and the
  result says so (`source: 'previous'`, `currentProblem`).
- **No exceptions on load.** `loadRun` returns `ok: true` with the run, or `ok: false` with a reason: `missing`,
  `corrupt` (not JSON, fails the run schema, or the case no longer matches its seal), `unsupported-version` (a
  `schemaVersion` this engine does not know; migrations are #64 and plug in at `parseRunText`) or `unreadable`.
- **Exact resume.** The state carries `rngState`; `restoreRng(run.rngState)` continues the same dice.
- **No clock, no `Math.random`.** File operations are injectable (`SaveFs`) so that crashes can be tested.
- **Not covered.** The directory entry is not fsynced after the rename, so a power loss right after a save can still
  lose the newest generation (never both).

## Resume summary

`buildResumeSummary(run)` turns a loaded run into a short text for a new agent session. It is built only from the
engine's public `viewRun`, so it holds no truth, solution, unfound clues, lies or hidden traits. Its labels are in one
place (`RESUME_LABELS`) to move to the locale files later.

## Security

The save holds the full secrets of the case. **The narrator and any agent must be denied read access to the save
directory.** The case seal is tamper evidence (a changed case fails to load), not protection against someone who can
rewrite the whole file, seal included.
