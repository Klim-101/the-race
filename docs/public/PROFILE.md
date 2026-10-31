# The profile

The profile is the player's tally across runs: how many runs, how many solved, how each of the others ended, days and clues over all of them, the longest case and the streak of wins. It is **one local file** and nothing else: no account, no server, no telemetry, and nothing in it ever leaves the machine.

## What is stored

`profile/profile.json` in the game folder (`RACE_PROFILE_DIR` overrides it) holds one small **record** for each run that is over, and nothing is counted in it. A record has the hero (name, background, situation, signal), the case title, how the run ended and the reason, the day it ended on, and a few numbers of play (turns, minutes, clues found, conclusions drawn, traits shown). It never holds the case, its truth or the run's log.

Every number the player sees is computed from the records, so:

- a new number is a new function over the same records and needs no migration of counters;
- the profile can be thrown away and rebuilt from its records;
- a run has one record, keyed by its seed, so ending the same run twice or importing it twice adds nothing.

A record is written when a run ends (an accusation, the end of the days, a breakdown, or giving up). If it cannot be written, the turn that ended the run still counts and the next run that ends writes its own.

## Moving it

The only ways in and out are two files the player carries by hand: `profile_export` writes `export.json` in the profile folder, and `profile_import` takes an `import.json` put there (an `export.json` from another machine, renamed). Importing adds only the runs the profile does not have.

## What the narrator does with it

After the closing scene of a run, the narrator calls `profile_view` and says one line of the tally. It is the player's own data and may be said plainly.
