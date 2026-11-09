# 0011. The form of a case is its own roll, and no longer follows from its theme

Status: Accepted, 2026-11-09. Amends the abduction form of #449, which tied the form to the theme.

## Context

An abduction was the form of one theme, `missing-person`, and that theme can come only from `dispute` and `curiosity` seeds. So an abduction was rare and always the same kind of case, though a pet of a person of weight, or an official kept out of the way, fits a fraud, a leak or a forgery as well.

## Decision

- **The theme says what the case is about and the form says how it is played.** They are independent.
- **A disappearance is always an abduction. Any other theme is one with a chance of one in four,** the same for every theme, so the player has the same chance of every kind of crime in both forms.
- **The roll is on a stream of the run's seed of its own** (`<runSeed>:form`), so it is the same on every call and never moves the dice the run is played with. The generator is told the form and never picks it.
- **An abduction of another theme is pressure inside it,** and stays harm-free: the victim is hidden and unharmed, and the case never speaks of a hostage, a threat or a ransom.

## Consequences

- `formForTheme(theme)` became `formFor(theme, runSeed)`. The validator, the checks and the narrator already follow `form`, not the theme.
- The generator's prompt teaches the abduction as pressure inside the theme.
