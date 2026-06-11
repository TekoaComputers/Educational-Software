#!/usr/bin/env python3
"""
Extract embedded picture blobs from a VB6 .frx file.

Format per block (observed in CHGAMES.FRX, MAIN.frx, etc.):
  offset 0..3   : block-payload length (LE uint32, EXCLUDING these 4 bytes)
  offset 4..7   : unknown (OLE StdPicture format marker; ignored)
  offset 8..11  : BMP file size (LE uint32)
  offset 12..   : BMP file (starts with "BM")

We scan the .frx for "BM" markers and write each BMP out as
<stem>_<hex-offset>.bmp under the chosen output dir, then convert to .png.

The .frm files reference these via `Picture = "<FORM>.frx":<HEX_OFFSET>`.
The hex offset is the START of the 12-byte header, so the BMP itself
begins 12 bytes later. We name the extract by header offset so the .frm
references map directly.

Usage:
    python3 tools/extract_frx.py kesem/CHGAMES.FRX assets/Kesem/frx/chgames/
"""
from __future__ import annotations
import struct
import sys
import subprocess
from pathlib import Path

def extract(frx_path: Path, out_dir: Path):
    data = frx_path.read_bytes()
    out_dir.mkdir(parents=True, exist_ok=True)
    found = 0
    i = 0
    while i < len(data) - 16:
        # Each block: 4-byte length, then payload. Payload begins with
        # 8 bytes we ignore, then BM... So scan for "BM" with the
        # 12-byte header signature in front.
        if data[i:i+2] == b"BM" and i >= 12:
            # The header at i-12: 4 bytes block size, 4 bytes marker,
            # 4 bytes BMP size.
            (block_size,) = struct.unpack("<I", data[i-12:i-8])
            (bmp_size,)   = struct.unpack("<I", data[i-4:i])
            # Plausibility check: block_size ~= bmp_size + 8, both fit
            # in the file, and the BMP file header itself reports a
            # size that matches.
            if bmp_size < 16 or bmp_size > len(data) - i:
                i += 1
                continue
            (bmp_hdr_size,) = struct.unpack("<I", data[i+2:i+6])
            if abs(bmp_hdr_size - bmp_size) > 4:
                i += 1
                continue
            bmp = data[i:i+bmp_size]
            header_off = i - 12
            stem = frx_path.stem.lower()
            bmp_out = out_dir / f"{stem}_0x{header_off:04x}.bmp"
            png_out = out_dir / f"{stem}_0x{header_off:04x}.png"
            bmp_out.write_bytes(bmp)
            # Convert to PNG so the renderer can <img> it.
            try:
                subprocess.run(
                    ["convert", str(bmp_out), str(png_out)],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                bmp_out.unlink()
            except Exception:
                # Keep the .bmp if conversion fails; the user can convert manually.
                pass
            found += 1
            i += bmp_size
            continue
        i += 1
    print(f"  {frx_path.name}: {found} images → {out_dir}")


def main():
    if len(sys.argv) != 3:
        print("usage: extract_frx.py <input.frx> <output-dir>", file=sys.stderr)
        sys.exit(1)
    extract(Path(sys.argv[1]), Path(sys.argv[2]))


if __name__ == "__main__":
    main()
