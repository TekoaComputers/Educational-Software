#!/usr/bin/env python3
"""
Parse kesem/TIPS/*.txt into data/tafrosh/Kesem.json under a `screens` key.

Each editor form loads a specific tip file in its Form_Activate (per
Sst.frm:1633, Main.frm:912, etc.):
    Sst.frm          → tafrosh.txt   (album view tips: "אלבום התמונות", ...)
    Main.frm         → altaf.txt
    Chgames.frm      → tafgzir.txt
    Gzira.frm        → Gzirhad.txt
    Maslul.frm       → masnos.txt
    Start_Maslul.frm → 1.txt
    Expo.frm         → (none; no GetTip call)

The original then assigns TipArray(N) to lbtip(M).Caption in each per-
control MouseMove handler. We store the raw arrays here; per-control
mapping (idx → tip text) is hardcoded in wireKesemX functions.
"""
from __future__ import annotations
import json
from pathlib import Path

SOURCE_ENCODING = "cp1255"

SCREEN_TO_TIPFILE = {
    "sst":          "Tafrosh.txt",
    "main":         "altaf.txt",
    "chgames":      "Tafgzir.txt",
    "gzira":        "Gzirhad.txt",
    "maslul":       "MasNos.txt",
    "start_maslul": "1.txt",
    # Expo has no GetTip call in Form_Load/Activate.
}


def read_tips(path: Path) -> list[str]:
    if not path.exists():
        return []
    raw = path.read_bytes().decode(SOURCE_ENCODING, errors="replace")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    # Don't strip empty lines — the original uses 1-indexed TipArray and
    # we want index alignment to match the per-MouseMove `TipArray(N)`
    # references. Strip trailing whitespace only.
    return [l.rstrip() for l in raw.split("\n")]


def main():
    site = Path(__file__).resolve().parent.parent
    kesem = site.parent / "kesem"
    tips_dir = None
    for cand in ("TIPS", "tips", "Tips"):
        if (kesem / cand).is_dir():
            tips_dir = kesem / cand; break
    if not tips_dir:
        raise SystemExit(f"no TIPS dir under {kesem}")

    screens = {}
    for screen, fname in SCREEN_TO_TIPFILE.items():
        # Filenames vary in case across distributions.
        path = None
        for cand in (tips_dir / fname,
                     tips_dir / fname.lower(),
                     tips_dir / fname.upper()):
            if cand.exists():
                path = cand; break
        if not path:
            print(f"  {screen}: {fname} not found")
            continue
        tips = read_tips(path)
        # Leading-space pad in some files (e.g. " כיבוי") — strip when
        # the runtime reads (the original does Trim on the Caption set).
        tips = [t.lstrip() for t in tips]
        screens[screen] = tips
        print(f"  {screen}: {fname} → {len(tips)} entries")

    out = {"app": "Kesem", "ramas": {}, "screens": screens}
    out_path = site / "data" / "tafrosh" / "Kesem.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path.name}")


if __name__ == "__main__":
    main()
