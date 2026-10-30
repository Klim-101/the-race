# Authored content

Hand-written detective cases for the-RACE, used as test fixtures and for offline play before the news pipeline exists.

**Licence: undecided.** The Apache-2.0 licence of the code does not yet cover this folder; the licence of authored content is settled in task P6-02. Until then, treat these files as all rights reserved by the project.

## Layout

```
content/cases/<case-id>.<locale>.json   a case in the engine's case schema (locale: ru or en)
content/cases/<case-id>.md              the playthrough note: solution, evidence chains, red herrings, skill routes
```

Each case exists in Russian and in English. The two versions tell the same case with the same ids, so a save or a verdict does not depend on the language.

## Cases

| Case                      | Crime         | Tone   |
| ------------------------- | ------------- | ------ |
| `goose-of-elmwick`        | curious theft | absurd |
| `leaked-memo-of-larkspur` | financial     | wry    |

## How the files are used

- `packages/engine/test/sample-cases.test.ts` reads every JSON file here and runs the engine's `validateCase` on it for three starting heroes, with no traits and with each single trait of the detective catalogue. It also checks that the two languages share their ids.
- They are plain case files, so a host can load one as the accepted case of a run without generating anything.
- The setting is the mirror world called The Draft: every country, town, company and person is fictional.
- The playthrough notes spoil the cases. They are for authors and testers, not for players.
