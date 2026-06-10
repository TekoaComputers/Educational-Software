#!/usr/bin/env python3
"""
Extract sprite sheets + per-cell frames from Mikraot/ANIM.FRX.

ANIM.frx packs two StdPicture PictureClips:
  - PicClip2 at offset 0x0000 (2×6 grid, 67×90 per cell — PicBur sprite)
  - PicClip1 at offset 0x90CE (2×6 grid, 84×93 per cell — PicFea sprite)

Per-blob format:
  +0   4 bytes  LE size of payload (excludes the first 4 bytes itself)
  +4  16 bytes  StdPicture CLSID
  +20  4 bytes  "lt\0\0" marker (0x0000746c)
  +24  4 bytes  LE size of BMP
  +28  ...      BMP file content (begins with "BM")

START.FRM Form_Load wires:
  PicFea.Picture = Anim.PicClip1.GraphicCell(0)
  PicBur.Picture = Anim.PicClip2.GraphicCell(0)

Cells are indexed row-major: PicClip(rows=2, cols=6) → cells 0..11
mapped as cell[r][c] = (c * cell_w, r * cell_h).
"""
from __future__ import annotations
import struct
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
SRC = SITE.parent / "Mikraot" / "ANIM.FRX"
OUT_DIR = SITE / "assets" / "anim"

# (grid_rows, grid_cols, label, offset_in_frx)
CLIPS = [
    (2, 6, "pic_bur", 0x0000),
    (2, 6, "pic_fea", 0x90CE),
]

def read_blob(data: bytes, off: int) -> bytes:
    # blob length is at +0 (4 LE bytes); BMP itself at +24, length at +20.
    bmp_size = struct.unpack_from("<I", data, off + 24)[0]
    bmp = data[off + 28 : off + 28 + bmp_size]
    if bmp[:2] != b"BM":
        raise SystemExit(f"expected 'BM' at offset 0x{off+28:x}, got {bmp[:2]!r}")
    return bmp

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = SRC.read_bytes()
    for rows, cols, label, off in CLIPS:
        bmp = read_blob(data, off)
        sheet_path = OUT_DIR / f"{label}_sheet.bmp"
        sheet_png  = OUT_DIR / f"{label}_sheet.png"
        sheet_path.write_bytes(bmp)
        subprocess.run(["convert", str(sheet_path), str(sheet_png)], check=True)
        # Parse BMP header for natural dims.
        w = struct.unpack_from("<i", bmp, 0x12)[0]
        h = struct.unpack_from("<i", bmp, 0x16)[0]
        cell_w = w // cols
        cell_h = h // rows
        print(f"{label}: sheet {w}×{h}, cell {cell_w}×{cell_h} ({rows}×{cols} grid)")
        # Slice each cell with ImageMagick. Cells are indexed top-to-bottom
        # left-to-right but BMPs are stored bottom-up — convert handles
        # orientation; we treat (0,0) as the top-left visually.
        idx = 0
        for r in range(rows):
            for c in range(cols):
                x = c * cell_w
                y = r * cell_h
                cell_png = OUT_DIR / f"{label}_{idx}.png"
                subprocess.run([
                    "convert", str(sheet_png),
                    "-crop", f"{cell_w}x{cell_h}+{x}+{y}",
                    "+repage",
                    str(cell_png),
                ], check=True)
                idx += 1
        sheet_path.unlink()

if __name__ == "__main__":
    main()
