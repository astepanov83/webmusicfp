#!/usr/bin/env bash
# Install and start the player as a systemd user service.
#   scripts/install-service.sh            # picks a free port starting at 8421
#   scripts/install-service.sh 9000       # uses port 9000
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="$UNIT_DIR/webmusicfp.service"
REFRESH_UNIT="$UNIT_DIR/webmusicfp-refresh.service"
REFRESH_TIMER="$UNIT_DIR/webmusicfp-refresh.timer"

port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if [[ -n "${1:-}" ]]; then
  PORT="$1"
elif [[ -f "$UNIT" ]] && grep -q '^Environment=PORT=' "$UNIT"; then
  # Re-install: keep the port the service already uses.
  PORT="$(sed -n 's/^Environment=PORT=//p' "$UNIT")"
else
  PORT=8421
  while ! port_free "$PORT"; do PORT=$((PORT + 1)); done
fi

mkdir -p "$UNIT_DIR"
sed -e "s|__DIR__|$DIR|g" -e "s|__PORT__|$PORT|g" -e "s|__NODE__|$NODE|g" \
  "$DIR/webmusicfp.service" > "$UNIT"
sed -e "s|__DIR__|$DIR|g" -e "s|__NODE__|$NODE|g" "$DIR/webmusicfp-refresh.service" > "$REFRESH_UNIT"
cp "$DIR/webmusicfp-refresh.timer" "$REFRESH_TIMER"

# First scrape, so the page has something to show.
[[ -f "$DIR/public/episodes.json" ]] || "$NODE" "$DIR/scripts/refresh.js"

systemctl --user daemon-reload
systemctl --user enable --now webmusicfp.service
systemctl --user restart webmusicfp.service
systemctl --user enable --now webmusicfp-refresh.timer

echo "webmusicfp is running on http://127.0.0.1:$PORT"
echo "unit: $UNIT"
echo "logs: journalctl --user -u webmusicfp -f"
echo "refresh timer: systemctl --user list-timers webmusicfp-refresh.timer"
