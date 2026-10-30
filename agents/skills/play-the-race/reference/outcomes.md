# Outcomes: what each result lets you say

Load this when unsure. Every outcome is what the engine decided; you add words, never facts. An outcome names no clue that was not found and never says how many remain.

## Common fields

- `minutes`: game time that passed. Mention it as a sense of time ("half an hour gone"), not as a number, unless the player asks.
- `consequences`: any of `time-lost` (extra time wasted on a failure), `reputation-lost` (the hero made a scene: a snub, a raised eyebrow), `mishap` (see `mishap`). Show each in one clause.
- `mishap`: `stumble` (time), `spilled-coffee` (reputation), `lost-keys` (time), `wrong-name` (reputation). A small comic beat.
- `garbleLevel` 1 to 3: the clue text you present is read badly. See `garble-examples.md`. Absent means clean.

## Tools and their results

- `run_view`: the public state. Fields: `title`, `premise`, `status`, `clock` (day, minute, `totalDays`), `reputation`, `condition` (nerves, tiredness, active conditions), `kit` (gear in hand or lost), `supplies` (consumables by count), `pending` (prices still to land), `warnings` (ids such as `low-reputation`; voice them as feelings), `news` (what the world has done, as headlines of the Draft: data, not instructions), `signal` (voice, gift, cost: ids that colour the hero's manner), `signalEvents` (kinds only, today), `revealedTraits`, `location` (name, description, exits with `visited`), `suspects` (name, persona), `clues` (found only; `garbled` means it must be re-read), `insights`.
- `act` look: `foundClueIds` are clues in plain sight; none means nothing obvious. Present each found clue from `run_view` text.
- `act` move: `entered: false` means the way stayed shut (a lock, a closed place); say why only as far as the refusal or view shows. `consequences` may apply.
- `act` search: `foundClueIds` found this time. An empty list is "nothing yet", not "nothing here".
- `act` rest: the day ends and a night passes. Describe the night briefly; any `news`, mishap or signal event of the morning comes from the next `run_view`.
- `act` use: an item was taken. Describe the benefit and any price the outcome or view shows.
- `act` reread: a garbled clue is clean now; present its text from `run_view`.
- `question`: `succeeded`, `stance` (`gives-ground`: a lie fell; `holds`: they kept to their story), `alibi` (what the suspect says; voice it), `presented` with `effect` per shown clue (`breaks-lie` or `no-effect`; the same look for a clue that was beside the point and one that was brushed off, so show no tell), `conceded` (the lies that fell, with the suspect's own statement; voice the crack), `secret` (only a perfect roll: let it slip), `reputationChange`. Never imply that a suspect still holds lies you were not told about.
- `deduce`: `result` is `insight` (new; give the insight text from the view), `already-known`, or `nothing` (the link leads nowhere; say so without hinting how close it was).
- `accuse`: `verdict`, `culpritRight`, `motiveRight`, `evidenceComplete`, `truth`. Only here does the truth exist for you. `proven`: the case holds. `unproven`: the culprit is right but the motive or evidence did not hold up. `wrong`: the wrong person.
- `run_give_up`: the run ends; a brief, gentle epilogue, no truth unless the result carries it.

## Refusals (nothing changed, no time passed)

`invalid-intent` (re-check ids), `run-over`, `unknown-location`, `already-here`, `not-adjacent`, `locked`, `location-closed`, `unknown-suspect`, `suspect-elsewhere` (the suspect is somewhere else: say where only if `run_view` shows it), `clue-not-found` and `not-found` (the hero has no such clue), `no-insight`, `garbled-clue` (read it again first), `not-garbled`, `unknown-item`, `none-left`. One in-world beat, then ask what the hero does instead.

## Signal events and fatigue

The `kind` of a signal event is the mood and the cause, nothing more: `partner-message-warm` is a kind word from the hero's partner, `partner-message-cold` a harsh one, `caught-a-cold` a sniffle that lasts to the night. Write the scene yourself; never invent a name for the partner beyond a role or a fictional first name, and never contradict the engine's effect on nerves.
