# 0010. The rules of a case are taught by the generator's prompt, and every code is tied to it

Status: Accepted, 2026-11-06. Amends [0009](0009-scenario-is-a-contract-of-the-archetype.md): the scenario contract has no slot for the rules of the brief.

## Context

The rules of a case were written in three places: as prose in the generator's prompt, as a text in the brief that the generator is given, and as code, in the checks of the validator. Nothing tied them together. The prompt names one of the 64 codes of the detective's issues (`schema`) and teaches the others in prose without saying which; a check can be added that the generator is never told about, and it then learns the rule from a rejection, which costs an attempt.

Measured on the detective's generator (#422): the prompt is 26.7 KB, of which 16 KB is the description of the fields of a case, with the rules written into it field by field and mixed with the craft of writing a clue or a suspect. Only 1.6 KB is a section of rules as such. The brief's text of the rules (about 1 KB) restates that section and ends by sending the generator to its instructions. Every one of the 65 messages of the checks is already written for the generator, in the form of the rule it broke.

Since the case is written in two stages (a frame, then the texts) and a rejection is fixed by a patch, a rule that is learned from a rejection costs little; it need not be taught beforehand to be kept.

## Decision

- **The prompt of an archetype's generator is the one place where the rules of a case are taught.** The host caches a prompt and does not cache the result of a tool. The brief carries the facts of the run (the seed, the theme, the tone, the country, the hero's public data, the attempts left) and no rules, and the scenario contract has no place for them. A rejection says a rule again, in the message of the check that found it.
- **Every code of an archetype's issues is accounted for.** A table in a test, typed by the codes of the archetype, gives each one either a pattern that the prompt must match, or a reason it is left to the rejection. A code that is added without an entry does not compile, so teaching it or leaving it is decided when the check is written.
- **What is taught beforehand is what the rejections say is worth it.** The log of the submissions (#431) shows which codes reject often. A code that does is taught in the prompt; one that rarely does may be left to its message.

## Alternatives rejected

- **Each check exports its rule, and the brief assembles them.** The result of a tool is not cached, so every run would pay for some 64 lines, and the 16 KB that describe the fields would still be in the prompt, because they are not from the checks.
- **The rules as JSON, rendered into the prompt.** Only the fragments of the rules would be data; the prose about the fields and the craft stays written by hand, so the render step and its check of freshness would guard a small part of the prompt.
- **A marker for each rule in the prompt, with a test of the markers.** The markers are noise in a prompt the model reads, and removing them when the plugin is built is a step to keep working. A typed table in a test gives the same guarantee without touching the prompt.

## Consequences

- There is one text of the rules to keep (the prompt), and the messages of the checks, which are written beside the code that gives them. The table in the test ties the two, and the compiler makes sure it is complete.
- A pattern that matches the prompt shows that the rule is mentioned, not that it is taught well. Whether a rule is clear to the generator stays a judgment, and the log shows where it was not.
- The patterns break when the prompt is reworded, as the other tests of the prompt do; a failing one is a reason to look at the wording again.
- Each archetype has its own table, over its own codes and its own prompt. The codes all archetypes share are taught by the shared part of the procedure and need be accounted for once.
- The brief is shorter by the rules and says nothing of them; the generator's first step names what the brief holds.
