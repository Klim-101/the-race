# The Weigh-Master of Brindle (spoilers)

An attempt on someone (the form `homicide`, fate `attempt`), serious. Files: `weigh-master-of-brindle.en.json`, `weigh-master-of-brindle.ru.json`. It is told off screen and without relish: the victim lives, and the case is about what the hero understands.

## Solution

Edmund Harl (`factor`), the grain factor, sold light measure for three harvests on false weights. The weigh-master, Orsolya Pike, found them and meant to read them out at the assize. At ten past two he let himself into the weighing house with a spare tally key bought from the clerk for a week of wages, and brought the brass counterweight of the big scale down on her from behind. He rinsed it at the chapel square and hid it under the sacks in his corn store. Orsolya lives and lies in the infirmary ward, where visitors are let in from 14:00 to 18:00.

Motive deduction: `motive-false-weights` (`scale-hatch` + `debt-rumour`).
Means deduction: `means-counterweight` (`empty-pan` + `surgeon-report`): the blow came from something heavy with a round edge, and the big scale lost its counterweight that night.

## Evidence chains

Three independent chains, each enough to name the culprit, each on different skills:

| Chain | Clues                                                   | Skills                                                              |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| A     | `empty-pan`, `green-ink` (counting room), `scale-hatch` | perception (the counting room needs `ledger-key`, found by looking) |
| B     | `nightwatch-witness` (tea shop), `debt-rumour` (store)  | social, contacts                                                    |
| C     | `tally-lock`, `clerk-confession` (scale cellar)         | tech, pressure                                                      |

`surgeon-report` is a report: it arrives by itself on the second morning (minute 1700 from midnight of day 1), at the hero's next turn, and names no one.

## Red herrings

- `threat-note` and `dust-boots` point at the carter Bram Hollis. The note is spite and the prints are his, from trying to take it down.
- `flour-glove` points at the miller Tobias Wren, who merely sleeps in his office on assize eves.

## Lies

Each suspect has one lie broken by clues, for example the factor's night alibi is broken by `tally-lock`, `nightwatch-witness` and the sighting of the road sweeper.

## The victim and the hours

The weigh-master is a witness in the ward (`victim: true`), who did not see who did it: the engine cuts what she saw, so the factor is never among it. The ward keeps visiting hours (afternoon), so the hero has to come at the right time. Two suspects stood at the scene in the timeline (the factor and the clerk, who fetched her shawl at ten to two).

## Routes by hero

- Former auditor (reasoning, perception): chain A.
- Street private eye (social, contacts): chain B, plus the miller's office.
- Investigative blogger (tech, pressure): chain C.

Scenes: the yard is a `crowd`, the scale cellar is a `confined-space`, `tally-lock` is `digital-evidence`. One empty part of the yard has a trace, and Mill Road has litter. No clue depends on police data, so no trait locks a route out. All difficulties are at most 12.
