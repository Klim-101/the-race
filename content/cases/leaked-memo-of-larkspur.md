# The Leaked Memo of Larkspur (spoilers)

Financial crime (market manipulation and a forged memo), wry. Files: `leaked-memo-of-larkspur.en.json`, `leaked-memo-of-larkspur.ru.json`.

## Solution

Ottoline Vance (`investor-relations`), head of investor relations at the Larkspur Tea Company, forged a "recall" memo at her desk machine IR-04, printed it on old letterhead and slipped it under the press room door at minute 420 (07:00). When the shares fell, a shell company registered at her family's teahouse, Fennel Gate Holdings, bought 400,000 shares at the bottom. She needed the money for the teahouse mortgage due on Friday.

Motive deduction: `motive-mortgage` (`mortgage-notice` + `trade-ledger`).

## Evidence chains

| Chain | Clues                                                              | Skills                |
| ----- | ------------------------------------------------------------------ | --------------------- |
| A     | `paper-stock` (print shop), `trade-ledger` (records vault)         | perception, reasoning |
| B     | `journalist-source` (press room), `broker-gossip` (exchange floor) | social, contacts      |
| C     | `memo-metadata` (press room), `clerk-confession` (teahouse)        | tech, pressure        |

The records vault needs `vault-pass`, found by looking at the headquarters. `deleted-draft` (tech 12) and `mortgage-notice` (reasoning) are extra proof outside the chains; the draft sits in the server room, behind a tech check of 12.

## Red herrings

- `big-short-slip` points at the trader Fenwick Lowe, whose short order was a client's hedge.
- `pigeon-receipt` points at the finance director Barnaby Fitch, who was gambling on racing pigeons at the board dinner.
- `champagne-bill` points at the reporter Rosamund Ashby, who was celebrating a bonus.

## Lies

Each suspect has one lie. The culprit's "I never saw that memo" is broken by `memo-metadata`, `paper-stock` or `deleted-draft`.

## Routes by hero

- Former auditor (reasoning, perception): chain A, with the motive from `mortgage-notice`.
- Street private eye (social, contacts): chain B.
- Investigative blogger (tech, pressure): chain C.

Scenes: the exchange floor is a `crowd`, the records vault is a `confined-space`, the metadata and the server room are `digital-evidence`, and the ledger and the notice are `financial-documents`. No clue depends on police data. All difficulties are at most 12.
