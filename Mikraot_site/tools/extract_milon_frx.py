#!/usr/bin/env python3
"""
Extract button pictures from Mikraot/MILON.FRX. Each Threed.SSCommand
button in MILON.FRM references its picture by FRX offset, e.g.
  picture = "MILON.frx":031A
The on-disk format mirrors ANIM.FRX (cf. extract_anim_frx.py):
  +0   4 bytes LE  size of payload
  +4  16 bytes     SSCommand CLSID (different from StdPicture)
  +20  4 bytes     "lt\\0\\0" marker (0x0000746c)
  +24  4 bytes LE  BMP size
  +28  ...         BMP data (begins with "BM")

The mouseicon offsets in the .frm point to ICO blobs (skipped — browsers
get a regular pointer; no need to import the custom cursor sprites).
"""
from __future__ import annotations
import struct
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
SRC = SITE.parent / "Mikraot" / "MILON.FRX"
OUT_DIR = SITE / "assets" / "milon_btn"

# label → FRX offset of the button's "picture" blob.
# (Indices match MILON.FRM Z-order, top of the form.)
BUTTONS = [
    ("btn6",     0x031A),
    ("btn5",     0x0D06),
    ("btn4",     0x16B2),
    ("btn3",     0x209E),
    ("btn2",     0x2A8A),
    ("btn1_1",   0x3476),
    ("btn1_0",   0x3E62),
    ("btnReturn",0x484E),
]

def read_bmp(data: bytes, off: int) -> bytes:
    bmp_size = struct.unpack_from("<I", data, off + 24)[0]
    bmp = data[off + 28 : off + 28 + bmp_size]
    if bmp[:2] != b"BM":
        raise SystemExit(f"expected BM at 0x{off+28:x}, got {bmp[:2]!r}")
    return bmp

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = SRC.read_bytes()
    for label, off in BUTTONS:
        bmp = read_bmp(data, off)
        bmp_path = OUT_DIR / f"{label}.bmp"
        png_path = OUT_DIR / f"{label}.png"
        bmp_path.write_bytes(bmp)
        subprocess.run(["convert", str(bmp_path), str(png_path)], check=True)
        w = struct.unpack_from("<i", bmp, 0x12)[0]
        h = struct.unpack_from("<i", bmp, 0x16)[0]
        print(f"{label}: {w}×{h}")
        bmp_path.unlink()

if __name__ == "__main__":
    main()
