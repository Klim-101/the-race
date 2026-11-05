# 0008. How the real names of the day are taken from headlines

Status: Accepted, 2026-11-05

## Context

[ADR 0004](0004-full-mirror-world.md) says the engine rejects a real name in a case, and that the names come from the day's headlines. It leaves open how a name is told from a word, and the answer decides whether a case can be written at all.

There is no dictionary of names, by decision: a name is found by how it is written, by `extract-names.ts`. A capitalised word in the middle of a sentence is a name, and so is each part of a run of capitalised words. Played in English on 2026-11-05, this made a case impossible three times in a row, because the real names of the day held ordinary words. The generator reported 89 `real-name` issues in one attempt, every one on a plain word. Run over the live feeds, titles and summaries, four things turned out to put them there:

- **Title Case.** Two English feeds write every word of a headline with a capital, and each word became a name: "as", "at", "newsroom", "independent".
- **A case ending on a Latin name.** A name of five letters or more took up to three letters after it, which suits a Russian case ending ("в Германии") and found "record" in "recording" and "paris" in "parish".
- **Summaries run together.** A feed's summary may join two sentences with no full stop, so "The African National Congress" stood mid-sentence and its parts, "the" among them, were names. The same gave "on" from "On Tuesday", and "die" and "der" from the German feed.
- **Given names and common words in a run.** "Beau Lamarre-Condon" gave "beau", and "National Party" gave "national". Neither points at anyone, and either blocks an ordinary word or an ordinary first name in a case.

A real name that reaches the player is the worse failure, which is why the net was cast wide. But a net that rejects "the" is not a net, it is a wall: every case in English fails, and the check protects nothing because nothing passes.

## Decision

Keep the rule of ADR 0004 and narrow what counts as a name, by how the text is written and by the day's own texts, never by a list of names.

- **A headline in Title Case yields only acronyms.** At least six words after the first, four in five capitalised.
- **A name in Latin letters matches whole words only.** The short ending is kept for names in Cyrillic, and, as an explicit option, where two names of the world are told apart ("Valdmark", "Valdmarks").
- **Function words and the generic heads of names are no name alone:** articles, prepositions and conjunctions of English, German and Spanish, and "agreement", "treaty", "summit" and the like.
- **A person's given name is no name alone.** In a run of up to three words, none of them a function word or a head of an office, the whole name and the last word are names, and the first words are not.
- **A part of a name is dropped when the day's own texts use it as an ordinary word in lower case.** The whole name, and any word that stands capitalised by itself in the middle of a sentence, are always kept: "Berlin", "Putin", "Apple" stay.

What does not change: countries, cities, companies, organisations and the surnames of public figures are real names, and a case that holds one is rejected. The dictionary of the world ([ADR 0007](0007-append-only-world-dictionary.md)) is untouched.

## Alternatives rejected

- **Let single words through and check only a first name with a surname.** A country, a city and a company are single words, and a surname alone names the person. This would let a real Berlin into a case, which is the one thing the check is for.
- **A dictionary of ordinary words.** Large, per language, and a list to keep up; the day's own lower-case words say the same for free, and can never be out of date.
- **Ask the generator to avoid the words.** The reject-and-retry loop spends three attempts and about 50 thousand tokens on each failure, and does not teach a model to avoid "the".
- **Mark sentence ends in the feed text** (a full stop where a tag was). A cleaner cure for the run-together summaries, but it changes the text the seed extractor reads. Not rejected for good; not done here.

## Consequences

- A case in English passes on a day whose feeds are in Title Case or run sentences together. Measured over the live feeds on that day: on the titles of the English feeds the one-word Latin names fell from 238 to 181 with the Title Case rule and the whole-word rule; on the titles and summaries of all the feeds (780 texts) they fell from 1106 to 895 with the given-name and ordinary-word rules, after the function words were out. Sentences written the way a case is no longer held a name.
- **Names are now missed that were caught.** A name that stands only in a Title Case headline, a real name made only of function words, a given name used alone ("Beau"), and the first word of a short run of a place and a thing ("Berlin" of "Berlin Wall", when it stands nowhere else). The generator never sees headlines, only abstract seeds, so the check is a net against it using a real name by chance, and the dictionary and the validator's other checks still stand behind it. This is the price, and it is accepted.
- A German noun is capitalised wherever it stands, so the German feed still puts many words among the names. Most are not English words; the few that are ("art", "all") can still block a case, and the next measure will show whether it matters.
- The check is deterministic and the list is a function of the day's texts: the same texts always give the same names.
- Every rule is a heuristic over how text is written, and a feed that changes its style can break it again. A live check of the feeds against sample English text is worth having, and is not part of this record.
