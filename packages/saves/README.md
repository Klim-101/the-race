# @the-race/saves

Save and resume runs. The engine is pure and does no I/O; this package owns the files.

## Where saves live

A save holds the sealed truth as plain JSON, so it lives in the player's own state directory, never in the working
directory. `resolveSaveDir({ env, platform, homedir })` is the one pure function that decides, and `defaultSaveDir()`
calls it with the process values:

1. `RACE_HOME`, when set and non-empty (resolved to an absolute path).
2. Windows: `%LOCALAPPDATA%\the-race`, else `<home>\AppData\Local\the-race`.
3. macOS: `<home>/Library/Application Support/the-race`.
4. Elsewhere: `$XDG_STATE_HOME/the-race` when it is set and absolute, else `<home>/.local/state/the-race`.

## Layout of the save directory

```
the-race/
  run/
    state.json        the current save of the active run (JSON of the engine's run state)
    state.prev.json   the generation before it
    log.json          the run event log that goes with state.json
    log.prev.json     the log that goes with state.prev.json
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
- **The event log is saved beside the state.** `saveRun(dir, run, fs, log)` writes `log.json` with the same
  atomic write, and rotates `log.prev.json` with the state, only when the current pair is itself good. The log goes
  first, then the state. `loadRun` returns `{ run, log }` and checks that replaying the log from the start of the
  run reaches the saved state. The start is rebuilt from the run (hero, traits, case, seed and locale do not change
  during a run; the starting dice are the `rngStateBefore` of the first entry), so the log file holds only the log.
  A pair that does not replay is `log-mismatch`; a log that is not JSON or fails the log schema is `corrupt`. Either
  falls back to the previous pair like a bad state file does. A crash between the two renames leaves a pair that
  does not replay, and the load uses the previous generation.
- **Saves from before logs.** A missing `log.json` is not an error: the run loads with an empty log and nothing to
  check. A caller that has no log can omit the argument; that removes a leftover log file so it cannot contradict
  the new state. With a log, one that does not replay to the run is refused with a `RangeError`.
- **Exact resume.** The state carries `rngState`; `restoreRng(run.rngState)` continues the same dice.
- **No clock, no `Math.random`.** File operations are injectable (`SaveFs`) so that crashes can be tested.
- **Not covered.** The directory entry is not fsynced after the rename, so a power loss right after a save can still
  lose the newest generation (never both).

## Resume summary

`buildResumeSummary(run)` turns a loaded run into a short text for a new agent session. It is built only from the
engine's public `viewRun`, so it holds no truth, solution, unfound clues, lies or hidden traits. Its labels are in one
place (`RESUME_LABELS`) to move to the locale files later. It takes the run only and never reads the log.

## Security

The save holds the full secrets of the case, and the log adds to them: it names the clues that every check rolled
for, found or not, and after an accusation it holds the truth. **The narrator and any agent must be denied read access to the save
directory.** The case seal is tamper evidence (a changed case fails to load), not protection against someone who can
rewrite the whole file, seal included.
