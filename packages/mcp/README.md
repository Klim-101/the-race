# @the-race/mcp

The local MCP server of the RACE: the engine and the saves, offered as tools to the player's own agent.

- Server name: `the-race`. Transport: stdio only. Nothing listens on a port, nothing calls the network, and no API key is needed or read.
- The engine owns the truth. A tool returns what the engine says; the agent narrates it.

## Run

```sh
npm run build
node packages/mcp/dist/main.js
```

Stdout carries the protocol, so the server writes nothing else to it. Saves go in `saves/` of the game folder the player chose, never the working directory: `RACE_HOME` when set, else `<game folder>/saves` (see `@the-race/saves`). The plugin asks for the game folder at the first start (`C:	he-race` by default) and passes it as `RACE_GAME_FOLDER`.

## Tools

| Tool          | What it does                                                                  |
| ------------- | ----------------------------------------------------------------------------- |
| `server_info` | Server name and version, ruleset version, supported locales. Changes nothing. |

The game tools, which the narrator skill calls by exactly these names:

| Tool              | What it does                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run_new`         | Starts a pending run (seed, language, theme) and returns the hero choices. Refused mid-run.                                                                                                                                                                                                                                                                                                                        |
| `hero_create`     | Assembles the hero on the seed's dice; hidden traits are rolled and stored, never returned.                                                                                                                                                                                                                                                                                                                        |
| `run_view`        | The public view of the run (with the country it is set in and its climate), or `awaiting-hero` / `awaiting-case` / `no-run`.                                                                                                                                                                                                                                                                                       |
| `act`             | look, move, search, rest, use, reread: `{ turn, intent }`.                                                                                                                                                                                                                                                                                                                                                         |
| `question`        | Interrogate a suspect, optionally showing clues.                                                                                                                                                                                                                                                                                                                                                                   |
| `deduce`          | Link found clues into an insight.                                                                                                                                                                                                                                                                                                                                                                                  |
| `evidence_board`  | Writes the evidence board, a self-contained HTML page of the public view in five tabs (the known map with the news, the suspects with what they said, the clues with their links, the chronicle with the time left, the open questions and the last turns, the hero and kit with the climate) in the board folder, always as the same file; returns its `path` and a `file://` `link`. Changes nothing in the run. |
| `accuse`          | The final accusation; ends the run and is the one place the truth is returned.                                                                                                                                                                                                                                                                                                                                     |
| `run_give_up`     | Ends the run as gave-up (a retry returns the same end).                                                                                                                                                                                                                                                                                                                                                            |
| `generator_brief` | For the case generator only: locale, the hero's public data, attempts left, the one seed the engine chose for this hero with its crime type (`theme`) and tone, and the mirror world. Never a hidden trait.                                                                                                                                                                                                        |
| `world_propose`   | For the seed extractor only: gives a real country, organisation or role its mirror name, which the engine makes itself in both languages (a role is named by hand). Accepted only if no mirror name is shared or real; then fixed for good.                                                                                                                                                                        |
| `world_view`      | The mirror world as the player may know it: its name and every named entity, mirror names only. Changes nothing.                                                                                                                                                                                                                                                                                                   |
| `tavern_news`     | The news of the day told as a few lines of the mirror world, from the stored seeds alone: no model call, no feed, no run needed. Names no real entity and holds no tragedy.                                                                                                                                                                                                                                        |
| `news_brief`      | For the seed extractor only: today's cleaned and filtered headlines, each with an id, in an untrusted block, and the seed kinds allowed. Fetched once a day.                                                                                                                                                                                                                                                       |
| `seeds_submit`    | For the seed extractor only: the seeds of the day, checked against the headlines given and the real names; kept once per day and shared by every run.                                                                                                                                                                                                                                                              |
| `scenario_submit` | For the case generator only: validates a case for the run's hero, seals it and starts the run, or lists the issues. At most three attempts; an accepted case is final. Returns `{"accepted":true}` and nothing of the case.                                                                                                                                                                                        |

The short `view` that a turn tool returns carries the case title, the language and the known `map`, the same as `run_view`, so the plugin's HUD (see [PLUGIN.md](../../docs/public/PLUGIN.md)) never goes stale between `run_view` calls.

Every tool that changes a run takes `turn`, the run's turn from `run_view`. A call with another number is refused with `stale-turn` and changes nothing, so a retried call is never applied twice. A turn is saved together with its log entry; giving up is not a turn, so a given-up run is saved without its log.

The evidence board is not written to the save directory, which is closed to the narrator, nor to a profile folder, which a browser under another account could not open. It goes to `board/evidence.html` in the game folder (`C:\the-race\board` by default), or to the folder `RACE_BOARD_DIR` names. If that folder cannot be written, the tool answers `board-unwritable` and says how to choose another one. The page holds what `run_view` shows and nothing more, and a test checks it, so it is safe outside the closed directory. It is one fixed file: a tab the player left open shows the new state after a reload.

The news tools read the day, the network and the feed list from the context. `RACE_NEWS_LAG_DAYS` (0 to 14, default 0) sets how many days behind the news a run is; the seeds are kept in `<save dir>/seeds/seeds.json` for 14 days.

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
