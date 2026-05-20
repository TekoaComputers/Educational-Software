#!/usr/bin/env python3
"""
Parse a per-app stage-data set from CHBOX<rama>.INI and the .MAS files it
references. Produces data/paths/<App>.json:

    {
      "app": "Brahot",
      "ramas": {
        "4": {              # rama level
          "slots": [
            {
              "idx": 0,
              "name": " - ב",
              "masFile": "52.MAS",
              "header": { "introVideo": "\\AVI\\MOZI.AVI", "mashalVideo": "...",
                          "pathName": "מוציא-א" },
              "stages": [
                { "gameNumber": 3, "pic": "3.bmp", "razNom": "3_1" },
                ...
              ]
            },
            ...
          ]
        },
        ...
      }
    }

Each `slot` corresponds to one btnIcon on the Sst main screen.
"""
from __future__ import annotations
import json
import struct
from pathlib import Path

SOURCE_ENCODING = "cp1255"

APPS = ["Brahot", "Hagim", "Yeled", "Dvash"]

# .RAS record format (LEV.BAS: Type FileStru, 68 bytes):
#   Name_of_Rasb As String * 30   bytes  0..29  (cp1255 Hebrew, space-padded)
#   Xx           As Integer       bytes 30..31  (signed little-endian: Left)
#   yy           As Integer       bytes 32..33  (Top)
#   Xx1          As Integer       bytes 34..35  (Width)
#   yy1          As Integer       bytes 36..37  (Height)
#   WavFileName  As String * 30   bytes 38..67  (cp1255, space-padded)
RAS_RECORD = 68


def parse_ras(path: Path) -> list:
    if not path.exists() or path.stat().st_size == 0:
        return []
    data = path.read_bytes()
    n = len(data) // RAS_RECORD
    out = []
    for i in range(n):
        rec = data[i * RAS_RECORD:(i + 1) * RAS_RECORD]
        name = rec[0:30].decode(SOURCE_ENCODING, errors="replace").rstrip(" \x00")
        xx, yy, w, h = struct.unpack("<hhhh", rec[30:38])
        wav = rec[38:68].decode(SOURCE_ENCODING, errors="replace").rstrip(" \x00")
        out.append({
            "name": name,
            "x": xx, "y": yy, "w": w, "h": h,
            "wav": wav,
        })
    return out


def find_rasb_dir(app: str) -> Path | None:
    for cand in (
        Path(f"/home/levlavy/Documents/Tekoa_Computers/Master/{app}/DAPEY_KE/RASB"),
        Path(f"/home/levlavy/Documents/Tekoa_Computers/Master/{app}/dapey_ke/RASB"),
        Path(f"/home/levlavy/Documents/Tekoa_Computers/Master/{app}/DAPEY_KE/Rasb"),
        Path(f"/home/levlavy/Documents/Tekoa_Computers/Master/{app}/dapey_ke/Rasb"),
    ):
        if cand.is_dir():
            return cand
    return None


def read_lines(path: Path) -> list:
    raw = path.read_bytes().decode(SOURCE_ENCODING, errors="replace")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    return raw.split("\n")


def parse_mas(path: Path) -> dict:
    """Parse one .MAS file into a header dict + stage list."""
    if not path.exists():
        return None
    lines = [l.rstrip() for l in read_lines(path)]
    # Strip trailing blanks
    while lines and lines[-1] == "":
        lines.pop()
    # Header: first 6 lines (per Dvash Sst.StartGames2 / Yeled equivalent):
    #   line0: Video_Start_Pr (0 = play in popup, 1 = play inline via
    #          VideoStartEnd; we treat both the same)
    #   line1: Video_End_Pr
    #   line2: Video_Start (e.g. \AVI\ADAMA.AVI for Brahot, \avi\1start.avi
    #          for Dvash) — played BEFORE the first stage
    #   line3: Video_End (e.g. \mashal\mash2.avi for Brahot, \avi\1end.avi
    #          for Dvash) — played AFTER the last stage
    #   line4: path display name (Hebrew, s$ in original)
    #   line5: Coi (stage count) — NOT a stage triplet
    # Stage triplets (gameNumber, pic, razNom) begin at line 6.
    # Field names kept as "introVideo"/"mashalVideo" for now since the runtime
    # references them; they're semantically Video_Start and Video_End.
    header = {
        "videoStartPr": lines[0].strip() if len(lines) > 0 else "",
        "videoEndPr":   lines[1].strip() if len(lines) > 1 else "",
        "introVideo":   lines[2].strip() if len(lines) > 2 else "",   # = Video_Start
        "mashalVideo":  lines[3].strip() if len(lines) > 3 else "",   # = Video_End
        "pathName":     lines[4].strip() if len(lines) > 4 else "",
        "stageCount":   lines[5].strip() if len(lines) > 5 else "",   # = Coi
    }
    # Per Dvash Sst.StartGames2:
    #   For i = 1 To Coi
    #     Input #2, PN   ' picture filename
    #     Input #2, RN   ' .RAS basename (NameRasb)
    #     Input #2, GN   ' game number
    # → triplet is (pic, razNom, gameNumber) starting at line 6.
    stages = []
    body = lines[6:]
    for i in range(0, len(body), 3):
        triplet = body[i:i + 3]
        if len(triplet) < 3:
            break
        try:
            gn = int(triplet[2].strip())
        except ValueError:
            continue
        stages.append({
            "gameNumber": gn,
            "pic":     triplet[0].strip(),
            "razNom":  triplet[1].strip(),
        })
    return {"header": header, "stages": stages}


def parse_chbox(path: Path) -> list:
    """Parse a CHBOX<rama>.INI — pairs of (ChName, ChFname)."""
    if not path.exists() or path.stat().st_size == 0:
        return []
    lines = [l.rstrip() for l in read_lines(path)]
    while lines and lines[-1] == "":
        lines.pop()
    out = []
    for i in range(0, len(lines), 2):
        if i + 1 >= len(lines):
            break
        out.append({"name": lines[i].strip(), "masFile": lines[i + 1].strip()})
    return out


def app_dirs(app: str):
    base = Path(f"/home/levlavy/Documents/Tekoa_Computers/Master/Clean/{app}")
    if not base.is_dir():
        base = Path(f"/home/levlavy/Documents/Tekoa_Computers/Code/{app}")
    maslul = None
    for cand in ("MASLUL", "Maslul", "maslul"):
        if (base / cand).is_dir():
            maslul = base / cand
            break
    return base, maslul


def main():
    site = Path(__file__).resolve().parent.parent
    out_dir = site / "data" / "paths"
    out_dir.mkdir(parents=True, exist_ok=True)

    for app in APPS:
        base, maslul = app_dirs(app)
        rasb = find_rasb_dir(app)
        result = {"app": app, "ramas": {}}
        total_hot = 0
        stage_count = 0
        for rama in (1, 2, 3, 4):
            ini = base / f"CHBOX{rama}.INI"
            if not ini.exists():
                ini = base / f"ChBox{rama}.ini"
            slots = parse_chbox(ini)
            rama_slots = []
            for idx, slot in enumerate(slots):
                entry = {"idx": idx, "name": slot["name"], "masFile": slot["masFile"]}
                if maslul:
                    # .MAS files vary in case across distributions.
                    mas_path = None
                    for cand in (slot["masFile"],
                                 slot["masFile"].lower(),
                                 slot["masFile"].upper()):
                        p = maslul / cand
                        if p.exists():
                            mas_path = p
                            break
                    mas = parse_mas(mas_path) if mas_path else None
                    if mas:
                        entry["header"] = mas["header"]
                        entry["stages"] = mas["stages"]
                        # For each stage, attempt to parse its associated .RAS
                        # (hotspot records on Picture1).
                        for st in entry["stages"]:
                            stage_count += 1
                            if not rasb or not st.get("razNom"):
                                continue
                            for ext in (".RAS", ".ras"):
                                cand = rasb / f"{st['razNom']}{ext}"
                                if cand.exists():
                                    recs = parse_ras(cand)
                                    if recs:
                                        st["hotspots"] = recs
                                        total_hot += len(recs)
                                    break
                rama_slots.append(entry)
            if rama_slots:
                result["ramas"][str(rama)] = {"slots": rama_slots}
        out = out_dir / f"{app}.json"
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        total = sum(len(r["slots"]) for r in result["ramas"].values())
        print(f"  {app}: {len(result['ramas'])} rama(s), {total} slot(s), "
              f"{stage_count} stages, {total_hot} hotspots -> {out.name}")


if __name__ == "__main__":
    main()
