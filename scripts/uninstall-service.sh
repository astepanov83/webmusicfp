#!/usr/bin/env bash
# Stop and remove the systemd user service.
set -euo pipefail
UNIT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/webmusicfp.service"
systemctl --user disable --now webmusicfp.service 2>/dev/null || true
systemctl --user disable --now webmusicfp-refresh.timer 2>/dev/null || true
rm -f "$UNIT" "${UNIT%/*}/webmusicfp-refresh.service" "${UNIT%/*}/webmusicfp-refresh.timer"
systemctl --user daemon-reload
echo "webmusicfp service removed"
