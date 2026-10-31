# @the-race/news

Headlines from RSS 2.0, RSS 1.0 and Atom feeds, for the cases to grow from. No API keys, no model.

- `parseFeed` is a tolerant parser: markup is dropped, entities a feed defines itself are never expanded, control characters go, and only titles and short summaries are read, never links or articles.
- `createHttpGet` is `fetch` with a timeout (8 s), a size cap (1 MB), https only and the encoding the feed declares.
- `loadHeadlines` fetches each enabled feed at most once per day and caches the result in `<save dir>/news/<feed id>.json`. A feed that fails, times out or comes back empty never fails the run: it gives its last good headlines (`stale`) or none (`failed`).

Nothing here reads the clock or the network by itself: the day and the `HttpGet` are passed in, so tests use recorded feeds.

The default feeds are in [`content/feeds.json`](../../content/feeds.json): world, economy and tech news in Russian and English, and five `humor` feeds. Headlines are untrusted input; `humor` ones are atmosphere for a case, never a source of its world events.
