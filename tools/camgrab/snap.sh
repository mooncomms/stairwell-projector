#!/usr/bin/env bash
# Take a picture with the projector's built-in camera, over USB debugging.
#   tools/camgrab/snap.sh out.png        (needs adb; ADB=... to use another one)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ADB="${ADB:-adb}"
out="${1:-snap.png}"
"$ADB" push "$here/camgrab-armv7" /data/local/tmp/camgrab >/dev/null
"$ADB" shell 'chmod 755 /data/local/tmp/camgrab && /data/local/tmp/camgrab /dev/video0 grab /data/local/tmp/snap.yuv 640 480 20' >&2
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
"$ADB" pull /data/local/tmp/snap.yuv "$tmp/snap.yuv" >/dev/null
python3 "$here/yuyv2png.py" "$tmp/snap.yuv" "$out" 640 480
echo "saved $out"
