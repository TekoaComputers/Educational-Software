#!/usr/bin/env python3
"""
Parse Mikraot/MASLUL/*.MSL — the maslul chain files.

Each .MSL holds 3 lines, one per maslul (easy/medium/hard):
  /02/04/05/07/
  /01/03/06/10/
  /00/08/09/11/

Each pair "/NN/" is a NomerMasl step code, dispatched by KIVUN.FRM
Kivun(Ind) Select Case NomerMasl:
  00 → Form1 tirgul=1 (syllables, "הברות")
  01 → Form1 tirgul=2 (words,      "מילים")
  02 → Form1 tirgul=3 (sentences,  "משפטים")
  03 → Form1 tirgul=4 (text Q&A,   "שאלות לתמליל")
  04 → Form1 tirgul=5 (picture Q&A,"שאלות לתמונות")
  05 → game1 Mishak=4 ("במה זה מתחיל")
  06 → game1 Mishak=1 ("איפה זה כתוב")
  07 → game5         ("מה התמונה")
  08 → Game2         ("מה הטעות")
  09 → game1 Mishak=2 ("מה נישמה")
  10 → Slog          (syllable game)
  11 → gam_3         (word game)

There are 10 .MSL files (1..10) — one per song (GameNomer).
"""
from __future__ import annotations
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
SRC_DIR = SITE / "assets" / "maslul"
OUT = SITE / "data" / "maslul.js"

# Lookahead on the trailing slash so consecutive /NN/ tokens don't
# eat each other's separator: input "/02/04/05/07/" must yield
# all four codes, not [02,05].
STEP_RE = re.compile(r"/(\d{2})(?=/)")

def parse_msl(path: Path) -> list[list[int]]:
    """Returns 3 lists, one per maslul, each a list of NomerMasl ints."""
    text = path.read_text(encoding="latin-1")
    lines = [l for l in text.replace("\r", "").split("\n") if l.strip()]
    masls = []
    for line in lines:
        steps = [int(m) for m in STEP_RE.findall(line)]
        masls.append(steps)
    return masls

def stage_key(path: Path) -> int:
    return int(path.stem)

def main():
    data = {}
    for p in sorted(SRC_DIR.glob("*.MSL"), key=stage_key):
        song = stage_key(p)
        data[str(song)] = parse_msl(p)
    body = "window.MK_MASLUL = " + json.dumps(data, ensure_ascii=False) + ";\n"
    OUT.write_text(body, encoding="utf-8")
    total = sum(sum(len(m) for m in s) for s in data.values())
    print(f"Wrote {OUT} ({len(data)} songs, {total} total NomerMasl steps)")

if __name__ == "__main__":
    main()
