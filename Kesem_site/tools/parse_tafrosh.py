#!/usr/bin/env python3
"""Convert Tafrosh<rama>.txt tooltip files into a single JSON per app."""
from __future__ import annotations
import json
import sys
from pathlib import Path

SOURCE_ENCODING = "cp1255"

APPS = {
    "Brahot": "Brahot",
    "Hagim":  "Hagim",
    "Yeled":  "Yeled",
    "Dvash":  "Dvash",
}


def find_tips_dir(master_clean: Path, app: str) -> Path | None:
    for cand in ("TIPS", "Tips", "tips"):
        p = master_clean / app / cand
        if p.is_dir():
            return p
    return None


def read_tooltips(path: Path) -> list[str]:
    raw = path.read_bytes().decode(SOURCE_ENCODING, errors="replace")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    return [line.strip() for line in raw.split("\n") if line.strip() != ""]


def main():
    site_dir = Path(__file__).resolve().parent.parent
    tekoa_dir = site_dir.parent.parent
    master_clean = tekoa_dir / "Master" / "Clean"
    out_dir = site_dir / "data" / "tafrosh"
    out_dir.mkdir(parents=True, exist_ok=True)

    for app in APPS:
        tips_dir = find_tips_dir(master_clean, app)
        if tips_dir is None:
            print(f"  {app}: no TIPS folder")
            continue
        out = {"app": app, "ramas": {}}
        for f in sorted(tips_dir.iterdir()):
            name = f.name.lower()
            if not name.startswith("tafrosh"):
                continue
            # tafrosh.txt -> "0" (default), tafrosh1.txt -> "1", etc.
            stem = f.stem.lower().replace("tafrosh", "")
            key = stem if stem else "0"
            out["ramas"][key] = read_tooltips(f)
        outfile = out_dir / f"{app}.json"
        outfile.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {app}: {len(out['ramas'])} rama levels -> {outfile.name}")


if __name__ == "__main__":
    main()
