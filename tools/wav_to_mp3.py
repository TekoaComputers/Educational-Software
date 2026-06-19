#!/usr/bin/env python3
"""Walk a list of site roots, convert every .wav to a sibling .mp3 via
the ffmpeg afftdn pipeline with a loudness safety-net.

For each file:

  1. Skip if empty / not a regular file.
  2. If path in EXCLUDE_FROM_CLEANING → passthrough (raw libmp3lame).
  3. Otherwise:
       a. Run ffmpeg afftdn chain (highpass 60 Hz + afftdn + lowpass
          5 kHz + soxr resample). Capture float buffer in memory.
       b. Measure Δ = RMS(whole proc) − RMS(whole orig).
       c. If Δ ≥ −10 dB → encode the buffer directly.
       d. Else compute makeup gain, capped by MAX_MAKEUP_GAIN_DB and the
          0.99 peak ceiling. Apply, re-measure Δ:
              • Δ ≥ −10 dB → AMPLIFIED afftdn.
              • Δ still <  −10 dB (peak ceiling clamped) → FALLBACK to
                raw libmp3lame passthrough (preserves loudness).

No models, no GPU, no VAD. Pure ffmpeg + numpy. ~0.05 s per file CPU.

Usage:
    python tools/wav_to_mp3.py <root1> [<root2> ...] [--shard i --shards N]
"""
import argparse
import subprocess
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf
import scipy.signal as sps

warnings.filterwarnings("ignore")

# ---------- Pipeline constants ---------------------------------------------
AFFTDN_NR_DB         = 6       # afftdn -nr (noise reduction strength)
AFFTDN_NF_DB         = -25     # afftdn -nf (noise floor estimate)
HIGHPASS_HZ          = 60      # kill rumble + AC hum
LOWPASS_HZ           = 5000    # kill high-frequency hiss
TARGET_SR            = 44100   # delivery sample rate after soxr
MP3_BITRATE          = "64k"   # libmp3lame bitrate
MP3_CHANNELS         = 1       # force mono
FALLBACK_LOSS_DB     = 3.0     # |Δ| > this triggers amplify → maybe fallback
MAX_MAKEUP_GAIN_DB   = 15.0    # ceiling on makeup-gain dB
PEAK_CEILING         = 0.99    # peak ceiling after makeup gain
# Paths matching any of these go straight to passthrough — sources that
# are already well-recorded and would only be dulled by the filter chain.
EXCLUDE_FROM_CLEANING = [
    "/Kesem_site/assets/Ivrit/",
]
# ---------------------------------------------------------------------------


def afftdn_chain():
    return (f"highpass=f={HIGHPASS_HZ},"
            f"afftdn=nr={AFFTDN_NR_DB}:nf={AFFTDN_NF_DB},"
            f"lowpass=f={LOWPASS_HZ},"
            f"aresample={TARGET_SR}:resampler=soxr:precision=28")


def rms_db(x: np.ndarray) -> float:
    if x is None or len(x) == 0:
        return float("-inf")
    r = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    return float("-inf") if r < 1e-12 else 20.0 * np.log10(r)


def afftdn_to_buffer(in_path: Path):
    """Returns (orig_arr, sr_orig, proc_arr, sr_proc=TARGET_SR)."""
    orig, sr_orig = sf.read(str(in_path))
    if orig.ndim > 1:
        orig = orig.mean(axis=1)
    orig = orig.astype(np.float32)
    completed = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
         "-i", str(in_path), "-af", afftdn_chain(),
         "-f", "f32le", "-ac", "1", "-ar", str(TARGET_SR), "-"],
        capture_output=True, check=True,
    )
    proc_buf = np.frombuffer(completed.stdout, dtype=np.float32)
    return orig, sr_orig, proc_buf, TARGET_SR


def encode_passthrough(in_path: Path, out_path: Path):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
         "-i", str(in_path),
         "-c:a", "libmp3lame", "-b:a", MP3_BITRATE,
         "-ac", str(MP3_CHANNELS), str(out_path)],
        check=True,
    )


def encode_buffer_to_mp3(buf: np.ndarray, sr: int, out_path: Path):
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
         "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", MP3_BITRATE,
         "-ac", str(MP3_CHANNELS), str(out_path)],
        stdin=subprocess.PIPE,
    )
    proc.stdin.write(buf.astype(np.float32, copy=False).tobytes())
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed for {out_path}")


def process_file(in_path: Path, out_path: Path):
    """Returns (route, orig_db, final_db, delta_db, applied_gain_db).

    `route` is one of:
      'skipped'           - empty/non-file/dir, no output written
      'passthrough'       - EXCLUDE_FROM_CLEANING path, raw mp3
      'afftdn'            - afftdn pipeline succeeded within tolerance
      'afftdn_amplified'  - afftdn + makeup gain rescued a quiet output
      'fallback'          - even amplified output too quiet → raw mp3
      'error'             - ffmpeg or I/O failure
    """
    if not in_path.is_file() or in_path.stat().st_size == 0:
        return "skipped", None, None, None, None
    if any(s in str(in_path) for s in EXCLUDE_FROM_CLEANING):
        try:
            encode_passthrough(in_path, out_path)
            return "passthrough", None, None, None, None
        except Exception:
            return "error", None, None, None, None

    try:
        orig, sr_o, proc, sr_p = afftdn_to_buffer(in_path)
    except subprocess.CalledProcessError:
        # afftdn refused (file too short for its analysis window, etc).
        # Make sure we still produce an MP3 — plain passthrough so the
        # file is at least listenable + freshly encoded.
        try:
            encode_passthrough(in_path, out_path)
            return "afftdn_error_pass", None, None, None, None
        except Exception:
            return "error", None, None, None, None
    if len(proc) == 0:
        try:
            encode_passthrough(in_path, out_path)
            return "afftdn_error_pass", None, None, None, None
        except Exception:
            return "error", None, None, None, None

    # Match sample rates for a fair whole-file RMS comparison.
    if sr_o != sr_p:
        orig_cmp = sps.resample_poly(orig, sr_p, sr_o).astype(np.float32)
    else:
        orig_cmp = orig

    orig_db = rms_db(orig_cmp)
    proc_db = rms_db(proc)

    # Silent original: nothing to compare, just emit the afftdn output.
    if orig_db == float("-inf"):
        try:
            encode_buffer_to_mp3(proc, sr_p, out_path)
            return "afftdn", orig_db, proc_db, None, None
        except Exception:
            return "error", orig_db, proc_db, None, None

    delta = proc_db - orig_db
    if delta >= -FALLBACK_LOSS_DB:
        try:
            encode_buffer_to_mp3(proc, sr_p, out_path)
            return "afftdn", orig_db, proc_db, delta, 0.0
        except Exception:
            return "error", orig_db, proc_db, delta, 0.0

    # Δ < -10 dB → try to amplify.
    wanted_db = orig_db - proc_db                   # positive
    peak = float(np.max(np.abs(proc)))
    peak_cap_db = float("inf") if peak < 1e-9 else 20.0 * np.log10(PEAK_CEILING / peak)
    applied_db = min(wanted_db, MAX_MAKEUP_GAIN_DB, max(0.0, peak_cap_db))

    if applied_db > 0.0:
        proc_amp = (proc * (10 ** (applied_db / 20))).astype(np.float32)
        amp_db = rms_db(proc_amp)
        if amp_db - orig_db >= -FALLBACK_LOSS_DB:
            try:
                encode_buffer_to_mp3(proc_amp, sr_p, out_path)
                return "afftdn_amplified", orig_db, amp_db, amp_db - orig_db, applied_db
            except Exception:
                return "error", orig_db, amp_db, amp_db - orig_db, applied_db

    # Couldn't restore loudness → raw passthrough preserves it.
    try:
        encode_passthrough(in_path, out_path)
        return "fallback", orig_db, proc_db, delta, applied_db
    except Exception:
        return "error", orig_db, proc_db, delta, applied_db


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("roots", nargs="+")
    ap.add_argument("--shard",  type=int, default=0)
    ap.add_argument("--shards", type=int, default=1)
    args = ap.parse_args()
    if not (0 <= args.shard < args.shards):
        sys.exit(f"--shard must be in [0, {args.shards})")
    tag = f"[s{args.shard}/{args.shards}] " if args.shards > 1 else ""

    roots = [Path(p).resolve() for p in args.roots]
    for r in roots:
        if not r.is_dir():
            sys.exit(f"Not a directory: {r}")

    print(f"{tag}Scanning…", flush=True)
    files = []
    for r in roots:
        files.extend(sorted(r.rglob("*.wav")))
        files.extend(sorted(r.rglob("*.WAV")))
    files = sorted(set(files))
    if args.shards > 1:
        files = files[args.shard::args.shards]
    print(f"{tag}Processing {len(files)} files", flush=True)

    counts = {"skipped": 0, "passthrough": 0, "afftdn": 0,
              "afftdn_amplified": 0, "fallback": 0,
              "afftdn_error_pass": 0, "error": 0}
    t0 = time.time()
    for i, in_path in enumerate(files, 1):
        out_path = in_path.with_suffix(".mp3")
        route, *_ = process_file(in_path, out_path)
        counts[route] = counts.get(route, 0) + 1
        if i % 100 == 0 or i == len(files):
            dt = time.time() - t0
            rate = i / dt if dt > 0 else 0
            eta = (len(files) - i) / rate if rate > 0 else 0
            print(f"  {tag}[{i:>6d}/{len(files)}] "
                  f"afftdn={counts['afftdn']} amp={counts['afftdn_amplified']} "
                  f"fallback={counts['fallback']} pass={counts['passthrough']} "
                  f"err_pass={counts['afftdn_error_pass']} "
                  f"err={counts['error']} skip={counts['skipped']}  "
                  f"{rate:5.1f}/s  ETA {eta/60:5.1f}m", flush=True)
    dt = time.time() - t0
    print(f"\n{tag}Done in {dt/60:.1f} min — "
          f"afftdn={counts['afftdn']}  amplified={counts['afftdn_amplified']}  "
          f"fallback={counts['fallback']}  passthrough={counts['passthrough']}  "
          f"err_pass={counts['afftdn_error_pass']}  "
          f"skipped={counts['skipped']}  errors={counts['error']}", flush=True)


if __name__ == "__main__":
    main()
