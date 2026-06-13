#!/usr/bin/env python3
"""
Parse Mikraot/GAMES/*.SPI (Spisok = "list" in Russian) — the per-stage
data files. Each .spi holds N fixed-length 826-byte records produced by
VB6 `Open ... For Random Access ... Len = Len(Sps)` and `Put #1, n, Sps`.

The on-disk struct corresponds to File_Stru in Mikraot/GLOBAL.BAS (NOT
the older GLOB1.BAS — that file declares Questions/QuestionsP as
String*40, which would total 746 bytes per record; the actual files
are 826 = 16*40 + 2*80 + 13*2 — i.e. Questions and QuestionsP are
String*80 in the live struct):

  Offs  Sz  Field
   0    40  LPicName
  40    40  RPicName
  80     2  Kol           total record count
  82     2  Kol_t         word/line count (records 1..Kol_t hold word data)
  84     2  Kol_P         picture-zone count (records 1..Kol_P hold zone data)
  86     2  FX_           word rect Left
  88     2  FX1_          word rect Width
  90     2  FY_           word rect Top
  92     2  FY1_          word rect Height
  94    40  WavFileName   audio for this word
 134    80  Questions
 214    40  Font_Questions
 254     2  FontSize_Questions
 256    40  WavFileName_Questions
 296    40  AWavFileName_Questions
 336    40  NWavFileName_Questions
 376    40  PWavFileName_Questions
 416     2  Fx_p          pic zone Left
 418     2  Fx1_p         pic zone Width
 420     2  Fy_p          pic zone Top
 422     2  Fy1_p         pic zone Height
 424    40  WavFileNameP
 464    80  QuestionsP
 544    40  Font_QuestionsP
 584     2  FontSize_QuestionsP
 586    40  WavFileName_QuestionsP
 626    40  AWavFileName_QuestionsP
 666    40  NWavFileName_QuestionsP
 706    40  PWavFileName_QuestionsP
 746    40  SWavFilenameP
 786    40  SNameP
 826    end of record

Record 1 fields LPicName, RPicName, Kol, Kol_t, Kol_P apply to the whole
stage. Subsequent records carry per-word and per-zone overlays — for word
N read FX_/FX1_/FY_/FY1_/WavFileName from record N; for zone M read
Fx_p/.../WavFileNameP/SNameP from record M.

Each .spi is one *stage* (e.g. games/1_1.SPI = song 1, variant 1).
"""
from __future__ import annotations
import json
import struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
SRC_DIR = Path("/home/levlavy/Documents/Tekoa_Computers/Master/Mikraot/Z/GAMES")
OUT = SITE / "data" / "stages.js"

RECORD_SIZE = 826
ENCODING = "cp1255"

def s(data: bytes, off: int, n: int) -> str:
    # VB6 fixed-length strings are space-padded; some have trailing NULs.
    raw = data[off : off + n]
    txt = raw.decode(ENCODING, errors="replace")
    return txt.rstrip(" \x00")

def i(data: bytes, off: int) -> int:
    return struct.unpack_from("<h", data, off)[0]

def parse_stage(path: Path) -> dict:
    raw = path.read_bytes()
    if len(raw) % RECORD_SIZE:
        raise ValueError(f"{path}: size {len(raw)} not a multiple of {RECORD_SIZE}")
    n_records = len(raw) // RECORD_SIZE
    rec1 = raw[:RECORD_SIZE]
    stage = {
        "file": path.name,
        "left":      s(rec1, 0,  40),
        "right":     s(rec1, 40, 40),
        "kol":       i(rec1, 80),
        "kol_t":     i(rec1, 82),
        "kol_p":     i(rec1, 84),
        "words": [],
        "zones": [],
    }
    for idx in range(stage["kol_t"]):
        r = raw[idx * RECORD_SIZE : (idx + 1) * RECORD_SIZE]
        stage["words"].append({
            "rect": [i(r, 86), i(r, 90), i(r, 88), i(r, 92)],  # x,y,w,h
            "wav":  s(r, 94, 40),
            # Word-level Q&A (tirgul=4 text questions). Offsets per
            # File_Stru header above.
            "q":    s(r, 134, 80),
            "qfont":s(r, 214, 40),
            "qsize":i(r, 254),
            "wavQ": s(r, 256, 40),
            "wavA": s(r, 296, 40),
            "wavN": s(r, 336, 40),
            "wavP": s(r, 376, 40),
        })
    for idx in range(stage["kol_p"]):
        r = raw[idx * RECORD_SIZE : (idx + 1) * RECORD_SIZE]
        stage["zones"].append({
            "rect": [i(r, 416), i(r, 420), i(r, 418), i(r, 422)],
            "wav":  s(r, 424, 40),
            "q":    s(r, 464, 80),
            "qfont":s(r, 544, 40),
            "qsize":i(r, 584),
            "wavQ": s(r, 586, 40),
            "wavA": s(r, 626, 40),
            "wavN": s(r, 666, 40),
            "wavP": s(r, 706, 40),
            "sWav": s(r, 746, 40),
            "sNam": s(r, 786, 40),
        })
    return stage

def stage_key(path: Path) -> tuple[int, int]:
    # 1_2.SPI → (1, 2). Sort by song, then variant.
    stem = path.stem
    parts = stem.split("_")
    return (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)

def main():
    stages = {}
    for p in sorted(SRC_DIR.glob("*.SPI"), key=stage_key):
        stage = parse_stage(p)
        song, variant = stage_key(p)
        stages.setdefault(str(song), {})[str(variant)] = stage
    body = "window.MK_STAGES = " + json.dumps(stages, ensure_ascii=False) + ";\n"
    OUT.write_text(body, encoding="utf-8")
    n_files = sum(len(v) for v in stages.values())
    print(f"Wrote {OUT} ({len(stages)} songs, {n_files} stages)")

if __name__ == "__main__":
    main()
