#!/usr/bin/env python3
"""Build manifest.json for the asset-diff viewer.

Walks each app's ORIGINAL dir (the untracked VB6 source folders at repo
root: Brahot/, Hemed/, Tirgolit/, ...) and its PORTED dir(s) under the
per-site `assets/`, `data/`, etc. Pairs files up by case-insensitive
basename, then emits a manifest the browser viewer renders.

    cd <repo root>
    python3 tools/asset_diff/build_manifest.py
    python3 -m http.server 8080
    # Open http://localhost:8080/tools/asset_diff/

Re-run after asset changes. Originals not present locally → that app's
pairs all show as "ported-only" (still useful — confirms what shipped).
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

IMG_EXTS = {".bmp", ".png", ".jpg", ".jpeg", ".gif", ".webp"}
AUD_EXTS = {".wav", ".mp3", ".ogg", ".m4a", ".aac"}
VID_EXTS = {".avi", ".mp4", ".webm", ".mov", ".mkv"}

# (orig_root, [ported_roots], label).
# orig_root may not exist locally — that's fine. ported_roots are tried
# in order; all that exist are walked.
APPS = [
    # === Kesem suite (one ported asset dir per app) ===
    ("Brahot",          ["Kesem_site/assets/Brahot"],          "ברכות"),
    ("Hagim",           ["Kesem_site/assets/Hagim"],           "חגי ישראל"),
    ("Yeled",           ["Kesem_site/assets/Yeled"],           "עולם הילד"),
    ("Dvash",           ["Kesem_site/assets/Dvash"],           "מן הפרח אל הדבש"),
    ("Heshbon",         ["Kesem_site/assets/Heshbon"],         "ארמון החשבון"),
    ("Ivrit",           ["Kesem_site/assets/Ivrit"],           "עברית מבית טוב"),
    ("Shabat",          ["Kesem_site/assets/Shabat"],          "שבת"),
    ("Shirim",          ["Kesem_site/assets/Shirim"],          "שירי ילדים"),
    ("Shirim&Meshalim", ["Kesem_site/assets/Shirim&Meshalim"], "שירים ומשלים"),
    ("KolKoreA",        ["Kesem_site/assets/KolKoreA"],        "קול קורא א'"),
    ("KolKoreB",        ["Kesem_site/assets/KolKoreB"],        "קול קורא ב'"),
    ("KolKoreC",        ["Kesem_site/assets/KolKoreC"],        "קול קורא ג'"),
    ("KolKoreD",        ["Kesem_site/assets/KolKoreD"],        "קול קורא ד'"),
    ("EnglishA",        ["Kesem_site/assets/EnglishA"],        "אנגלית א'"),
    ("EnglishB",        ["Kesem_site/assets/EnglishB"],        "אנגלית ב'"),
    ("EnglishC",        ["Kesem_site/assets/EnglishC"],        "אנגלית ג'"),
    # === חמ"ד / ניבים (split: assets + data) ===
    ("Hemed",           ["hemed_nivim_site/assets/Hemed",
                         "hemed_nivim_site/data/Hemed"],       "צמד חמד"),
    ("Nivim",           ["hemed_nivim_site/assets/Nivim",
                         "hemed_nivim_site/data/Nivim"],       "ניבים ופתגמים"),
    # === Tirgolit (orig split; port combined) ===
    ("Tirgolit",        ["Tirgolit_site/assets"],              "תרגולית עם תרנגול"),
    ("Tirgolit2",       ["Tirgolit_site/assets"],              "תרגולית 2"),
    # === Makhela: no original dir (DOS .jsdos), assets extracted ===
    ("",                ["makhela_site/assets",
                         "makhela_site/data"],                 "מקהלה עליזה"),
    # === Mikraot ===
    ("Mikraot",         ["Mikraot_site/assets",
                         "Mikraot_site/data"],                 "מקראות אות ועוד..."),
    # === Kesem editor (orig dir is lowercase 'kesem/') ===
    ("kesem",           ["Kesem_site/assets/Kesem"],           "חלונות קסם"),
]


def walk(root: Path):
    """Return [{path, name, ext, cat, size}, ...] for media files under root."""
    if not root.exists():
        return []
    out = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext in IMG_EXTS:
            cat = "image"
        elif ext in AUD_EXTS:
            cat = "audio"
        elif ext in VID_EXTS:
            cat = "video"
        else:
            continue
        try:
            rel = p.relative_to(REPO)
        except ValueError:
            continue
        out.append({
            "path": str(rel).replace("\\", "/"),
            "name": p.stem.lower(),
            "ext": ext,
            "cat": cat,
            "size": p.stat().st_size,
        })
    return out


def build():
    apps = []
    for orig_id, ported_roots, label in APPS:
        orig_files = walk(REPO / orig_id) if orig_id else []
        ported_files = []
        for r in ported_roots:
            ported_files.extend(walk(REPO / r))

        # Index by (cat, name). Keep lists so dupes (.bmp + .png in same
        # tree, or two ports of one orig) all show up.
        def index(files):
            idx = {}
            for f in files:
                idx.setdefault((f["cat"], f["name"]), []).append(f)
            return idx

        orig_idx = index(orig_files)
        ported_idx = index(ported_files)

        # Build pairs. For each (cat, name) key, zip orig+ported lists by
        # position (longer list → unmatched extras carry no counterpart).
        pairs = []
        keys = sorted(set(orig_idx) | set(ported_idx))
        for key in keys:
            cat, name = key
            o_list = orig_idx.get(key, [])
            p_list = ported_idx.get(key, [])
            for i in range(max(len(o_list), len(p_list))):
                o = o_list[i] if i < len(o_list) else None
                p = p_list[i] if i < len(p_list) else None
                pairs.append({"cat": cat, "name": name, "orig": o, "ported": p})

        stats = {
            "total":       len(pairs),
            "matched":     sum(1 for x in pairs if x["orig"] and x["ported"]),
            "orig_only":   sum(1 for x in pairs if x["orig"] and not x["ported"]),
            "ported_only": sum(1 for x in pairs if x["ported"] and not x["orig"]),
            "image":       sum(1 for x in pairs if x["cat"] == "image"),
            "audio":       sum(1 for x in pairs if x["cat"] == "audio"),
            "video":       sum(1 for x in pairs if x["cat"] == "video"),
        }
        apps.append({
            "id":     orig_id or label,
            "label":  label,
            "stats":  stats,
            "pairs":  pairs,
        })

    out_path = Path(__file__).resolve().parent / "manifest.json"
    out_path.write_text(
        json.dumps({"apps": apps}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    total = sum(a["stats"]["total"] for a in apps)
    try:
        rel = out_path.relative_to(REPO)
    except ValueError:
        rel = out_path
    print(f"Wrote {rel} — {len(apps)} apps, {total} pairs")
    for a in apps:
        s = a["stats"]
        line = (
            f"  {a['id']:18s} {s['total']:>5d} pairs "
            f"({s['matched']} matched, "
            f"{s['orig_only']} orig-only, "
            f"{s['ported_only']} ported-only)"
        )
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(build())
