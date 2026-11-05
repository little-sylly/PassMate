"""Draw the placeholder app icons (navy square, white tick) with no dependencies.
    python tools/make_icons.py
"""
import os, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
NAVY = (0x1D, 0x34, 0x61)
WHITE = (255, 255, 255)

def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5

def render(size, scale):
    """scale = how much of the canvas the tick may use (0.5 for maskable's safe zone)."""
    ss = 3  # supersampling for smooth edges
    a = (0.5 - 0.5 * scale + 0.5 * scale * 0.22, 0.5 + 0.5 * scale * 0.04)
    b = (0.5 - 0.5 * scale + 0.5 * scale * 0.80, 0.5 + 0.5 * scale * 0.56)
    c = (0.5 - 0.5 * scale + 0.5 * scale * 1.78, 0.5 - 0.5 * scale * 0.52)
    half = 0.5 * scale * 0.19
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            hit = 0
            for sy in range(ss):
                for sx in range(ss):
                    px, py = (x + (sx + .5) / ss) / size, (y + (sy + .5) / ss) / size
                    d = min(seg_dist(px, py, *a, *b), seg_dist(px, py, *b, *c))
                    hit += d <= half
            k = hit / (ss * ss)
            row += bytes(round(NAVY[i] + (WHITE[i] - NAVY[i]) * k) for i in range(3))
        rows.append(bytes(row))
    return rows

def png(path, size, scale):
    raw = b"".join(render(size, scale))
    def chunk(t, d):
        body = t + d
        return struct.pack(">I", len(d)) + body + struct.pack(">I", zlib.crc32(body))
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)

os.makedirs(OUT, exist_ok=True)
png(os.path.join(OUT, "icon-192.png"), 192, 0.62)
png(os.path.join(OUT, "icon-512.png"), 512, 0.62)
png(os.path.join(OUT, "icon-maskable-512.png"), 512, 0.5)
png(os.path.join(OUT, "apple-touch-icon.png"), 180, 0.62)
print("icons written")
