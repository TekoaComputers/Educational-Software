#!/usr/bin/env python3
"""Walk a list of site roots, write a sibling .webp for every .png.

Quality strategy (matches the recommendation from the analysis):
  - src < 1 KB        → lossless WebP (lossy would inflate via overhead)
  - 1 KB ≤ src < 10 KB → lossless WebP (preserve UI sprite pixel clarity)
  - src ≥ 10 KB        → lossy WebP q=80 (best size on illustrations)

Idempotent: if the .webp exists and is newer than the .png, skip.
Originals are untouched. Phase-1 sibling approach — fully reversible by
deleting the .webp files or `git clean -f -- '*.webp'`.

Usage:
    python tools/png_to_webp.py <root1> [<root2> ...]
    python tools/png_to_webp.py --processes 8 <root>
    python tools/png_to_webp.py --force <root>          # overwrite existing
"""
import argparse
import multiprocessing as mp
import os
import sys
import time
from pathlib import Path

from PIL import Image, UnidentifiedImageError

# ---------- Pipeline constants ---------------------------------------------
LOSSY_QUALITY      = 80
LOSSY_METHOD       = 6        # slowest/best WebP encoder effort
LOSSLESS_QUALITY   = 100      # used as exact-pixel quality at lossless=True
LOSSLESS_THRESHOLD = 10 * 1024  # below this, encode lossless
# ---------------------------------------------------------------------------


def process_one(in_path_str):
    """Returns (route, src_bytes, out_bytes, error_str)."""
    in_path = Path(in_path_str)
    out_path = in_path.with_suffix(".webp")
    try:
        src_bytes = in_path.stat().st_size
    except OSError as e:
        return "error", 0, 0, f"stat failed: {e}"
    if src_bytes == 0:
        return "skipped_empty", 0, 0, ""

    if out_path.exists() and not FORCE:
        try:
            if out_path.stat().st_mtime >= in_path.stat().st_mtime:
                return "skipped_fresh", src_bytes, out_path.stat().st_size, ""
        except OSError:
            pass

    try:
        with Image.open(in_path) as im:
            im.load()
            # WebP-lossy doesn't support palette ('P') directly; convert.
            if im.mode == "P":
                im = im.convert("RGBA" if "transparency" in im.info else "RGB")
            if src_bytes < LOSSLESS_THRESHOLD:
                im.save(out_path, "WEBP",
                        lossless=True, quality=LOSSLESS_QUALITY, method=LOSSY_METHOD)
                route = "lossless"
            else:
                im.save(out_path, "WEBP",
                        lossless=False, quality=LOSSY_QUALITY, method=LOSSY_METHOD)
                route = "lossy"
        return route, src_bytes, out_path.stat().st_size, ""
    except (UnidentifiedImageError, OSError, ValueError) as e:
        # Clean up half-written outputs.
        try:
            if out_path.exists() and out_path.stat().st_size == 0:
                out_path.unlink()
        except OSError:
            pass
        return "error", src_bytes, 0, f"{type(e).__name__}: {e}"


FORCE = False  # set by main


def main():
    global FORCE
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("roots", nargs="+")
    ap.add_argument("--processes", type=int, default=max(1, os.cpu_count() - 2),
                    help="worker processes (default: cpu_count() - 2)")
    ap.add_argument("--force", action="store_true",
                    help="overwrite existing .webp even if it's newer than the .png")
    args = ap.parse_args()
    FORCE = args.force

    roots = [Path(p).resolve() for p in args.roots]
    for r in roots:
        if not r.is_dir():
            sys.exit(f"Not a directory: {r}")

    print(f"Scanning {len(roots)} root(s)…", flush=True)
    files = []
    for r in roots:
        files.extend(r.rglob("*.png"))
        files.extend(r.rglob("*.PNG"))
    files = sorted({str(p) for p in files})
    print(f"  found {len(files)} png files", flush=True)
    if not files:
        return

    counts = {"lossless": 0, "lossy": 0, "skipped_fresh": 0,
              "skipped_empty": 0, "error": 0}
    src_total = out_total = 0
    errors_sample = []

    t0 = time.time()
    print(f"  encoding with {args.processes} workers…", flush=True)
    with mp.Pool(args.processes) as pool:
        for i, (route, sb, ob, err) in enumerate(
                pool.imap_unordered(process_one, files, chunksize=20), 1):
            counts[route] = counts.get(route, 0) + 1
            src_total += sb
            out_total += ob
            if err and len(errors_sample) < 5:
                errors_sample.append(err)
            if i % 500 == 0 or i == len(files):
                dt = time.time() - t0
                rate = i / dt if dt > 0 else 0
                eta = (len(files) - i) / rate if rate > 0 else 0
                print(f"  [{i:>5d}/{len(files)}] "
                      f"lossy={counts['lossy']} lossless={counts['lossless']} "
                      f"skipped={counts['skipped_fresh']+counts['skipped_empty']} "
                      f"err={counts['error']}  "
                      f"{rate:5.1f}/s  ETA {eta/60:.1f}m", flush=True)

    dt = time.time() - t0
    src_mb = src_total / 1024 / 1024
    out_mb = out_total / 1024 / 1024
    print(f"\nDone in {dt/60:.1f} min", flush=True)
    print(f"  lossy:         {counts['lossy']}", flush=True)
    print(f"  lossless:      {counts['lossless']}", flush=True)
    print(f"  skipped fresh: {counts['skipped_fresh']}", flush=True)
    print(f"  skipped empty: {counts['skipped_empty']}", flush=True)
    print(f"  errors:        {counts['error']}", flush=True)
    if errors_sample:
        for e in errors_sample:
            print(f"    {e}", flush=True)
    print(f"  source total:  {src_mb:.1f} MB", flush=True)
    print(f"  webp   total:  {out_mb:.1f} MB", flush=True)
    if src_mb > 0:
        print(f"  reduction:     {(src_mb-out_mb)/src_mb*100:.1f}%", flush=True)


if __name__ == "__main__":
    main()
