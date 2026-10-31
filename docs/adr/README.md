# Architecture decision records

Decisions that are hard to reverse, written down with the reasons, so that nobody has to guess why the project is the way it is. A record is never edited to change history: a new decision gets a new record that supersedes the old one.

| #                                                         | Decision                                                                              | Status   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| [0001](0001-no-model-calls.md)                            | No model calls from the code; the player's subscription pays                          | Accepted |
| [0002](0002-engine-owns-the-truth.md)                     | The engine owns dice, state, truth and verdict; the agent narrates                    | Accepted |
| [0003](0003-isolated-generator-blind-narrator.md)         | The case generator is isolated and the narrator never sees the truth                  | Accepted |
| [0004](0004-full-mirror-world.md)                         | A full mirror world: real names never reach the player                                | Accepted |
| [0005](0005-json-is-canonical.md)                         | JSON is canonical; Markdown and HTML are rendered from it                             | Accepted |
| [0006](0006-keeping-the-narrator-blind-in-claude-code.md) | Keeping the narrator blind in Claude Code: saves outside the project and a guard hook | Accepted |
| [0007](0007-append-only-world-dictionary.md)              | The world dictionary is local and append-only                                         | Accepted |

## Format

Each record has a status, the context that forced the decision, the decision itself, the alternatives that were rejected and the consequences, good and bad. Copy the structure of an existing record and take the next number.
