// camgrab: grab a frame from a V4L2 camera (the projector's built-in "HD camera").
// Runs on the projector over adb. Prints the camera's formats, then captures.
//
//   camgrab /dev/video0 list
//   camgrab /dev/video0 grab out.jpg [width height] [skip]
//   camgrab /dev/video0 ctrls                      list controls (exposure, gain…)
//   camgrab /dev/video0 set ID VALUE               set a control
//   camgrab /dev/video0 serve W H                  keep streaming; read stdin lines
//       "grab PATH SKIP" -> drop SKIP frames, save the next one, print "ok PATH"
//       "quit"           -> stop
//
// Prefers MJPEG (written as-is: a .jpg); falls back to YUYV (written raw, with a
// .txt sidecar giving the size, for conversion on the host).
#include <errno.h>
#include <fcntl.h>
#include <linux/videodev2.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/select.h>
#include <unistd.h>

static int xioctl(int fd, unsigned long req, void *arg) {
  int r;
  do r = ioctl(fd, req, arg); while (r == -1 && errno == EINTR);
  return r;
}

static void fourcc(unsigned f, char out[5]) {
  out[0] = f & 255; out[1] = (f >> 8) & 255; out[2] = (f >> 16) & 255; out[3] = (f >> 24) & 255; out[4] = 0;
}

static void list(int fd) {
  struct v4l2_capability cap = {0};
  if (xioctl(fd, VIDIOC_QUERYCAP, &cap) == 0)
    printf("card: %s  driver: %s  caps: 0x%08x\n", cap.card, cap.driver, cap.device_caps);
  struct v4l2_fmtdesc fd_ = {0};
  fd_.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  for (fd_.index = 0; xioctl(fd, VIDIOC_ENUM_FMT, &fd_) == 0; fd_.index++) {
    char cc[5]; fourcc(fd_.pixelformat, cc);
    printf("format %s (%s):", cc, fd_.description);
    struct v4l2_frmsizeenum fs = {0};
    fs.pixel_format = fd_.pixelformat;
    for (fs.index = 0; xioctl(fd, VIDIOC_ENUM_FRAMESIZES, &fs) == 0; fs.index++)
      if (fs.type == V4L2_FRMSIZE_TYPE_DISCRETE) printf(" %ux%u", fs.discrete.width, fs.discrete.height);
    printf("\n");
  }
}

static void ctrls(int fd) {
  struct v4l2_queryctrl q = {0};
  q.id = V4L2_CTRL_FLAG_NEXT_CTRL;
  while (xioctl(fd, VIDIOC_QUERYCTRL, &q) == 0) {
    if (!(q.flags & V4L2_CTRL_FLAG_DISABLED) && q.type != V4L2_CTRL_TYPE_CTRL_CLASS) {
      struct v4l2_control c = { .id = q.id };
      xioctl(fd, VIDIOC_G_CTRL, &c);
      printf("0x%08x %-32s min %d max %d step %d default %d now %d\n", q.id, q.name, q.minimum, q.maximum, q.step, q.default_value, c.value);
    }
    q.id |= V4L2_CTRL_FLAG_NEXT_CTRL;
  }
}

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: camgrab DEV list | grab OUT [W H] [SKIP]\n"); return 2; }
  int fd = open(argv[1], O_RDWR);
  if (fd < 0) { perror("open"); return 1; }
  if (!strcmp(argv[2], "list")) { list(fd); return 0; }
  if (!strcmp(argv[2], "ctrls")) { ctrls(fd); return 0; }
  if (!strcmp(argv[2], "set") && argc > 4) {
    struct v4l2_control c = { .id = (unsigned)strtoul(argv[3], NULL, 0), .value = atoi(argv[4]) };
    if (xioctl(fd, VIDIOC_S_CTRL, &c) < 0) { perror("S_CTRL"); return 1; }
    return 0;
  }
  int serve = !strcmp(argv[2], "serve");
  if (serve) {
    // Reuse the grab path below, but loop on commands from stdin.
    static char *fake[] = {0, 0, "grab", "", 0, 0, 0};
    fake[1] = argv[1]; fake[4] = argc > 3 ? argv[3] : "640"; fake[5] = argc > 4 ? argv[4] : "480"; fake[6] = "0";
    argv = fake; argc = 7;
  }
  if (strcmp(argv[2], "grab") || argc < 4) { fprintf(stderr, "bad args\n"); return 2; }
  const char *out = argv[3];
  unsigned W = argc > 5 ? atoi(argv[4]) : 1280, H = argc > 5 ? atoi(argv[5]) : 720;
  int skip = argc > 6 ? atoi(argv[6]) : 15;

  // Prefer MJPEG, else YUYV.
  struct v4l2_format f = {0};
  f.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  f.fmt.pix.width = W; f.fmt.pix.height = H; f.fmt.pix.field = V4L2_FIELD_ANY;
  f.fmt.pix.pixelformat = V4L2_PIX_FMT_MJPEG;
  if (xioctl(fd, VIDIOC_S_FMT, &f) < 0 || f.fmt.pix.pixelformat != V4L2_PIX_FMT_MJPEG) {
    f.fmt.pix.pixelformat = V4L2_PIX_FMT_YUYV;
    if (xioctl(fd, VIDIOC_S_FMT, &f) < 0) { perror("S_FMT"); return 1; }
  }
  char cc[5]; fourcc(f.fmt.pix.pixelformat, cc);
  fprintf(stderr, "format %s %ux%u\n", cc, f.fmt.pix.width, f.fmt.pix.height);

  struct v4l2_requestbuffers rb = {0};
  rb.count = 4; rb.type = V4L2_BUF_TYPE_VIDEO_CAPTURE; rb.memory = V4L2_MEMORY_MMAP;
  if (xioctl(fd, VIDIOC_REQBUFS, &rb) < 0) { perror("REQBUFS"); return 1; }
  void *ptr[8]; size_t len[8];
  for (unsigned i = 0; i < rb.count && i < 8; i++) {
    struct v4l2_buffer b = {0};
    b.type = rb.type; b.memory = rb.memory; b.index = i;
    if (xioctl(fd, VIDIOC_QUERYBUF, &b) < 0) { perror("QUERYBUF"); return 1; }
    len[i] = b.length;
    ptr[i] = mmap(NULL, b.length, PROT_READ | PROT_WRITE, MAP_SHARED, fd, b.m.offset);
    if (ptr[i] == MAP_FAILED) { perror("mmap"); return 1; }
    if (xioctl(fd, VIDIOC_QBUF, &b) < 0) { perror("QBUF"); return 1; }
  }
  enum v4l2_buf_type t = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  if (xioctl(fd, VIDIOC_STREAMON, &t) < 0) { perror("STREAMON"); return 1; }

  if (serve) {
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("ready %ux%u\n", f.fmt.pix.width, f.fmt.pix.height);
    char line[600], path[512];
    int want = -1, n = 0;
    for (;;) {
      // Keep draining frames; when a grab is pending, count down and save.
      fd_set rs; FD_ZERO(&rs); FD_SET(0, &rs);
      struct timeval tv = {0, 0};
      if (want < 0 && select(1, &rs, NULL, NULL, &tv) > 0) {
        if (!fgets(line, sizeof line, stdin) || !strncmp(line, "quit", 4)) break;
        int sk = 3;
        if (sscanf(line, "grab %511s %d", path, &sk) >= 1) { want = sk; n = 0; }
      }
      struct v4l2_buffer b = {0};
      b.type = t; b.memory = V4L2_MEMORY_MMAP;
      if (xioctl(fd, VIDIOC_DQBUF, &b) < 0) { perror("DQBUF"); return 1; }
      if (want >= 0 && n++ >= want) {
        FILE *o = fopen(path, "wb");
        if (o) { fwrite(ptr[b.index], 1, b.bytesused, o); fclose(o); printf("ok %s\n", path); }
        else printf("err %s\n", path);
        want = -1;
      }
      if (xioctl(fd, VIDIOC_QBUF, &b) < 0) { perror("QBUF"); return 1; }
    }
    xioctl(fd, VIDIOC_STREAMOFF, &t);
    return 0;
  }

  // Let exposure settle, then keep the last frame.
  for (int n = 0; n <= skip; n++) {
    struct v4l2_buffer b = {0};
    b.type = t; b.memory = V4L2_MEMORY_MMAP;
    if (xioctl(fd, VIDIOC_DQBUF, &b) < 0) { perror("DQBUF"); return 1; }
    if (n == skip) {
      FILE *o = fopen(out, "wb");
      if (!o) { perror("fopen"); return 1; }
      fwrite(ptr[b.index], 1, b.bytesused, o);
      fclose(o);
      if (f.fmt.pix.pixelformat != V4L2_PIX_FMT_MJPEG) {
        char side[512]; snprintf(side, sizeof side, "%s.txt", out);
        FILE *s = fopen(side, "w"); fprintf(s, "YUYV %u %u\n", f.fmt.pix.width, f.fmt.pix.height); fclose(s);
      }
      fprintf(stderr, "saved %u bytes\n", b.bytesused);
    }
    if (xioctl(fd, VIDIOC_QBUF, &b) < 0) { perror("QBUF"); return 1; }
  }
  xioctl(fd, VIDIOC_STREAMOFF, &t);
  close(fd);
  return 0;
}
