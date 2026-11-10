# Languages

Everything the server says to the player that is not the case's own text lives in one JSON file per language: `packages/mcp/src/locales/<code>.json`. It holds the evidence board (`board`, `tabs`): headings, labels, the words for skills, signals, conditions, gear, climate and the lines of the chronicle. `{name}`-style placeholders are filled in by the code and must appear in every language.

Two kinds of text are not in these files, on purpose:

- **Messages addressed to an agent**, such as the refusals of the engine and the remarks of the case validator. The narrator and the case generator read them; they are English, and the narrator speaks to the player in the run's language.
- **Names** of the tavern heroes, spelled in every language at once in the engine's data so that one hero is one hero on every card.

## Adding a language

1. Add the code to `LOCALES` in `packages/engine/src/locale.ts`.
2. Write `packages/mcp/src/locales/<code>.json`: translate the values of `en.json`, never the keys. By hand, or with the work file below.
3. Import it in `packages/mcp/src/locales/index.ts` next to the others.
4. Run `npm run typecheck` and `npm test`.

### The work file

`npm run locale:keys -- export <code>` writes `locale-work/<code>.keys.json` (git-ignored): every key of `en.json` with its English text, an empty `text` for the translation and `"reviewed": false`. Fill in `text` with whatever translator you trust, a person or a tool of your own; the project calls none and has none in the game. Keep every `{placeholder}` as it is. Then `npm run locale:keys -- import <code>` checks the file (nothing left empty, no key the English does not have, the same placeholders) and writes `<code>.json` in the order of `en.json`; if it finds a problem it names it and writes nothing.

A text is trusted only once a person who reads the language has checked it and set `"reviewed": true`. Every text not marked so is listed in `<code>.unreviewed.json` beside the locale file, and `locales.test.ts` fails while any such file exists, so a machine translation cannot be merged by accident: the reviewer reads the texts, marks them, imports again (which removes the list when nothing is left), and commits. When `en.json` gains keys later, `export` again: what the language already says is carried over as reviewed and only the new keys are left to do.

A key missing from a file, or an id of the engine without a word, does not compile; `locales.test.ts` also fails on a key that exists in one language and not in another, on an empty text and on a placeholder that one language fills in and another does not.

`en` is the reference: every other language is compared with it key by key (`compareLocale`), so a key removed from `en` fails the test in every other file at once, as a key only they have. A `<code>.json` file left in the folder without its code in `LOCALES` fails too, so a step of the list above cannot be forgotten without CI saying which.
