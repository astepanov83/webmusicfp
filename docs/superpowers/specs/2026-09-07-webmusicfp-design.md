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

`server.js` is a static file server for `public/`. There is no API.

## Scraper

`lib/scrape.js` has pure parsers: `parseSlugs(html)`, `parseEntry(html)`,
`parseTracklist(text)`, `parseDuration(text)`. The `__SAPPER__` literal is
JavaScript, not JSON, so it is evaluated inside `node:vm` with a timeout and
only the `entry` object is kept.

`lib/catalog.js` reads and writes `public/episodes.json`. `scripts/refresh.js`
runs it from the command line and from a daily systemd timer. Episodes never
change once published, so a refresh only fetches new slugs.

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

## Client

Plain HTML, CSS and JS in `public/`. Layout:

- Left pane: episode list with a filter box. Each row shows number, artist,
  duration, and a progress indicator (unplayed, partly played, finished).
- Right pane: the selected episode with its tracklist and links.
- Bottom bar: previous/next track, skip back 10s and forward 30s, play/pause,
  a next/random toggle for what plays after an episode, seek bar with buffered
  range and hover time, elapsed/remaining time, volume.

Within-episode navigation:

- Seek bar, arrow key seeking, and number keys 0-9 jump to 0%-90%.
- Track positions are approximate. The site publishes no timestamps, so the
  tracks are spread evenly over the file. Clicking a track or pressing
  prev/next jumps between them.

Persistence: everything lives in localStorage. Position is saved every few
seconds and on pause. Reopening the page restores the last episode and offers
resume.

Media Session API exposes title and artwork to the OS and media keys.

## Testing

`node --test`. Parsers are tested against saved HTML fixtures, the catalog
with a fake fetch and a temp file, the static server over http.

## Service

`scripts/install-service.sh` installs a systemd user unit, like the
sibling `webplayer` project. Default port 8421.
