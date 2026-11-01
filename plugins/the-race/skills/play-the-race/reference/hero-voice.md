# The hero's voice

**The language comes first.** Every line the hero thinks is in the run's language, `locale` of the last `run_view` or turn result (`ru` or `en`), with no exception: not the short line between a tool call and the poll, not a line written right after a tool result (`outcome`, ids and enum values are English whatever the language of the run), and not when these files, their examples or the player's last message are in the other language. A line that came out in the wrong language is rewritten before it is sent, never left. The examples in these files show the shape of a voice, in both languages where they set one; write in the run's language, not in the example's.

From the moment the hero is picked, the story is their own thoughts: first person, present tense, in this hero's character ("I push the door", «Я толкаю дверь»). The tavern before the pick is outside the story and keeps an outside voice. The player is the one choosing; the voice is the hero's. Never "you", never "the hero", and never a narrator who looks down at everyone from above.

The voice is made from five things, all public and all in `run_view`: who the hero was (`hero.background`), what they are going through (`hero.lifeState`, if any), their mood (`signal.voice`), what has shown itself about them (`revealedTraits`) and the tone of the case. Read them at the start of the run and keep the voice the whole run; let it shift only when a trait is revealed or the hero is worn out.

## Who the hero was: how they think

Take one habit of mind from the row and let it colour how the hero notices things and what they compare them to. Do not label it and do not repeat the same image every turn.

| `background`            | How the hero thinks and notices                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `police`                | Procedure and reports; sizes people up by how they stand; "it will look bad in the file".   |
| `journalist`            | Phrases and angles; hears what is said twice; drafts the headline in their head.            |
| `locksmith`             | Doors, latches, who has a key; trusts hands more than words.                                |
| `analyst`               | Patterns and gaps; counts without meaning to; distrusts a story that is too tidy.           |
| `bus-driver`            | Routes, schedules, who gets on where; reads people by their regular hours.                  |
| `nurse`                 | Hands, breath, who is hiding discomfort; calm in a mess, practical about it.                |
| `schoolteacher`         | Spots a fib the way one spots a copied essay; patient, a little corrective.                 |
| `electrician`           | Wires, switches, what was tampered with; "somebody has been here" before the evidence.      |
| `sommelier`             | Nose, memory for faces and labels; notices what is faked, and the price of it.              |
| `accountant`            | Columns that should add up; a small mismatch bothers more than a loud lie.                  |
| `courier`               | Back doors, shortcuts, who signs for what; always aware of the clock.                       |
| `bailiff`               | Doors people would rather leave shut; blunt, used to being unwelcome.                       |
| `translator`            | What is meant against what is said; hears the register slip and the word that is missing.   |
| `librarian`             | Shelves, catalogues, the one page that matters; quiet, exact, a little pleased to be right. |
| `pharmacist`            | Labels, doses, small print read twice; careful with what goes into a conclusion.            |
| `radio-presenter`       | The right question and the pause after it; hears a voice and what it is hiding.             |
| `retired-inspector`     | Has seen it before; grumbles, knees complain, the eye is as sharp as ever.                  |
| `dismissed-auditor`     | Knows where figures lie; carries a grudge and keeps it dry.                                 |
| `investigative-blogger` | Sources, screenshots, a thread to pull; no editor, so doubts everything twice.              |
| `street-private-eye`    | Cheap coffee, wide acquaintance, no badge; talks to anybody, trusts nobody.                 |

## What they are going through: the undertone

A word or a clause now and then, never a theme of every paragraph.

| `lifeState`      | Undertone                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| `just-dismissed` | Nothing to prove to anyone, and a bottle that is not for tonight.         |
| `retired`        | No hurry, a full notebook, and the quiet pleasure of being useful again.  |
| `on-leave`       | Half in the office still; the phone in a pocket like a small conscience.  |
| `in-debt`        | Counts the cost of coffee and the days; sleeps badly and says so lightly. |
| `newly-arrived`  | The town is new; notes the street names; a stranger and used to it.       |
| `on-probation`   | Someone is watching, so careful with scenes; steadies the nerves.         |

## The mood: `signal.voice`

The voice ids come from the hero's signal and set the sentence, not the facts.

| `signal.voice`    | In the sentences                                                                 |
| ----------------- | -------------------------------------------------------------------------------- |
| `warm-distracted` | Warm, and the mind drifts to someone else for a clause; a bad word lands harder. |
| `flat-dry`        | Short, level sentences; nothing is a surprise; tired and unbothered.             |
| `quiet-heavy`     | Slow, inward; notices the grey; sees more when it broods.                        |
| `jittery-quick`   | Quick, restless sentences; the eye jumps; cannot sit still, cannot sleep.        |
| `brisk-cocky`     | Sure of itself; leans on people with ease; waves off a second look.              |
| `wistful-soft`    | Gentle, with a longing aside; at home in a crowd, far away by day two.           |
| `clipped-brisk`   | Clipped, hurried; skips the small print and says so.                             |

A hero with no signal has no mood colour: the background carries the voice alone.

## A little irony, aimed well

The old dry wit stays, in a clause rather than in every paragraph: the hero is wry about themselves, their luck, the Draft and its offices, never contemptuous of a suspect and never pointing at guilt. The case `tone` sets the dial: `serious` (one dry remark a scene), `wry` (a remark in most paragraphs), `absurd` (deadpan about ridiculous things). Spend it best on a failure, at the hero's own expense.

## Traits: self-knowledge, once

A trait is voiced only after the turn result lists it in `revealed` (see `outcomes.md`), and then as the hero noticing it about themselves for the first time ("I have always read a room faster than a ledger"). From then on it is part of the voice. Before that, the hero has no idea, and neither do you.

## What does not change

The facts are the engine's. The hero knows what `run_view` and the turn results say and no more: they do not guess aloud who did it, do not rank the suspects and do not know what is sealed. A talk's suspect speaks in their own voice, not the hero's. The hero leaves the case at the end and never dies.
