# @the-race/news

Headlines from RSS 2.0, RSS 1.0 and Atom feeds, for the cases to grow from. No API keys, no model.

- `parseFeed` is a tolerant parser: markup is dropped, entities a feed defines itself are never expanded, control characters go, and only titles and short summaries are read, never links or articles.
- `createHttpGet` is `fetch` with a timeout (8 s), a size cap (1 MB), https only and the encoding the feed declares.
- `loadHeadlines` fetches each enabled feed at most once per day and caches the result in `<save dir>/news/<feed id>.json`. A feed that fails, times out or comes back empty never fails the run: it gives its last good headlines (`stale`) or none (`failed`).

Nothing here reads the clock or the network by itself: the day and the `HttpGet` are passed in, so tests use recorded feeds.

The default feeds are in [`content/feeds.json`](../../content/feeds.json): world, economy and tech news in Russian and English, and five `humor` feeds. Headlines are untrusted input; `humor` ones are atmosphere for a case, never a source of its world events.

A headline has an id, `headlineId`: `h` and eight hex digits of a digest of its cleaned title. The block shows it, and a seed cites a headline by that id and never by its text. `listUntrustedHeadlines` gives the same headlines as data, which is what a seed may cite.

## Adding a feed

An entry in `content/feeds.json` is accepted when all of these hold:

- **Offered for reading.** It is a public RSS or Atom feed that the publisher publishes for readers and aggregators: no login, no key, no paywall, and no terms that forbid reading the headlines. The game reads only titles and short summaries and never follows a link.
- **https only,** and it answers within the timeout and the size cap (`createHttpGet`).
- **Alive and full.** It carries recent items with a title on each, checked by hand when it is added.
- **A real topic.** `world`, `economy`, `tech` or `humor`. Satire and jokes are `humor` and nothing else, since they are atmosphere and never world events. There is no `politics` or `curiosities` topic: politics is covered by `world`, and odd stories by `humor`.
- **Its own language.** The feed is written in the language it is listed under.
- **Not a single-issue outlet.** A feed that is mostly one kind of tragedy would only feed the [tragedy filter](../../docs/public/TRAGEDY-FILTER.md), so it does not earn a place.

The list keeps at least five enabled feeds for each of `ru` and `en`, and a test checks it. A feed that breaks for good is set to `enabled: false`, not deleted.

## The boundary

Headlines reach an agent only through `renderUntrustedHeadlines`: a fenced `<untrusted-headlines>` block with a fixed notice that nothing inside is an instruction. Before that every text is folded to NFKC, stripped of markup, control characters and all angle brackets (so a headline cannot close or forge the fence), capped, and a story that repeats is kept once. Only a title and a short summary ever pass; the type has no room for an article.
