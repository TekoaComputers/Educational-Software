#!/usr/bin/env python3
"""
Extract and convert Hemed/Nivim source assets into hemed_nivim_site.

Source layouts (VB6 originals):
  Master/Hemed/clean.dat     — RAR archive: Hemed.exe + Data/ + Units/ + Users/
  Code/Nivim/Units/<n>/      — extracted (Nivim ships unpacked)

Output (per app):
  assets/<App>/pictures/<category>/*.png    (BMPs/JPGs converted to PNG)
  assets/<App>/sounds/*.wav                 (top-level wavs, copied)
  data/<App>/units.json                     (Units.txt → JSON, with each unit's
                                             metadata + question rows)
  data/<App>/unit_<id>/wave/*.wav           (per-question audio)
  data/<App>/config.json                    (Config.txt → JSON)
  data/<App>/tips.json                      (Tips.txt → JSON)

Run from repo root:
  python3 hemed_nivim_site/tools/port_hemed_nivim.py
"""
from __future__ import annotations
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve()
SITE   = SCRIPT.parent.parent
ROOT   = SITE.parent
MASTER = ROOT.parent / "Master"
SOURCE_ENC = "cp1255"


_HEBREW_RE = re.compile(r"[֐-׿]")


def fix_hebrew(s: str) -> str:
    """The Hemed/Nivim VB6 binary writes its TXT files in VISUAL (right-to-
    left rendering) order, so a Hebrew string like 'אנשים' lands on disk as
    'םישנא'. Reverse the string character-by-character whenever it contains
    any Hebrew letter — non-Hebrew lines (numbers, True/False flags, ASCII
    captions) are left alone."""
    if not _HEBREW_RE.search(s):
        return s
    return s[::-1]


def decode(path: Path) -> str:
    return path.read_bytes().decode(SOURCE_ENC, errors="replace")


def convert_pictures(src_dir: Path, dst_dir: Path):
    """BMP/JPG → PNG. Preserves the per-game subfolder layout under Pictures/."""
    dst_dir.mkdir(parents=True, exist_ok=True)
    for f in src_dir.iterdir():
        if f.is_dir():
            convert_pictures(f, dst_dir / f.name)
            continue
        ext = f.suffix.lower()
        out = dst_dir / (f.stem.lower() + ".png")
        if out.exists():
            continue
        if ext in (".bmp", ".jpg", ".jpeg"):
            if subprocess.run(
                ["convert", str(f), str(out)],
                stderr=subprocess.DEVNULL,
            ).returncode != 0:
                # fall back to ffmpeg for the occasional weird BMP variant
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(f), str(out)],
                    stderr=subprocess.DEVNULL,
                )
        elif ext == ".cur":
            # Cursor file — keep alongside as-is so future code can use it.
            shutil.copy(f, dst_dir / f.name.lower())


def copy_sounds(src_dir: Path, dst_dir: Path):
    """Top-level WAVs → assets/<App>/sounds/. Names lowercased so file://
    lookups work consistently on case-sensitive filesystems."""
    dst_dir.mkdir(parents=True, exist_ok=True)
    for f in src_dir.iterdir():
        if f.is_file() and f.suffix.lower() == ".wav":
            shutil.copy(f, dst_dir / (f.stem.lower() + ".wav"))


def parse_units_txt(path: Path):
    """Units.txt: fixed-size 8-line records separated by one-or-more blank
    lines. Cannot use line.strip()=='' as a block boundary because some
    records have a category line that is a single space (e.g. unit 11
    "scratch" with empty category). Instead: read each record as exactly
    8 non-blank-only-by-trimming lines... no — read exactly 8 lines per
    record starting from a non-blank line, then advance past trailing
    blanks before the next record.
        line 0: name
        line 1: category   (may be " " — whitespace)
        line 2: id         (this is the actual record anchor)
        line 3-6: 4× True/False flags
        line 7: rama label  (e.g. "א המר" = "רמה א" backwards in raw bytes)
    """
    text = decode(path)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [fix_hebrew(l.rstrip()) for l in text.split("\n")]
    units = []
    i = 0
    while i < len(lines):
        # Skip any leading blank lines between records.
        while i < len(lines) and lines[i] == "":
            i += 1
        if i + 7 >= len(lines):
            break
        block = lines[i:i + 8]
        i += 8
        try:
            uid = int(block[2].strip())
        except (ValueError, IndexError):
            # Not a valid record — try to recover by advancing one line.
            i = i - 7
            continue
        units.append({
            "id": uid,
            "name": block[0],
            "category": block[1],
            "flags": [block[3].strip() == "True", block[4].strip() == "True",
                      block[5].strip() == "True", block[6].strip() == "True"],
            "ramaLabel": block[7],
        })
    return units


def parse_cfg_txt(path: Path):
    text = decode(path)
    return [fix_hebrew(l.rstrip()) for l in text.replace("\r\n", "\n").split("\n")]


def parse_data_txt(path: Path):
    """Per-unit Data.txt:
        - First ~21 lines: header (unit name/category, 3 column captions,
          font/size/color, flags).
        - Body: VB6 fixed-record dump. Each text row is followed by zero
          or more null-padded \\x00 rows (record padding to fixed width).
          The text rows themselves are grouped in TRIPLES: (col1, col2,
          col3) matching the three column captions from the header. The
          .frm column order is Hint / Answer / Question (header lines
          2/3/4) — so on disk the triples land as (col1, col2, col3) in
          that same display order."""
    if not path.exists():
        return {"header": [], "columns": [], "items": []}
    raw = decode(path).replace("\r\n", "\n").split("\n")
    # strip null-padding rows (VB6 Type record padding leaks as \x00 bytes)
    cleaned = []
    for line in raw:
        s = line.replace("\x00", "").rstrip()
        if s == "":
            continue
        cleaned.append(fix_hebrew(s))
    header_len = 21
    header = cleaned[:header_len]
    body   = cleaned[header_len:]
    # Three column captions (Hint / Answer / Question).
    columns = header[2:5] if len(header) >= 5 else []
    items = []
    for i in range(0, len(body), 3):
        triple = body[i:i + 3]
        if len(triple) < 3:
            break
        items.append({columns[k] or f"col{k}": triple[k] for k in range(3)})
    return {"header": header, "columns": columns, "items": items}


def port_app(app_id: str, src_root: Path):
    """src_root has Data/, Units/, Users/, Hemed.exe (or just Units/ for Nivim)."""
    print(f"\n=== {app_id} ===  src={src_root}")
    dst_pic = SITE / "assets" / app_id / "pictures"
    dst_snd = SITE / "assets" / app_id / "sounds"
    dst_dat = SITE / "data"   / app_id
    dst_dat.mkdir(parents=True, exist_ok=True)

    pic_src = src_root / "Data" / "Pictures"
    if pic_src.is_dir():
        print(f"  pictures → {dst_pic}")
        convert_pictures(pic_src, dst_pic)
    snd_src = src_root / "Data" / "Sounds"
    if snd_src.is_dir():
        print(f"  sounds → {dst_snd}")
        copy_sounds(snd_src, dst_snd)

    # Config / Tips
    for name in ("Config.txt", "Tips.txt"):
        f = src_root / "Data" / name
        if f.exists():
            (dst_dat / (name.lower().replace(".txt", ".json"))).write_text(
                json.dumps(parse_cfg_txt(f), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    # Units
    units_src = src_root / "Units"
    units_txt = units_src / "Units.txt"
    units = parse_units_txt(units_txt) if units_txt.exists() else []
    for unit in units:
        u_src = units_src / str(unit["id"])
        if not u_src.is_dir():
            unit["_missing"] = True
            continue
        cfg_p  = u_src / "Cfg.txt"
        data_p = u_src / "Data.txt"
        unit["cfg"]  = parse_cfg_txt(cfg_p)  if cfg_p.exists()  else []
        unit["data"] = parse_data_txt(data_p)
        # Copy per-unit audio: data/<App>/unit_<id>/wave/<n>.wav
        u_dst_wave = dst_dat / f"unit_{unit['id']}" / "wave"
        src_wave = u_src / "wave"
        if src_wave.is_dir():
            u_dst_wave.mkdir(parents=True, exist_ok=True)
            for f in src_wave.iterdir():
                if f.suffix.lower() == ".wav":
                    shutil.copy(f, u_dst_wave / f.name.lower())

    # Drop empty/placeholder units. The original ships unit 11 in both apps
    # as a developer-test stub ("זסבזסב", category=" ", LineCount=0,
    # rama "ב'"). It only shows up in the original because the user can
    # never reach rama ב' (RamaList is hidden in Nivim, and even in Hemed
    # the unit has no items to play). Filter at port time so the rama
    # dropdown doesn't list a level whose only entry is an unplayable stub.
    units = [
        u for u in units
        if u.get("_missing") or
           ((u.get("data") or {}).get("items") or [])
    ]
    (dst_dat / "units.json").write_text(
        json.dumps(units, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    # Also emit as plain-JS so the site can run from file:// (browsers
    # block fetch() on file:// origins). The runtime reads
    # window.HND_DATA[<appId>] and never touches the JSON file directly.
    js_path = dst_dat / "units.js"
    js_path.write_text(
        "window.HND_DATA = window.HND_DATA || {};\n"
        "window.HND_DATA[" + json.dumps(app_id) + "] = "
        + json.dumps(units, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"  units → {len(units)} entries, "
          f"{sum(1 for u in units if u.get('_missing'))} missing")


def main():
    # Hemed sources, in priority order — the loose Code/Hemed/ tree is the
    # most up-to-date (10 units, includes astronomia/gimatria that the older
    # archives are missing). Fall back to "New master Setup/Data/hemed.app"
    # (7 units) or the legacy Master/Hemed/clean.dat (7 units) if Code/Hemed
    # isn't present. Pictures still come from the extracted archive because
    # the loose tree doesn't include the BMP/JPG asset folder.
    code_hemed = ROOT / "Hemed"
    new_master_app = ROOT / "New master Setup" / "Data" / "hemed.app"
    legacy_clean  = MASTER / "Hemed" / "clean.dat"
    extracted_pics = SITE / "_raw" / "hemed" / "Hemed" / "Data"

    # 1) Extract pictures/sounds — try in order until one works.
    if not (SITE / "_raw" / "hemed" / "Hemed").is_dir():
        tmp = SITE / "_raw" / "hemed"
        tmp.mkdir(parents=True, exist_ok=True)
        archive = None
        if new_master_app.exists(): archive = new_master_app
        elif legacy_clean.exists(): archive = legacy_clean
        if archive:
            print(f"Extracting {archive.name} → {tmp}")
            subprocess.run(["unrar", "x", "-o+", "-inul", str(archive)], cwd=tmp, check=True)

    if code_hemed.is_dir() and (code_hemed / "Units" / "Units.txt").exists():
        # Synthesize a src_root that pulls Units/Users from loose Code/Hemed
        # but reuses the extracted Data/ (pictures + sounds) from the archive.
        synth = SITE / "_raw" / "hemed_synth"
        synth.mkdir(parents=True, exist_ok=True)
        if not (synth / "Data").exists() and extracted_pics.exists():
            (synth / "Data").symlink_to(extracted_pics.resolve())
        for name in ("Units", "Users"):
            sub = synth / name
            if sub.is_symlink(): sub.unlink()
            if not sub.exists():
                sub.symlink_to((code_hemed / name).resolve())
        port_app("Hemed", synth)
    elif (SITE / "_raw" / "hemed" / "Hemed").is_dir():
        port_app("Hemed", SITE / "_raw" / "hemed" / "Hemed")
    else:
        print("missing Code/Hemed/ and no Hemed archive found")

    # Nivim units source — explicit override directory takes priority if
    # present (user-provided extraction at /test/Nivim). Otherwise fall
    # back to the loose Code/Nivim/ tree.
    override = Path("/home/levlavy/Documents/Tekoa_Computers/test/Nivim")
    if (override / "Units" / "Units.txt").exists():
        nivim_src = override
        print(f"[Nivim] using override units source: {override}")
    else:
        nivim_src = ROOT / "Nivim"
    if nivim_src.is_dir():
        # Stand up a synthetic src_root by symlinking shared Data/Pictures+Sounds
        # from the extracted Hemed clean.dat, plus Nivim's own Units/ + Users/.
        synth = SITE / "_raw" / "nivim_synth"
        synth.mkdir(parents=True, exist_ok=True)
        data_dir = synth / "Data"
        if not data_dir.exists():
            data_dir.symlink_to((SITE / "_raw" / "hemed" / "Hemed" / "Data").resolve())
        for name in ("Units", "Users"):
            sub = synth / name
            if sub.exists() or sub.is_symlink():
                sub.unlink() if sub.is_symlink() else None
            if not sub.exists():
                sub.symlink_to((nivim_src / name).resolve())
        port_app("Nivim", synth)
    else:
        print("missing Code/Nivim/")


if __name__ == "__main__":
    main()
