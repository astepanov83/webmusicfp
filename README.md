# webmusicfp

A local web player for [musicforprogramming.net](https://musicforprogramming.net).
Episode list, tracklists, resume, track marks, keyboard control. Built to live in
a Rambox tab. Node only, no dependencies, no build step.

![player](docs/screenshot.png)

## Run it

```sh
npm start                # http://127.0.0.1:8421
PORT=9000 npm start      # pick another port
npm test
npm run refresh          # scrape the site into data/episodes.json by hand
```

Environment:

| Variable        | Default                          | Meaning                                  |
| --------------- | -------------------------------- | ---------------------------------------- |
| `PORT`          | `8421`                           | Port to listen on                        |
| `HOST`          | `127.0.0.1`                      | Bind address (`0.0.0.0` for LAN)         |
| `DATA_DIR`      | `./data`                         | Where the episode cache and state live   |
| `REFRESH_HOURS` | `24`                             | Re-check the site when the cache is older |
| `SITE_URL`      | `https://musicforprogramming.net`| Site to scrape                           |

## Run it as a service

```sh
scripts/install-service.sh          # picks the first free port from 8421 up
scripts/install-service.sh 9000     # or choose one
scripts/uninstall-service.sh
```

The install script writes a systemd user unit to `~/.config/systemd/user/webmusicfp.service`,
enables it and starts it. It restarts on failure and comes back after reboot.

```sh
systemctl --user status webmusicfp
journalctl --user -u webmusicfp -f
```

## What the server does

- Scrapes the site into `data/episodes.json`. Every episode page embeds a JSON-like
  object with the mp3 url, duration, date and tracklist. The scrape takes about
  ten seconds for all episodes. It runs on start when the cache is missing or
  older than `REFRESH_HOURS`, then once an hour it checks the age again. The
  refresh button in the page checks for new episodes at once (shift-click
  re-scrapes everything).
- Saves player state to `data/state.json`: last episode, position per episode,
  finished episodes, and track marks.
- `GET /api/episodes`, `GET /api/episodes/:slug`, `POST /api/refresh[?full=1]`,
  `GET|PUT /api/state`, `GET /api/health`.

Audio goes straight from the browser to the mp3 host. The server only hands out
URLs and metadata.

## Track marks

The site does not publish timestamps for the tracks in a mix. So the player lets
you set them: while an episode plays, press `mark` on a track when it starts,
or hit `enter` to stamp the next unmarked track with the current time. Marked
tracks show their time, become clickable, appear as ticks on the seek bar, and
the one that is playing is highlighted. `[` and `]` jump between marks.

## Keyboard

| Key                     | Action                                     |
| ----------------------- | ------------------------------------------ |
| `space`, `k`            | Play / pause                               |
| `←` `→`                 | Back 10 s / forward 30 s                   |
| `shift`+`←` `→`         | Back / forward 5 min                       |
| `j` `l`                 | Back / forward 1 min                       |
| `0` … `9`               | Jump to 0% … 90%                           |
| `[` `]`                 | Previous / next marked track               |
| `enter`                 | Mark the next unmarked track at this time  |
| `p` `n`                 | Previous / next episode                    |
| `↑` `↓`, `m`            | Volume, mute                               |
| `/`                     | Filter episodes (matches tracks too)       |
| `t`, `?`                | Theme, help                                |
