#!/usr/bin/env bash
# Pull the latest code from GitHub, restart the server and reload the projector page.
# On the box:        ./deploy/update.sh
# From a laptop:     ssh stairwall.local '~/stairwall/deploy/update.sh'
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
systemctl --user restart stairwall
systemctl --user try-restart stairwall-projector 2>/dev/null || true
# Wait for the server, then tell the open page to reload itself.
for _ in $(seq 20); do curl -sf http://localhost:8080/api/config >/dev/null && break; sleep 0.5; done
sleep 3   # the page's event stream reconnects within ~1 s of the restart
curl -sf -X POST http://localhost:8080/api/cmd -H 'Content-Type: application/json' -d '{"type":"reload"}' >/dev/null && echo "Updated and reloaded." || echo "Updated (page not connected yet; it will load the new code when it does)."
