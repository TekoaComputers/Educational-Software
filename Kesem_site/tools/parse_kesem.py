#!/usr/bin/env python3
"""
Seed data/paths/Kesem.json from the editor's own content library at
/Code/kesem/. Kesem is an editor + player in one — unlike the other apps
it has no CHBOX/rama partitioning; instead it carries:

  BMP/Spisok.dat   alternating <pic-filename> / <Hebrew description> lines
                   (the picture-album index Main.frm.GetAllPics reads).
  RASB/<pic>_<n>.ras   hotspot rectangles per picture variant
                       (66-byte FileStru records — see GLOBAL.BAS:73).
  MASLUL/*.mas         author-composed lesson paths (same .mas shape every
                       runtime app reads from CHBOX-listed paths).
  WAV/<pic>_<n>/<m>    per-hotspot recorded narration.

Output mirrors the other apps' data/paths/<App>.json shape closely enough
that the existing renderer can reach into it, with a couple of extra
top-level keys specific to the editor:

  {
    "app": "Kesem",
    "pictures": [{"file": "1.bmp", "name": "..."}, ...],
    "rasb":     {"1_101": [hotspot, ...], ...},
    "maslul":   [{"masFile":"00.mas","name":"...","header":{...},"stages":[...]}, ...]
  }

Run with:  python3 tools/parse_kesem.py
"""
from __future__ import annotations
import json
from pathlib import Path

# Reuse the parsers in parse_paths.py so the .ras and .mas decoding logic
# stays in one place.
import importlib.util
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("parse_paths", HERE / "parse_paths.py")
parse_paths = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parse_paths)

SOURCE_ENCODING = "cp1255"


def parse_spisok(path: Path) -> list[dict]:
    """BMP/Spisok.dat: alternating filename + Hebrew description lines.
    Mirrors Main.frm.GetAllPics:
        Input #1, FN(Cot)   ' picture filename
        Input #1, n(Cot)    ' Hebrew description
    """
    if not path.exists():
        return []
    raw = path.read_bytes().decode(SOURCE_ENCODING, errors="replace")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    lines = [l.strip() for l in raw.split("\n")]
    out = []
    i = 0
    while i + 1 < len(lines):
        fn = lines[i]
        desc = lines[i + 1]
        if fn:
            out.append({"file": fn, "name": desc})
        i += 2
    return out


def parse_rasb_dir(rasb: Path) -> dict[str, list]:
    """Read every .ras under RASB/ into a {basename: hotspots[]} map.
    `parse_paths.parse_ras` already handles the 68-byte FileStru records.
    """
    out = {}
    if not rasb.is_dir():
        return out
    for p in sorted(rasb.iterdir()):
        if not p.is_file() or p.suffix.lower() != ".ras":
            continue
        recs = parse_paths.parse_ras(p)
        if recs:
            out[p.stem] = recs
    return out


def parse_maslul_dir(maslul: Path, rasb: Path) -> list[dict]:
    """Read every .mas under MASLUL/ — same shape as the all_maslul block
    parse_paths.main() produces for the other apps."""
    if not maslul.is_dir():
        return []
    mas_files = []
    for p in sorted(maslul.iterdir()):
        if p.is_file() and p.suffix.lower() == ".mas":
            mas_files.append(p)

    def _key(p):
        stem = p.stem
        try:    return (0, int(stem), stem)
        except: return (1, 0, stem.lower())
    mas_files.sort(key=_key)

    out = []
    for p in mas_files:
        mas = parse_paths.parse_mas(p)
        if not mas:
            continue
        entry = {
            "masFile": p.name,
            "name": mas["header"].get("pathName") or p.stem,
            "header": mas["header"],
            "stages": mas["stages"],
        }
        # Resolve per-stage hotspots from RASB/.
        for st in entry["stages"]:
            if not st.get("razNom"):
                continue
            for ext in (".RAS", ".ras"):
                cand = rasb / f"{st['razNom']}{ext}"
                if cand.exists():
                    recs = parse_paths.parse_ras(cand)
                    if recs:
                        st["hotspots"] = recs
                    break
        out.append(entry)
    return out


def _pick(*candidates):
    for c in candidates:
        if c.is_dir():
            return c
    return None


def main():
    site = Path(__file__).resolve().parent.parent
    code = site.parent
    tekoa = code.parent
    master = tekoa / "Master"

    # Source priority for each content kind:
    #   BMP / RASB / Spisok.dat → /Master/Kesem/dapey_ke/   (the 85-picture
    #     master library — what teachers actually had at runtime)
    #   MASLUL → /Master/Clean/Kesem/MASLUL/                (lesson .MAS files)
    #   Fallback for everything → /Code/kesem/              (dev sandbox)
    kesem_dev    = code  / "kesem"
    kesem_master = master / "Kesem"
    kesem_clean  = master / "Clean" / "Kesem"

    bmp_dir = _pick(
        kesem_master / "dapey_ke" / "BMP",
        kesem_master / "dapey_ke" / "Bmp",
        kesem_master / "dapey_ke" / "bmp",
        kesem_clean  / "BMP",
        kesem_dev    / "BMP",
        kesem_dev    / "bmp",
    )
    rasb_dir = _pick(
        kesem_master / "dapey_ke" / "RASB",
        kesem_master / "dapey_ke" / "rasb",
        kesem_master / "dapey_ke" / "Rasb",
        kesem_clean  / "RASB",
        kesem_dev    / "RASB",
        kesem_dev    / "rasb",
    )
    maslul_dir = _pick(
        kesem_clean  / "MASLUL",
        kesem_clean  / "Maslul",
        kesem_clean  / "maslul",
        kesem_master / "dapey_ke" / "MASLUL",
        kesem_dev    / "MASLUL",
        kesem_dev    / "maslul",
    )

    spisok_path = None
    if bmp_dir:
        for cand in ("Spisok.dat", "SPISOK.DAT", "spisok.dat"):
            p = bmp_dir / cand
            if p.exists():
                spisok_path = p; break
    # Fallback: dev sandbox root
    if not (spisok_path and spisok_path.exists()):
        for cand in (kesem_dev / "SPISOK.DAT", kesem_dev / "Spisok.dat"):
            if cand.exists():
                spisok_path = cand; break

    pictures = parse_spisok(spisok_path) if spisok_path and spisok_path.exists() else []
    rasb     = parse_rasb_dir(rasb_dir) if rasb_dir else {}
    maslul   = parse_maslul_dir(maslul_dir, rasb_dir) if maslul_dir and rasb_dir else []

    out = {
        "app": "Kesem",
        "pictures": pictures,
        "rasb": rasb,
        "maslul": maslul,
    }

    out_path = site / "data" / "paths" / "Kesem.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    total_hot = sum(len(v) for v in rasb.values())
    print(f"  Kesem: {len(pictures)} pictures, {len(rasb)} ras files / "
          f"{total_hot} hotspots, {len(maslul)} maslul lessons -> {out_path.name}")


if __name__ == "__main__":
    main()
