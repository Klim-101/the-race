# @the-race/mcp

The local MCP server of the RACE: the engine and the saves, offered as tools to the player's own agent.

- Server name: `the-race`. Transport: stdio only. Nothing listens on a port, nothing calls the network, and no API key is needed or read.
- The engine owns the truth. A tool returns what the engine says; the agent narrates it.

## Run

```sh
npm run build
node packages/mcp/dist/main.js
```

Stdout carries the protocol, so the server writes nothing else to it. Saves go in the player's own state directory, never the working directory: `RACE_HOME` when set, else the platform's per-user state directory (see `@the-race/saves`).

## Tools

| Tool          | What it does                                                                  |
| ------------- | ----------------------------------------------------------------------------- |
| `server_info` | Server name and version, ruleset version, supported locales. Changes nothing. |

The game tools, which the narrator skill calls by exactly these names:

| Tool              | What it does                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_new`         | Starts a pending run (seed, language, theme) and returns the hero choices. Refused mid-run.                                                                                                                                 |
| `hero_create`     | Assembles the hero on the seed's dice; hidden traits are rolled and stored, never returned.                                                                                                                                 |
| `run_view`        | The public view of the run, or `awaiting-hero` / `awaiting-case` / `no-run`.                                                                                                                                                |
| `act`             | look, move, search, rest, use, reread: `{ turn, intent }`.                                                                                                                                                                  |
| `question`        | Interrogate a suspect, optionally showing clues.                                                                                                                                                                            |
| `deduce`          | Link found clues into an insight.                                                                                                                                                                                           |
| `evidence_board`  | Writes the evidence board, a self-contained HTML page of the public view (clues, conclusions, cast and where they are, news); returns its path. Changes nothing in the run.                                                 |
| `accuse`          | The final accusation; ends the run and is the one place the truth is returned.                                                                                                                                              |
| `run_give_up`     | Ends the run as gave-up (a retry returns the same end).                                                                                                                                                                     |
| `generator_brief` | For the case generator only: locale, theme, tone, the hero's public data, attempts left. Never a hidden trait.                                                                                                              |
| `scenario_submit` | For the case generator only: validates a case for the run's hero, seals it and starts the run, or lists the issues. At most three attempts; an accepted case is final. Returns `{"accepted":true}` and nothing of the case. |

Every tool that changes a run takes `turn`, the run's turn from `run_view`. A call with another number is refused with `stale-turn` and changes nothing, so a retried call is never applied twice. A turn is saved together with its log entry; giving up is not a turn, so a given-up run is saved without its log.

A pending run (a seed, a language, a theme and, after `hero_create`, the hero with its hidden traits) lives in `<save dir>/pending/state.json` until the case is accepted. `src/pending-run.ts` holds its schema and `loadPending`, `savePending` and `clearPending`.

Input that breaks a tool's schema is answered by the MCP SDK itself, before the handler runs, so its error does not have the shape below. The schema is what the agent reads from `tools/list`, so it is kept strict rather than made permissive.

## Results and errors

Every result is compact JSON, sent twice: as text content and as `structuredContent`, checked against the tool's output schema. A failure is a result with `isError: true` and this shape, never a stack trace or an engine internal:

```json
{ "error": { "code": "invalid-input", "message": "…", "remediation": "…" } }
```

`toToolError` is the one place where a thrown error or an engine refusal becomes that shape. An engine refusal keeps its own `code`; an unexpected error becomes `internal-error` with a fixed message.

## Adding a tool

One tool, one file in `src/tools/`:

```ts
export const myTool = defineTool({
  name: 'my_tool',
  description: 'For a model: what it is for, what must be true before calling it, what the result means.',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  handler: (input, context) => Promise.resolve({}),
});
```

Then add it to the list in `src/tools/index.ts`. A handler gets a `ServerContext` (save directory, save file system, seed source) and reaches for no global: no `Math.random`, no clock, no direct disk access.
