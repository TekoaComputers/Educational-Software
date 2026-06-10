#!/usr/bin/env python3
"""
Extract Picture1(0..11) icons from AGDARA.FRX — one per NomerMasl step.
Same blob format as ANIM.FRX / MILON.FRX (size + CLSID + marker + BMP).
"""
from __future__ import annotations
import struct, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
SRC = SITE.parent / "Mikraot" / "AGDARA.FRX"
OUT = SITE / "assets" / "agdara_icons"

# From AGDARA.FRM (top of declared Picture1 → bottom maps to indices 11..0)
OFFSETS = [0x0000, 0x06C2, 0x0D44, 0x1406, 0x1AC8, 0x218A, 0x284C, 0x2F0E, 0x35D0, 0x3C92, 0x4354, 0x4A16]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = SRC.read_bytes()
    # AGDARA.FRX has a shorter blob header than ANIM/MILON — no CLSID:
    #   +0  4 bytes LE  payload size
    #   +4  4 bytes     "lt\0\0" marker
    #   +8  4 bytes LE  BMP size
    #  +12  ...         BMP data ("BM...")
    ok = 0
    for i, off in enumerate(OFFSETS):
        bmp_size = struct.unpack_from("<I", data, off + 8)[0]
        bmp = data[off + 12 : off + 12 + bmp_size]
        if bmp[:2] != b"BM":
            print(f"skip idx {i}: bad header at 0x{off+12:x}, got {bmp[:2]!r}")
            continue
        # In AGDARA.FRM the Picture1 controls are declared with Index
        # decreasing from 11 to 0 — match that mapping so the filename
        # matches the NomerMasl step code: step_<code>.png.
        code = 11 - i
        bp = OUT / f"step_{code}.bmp"
        pp = OUT / f"step_{code}.png"
        bp.write_bytes(bmp)
        subprocess.run(["convert", str(bp), str(pp)], check=True)
        bp.unlink()
        ok += 1
    print(f"Wrote {ok}/{len(OFFSETS)} icons to {OUT}")

if __name__ == "__main__":
    main()
