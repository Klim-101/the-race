# How a run ends: the hero leaves the case

A hero has one run and one life in the Draft. When the run is over it stays over: it cannot be resumed, and the next run is a new hero from the tavern. The engine decides the ending and records its cause (`endReason` in the view, and the `status`: `won`, `lost` or `gave-up`). You only tell it.

**The hero leaves; the hero never dies.** No ending is a death, an injury or a harm, and no word of one belongs in the scene. A hero who loses is let go, burnt out, sent home or simply walks away, and the world carries on. This is a rule of the world, not a matter of taste.

## One closing scene, then the line

Tell the ending as a short closing scene in the hero's own thoughts (first person, as they leave the case), six to ten sentences, in the run's language («я оставляю папку на столе и ухожу, не оглядываясь» / "I leave the folder on the desk and walk out without looking back"), in the player's language and in the dial of the case tone (`serious`, `wry`, `absurd`): the last moment at the place, the thing that decided it, and how I (the hero) fare afterwards, fitted to my background and, if they had one, their situation (`lifeState`). Say only what the view and the outcome contain; add no fact about the case that they do not. Then one plain line offering a new run.

For `accuse` the verdict word and the truth come first, as the skill says; the scene then follows the reason below.

## The closing story of an accusation

After `accuse` the scene is a short detective story, told from the `epilogue` and the `truth` of the outcome and from nothing else. The player has just learned how the case really went, so tell it as a story that makes the next case worth starting, not as a report. The shape depends on the verdict:

- **`unproven`**: the night with the notebook. Start with what really happened (`course`, in order, as the hero now sees it), then where the hero's trail broke off, then the thing walked past: each clue in `missed`, told in full: what it said, the place it lay in, and how it could have been had. The `obstacle` names the kind of thing that stood in the way (a lock, the dark, a soft thing, a trace, a seal, a screen); a clue with no `partId` was there for the asking or a talk. A clue that was found and left out is told from the `shortfall`. End on what the hero would do first, were the file open: a thought, not a promise.
- **`wrong`**: the culprit's own story, from `course` and the truth, beginning at the moment the hero went the other way. Name the false clue that led there (`misled`, by its `number`) and what it really was. The hero is let go, as the table below says.
- **`proven`**: short, a few sentences of `course` as the hero finally hears it, and the credit. There is no `missed` to tell.

In a homicide (an attempt on someone) the same shapes hold, told **off screen and without relish**: the story is of what the hero understood, never of the attack itself, and nothing graphic is dwelt on. The victim lives (`truth.homicide.fate` is `attempt`), recovers and is never found worse for the hero's mistake, whatever the verdict; say so in a sentence, kindly, as the end of the case for them. The means is a third part of the proof beside the culprit and the motive: **`proven`** tells the means in a sentence of the `course` ("it was the cart, as I finally saw it"); **`unproven`** with a right culprit tells, from the `shortfall`, which part fell short, and for the `means` says plainly whether the hero offered one (`offered`), whether the conclusion had ever been drawn (`drawn`) and what it would have taken, from the `epilogue`'s `missed` clues, without ever saying more than the outcome holds; **`wrong`** is the culprit's own story as for any whodunit. The doctor's or the expert's `report` of the case, if it came, may be named as the word that came too late or was read right, and never as the answer. In an abduction the same shapes hold, and the victim is part of them: **`proven`** ends with the victim found where the hero said, safe and cross rather than frightened (a cat that has opinions about the cellar, a clerk with a story to tell); **`wrong`** with `placeRight` false is a door opened on an empty room, and with `culpritRight` false is the right place and the wrong name: tell which of the two was right and say that the victim is found all the same, a little later, by others; **`unproven`** is the hero at the right door with the right name and a case that will not stand; when `shortfall.place.drawn` is false the door was right and the reasoning that leads to it was never done, so the victim is found, but the hero had only a hunch and no one will act on it: say so, kindly, and never say what the conclusion would have been. The `deadline-passed` ending is not an accusation and has no `truth`: the hour comes round, the phone does not ring, and the victim is found afterwards, unharmed, by someone else; it is told without blame and without the cost spelled out, and the victim is never found worse for the wait.

Rules for all three: six to ten sentences, the hero's voice, the case's tone. Every fact comes from the outcome; invent no person, clue, place or motive, and never explain a gap by something that is not in it. An empty `missed` or `misled` is told as nothing missing, not filled in. No real names. Do not blame the player, and let the hero leave as the table below says.

## What each reason means

| `endReason`       | What happened                                                  | How the hero leaves                                                                    |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `proven`          | The right person, the right motive, proof on the table.        | With credit, a quiet word from someone who matters, and a closed file.                 |
| `unproven`        | The right person, but the proof fell short (see `shortfall`).  | The file is closed without a verdict; the hero knows, and nobody else will act.        |
| `wrong`           | Someone else did it.                                           | An embarrassed exit; the office finds a polite reason to let the hero go.              |
| `time-ran-out`    | The days of the case are spent.                                | Taken off the case; the trail goes cold and the hero goes home.                        |
| `culprit-fled`    | The culprit left before the hero was ready.                    | An empty street, a train that has gone, and a case that is somebody else's now.        |
| `deadline-passed` | The deadline of an abduction came before the victim was found. | A phone that rings too late, or not at all; no blame is laid, and the hero carries it. |
| `reputation-zero` | Nobody will take the hero's calls any more.                    | Let go: a door that does not open and a number that does not answer.                   |
| `breakdown`       | The nerves gave out with little reputation to fall back on.    | Burnt out, and kindly: a long leave, a bench, a cup of tea; never mocked.              |
| `gave-up`         | The player chose to stop.                                      | The hero sets the case down on the table and walks away, with no hard feelings.        |

## What not to do

- Do not suggest the hero can come back to this case or this run: it is over. A new run is a new hero.
- Do not show numbers, meters or ids. Speak of how it felt: a tired hero, an empty phone, a cold file.
- Do not blame the player. The ending is the world answering, not a verdict on them.
- Do not mention a hall, achievements or any statistic that `profile_view` does not give you: they do not exist yet. The one line of the tally comes after the scene (see SKILL.md): `runs`, `won`, and if it is worth a word the streak or the longest case.

## The story kept on the board

Besides the closing scene you tell in the chat, a finished run keeps one text for the player to reread: a short detective tale of the case as it went, shown in the "Story" tab of the evidence board. You write it and send it with `run_story` (`title`, then `paragraphs`); the engine only keeps it and shows it. It decides nothing.

- **Length and form:** a `title` and 4 to 8 paragraphs of plain prose, each a few sentences. No markup, no headings, no lists, no ids, no numbers or meters.
- **Voice:** told as a tale, in the third person about the hero or in the hero's own voice, as suits the case tone (`serious`, `wry`, `absurd`), in the language of the run.
- **Shape:** the hero's days as they went (the place they started, what they chased, where they stood at the end), then the ending as the table above tells it. After an accusation, tell how the case really went from `epilogue` and `truth`, as the closing story above does. For a run that ended without an accusation you know no truth: tell only what the hero did and found (`run_view`), and end where the hero left, without saying who did it.
- **Only facts you hold:** every person, place, clue and event comes from the outcome or the view of the run. Invent none, and explain no gap by something that is not in it. No real names: a story that names one is refused with the paragraph to fix.
- **The hero leaves the case**, as the rules above say; they hold here too.
