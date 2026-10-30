# @the-race/mcp

The local MCP server of the RACE: the engine and the saves, offered as tools to the player's own agent.

- Server name: `the-race`. Transport: stdio only. Nothing listens on a port, nothing calls the network, and no API key is needed or read.
- The engine owns the truth. A tool returns what the engine says; the agent narrates it.

## Run

```sh
npm run build
node packages/mcp/dist/main.js
```

Stdout carries the protocol, so the server writes nothing else to it. Saves go under `<working directory>/.race`.

## Tools

| Tool          | What it does                                                                  |
| ------------- | ----------------------------------------------------------------------------- |
| `server_info` | Server name and version, ruleset version, supported locales. Changes nothing. |

| `generator_brief` | For the case generator only: locale, theme, tone, the hero's public data, attempts left. Never a hidden trait. |
| `scenario_submit` | For the case generator only: validates a case for the run's hero, seals it and starts the run, or lists the issues. At most three attempts; an accepted case is final. Returns `{"accepted":true}` and nothing of the case. |

The other game tools come in later changes.

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
