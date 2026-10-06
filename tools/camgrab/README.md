# camgrab: the projector's built-in camera

The Magcubic HY320 has a USB webcam inside ("HD camera", `uvcvideo`, YUYV 640×480) that it uses for autofocus and keystone. It's exposed as `/dev/video0`, and SELinux is permissive, so a static binary run through `adb shell` can capture from it.

- `build.sh`: cross-compiles `camgrab.c` to `camgrab-armv7` (Zig, installed via pip into `data/tools/venv`).
- `snap.sh out.png`: pushes the binary, grabs a frame (after letting exposure settle for 20 frames), pulls it and converts it to PNG.
- `camgrab /dev/video0 list`: prints the camera's formats.

The camera is fixed to the projector and sees the whole projected area, which makes it the basis for automatic calibration. The picture comes out rotated when the projector lies on its side.
