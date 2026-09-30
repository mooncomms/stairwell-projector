#!/usr/bin/env bash
# Full-screen Chromium on the projector output. Run from your desktop session's autostart
# (e.g. ~/.config/autostart/stairwall.desktop with Exec=/home/<you>/stairwall/deploy/kiosk.sh).
set -euo pipefail
URL="${STAIRWALL_URL:-http://localhost:8080/}"

# Wait for the server.
until curl -sf "$URL" >/dev/null; do sleep 1; done

# No screen blanking / power saving on the projector output (X11).
command -v xset >/dev/null && { xset s off; xset -dpms; xset s noblank; } || true

BROWSER=$(command -v chromium || command -v chromium-browser || command -v google-chrome)
exec "$BROWSER" \
  --kiosk "$URL" \
  --noerrdialogs --disable-infobars --no-first-run \
  --disable-session-crashed-bubble --disable-features=Translate \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --ignore-gpu-blocklist --enable-gpu-rasterization
