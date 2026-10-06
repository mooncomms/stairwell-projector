#!/usr/bin/env bash
# Cross-compile camgrab for the projector (32-bit ARM Android, static musl binary).
# Uses Zig from pip, in a private venv under data/tools (gitignored).
set -euo pipefail
cd "$(dirname "$0")"
V=../../data/tools/venv
[ -x "$V/bin/python" ] || { python3 -m venv "$V" && "$V/bin/pip" install -q ziglang; }
"$V/bin/python" -m ziglang cc -target arm-linux-musleabihf -Os -static -o camgrab-armv7 camgrab.c
echo "built tools/camgrab/camgrab-armv7"
