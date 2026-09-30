#!/usr/bin/env bash
# One-time setup on the always-on box. Run from inside the cloned repo, as the normal
# (desktop) user:   ./deploy/install.sh
#  - checks Node (18+) and Chromium/Chrome
#  - installs the server as a systemd *user* service that starts at boot
#  - autostarts the full-screen kiosk browser when the desktop session logs in
#  - opens port 8080 on the local network if ufw is active (phone remote, laptop)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "Checking Node…"
NODE="$(command -v node || true)"
if [ -z "$NODE" ] || [ "$("$NODE" -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Node 18+ is needed. Install Node 22 system-wide (so the service can find it):"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
echo "ok: $NODE ($("$NODE" -v))"

say "Checking the browser…"
if ! command -v chromium >/dev/null && ! command -v chromium-browser >/dev/null && ! command -v google-chrome >/dev/null; then
  echo "Install Chromium or Google Chrome, then run this again (e.g. sudo apt install chromium)."
  exit 1
fi
echo ok

say "Installing the server service…"
mkdir -p ~/.config/systemd/user
sed -e "s#^WorkingDirectory=.*#WorkingDirectory=$REPO#" \
    -e "s#^ExecStart=.*#ExecStart=$NODE server/index.js#" \
    "$REPO/deploy/stairwall.service" > ~/.config/systemd/user/stairwall.service
systemctl --user daemon-reload
systemctl --user enable --now stairwall
echo "Starting it at boot, even before anyone logs in, needs lingering (asks for your password):"
sudo loginctl enable-linger "$USER"

say "Autostarting the kiosk browser at login…"
chmod +x "$REPO/deploy/kiosk.sh" "$REPO/deploy/update.sh"
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/stairwall.desktop <<EOF
[Desktop Entry]
Type=Application
Name=stairwall kiosk
Exec=$REPO/deploy/kiosk.sh
X-GNOME-Autostart-enabled=true
EOF
echo ok

if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  say "Opening port 8080 to the local network…"
  sudo ufw allow from 192.168.0.0/16 to any port 8080 proto tcp
fi

say "Done."
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "Server:  http://localhost:8080   Phone remote:  http://${IP:-<this-box>}:8080/remote  (or http://$(hostname).local:8080/remote)"
echo "Still to do by hand (see README → 'The always-on box'): auto-login to the desktop,"
echo "no screen blanking/sleep, and copying data/calibration.json + media/ from the old machine."
