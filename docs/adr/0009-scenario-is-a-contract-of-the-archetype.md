# 0009. A scenario is a contract of the archetype, and each archetype has its own case generator

Status: Accepted, 2026-11-06. One point amended by [0010](0010-rules-of-a-case-are-taught-by-the-prompt.md): the contract has no place for the rules of the brief.

## Context

The pipeline that makes a case knows the detective by name. `scenario_submit` calls the detective's case schema, its sighting rule, its run constructor and its rules directly; `generator_brief` builds a brief in the words of a detective (a crime type chosen from the news seeds by a table of crimes); the pending record of a run holds a detective hero and a crime type. The generator is one prompt of some 26 KB that is all about one kind of case.

Phase 5 adds the survivor and the trader. Each has a scenario of its own: another schema, other rules of what makes it solvable, another vocabulary for what the news turns into. Without a decision, each would get a pair of tools of its own and a copy of everything around them: the two stages of writing a case, the attempts of each, the patch, the log, the pending record, and the guarantees of [ADR 0003](0003-isolated-generator-blind-narrator.md) that hold around all of it.

The run itself is still the detective's (`DetectiveRunState` is what the saves hold). Making the run general is its own task (#43), and this decision must not wait for it.

## Decision

- **A scenario is a contract of the archetype.** The engine has, beside the definition of an archetype, a contract for what its scenario is, and a registry of them with the same compile-time completeness as the registry of archetypes: an archetype with no scenario does not compile. The contract holds:
  - the schema of the case, and the texts in it (a frame leaves them blank and a patch writes them);
  - the themes its cases may have, and how a theme is chosen from the seeds of the news and the hero;
  - what the engine adds to a case it accepts (for the detective, the clues in which witnesses tell what they saw);
  - the validator, taking the hero and the hidden traits, with its rules profile, and the way it judges a frame;
  - the order in which its issues are shown, and the rules its brief carries;
  - how a run is started from an accepted case.
- **The tools are generic.** `generator_brief` and `scenario_submit` look up the scenario of the hero's archetype and know no archetype themselves. The two stages, the attempts of each, the patch, the pending record and the log are written once, in the server.
- **What is shared is only what no archetype's words are in.** The checks of the texts (real names, language, script, the language of the case), the patch, the reading of a frame, the sorting of issues, and everything of the server above. Random events, the length of a run and the shape of the map stay the detective's until a second archetype shows what is common between them: they speak of suspects, places and days, and a general form drawn from one example would be a guess.
- **Each archetype has its own generator subagent.** Its prompt carries that archetype's schema and craft and nothing else, and the narrator calls the one of the hero's archetype. The tools of every generator are the same two. The name of the detective's generator is not changed until there is a second one.
- **Starting a run is behind the contract and returns the archetype's run.** For now that is the detective's run state, and the saves are not touched; making the run general, and saving a run of another archetype, is the work of #43.
- **The wall stays where ADR 0003 put it.** The generator receives no hidden trait of the hero, and no message of any validator names one; the contract gives a validator the traits and gives a generator nothing of them.

## Alternatives rejected

- **A pair of tools for each archetype.** The staging, the attempts, the pending record and the log would be written again for each, the tool list the narrator may approve would grow with every archetype, and each copy would have to keep the guarantees of ADR 0003 on its own.
- **One generator for every archetype, its archetype part coming in the brief.** The schema and the craft of a case would arrive as the result of a tool, which a host does not cache as it does a prompt, and a long result at the start of every run is paid for in every run. The prompt would also have to say nothing about any one kind of case.
- **One generator prompt that holds every archetype.** Each run would carry the schemas of kinds of case it will not write.
- **Make everything general now: events, length, map.** Three things that belong to the detective would be abstracted from one example, and the abstraction would be wrong when the survivor needed something else.
- **Wait for the general run (#43).** Making a case and starting a run meet at one place, the starting of the run, and that place is a seam of the contract. The generation can be made general behind it.

## Consequences

- A new archetype is a definition, a scenario, a generator prompt and the narrator's sections for it, and needs no change in the tools, the stages, the pending record or the log.
- The part of the generator's procedure that is the same for every archetype (the stages, the patch, the attempts, the final answer) is written again in each prompt, because the plugin is built by copying files and has no way to include one in another. A test of the prompts must hold that part identical in all of them once there are two.
- Until #43, a scenario of another archetype can be judged and accepted but its run cannot be saved. The contract is proved by a test archetype up to the acceptance of its case, not beyond.
- The order of the issues is each archetype's own, as a list. The codes every archetype shares (a case that does not parse, a text still blank, a patch that did not apply, a duplicate id, an unknown reference, a real name, the wrong script or language) are named once, and each archetype's list places them among its own, because the detective's order mixes the two.
- The words of the brief (what a theme is, how it comes from a seed) become the archetype's. The theme of a pending run is a string that the archetype checks.
- Where the rules of a case are written, once, is not decided here (#422). The contract has a place for the rules its brief carries, and until that is decided the detective's are what the brief has now.
- The shape of the contract is drawn from one archetype. It is kept small for that reason, and the second archetype is expected to change it; the change gets its own record.
