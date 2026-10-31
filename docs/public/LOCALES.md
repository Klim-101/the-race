# Languages

Everything the server says to the player that is not the case's own text lives in one JSON file per language: `packages/mcp/src/locales/<code>.json`. It holds the evidence board (`board`, `tabs`): headings, labels, the words for skills, signals, conditions, gear, climate and the lines of the chronicle. `{name}`-style placeholders are filled in by the code and must appear in every language.

Two kinds of text are not in these files, on purpose:

- **Messages addressed to an agent**, such as the refusals of the engine and the remarks of the case validator. The narrator and the case generator read them; they are English, and the narrator speaks to the player in the run's language.
- **Names** of the tavern heroes, spelled in every language at once in the engine's data so that one hero is one hero on every card.

## Adding a language

1. Add the code to `LOCALES` in `packages/engine/src/locale.ts`.
2. Copy `packages/mcp/src/locales/en.json` to `<code>.json` and translate the values, never the keys.
3. Import it in `packages/mcp/src/locales/index.ts` next to the others.
4. Run `npm run typecheck` and `npm test`.

A key missing from a file, or an id of the engine without a word, does not compile; `locales.test.ts` also fails on a key that exists in one language and not in another, on an empty text and on a placeholder that one language fills in and another does not.
