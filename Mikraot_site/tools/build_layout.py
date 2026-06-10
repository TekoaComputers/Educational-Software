#!/usr/bin/env python3
"""
Bundle Mikraot_site/data/layout/*.json into data/layout.js as
window.MK_LAYOUT[name] = {...}. The site runs from file:// so fetch()
can't read JSON; this matches the same trick hemed_nivim_site uses.
"""
from __future__ import annotations
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
LAYOUT_DIR = SITE / "data" / "layout"
OUT = SITE / "data" / "layout.js"

def main():
    entries = {}
    for j in sorted(LAYOUT_DIR.glob("*.json")):
        key = j.stem
        entries[key] = json.loads(j.read_text(encoding="utf-8"))
    body = "window.MK_LAYOUT = " + json.dumps(entries, ensure_ascii=False) + ";\n"
    OUT.write_text(body, encoding="utf-8")
    print(f"Wrote {OUT} ({len(entries)} layouts)")

if __name__ == "__main__":
    main()
