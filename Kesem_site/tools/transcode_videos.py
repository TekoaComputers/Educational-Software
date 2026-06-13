#!/usr/bin/env python3
"""
Transcode .avi assets from the Master/ tree to browser-playable .mp4 in the
Kesem_site/assets/<App>/ tree.

Source paths (per app):
  Master/Brahot/DAPEY_KE/MASHAL/MASH<1..6>.AVI   → assets/Brahot/mashal/MASH<N>.mp4
  Master/Brahot/DAPEY_KE/AVI/<name>.AVI          → assets/Brahot/avi/<name>.mp4
  Master/Hagim/DAPEY_KE/MASHAL/MASH<N>.AVI       → assets/Hagim/mashal/MASH<N>.mp4
  Master/Hagim/DAPEY_KE/AVI/<name>.AVI           → assets/Hagim/avi/<name>.mp4
  Master/Yeled/dapey_ke/avi/<name>.AVI           → assets/Yeled/avi/<name>.mp4
  Master/Dvash/dapey_ke/AVI/<name>.avi           → assets/Dvash/avi/<name>.mp4
  Master/Dvash/dapey_ke/Catalog/<NN>.avi         → assets/Dvash/catalog/<NN>.mp4

Output format: H.264 (libx264) + AAC audio, CRF 23, faststart for streaming.
Existing .mp4 files are skipped unless --force is passed.

Usage:
  python3 tools/transcode_videos.py            # transcode everything (skip done)
  python3 tools/transcode_videos.py --dry-run  # show what would be done
  python3 tools/transcode_videos.py --app Dvash  # only one app
  python3 tools/transcode_videos.py --force    # re-transcode existing
"""
from __future__ import annotations
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent           # Kesem_site/
MASTER = ROOT.parent.parent / "Master"                  # ../../Master/
SITE = ROOT

# Per-app mapping: (Master source dir, asset subdir under assets/<App>/).
APPS = {
    "Brahot": [
        ("Brahot/DAPEY_KE/MASHAL", "mashal"),
        ("Brahot/DAPEY_KE/AVI",    "avi"),
    ],
    "Hagim": [
        ("Hagim/DAPEY_KE/MASHAL",  "mashal"),
        ("Hagim/DAPEY_KE/AVI",     "avi"),
    ],
    "Yeled": [
        ("Yeled/dapey_ke/avi",     "avi"),
    ],
    "Dvash": [
        ("Dvash/dapey_ke/AVI",     "avi"),
        ("Dvash/dapey_ke/Catalog", "catalog"),
    ],
    # Kesem master library — referenced by the .MAS lesson headers
    # (introVideo / mashalVideo) and by the editor help buttons.
    #   AVI/<name>.AVI    → game intro / mashal videos
    #   help/<name>.avi   → editor walkthrough (_albom, _hlpdrw, _gzira,
    #                       _hotamot, _zoom, _color, _record, _typing,
    #                       _instruc, _mas_nos, _mas_niv, _tafnew,
    #                       _tafrosh, _tafgzir)
    "Kesem": [
        ("Kesem/dapey_ke/AVI",   "avi"),
        ("Kesem/dapey_ke/help",  "help"),
    ],
}


def transcode_one(src: Path, dst: Path, force: bool, dry: bool) -> bool:
    """Return True if a file was written (or would be in dry-run)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and not force:
        return False
    if dry:
        print(f"  [dry-run] {src.name} → {dst.relative_to(SITE)}")
        return True
    # libx264 CRF 23 (sane default), faststart enables progressive download,
    # -pix_fmt yuv420p keeps QuickTime/Safari happy, AAC 96k mono is enough
    # for these clips (mostly speech).
    # H.264 needs even dimensions; some source files (e.g. Dvash Catalog) are
    # 480x331. `scale=trunc(iw/2)*2:trunc(ih/2)*2` rounds down to nearest even.
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264", "-crf", "23", "-preset", "medium",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-ac", "1",
        "-movflags", "+faststart",
        str(dst),
    ]
    try:
        subprocess.run(cmd, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ERROR: ffmpeg failed for {src}: {e}")
        if dst.exists():
            dst.unlink()
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", choices=list(APPS.keys()), help="restrict to one app")
    ap.add_argument("--force", action="store_true", help="overwrite existing .mp4")
    ap.add_argument("--dry-run", action="store_true", help="don't actually run ffmpeg")
    args = ap.parse_args()

    if shutil.which("ffmpeg") is None:
        print("error: ffmpeg not found on PATH", file=sys.stderr)
        sys.exit(2)

    apps = [args.app] if args.app else list(APPS.keys())

    total_done, total_skipped = 0, 0
    for app in apps:
        print(f"== {app} ==")
        for rel_src, sub in APPS[app]:
            src_dir = MASTER / rel_src
            if not src_dir.is_dir():
                print(f"  skip: {rel_src} (missing)")
                continue
            dst_dir = SITE / "assets" / app / sub
            # Match both .avi and .AVI on case-sensitive filesystems.
            srcs = sorted({p for p in list(src_dir.glob("*.avi")) + list(src_dir.glob("*.AVI"))})
            for src in srcs:
                dst = dst_dir / (src.stem + ".mp4")
                wrote = transcode_one(src, dst, args.force, args.dry_run)
                if wrote: total_done += 1
                else:     total_skipped += 1
    print(f"\ndone: {total_done} converted, {total_skipped} skipped (existing/missing).")


if __name__ == "__main__":
    main()
