#!/usr/bin/env python3
"""Convert a raw YUYV (4:2:2) frame to PNG. Usage: yuyv2png.py in.yuv out.png W H"""
import struct, sys, zlib
src, dst, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
d = open(src, 'rb').read()
clip = lambda v: 0 if v < 0 else 255 if v > 255 else int(v)
rows = bytearray()
for y in range(H):
    rows.append(0)
    o = y * W * 2
    for x in range(0, W, 2):
        y0, u, y1, v = d[o + 2 * x:o + 2 * x + 4]
        for yy in (y0, y1):
            c, dd, e = yy - 16, u - 128, v - 128
            rows += bytes((clip(1.164 * c + 1.596 * e), clip(1.164 * c - 0.392 * dd - 0.813 * e), clip(1.164 * c + 2.017 * dd)))
chunk = lambda t, b: struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
open(dst, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(rows), 6)) + chunk(b'IEND', b''))
