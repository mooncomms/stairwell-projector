#!/usr/bin/env bash
# Control the projector (Magcubic HY320 / Allwinner Android) over its USB debugging link.
# The projector's USB port must be connected to this box with a USB-A to USB-A data
# cable, with USB debugging on, and this box allowed once ("Always allow" on screen).
#
#   projector.sh hdmi     switch the projector to its HDMI input
#   projector.sh off      shut the projector down (as its power button does)
#   projector.sh status   is it connected, and what's on screen
#   projector.sh watch    keep running: each time the projector boots, switch it to HDMI
#
# Set PROJECTOR_SERIAL if more than one Android device is ever connected.
set -uo pipefail
ADB=$(command -v adb || true)
[ -z "$ADB" ] && { echo "projector: adb not installed (sudo apt install adb)" >&2; exit 1; }
adb() { "$ADB" ${PROJECTOR_SERIAL:+-s "$PROJECTOR_SERIAL"} "$@"; }
sh_() { timeout 15 adb shell "$@" 2>/dev/null | tr -d '\r'; }
connected() { [ "$(adb get-state 2>/dev/null)" = device ]; }
booted() { [ "$(sh_ getprop sys.boot_completed)" = 1 ]; }

hdmi() {
  # The projector's live-TV app opens the last-used HDMI source (persist.sys.hdmisource).
  # With "force", restart it so it re-tunes (it can get stuck on "no signal" if it was
  # opened while this box was still starting up its display).
  sh_ am start ${1:+-S} -n com.softwinner.awlivetv/.MainActivity >/dev/null && echo "projector: HDMI${1:+ (re-tuned)}"
}
# Is the wall page up on this box (so HDMI is really carrying a picture)?
# (Captured first: with pipefail, curl cut off by timeout would fail a pipeline.)
page_up() { local s; s=$(timeout 2 curl -s -N "http://localhost:${PORT:-8080}/api/events" 2>/dev/null); [[ $s == *'"scene"'* ]]; }

case "${1:-status}" in
  hdmi)
    connected || { echo "projector: not connected" >&2; exit 1; }
    hdmi ;;
  off)
    connected || { echo "projector: not connected (already off?)"; exit 0; }
    # The power key opens a shutdown dialog with Shutdown already selected (it would
    # count down by itself); confirm it straight away.
    sh_ input keyevent KEYCODE_POWER >/dev/null
    sleep 1
    sh_ input keyevent KEYCODE_ENTER >/dev/null
    echo "projector: shutting down" ;;
  status)
    if connected; then
      echo "projector: connected, booted=$(booted && echo yes || echo no)"
      sh_ dumpsys activity activities | grep -m1 topResumedActivity | sed 's/^ */on screen: /'
    else echo "projector: not connected"; fi ;;
  watch)
    # Once per projector boot (so its menus stay usable afterwards): switch to HDMI, then,
    # once the wall page is up here, re-tune once so a "no signal" from startup clears.
    last="" retuned=""
    while true; do
      if connected && booted; then
        id=$(sh_ cat /proc/sys/kernel/random/boot_id)
        if [ -n "$id" ] && [ "$id" != "$last" ]; then
          sleep 4      # let its launcher settle first
          hdmi && last="$id" && since=$(date +%s)
        elif [ -n "$last" ] && [ "$retuned" != "$last" ]; then
          if page_up; then sleep 5; hdmi force; retuned="$last"
          elif [ $(( $(date +%s) - since )) -gt 600 ]; then retuned="$last"   # give up after 10 min
          fi
        fi
      fi
      sleep 5
    done ;;
  *) echo "usage: $0 hdmi|off|status|watch" >&2; exit 2 ;;
esac
