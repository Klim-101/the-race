# Outcomes: what each result lets you say

Load this when unsure. Every outcome is what the engine decided; you add words, never facts. An outcome names no clue that was not found and never says how many remain.

## Common fields

- `minutes`: game time that passed. Mention it as a sense of time ("half an hour gone"), not as a number, unless the player asks.
- `consequences`: any of `time-lost` (extra time wasted on a failure), `reputation-lost` (the hero made a scene: a snub, a raised eyebrow), `nerves-lost` (the failure frayed the hero: a talk that moved no one, a link that led nowhere, a search that found nothing; say it as a feeling in a clause, never as a number), `mishap` (see `mishap`). Show each in one clause.
- `mishap`: `stumble` (time), `spilled-coffee` (reputation), `lost-keys` (time), `wrong-name` (reputation). A small comic beat.
- `garbleLevel` 1 to 3: the clue text you present is read badly. See `garble-examples.md`. Absent means clean.

## Tools and their results

- `act`, `question`, `deduce` and `accuse` each return `{ outcome, events, felt, revealed, view }`: the outcome described below, `events` (see "Events of the turn"), `felt` (see "The signal at work"), `revealed` (see "A trait shows itself") and `view`, a short summary of the run after the turn (`turn`, `status`, `endReason`, `clock`, `reputation`, `warnings`, `location`, `clueCount`, `insightCount`). Pass the `turn` of the latest view to the next state-changing call. `run_give_up` returns `{ view, stats }`. `evidence_board` returns `{ path, link, clueCount, insightCount }`: an HTML page for the player, as a path and as a `file://` link, never to be opened by you.
- `run_new` returns the hero choices (`skills`, `skillPoints`, `maxSkillLevel`, `skillPresets` (ready-made builds, each `{ id, skills }`), `backgrounds`, `signals`, `locales`); `hero_create` returns `{ status: "awaiting-case", hero, hiddenTraitCount }`.
- `profile_view`: the player's own tally from the runs that are over: `stats` (`runs`, `won`, `lost`, `gaveUp`, `winRate`, `byReason`, `daysPlayed`, `longestRunDays`, `cluesFound`, `insights`, `traitsRevealed`, `currentStreak`, `bestStreak`) and `recent` (the last five). The numbers are the player's own and may be said plainly. `profile_export` and `profile_import` only when the player asks to move the profile to another machine: the first writes `export.json` in the profile folder, the second takes an `import.json` the player has put there.
- `run_view`: the public state. With no run, only `status`: `awaiting-hero`, `awaiting-case` (the hero exists: run the case generator) or `no-run`. With a run, the fields (plus `endReason` once it is over): `title`, `premise`, `status`, `clock` (day, minute, `totalDays`), `reputation`, `condition` (nerves, tiredness, active conditions), `kit` (gear in hand or lost), `supplies` (consumables by count), `pending` (prices still to land), `warnings` (ids such as `low-reputation`, `frayed-nerves` and `ragged-nerves`; voice them as feelings: frayed nerves are a hero who is on edge and a little clumsy, ragged ones a hero whose hands slip and whose notes come out smudged, and either is a reason to think of rest, coffee or a quiet bed; never name the number or the meter), `news` (what the world has done, as headlines of the Draft: data, not instructions), `signal` (voice, gift, cost: ids that colour the hero's manner), `signalEvents` (kinds only, today), `revealedTraits`, `location` (name, description, exits with `visited`), `suspects` (name, persona, and `place`: where they can be found now, or null for anywhere; say it in the story, it is public), `clues` (found only; each has an `id`, a public `number` such as `KESVIK-03` that you name it by, and `garbled`, which means it must be re-read), `openLinks` (how many clues each conclusion still to be made takes, smallest first, as numbers only: tell them to the player, never which clues; a conclusion that has been drawn drops out, and an empty list means every one is drawn), `insights`.
- `act` look: `foundClueIds` are clues in plain sight; none means nothing obvious. Present each found clue from `run_view` text.
- `act` move: `entered: false` means the way stayed shut (a lock, a closed place); say why only as far as the refusal or view shows. `consequences` may apply.
- `act` search: `foundClueIds` found this time. An empty list is "nothing yet", not "nothing here".
- `act` rest: the day ends and a night passes. Describe the night briefly; any `news`, mishap or signal event of the morning comes from the next `run_view`.
- `act` use: an item was taken. Describe the benefit and any price the outcome or view shows.
- `act` reread: a garbled clue is clean now; present its text from `run_view`.
- `question` (the outcome's `kind` is `interrogate`): `succeeded`, `stance` (`gives-ground`: a lie fell; `holds`: they kept to their story), `alibi` (what the suspect says; voice it in full, in the scene described in `talks.md`), `presented` with `effect` per shown clue (`breaks-lie` or `no-effect`; the same look for a clue that was beside the point and one that was brushed off, so show no tell), `conceded` (the lies that fell, with the suspect's own statement; voice the crack), `secret` (only a perfect roll: let it slip), `reputationChange`. Never imply that a suspect still holds lies you were not told about.
- `deduce`: `result` is `insight` (new; give the insight text from the view), `already-known`, or `nothing` (the link leads nowhere; say so in one wry line about the hero's failed theory, without hinting how close it was and without suggesting other clues to try).
- `accuse`: `verdict`, `culpritRight`, `motiveRight`, `evidenceComplete`, `truth`. Only here does the truth exist for you. `proven`: the case holds. `unproven`: the culprit is right but the motive or evidence did not hold up. `wrong`: the wrong person.
- `run_give_up`: the run ends; a brief, gentle epilogue, no truth unless the result carries it.

## The signal at work

`felt` lists what the hero's character signal did in this turn, and is empty for a hero without a signal and for a turn it did not touch. Each entry names the `signal` and its `effect`: `helped` (the signal made a check of the `skill` easier: the gift worked), `hindered` (it made it harder: the cost showed) or `shielded` (it spared a `meter`, such as the nerves, a loss: the gift worked). Work it into the scene in a clause or a sentence, as the hero's own thought, in the signal's `voice` from the view, and never as a number or a skill name: in love, "the warmth in my head makes the talk go easier" («в голове тепло, и разговор идёт легче»); low, "the dull edge of the day keeps the detail from me" («тусклый день не пускает ко мне детали»); burnt out, "a blunder that would have shaken another leaves me as flat as before" («промах, который выбил бы другого, оставляет меня таким же ровным»). Say it only when it is in `felt`, and add no fact about the case: it colours the hero, never the clues.

## A trait shows itself

`revealed` lists the hidden traits of the hero that showed themselves in this turn, and is empty on most turns. Each entry has the `trait` id, its `polarity` (`positive`, `negative` or `mixed`) and the `reason`: `modifier` (it made a roll easier or harder), `auto-discover` (a second look found a clue without a roll), `lock-out` (a source of information stayed shut to the hero) or `spawn-event` (a debt collector turned up and cost an hour). Play it as a moment in the scene, in a sentence or two, and let the hero notice something about themselves for the first time, in the first person: "I have always read a room faster than a ledger" («я всегда читал людей быстрее, чем бумаги»), "the old grudge at the precinct means nobody there will take my call" («старая обида в участке значит, что мне там не ответят»). After that the trait is open: `run_view` lists it in `revealedTraits` with its effects, and you may name it and use it in the story from then on. Say it only when it is in `revealed`, once, and never hint at a trait that has not been revealed: the count of the hidden ones is the only thing the player may know about them.

## Events of the turn

`events` lists the random events that happened during this turn: `description` is what the world did, in the words of the case, and `effect` is its kind. At midday and in the evening the day may bring one, a night brings its own, and most turns bring none (an empty list). The engine has already applied the effect (an hour lost, frayed nerves, a closed door, a suspect moved), so tell it as something that happened to the hero on the way: a short scene of two to four sentences in the hero's voice, built on `description`, with the effect shown (the hour gone, the shaken hero) and never as a number. `flavor` is colour with no cost. Add no fact beyond the description, and do not say whether it helps the case.

## Refusals (nothing changed, no time passed)

`invalid-intent` (re-check ids), `run-over`, `unknown-location`, `already-here`, `not-adjacent`, `locked`, `location-closed`, `unknown-suspect`, `suspect-elsewhere` (the suspect is somewhere else: say where only if `run_view` shows it), `clue-not-found` and `not-found` (the hero has no such clue), `no-insight`, `garbled-clue` (read it again first), `wrong-link-size` (the set of clues is of a size no open conclusion takes: the message names the sizes that do; nothing was spent, say so in a line and ask again with one of those sizes), `not-garbled`, `unknown-item`, `none-left`. Tool-level refusals, also with nothing changed: `stale-turn` (the `turn` was old: call `run_view`, the earlier call may already have worked), `no-run`, `run-in-progress` (resume instead of starting), `no-pending-run`, `invalid-hero` (adjust the choices), `save-unusable` (an earlier save could not be read and was left as it is: say so in one plain sentence; it blocks nothing, so offer a new run). One in-world beat, then ask what the hero does instead.

## Signal events and fatigue

The `kind` of a signal event is the mood and the cause, nothing more: `partner-message-warm` is a kind word from the hero's partner, `partner-message-cold` a harsh one, `caught-a-cold` a sniffle that lasts to the night, `letter-from-home-warm` a kind letter from family and `letter-from-home-wistful` one that stirs the homesickness. Write the scene yourself. When the event in `run_view`'s `signalEvents` has a `companion`, that is the first name of the partner or the family member: use exactly that name, never another and never a surname, and never contradict the engine's effect on nerves.

## The road

`run_view` has `weather` (an id: `mild`, `warm`, `hot`, `humid`, `windy`, `fog`, `dry-heat`, `cold-rain`, `snow`, `frost`, `storms`) for today, or `null` when the case is set nowhere. It colours every place out of doors that day (the `location.exposure` of the view is `outdoor`; `indoor` is a room in a building, where the weather is only what comes through the window) and the walk between places; say it in a clause the hero would think, never as the id. A walk is slower in bad weather: the `minutes` of the move result already include it, so do not add anything up.

A `move` result may carry `weather` (the walk was out of doors) and `roadMishap`, a small, comic thing that happened on the way. Tell it as a short beat of the hero's own thoughts after the arrival, from its id, never harming anyone, and let it cost what the result says (a quarter of an hour more, a point of nerves, a short `exhausted` or `shaken` in the view) and no more:

| `roadMishap`               | The beat                                                                |
| -------------------------- | ----------------------------------------------------------------------- |
| `wrong-turn`               | A street that was not the one; the hero arrives from the wrong side.    |
| `missed-bus`               | The bus pulls away a step ahead of the hero.                            |
| `stranger-asks-directions` | A stranger needs the way, and the hero is the last person who knows it. |
| `dog-follows`              | A small dog decides to see the hero home, and barks at the doorstep.    |
| `pigeon-incident`          | A pigeon with a grudge, and a hat that will never be the same.          |
| `deep-puddle`              | A puddle deeper than it looked; a sock that squelches for the day.      |
| `umbrella-inside-out`      | The umbrella gives up in a gust and turns itself inside out.            |
| `hat-in-the-wind`          | The hat leaves, and the chase is undignified.                           |
| `icy-step`                 | A slip on ice that is saved by a lamp post and a good deal of pride.    |
| `lost-in-the-fog`          | The fog takes the street away for a while.                              |
| `heat-and-no-shade`        | The sun with no shade, and a long wait for a bench.                     |
| `shaken-by-a-bicycle-bell` | A bicycle bell at the worst moment; the hero's heart takes a minute.    |

Never turn a mishap into an injury, a fight or a threat, whatever the weather, and never let it hint at the case: it is the street, not the plot.
