#!/usr/bin/env python3
"""Extract the 10 individual instrument sprites from the original 1995
Aliza CD's INSTR_B sprite sheet.

INSTR_B is a 22,732-byte file at the ISO root: a 4-byte (width,height)
header (45×48) followed by ten 45×48 indexed-colour sprites, then 1128
bytes of padding. The palette isn't stored alongside it; we pull the
full 256-colour FLI palette out of ANIM/M0.FLI's first COLOR_64 chunk.

Output: assets/bitmaps/instruments/inst{1..10}.png (RGBA, panel-cream
made transparent so the sprites layer cleanly on any background).

Usage:  python3 tools/extract_instr_b.py /path/to/alizaOld01.iso/extracted/
"""
import struct, sys, os
from PIL import Image


def parse_fli_palette(path):
    """Return a 256-entry [(r,g,b), ...] palette from the first COLOR_64 /
    COLOR_256 chunk in an Autodesk FLI/FLC animation."""
    data = open(path, "rb").read()
    magic = struct.unpack("<H", data[4:6])[0]
    if magic not in (0xAF11, 0xAF12):
        raise ValueError(f"{path}: not a FLI/FLC (magic {hex(magic)})")
    pos = 128
    while pos < len(data) - 16:
        frame_size, frame_magic, nchunks = struct.unpack("<IHH", data[pos:pos+8])
        if frame_magic != 0xF1FA:
            pos += 1
            continue
        cpos = pos + 16
        for _ in range(nchunks):
            if cpos + 6 > len(data): break
            csize, ctype = struct.unpack("<IH", data[cpos:cpos+6])
            if ctype in (4, 11):                  # COLOR_256 / COLOR_64
                p = cpos + 6
                npackets = struct.unpack("<H", data[p:p+2])[0]; p += 2
                pal = [(0, 0, 0)] * 256
                cur = 0
                for _pk in range(npackets):
                    skip, cnt = data[p], data[p+1]; p += 2
                    cur += skip
                    n = cnt if cnt else 256
                    for k in range(n):
                        r, g, b = data[p], data[p+1], data[p+2]
                        if ctype == 11:           # 6-bit → 8-bit
                            r = (r << 2) | (r >> 4)
                            g = (g << 2) | (g >> 4)
                            b = (b << 2) | (b >> 4)
                        pal[cur + k] = (r, g, b)
                        p += 3
                    cur += n
                return pal
            cpos += csize
        pos += frame_size
    raise ValueError(f"{path}: no COLOR_64/256 chunk found")


def extract(iso_dir, out_dir):
    pal = parse_fli_palette(os.path.join(iso_dir, "ANIM", "M0.FLI"))
    data = open(os.path.join(iso_dir, "INSTR_B"), "rb").read()
    # Layout determined empirically with tools/instr_b_explorer.html:
    #   4-byte header
    #   visible region 45×49 with 46-byte row stride (1 byte/row padding)
    #   6-byte gap between consecutive sprites
    #   after the 4th sprite, an 87-byte block separates the rows
    #   10 sprites total
    # First 4 bytes of the file LOOK like (45, 48) when interpreted as a
    # little-endian header, but those values don't match the actual size.
    start_off = 3
    w, h, stride, gap = 48, 49, 46, 6
    row_break_after, row_break_bytes = 5, 88
    per_sprite = stride * h + gap                 # 46*49 + 6 = 2260
    # Pixels we want fully transparent: the panel cream, plus the dark
    # "selector box" backdrop the sprites were drawn against (pure black
    # and the near-black (0,0,16) that dominates the borders).
    transparent_colours = {
        (252, 212, 168),    # panel cream
        (0, 0, 0),          # pure black backdrop
        (0, 0, 16),         # near-black backdrop
    }
    os.makedirs(out_dir, exist_ok=True)
    for i in range(10):
        extra = row_break_bytes if i >= row_break_after else 0
        off = start_off + i * per_sprite + extra
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        px = img.load()
        for y in range(h):
            for x in range(w):
                idx = data[off + y*stride + x]
                rgb = pal[idx]
                if rgb in transparent_colours:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (rgb[0], rgb[1], rgb[2], 255)
        img.save(os.path.join(out_dir, f"inst{i+1}.png"))


if __name__ == "__main__":
    iso_dir = sys.argv[1] if len(sys.argv) > 1 else "/tmp/aliza_extract"
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "assets/bitmaps/instruments"
    extract(iso_dir, out_dir)
    print(f"wrote 10 sprites to {out_dir}/")
