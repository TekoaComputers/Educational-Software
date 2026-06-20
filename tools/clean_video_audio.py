#!/usr/bin/env python3
"""Walk a list of site roots, clean the audio track of every video file
via the same afftdn safety-net pipeline used for WAV→MP3, with the video
stream copied byte-for-byte.

Differences vs wav_to_mp3.py:
  - No 5 kHz lowpass (music videos have legitimate high-frequency content).
  - Output container is .mp4 with -c:v copy + AAC audio.
  - Stereo inputs stay stereo; mono stays mono.
  - In-place replacement via tmp + atomic rename.
  - Fallback = file-copy of the original (no re-encode at all).

Per-file routing:

  1. Empty / not a regular file                 → SKIP
  2. afftdn chain extracts processed audio buffer
       Δ = RMS(processed) − RMS(original)
       Δ ≥ −3 dB                                 → AFFTDN (re-encode + remux)
       Δ < −3 dB → compute makeup gain
                   capped by MAX_MAKEUP_GAIN_DB + 0.99 peak ceiling
         re-measure Δ
           Δ ≥ −3 dB                             → AFFTDN_AMPLIFIED
           Δ < −3 dB                             → FALLBACK (file-copy)
  3. afftdn refused (very short clip / no audio) → AFFTDN_ERROR_PASS (file-copy)

Usage:
    python tools/clean_video_audio.py <root1> [<root2> ...] [--shard i --shards N]
"""
import argparse
import shutil
import subprocess
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf  # noqa: F401  # imported for parity / future use
import scipy.signal as sps  # noqa: F401

warnings.filterwarnings("ignore")

# ---------- Pipeline constants ---------------------------------------------
AFFTDN_NR_DB         = 6       # afftdn -nr (noise reduction strength)
AFFTDN_NF_DB         = -25     # afftdn -nf (noise floor estimate)
HIGHPASS_HZ          = 60      # kill rumble + AC hum
AAC_BITRATE          = "96k"   # match source bitrate (~96k AAC mono)
FALLBACK_LOSS_DB     = 3.0     # |Δ| > this triggers amplify → maybe fallback
MAX_MAKEUP_GAIN_DB   = 15.0    # ceiling on makeup-gain dB
PEAK_CEILING         = 0.99    # peak ceiling after makeup gain
VIDEO_EXTS           = (".mp4", ".m4v", ".mov")
EXCLUDE_FROM_CLEANING: list[str] = []
# ---------------------------------------------------------------------------


def afftdn_chain():
    # No lowpass — preserve music's high-frequency content.
    # No resample — afftdn runs at source SR and we keep output there to
    # avoid wasting bitrate on imagined high-frequency content.
    return (f"highpass=f={HIGHPASS_HZ},"
            f"afftdn=nr={AFFTDN_NR_DB}:nf={AFFTDN_NF_DB}")


def rms_db(x: np.ndarray) -> float:
    if x is None or x.size == 0:
        return float("-inf")
    r = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    return float("-inf") if r < 1e-12 else 20.0 * np.log10(r)


def probe_audio(in_path: Path):
    """Returns (channels, sample_rate) for the first audio stream, or
    (None, None) if there isn't one. Parses key=value pairs because
    ffprobe doesn't honour the order of -show_entries args."""
    out = subprocess.run(
        ["ffprobe", "-hide_banner", "-loglevel", "error",
         "-select_streams", "a:0",
         "-show_entries", "stream=channels,sample_rate",
         "-of", "default=noprint_wrappers=1", str(in_path)],
        capture_output=True, text=True, check=False,
    )
    fields = {}
    for line in out.stdout.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            fields[k.strip()] = v.strip()
    try:
        return int(fields["channels"]), int(fields["sample_rate"])
    except (KeyError, ValueError):
        return None, None


def extract_to_buffer(in_path: Path, channels: int, sr: int):
    """Read the original audio as a float32 array at the source SR."""
    completed = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
         "-i", str(in_path),
         "-vn", "-f", "f32le", "-ac", str(channels), "-ar", str(sr), "-"],
        capture_output=True, check=True,
    )
    buf = np.frombuffer(completed.stdout, dtype=np.float32).copy()
    if channels > 1:
        buf = buf.reshape(-1, channels)
    return buf


def afftdn_to_buffer(in_path: Path, channels: int, sr: int):
    """Returns processed float32 buffer at the source SR."""
    completed = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
         "-i", str(in_path), "-af", afftdn_chain(),
         "-f", "f32le", "-ac", str(channels), "-ar", str(sr), "-"],
        capture_output=True, check=True,
    )
    buf = np.frombuffer(completed.stdout, dtype=np.float32).copy()
    if channels > 1:
        buf = buf.reshape(-1, channels)
    return buf


def remux_with_buffer(in_path: Path, out_path: Path,
                      buf: np.ndarray, channels: int, sr: int):
    """Pipe buf into ffmpeg as f32le; remux original video stream + new audio."""
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
         "-f", "f32le", "-ar", str(sr), "-ac", str(channels), "-i", "-",
         "-i", str(in_path),
         "-map", "1:v:0", "-map", "0:a:0",
         "-c:v", "copy",
         "-c:a", "aac", "-b:a", AAC_BITRATE,
         "-movflags", "+faststart",
         # No -shortest: ~8 originals have video shorter than audio
         # (VB6 .avi quirk). Preserve both stream durations as-is.
         "-f", "mp4",
         str(out_path)],
        stdin=subprocess.PIPE,
    )
    proc.stdin.write(buf.astype(np.float32, copy=False).tobytes())
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg remux failed for {out_path}")


def copy_file(in_path: Path, out_path: Path):
    shutil.copy2(str(in_path), str(out_path))


def atomic_replace(tmp_path: Path, target: Path):
    tmp_path.replace(target)


def process_file(in_path: Path):
    """Returns (route, orig_db, final_db, delta_db, applied_gain_db).

    `route` is one of:
      'skipped'            - empty / non-file / no audio stream
      'afftdn'             - afftdn cleaned + remuxed
      'afftdn_amplified'   - afftdn + makeup gain rescued a quiet output
      'fallback'           - even amplified was too quiet → original copied
      'afftdn_error_pass'  - afftdn refused → original copied
      'error'              - failure (tmp left or removed)
    """
    if not in_path.is_file() or in_path.stat().st_size == 0:
        return "skipped", None, None, None, None
    if any(s in str(in_path) for s in EXCLUDE_FROM_CLEANING):
        return "skipped", None, None, None, None

    channels, sr = probe_audio(in_path)
    if channels is None:
        # No audio track — nothing to clean.
        return "skipped", None, None, None, None

    tmp = in_path.with_suffix(in_path.suffix + ".cleaning")
    try:
        try:
            orig = extract_to_buffer(in_path, channels, sr)
            proc = afftdn_to_buffer(in_path, channels, sr)
        except subprocess.CalledProcessError:
            try:
                copy_file(in_path, tmp)
                atomic_replace(tmp, in_path)
                return "afftdn_error_pass", None, None, None, None
            except Exception:
                if tmp.exists(): tmp.unlink()
                return "error", None, None, None, None

        if proc.size == 0:
            try:
                copy_file(in_path, tmp)
                atomic_replace(tmp, in_path)
                return "afftdn_error_pass", None, None, None, None
            except Exception:
                if tmp.exists(): tmp.unlink()
                return "error", None, None, None, None

        orig_db = rms_db(orig)
        proc_db = rms_db(proc)

        # Silent original: nothing to compare, just emit the afftdn output.
        if orig_db == float("-inf"):
            try:
                remux_with_buffer(in_path, tmp, proc, channels, sr)
                atomic_replace(tmp, in_path)
                return "afftdn", orig_db, proc_db, None, None
            except Exception:
                if tmp.exists(): tmp.unlink()
                return "error", orig_db, proc_db, None, None

        delta = proc_db - orig_db
        if delta >= -FALLBACK_LOSS_DB:
            try:
                remux_with_buffer(in_path, tmp, proc, channels, sr)
                atomic_replace(tmp, in_path)
                return "afftdn", orig_db, proc_db, delta, 0.0
            except Exception:
                if tmp.exists(): tmp.unlink()
                return "error", orig_db, proc_db, delta, 0.0

        # Δ < -3 dB → try amplify.
        wanted_db = orig_db - proc_db
        peak = float(np.max(np.abs(proc))) if proc.size else 0.0
        peak_cap_db = float("inf") if peak < 1e-9 else 20.0 * np.log10(PEAK_CEILING / peak)
        applied_db = min(wanted_db, MAX_MAKEUP_GAIN_DB, max(0.0, peak_cap_db))

        if applied_db > 0.0:
            proc_amp = (proc * (10 ** (applied_db / 20))).astype(np.float32)
            amp_db = rms_db(proc_amp)
            if amp_db - orig_db >= -FALLBACK_LOSS_DB:
                try:
                    remux_with_buffer(in_path, tmp, proc_amp, channels, sr)
                    atomic_replace(tmp, in_path)
                    return ("afftdn_amplified", orig_db, amp_db,
                            amp_db - orig_db, applied_db)
                except Exception:
                    if tmp.exists(): tmp.unlink()
                    return "error", orig_db, amp_db, amp_db - orig_db, applied_db

        # Couldn't restore loudness → file-copy preserves the original.
        try:
            copy_file(in_path, tmp)
            atomic_replace(tmp, in_path)
            return "fallback", orig_db, proc_db, delta, applied_db
        except Exception:
            if tmp.exists(): tmp.unlink()
            return "error", orig_db, proc_db, delta, applied_db
    finally:
        if tmp.exists():
            try: tmp.unlink()
            except OSError: pass


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("roots", nargs="+")
    ap.add_argument("--shard",  type=int, default=0)
    ap.add_argument("--shards", type=int, default=1)
    ap.add_argument("--limit",  type=int, default=0,
                    help="Process only the first N files (for spot-checks).")
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
        for ext in VIDEO_EXTS:
            files.extend(sorted(r.rglob(f"*{ext}")))
            files.extend(sorted(r.rglob(f"*{ext.upper()}")))
    files = sorted(set(files))
    if args.shards > 1:
        files = files[args.shard::args.shards]
    if args.limit > 0:
        files = files[:args.limit]
    print(f"{tag}Processing {len(files)} files", flush=True)

    counts = {"skipped": 0, "afftdn": 0,
              "afftdn_amplified": 0, "fallback": 0,
              "afftdn_error_pass": 0, "error": 0}
    t0 = time.time()
    for i, in_path in enumerate(files, 1):
        route, *_ = process_file(in_path)
        counts[route] = counts.get(route, 0) + 1
        if i % 10 == 0 or i == len(files):
            dt = time.time() - t0
            rate = i / dt if dt > 0 else 0
            eta = (len(files) - i) / rate if rate > 0 else 0
            print(f"  {tag}[{i:>4d}/{len(files)}] "
                  f"afftdn={counts['afftdn']} amp={counts['afftdn_amplified']} "
                  f"fallback={counts['fallback']} "
                  f"err_pass={counts['afftdn_error_pass']} "
                  f"err={counts['error']} skip={counts['skipped']}  "
                  f"{rate:5.2f}/s  ETA {eta/60:5.1f}m", flush=True)
    dt = time.time() - t0
    print(f"\n{tag}Done in {dt/60:.1f} min — "
          f"afftdn={counts['afftdn']}  amplified={counts['afftdn_amplified']}  "
          f"fallback={counts['fallback']}  "
          f"err_pass={counts['afftdn_error_pass']}  "
          f"skipped={counts['skipped']}  errors={counts['error']}", flush=True)


if __name__ == "__main__":
    main()
