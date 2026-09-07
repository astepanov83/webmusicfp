# webmusicfp design

A local web player for musicforprogramming.net. Runs on Node with no
dependencies and no build step. Opened as a tab in Rambox.

## What the site gives us

- `GET /latest` returns HTML with a hidden nav that lists every episode slug
  (`one`, `two`, ... `seventynine`).
- Every episode page embeds a `__SAPPER__` object with one `entry`:
  slug, order, title, file (mp3 url), filesize, duration, timestamp,
  tracklist (lines split by `<br>`), links (html).
- Tracklists have no timestamps.
- The mp3 host (datashat.net) answers range requests and allows any origin,
  so the browser can play and seek the file directly.

## Server

`server.js` starts an http server. `lib/app.js` is the request handler.

Endpoints:

- `GET /` and static files from `public/`.
- `GET /api/episodes` - the cached catalog: `{ fetchedAt, episodes: [...] }`,
  newest first.
- `POST /api/refresh` - re-scrape the episode list and any episodes not yet
  cached. `?full=1` re-scrapes everything.
- `GET /api/state` and `PUT /api/state` - player state saved in
  `data/state.json`: last episode, playback position per episode, finished
  episodes, and track start marks per episode.
- `GET /api/health`.

Episode shape:

```json
{
  "slug": "seventynine", "number": 79, "title": "79: Corticyte",
  "artist": "Corticyte", "url": "https://datashat.net/...mp3",
  "bytes": 441077163, "duration": 14400, "durationText": "4:00:00",
  "date": "2026-08-24T17:18:00Z",
  "tracks": [{ "artist": "Thomas Köner", "title": "Untitled", "line": "Thomas Köner - Untitled" }],
  "links": ["https://www.instagram.com/corticyte/"]
}
```

## Scraper and cache

`lib/scrape.js` has pure parsers: `parseSlugs(html)`, `parseEntry(html)`,
`parseTracklist(text)`, `parseDuration(text)`. The `__SAPPER__` literal is
JavaScript, not JSON, so it is evaluated inside `node:vm` with a timeout and
only the `entry` object is kept.

`lib/catalog.js` owns `data/episodes.json`. On start it loads the file and
serves it at once. If the file is missing or older than `REFRESH_HOURS`
(default 24) it refreshes in the background. Refresh fetches the slug list,
then fetches missing episodes with a small concurrency limit. Episodes never
change once published, so incremental refresh only fetches new slugs.

## Client

Plain HTML, CSS and JS in `public/`. Layout:

- Left pane: episode list with a filter box. Each row shows number, artist,
  duration, and a progress indicator (unplayed, partly played, finished).
- Right pane: the selected episode with its tracklist and links.
- Bottom bar: play/pause, previous/next episode, skip back 10s and forward
  30s, seek bar with buffered range and hover time, elapsed/remaining time,
  speed, volume, sleep timer.

Within-episode navigation:

- Seek bar, arrow key seeking, and number keys 0-9 jump to 0%-90%.
- Track marks. Each track row has a "mark" button that stores the current
  time as that track's start. Marked tracks show their time and become
  clickable to jump. The track whose mark is the last one before the
  current time is highlighted as "now playing".

Persistence: position saved every few seconds and on pause to the server.
Reopening the page restores the last episode and offers resume.
Volume, speed and theme live in localStorage.

Media Session API exposes title and artwork to the OS and media keys.

## Testing

`node --test`. Parsers are tested against saved HTML fixtures. The app
handler is tested with a fake fetch and a temp data folder.

## Service

`scripts/install-service.sh` installs a systemd user unit, like the
sibling `webplayer` project. Default port 8421.
