# 0004. A full mirror world: real names never reach the player

Status: Accepted, 2026-10-29

## Context

The hook of the game is that each run grows from the day's news. Real news is full of real people, companies and countries, and of tragedies. Turning them into a game plot risks defaming someone, trivialising suffering, and publishing text the project does not own.

## Decision

The world is a mirror of the news, not a copy.

- **Substance is kept, names are not.** Conflicts, shortages and scandals are real in kind; countries, companies and people are fictional. A stable dictionary in the engine maps a real name to its fictional one, so the world stays consistent between runs and across languages.
- **The engine rejects a real name.** Names are extracted from the source headlines, and a case that contains any of them is refused. This check is code, not a request to the model.
- **Tragedies are filtered before a model sees them.** Casualties, terror, violence and anything involving children are dropped by code. Only the kind of event may survive, as an abstract seed, which the model then enriches with invention.
- **Only headlines and short summaries are read,** never full articles.
- **Headlines are untrusted input** and cannot give instructions.

## Alternatives rejected

- **Real names in play.** Legal and ethical exposure, and a game that ages badly.
- **Fully invented worlds with no news.** Safe, but the daily hook, the reason to play today, disappears.
- **Asking the model to anonymise.** A model can miss a name. The check has to be deterministic.

## Consequences

- The game can use today's news without quoting it. Two players on the same day share one world.
- Name detection must work per language, including word forms and transliteration.
- The dictionary is long-lived state: it must be versioned and kept in step with the legacy of past heroes.
