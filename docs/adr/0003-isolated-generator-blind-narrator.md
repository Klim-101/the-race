# 0003. The case generator is isolated and the narrator never sees the truth

Status: Accepted, 2026-10-29

## Context

A detective case has a secret: who did it, why, and how. If the agent that tells the story also knows the secret, it can let it slip, or tilt the story to please the player, even without meaning to. A case must also be solvable by the hero who plays it, which a model cannot be trusted to guarantee on its own.

## Decision

- **The case is generated in a separate context.** A subagent builds the case and submits it straight to the engine. The engine validates it, and the sealed truth stays in the engine, committed by a hash.
- **The narrator gets the public view only.** It reads what the player can see through typed tools: places, known clues, spoken lines. It does not know who the culprit is.
- **The engine validates before the run starts.** Every location is reachable, every lie can be broken, there are at least two independent ways to solve the case, and no real names appear. Errors go back to the generator, for at most three attempts.
- **Hidden traits stay behind the same wall.** The validator takes the hero's traits into account, but neither the generator nor the narrator receives them, and no validator message may name one. The narrator voices a trait only after the engine has revealed it.

## Alternatives rejected

- **One agent generates and narrates.** It knows the truth at every turn. Asking it to keep a secret is a promise, not a guarantee.
- **Trust the generated case without validation.** Unsolvable cases would reach the player.

## Consequences

- A narrator cannot give away the culprit, because it does not have the information.
- A run costs one extra subagent invocation and up to three validation rounds, in exchange for a case that is known to be solvable.
- Whether a host can isolate a subagent this way is a requirement on the host, to be checked for each one.
- A generator that is rejected repeatedly could in principle infer from the pattern that a trait is at work. Three attempts bound this, and it is accepted.
