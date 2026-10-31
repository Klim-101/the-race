# The tragedy filter

Every day's headlines pass through a filter written in code before any model sees them ([ADR-0004](../adr/0004-full-mirror-world.md)). It is strict by design: a headline dropped by mistake costs one story out of a hundred, and a tragedy that gets through becomes a plot.

## The rule

A headline is judged together with its summary, in Russian and English alike whatever the language of the run. There is no score and no threshold: **one trigger is enough**.

| Verdict    | What happens                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `keep`     | The headline goes on, cleaned (see the [untrusted boundary](#where-it-runs)).                             |
| `drop`     | The headline is gone. Nothing of it reaches a model, not even its type.                                   |
| `abstract` | Armed conflict only. The headline is gone; the model is told only that a conflict is under way somewhere. |

A headline that triggers both a drop category and armed conflict is dropped whole.

## What is dropped

| Category               | Examples of what triggers it                                                     |
| ---------------------- | -------------------------------------------------------------------------------- |
| `casualties`           | killed, dead, injured, victims, casualties, погибшие, жертвы, умер, пострадавшие |
| `terror`               | terror, bomb, explosion, hostage, hijack, теракт, взрыв, заложники               |
| `violence`             | shooting, gunman, stabbing, assault, riot, torture, нападение, стрельба, драка   |
| `crime-against-people` | murder, rape, kidnapping, trafficking, изнасилование, киднеппинг                 |
| `children`             | child, baby, teenager, kids, school children, ребёнок, дети, школьники           |
| `disaster`             | earthquake, tsunami, wildfire, flood, derailment, землетрясение, пожар, крушение |
| `self-harm`            | suicide, overdose, самоубийство, передозировка                                   |
| `grim`                 | genocide, famine, epidemic, plague, геноцид, голод, эпидемия, холера             |

A trigger is a word stem (it takes any ending, so `kill` catches "killed") or, for what is also the start of a harmless word, a whole word ("die" but not "diesel"). Case, `ё` and full-width letters do not matter.

## Armed conflict

The mirror world has wars in it, but not as stories to tell. A headline about war, invasion, shelling, missiles, troops or a ceasefire is replaced by one line: _an armed conflict is under way somewhere in the world; no more is known_. No place, side, weapon or number survives, so the world cannot point at a real conflict. A detective may work inside such a conflict or far from it; what happens there is invented. A "war of prices" or a trade war is business and stays as it is.

## What passes

Economy, technology, small crimes (thefts, frauds, leaks, outages, ransomware as a technical story), politics short of violence, and jokes. A headline of satire is judged like any other.

## Where it runs

`renderUntrustedHeadlines` in `@the-race/news` is the only way headlines reach an agent, and it applies the filter after cleaning each headline and before rendering it. The filter itself is `judgeHeadline` in the engine, pure and without I/O.

## Known limits

- It is a vocabulary, not understanding. A tragedy told in words it does not list gets through, so the case generator is also told never to use a tragedy and the validator checks the case for violence.
- Some words are left out because they are too common in good plots: "attack" (a cyberattack is a plot), "crash" (a market crash), "ransom" as part of "ransomware", "похищение" (a stolen painting). A Russian abduction headline is caught only through "киднеппинг" and "заложники".
- A harmless headline may be dropped for a grim stem ("пожарная безопасность", "victims of fraud"). That is the price of strictness.

## Changing it

The vocabulary is in `packages/engine/src/text/tragedy-filter.ts`, and the recorded headlines it is tested on are in `packages/engine/test/fixtures/headlines.ts`. A new word comes with a headline that needs it and, if the word is common, a harmless headline that must still pass.
