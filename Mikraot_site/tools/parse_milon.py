#!/usr/bin/env python3
"""
Parse Mikraot/MILON/MILON.DAT (60 records × 77 bytes) and the per-song
.TEM files in Mikraot/MILON/TEM/ (which select a subset of MILON.DAT
records for each song).

Milon_Rec struct (from GLOBAL.BAS):
  Kod      String * 3      (rec offset 0..3)
  Mila     String * 12              3..15
  Agdara1  String * 27             15..42   (declared 27 but the Const
                                             Milon_RecLen = 3+12+30+19+...
                                             implies 30 here; we use 27
                                             because record total = 77)
  Agdara2  String * 19             42..61
  MispSlg  Integer                 61..63
  Slg(0..3) String * 3 each        63..75
  Roma     Integer                 75..77

.TEM files are ASCII lists of integer MILON.DAT record indices that the
song uses. (Format inferred from MILON.FRM Form_Load setting
SelectedFile = Dirs$ & "TEM\" & GameNomer & ".TEM" and from game1's
print_l calling Get #10, dd(1), Miln where dd[] comes from ddd[] which
is populated from the .TEM. Without running ddd's loader sub, we just
emit the parsed integers.)
"""
from __future__ import annotations
import json
import struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
MILON_DAT = SITE / "assets" / "milon" / "MILON.DAT"
TEM_DIR   = SITE / "assets" / "milon" / "TEM"
OUT = SITE / "data" / "milon.js"

REC = 77

def s(rec: bytes, off: int, n: int) -> str:
    return rec[off : off + n].decode("cp1255", errors="replace").rstrip(" \x00")

def i(rec: bytes, off: int) -> int:
    return struct.unpack_from("<h", rec, off)[0]

def parse_milon_dat():
    data = MILON_DAT.read_bytes()
    out = []
    for n in range(len(data) // REC):
        r = data[n * REC : (n + 1) * REC]
        out.append({
            "kod":   s(r, 0,  3),
            "mila":  s(r, 3,  12),
            "agdara1": s(r, 15, 27),
            "agdara2": s(r, 42, 19),
            "misp":  i(r, 61),
            "slg":   [s(r, 63 + j*3, 3) for j in range(4)],
            "roma":  i(r, 75),
        })
    return out

def parse_tem(path: Path) -> list[int]:
    # .TEM format (VB6 Print sequence):
    #   line 1: "milonN"  — header label (N = song number)
    #   line 2: count of indices that follow
    #   line 3..N+2: one index per line (1-based MILON.DAT record id)
    # We drop the header + count and return just the index list.
    text = path.read_bytes().decode("cp1255", errors="replace")
    nums = []
    for tok in text.replace(",", " ").split():
        try: nums.append(int(tok.strip()))
        except ValueError: pass
    if not nums:
        return []
    # First int is the count; the rest are the indices.
    count = nums[0]
    return nums[1 : 1 + count]

def main():
    milon = parse_milon_dat()
    tems = {}
    if TEM_DIR.exists():
        for p in sorted(TEM_DIR.glob("*.TEM")):
            try:
                song = int(p.stem)
            except ValueError:
                continue
            tems[str(song)] = parse_tem(p)
    body = (
        "window.MK_MILON = " + json.dumps(milon, ensure_ascii=False) + ";\n" +
        "window.MK_TEM = "   + json.dumps(tems,  ensure_ascii=False) + ";\n"
    )
    OUT.write_text(body, encoding="utf-8")
    print(f"Wrote {OUT} ({len(milon)} milon records, {len(tems)} .TEM files)")

if __name__ == "__main__":
    main()
