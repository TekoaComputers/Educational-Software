#!/usr/bin/env python3
"""Walk a list of site roots, convert every .wav to a sibling .mp3.

For each file the script picks a route:

  * duration < MIN_DURATION_S          → plain encode (no cleaning)
  * VAD speech-ratio < MIN_SPEECH_RATIO → plain encode (likely music/SFX)
  * otherwise                          → full cleaning pipeline, then encode
                                          (noisereduce → DFN polish → Silero VAD gate)

The cleaned buffer is piped straight to ffmpeg/libmp3lame on stdin —
no temp wavs on disk.

Originals are preserved. Pre-existing .mp3 files are overwritten in
place.

Usage:
    python tools/wav_to_mp3.py <root1> [<root2> ...] [--shard i --shards N]

`--shards N` divides the file list into N chunks; `--shard i` (0-based)
picks chunk `i`. Run N copies of the command in parallel with i=0..N-1
to use multiple CPU cores + share the GPU. Each worker loads its own
copy of DFN (~620 MB GPU) and Silero VAD.
"""
import argparse
import os
import sys
import time
import warnings
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
import noisereduce as nr
import scipy.signal as sps
import torch
import torchaudio

warnings.filterwarnings("ignore")

# ---------- Pipeline knobs (locked-in from interactive tuning) -----------
PROP_DECREASE       = 0.85
N_STD_THRESH        = 1.4
TIME_MASK_SMOOTH_MS = 100
FREQ_MASK_SMOOTH_HZ = 1000
DFN_MIX             = 0.6
VAD_THRESHOLD       = 0.5     # fricative-friendly
MIN_SPEECH_MS       = 60
MIN_SILENCE_MS      = 40
SPEECH_PAD_MS       = 80      # fricative-friendly (preserves ח, ש onsets)
FADE_MS             = 12
SILENCE_DB          = -60.0
MIN_DURATION_S      = 1.0     # below: plain encode, skip cleaning
MIN_SPEECH_RATIO    = 0.20    # below: plain encode (music/SFX)
MAX_MAKEUP_GAIN_DB  = 15.0    # ceiling on the peak-match makeup gain
MP3_BITRATE         = "64k"
MP3_CHANNELS        = 1       # force mono
# -----------------------------------------------------------------------


def file_duration_s(path: Path) -> float:
    try:
        info = sf.info(str(path))
        return info.frames / info.samplerate if info.samplerate else 0.0
    except Exception:
        return 0.0


def speech_ratio(path: Path, vad_model, get_speech_timestamps) -> float:
    try:
        data, sr = sf.read(str(path))
    except Exception:
        return 0.0
    if data.ndim > 1:
        data = data.mean(axis=1)
    sig = (sps.resample_poly(data, 16000, sr).astype(np.float32)
           if sr != 16000 else data.astype(np.float32))
    speech = get_speech_timestamps(
        torch.from_numpy(sig), vad_model,
        sampling_rate=16000,
        threshold=0.5,
        min_speech_duration_ms=200,
        min_silence_duration_ms=200,
        speech_pad_ms=0,
    )
    total = sum(w["end"] - w["start"] for w in speech)
    return total / len(sig) if len(sig) else 0.0


def clean_buffer(path: Path, dfn_model, dfn_state, dfn_sr,
                 vad_model, dfn_enhance, get_speech_timestamps):
    """Run the full pipeline; return (cleaned_float32, sample_rate)."""
    data, sr = sf.read(str(path))
    if data.ndim > 1:
        data = data.mean(axis=1)
    orig_peak = float(np.max(np.abs(data))) if len(data) else 0.0
    # 1. noisereduce
    clean = nr.reduce_noise(
        y=data, sr=sr, stationary=True,
        prop_decrease=PROP_DECREASE,
        n_std_thresh_stationary=N_STD_THRESH,
        time_mask_smooth_ms=TIME_MASK_SMOOTH_MS,
        freq_mask_smooth_hz=FREQ_MASK_SMOOTH_HZ,
    )
    # 2. DFN cascade (60% blend)
    wav = torch.from_numpy(clean.astype(np.float32)).unsqueeze(0)
    if sr != dfn_sr:
        wav = torchaudio.functional.resample(wav, sr, dfn_sr)
    enh = dfn_enhance(dfn_model, dfn_state, wav)
    if sr != dfn_sr:
        enh = torchaudio.functional.resample(enh, dfn_sr, sr)
    enh_np = enh.squeeze(0).numpy()
    n = min(len(enh_np), len(clean))
    clean = DFN_MIX * enh_np[:n] + (1 - DFN_MIX) * clean[:n].astype(np.float32)
    # 3. Silero VAD gate
    sig_vad = (sps.resample_poly(clean, 16000, sr).astype(np.float32)
               if sr != 16000 else clean.astype(np.float32))
    speech = get_speech_timestamps(
        torch.from_numpy(sig_vad), vad_model,
        sampling_rate=16000,
        threshold=VAD_THRESHOLD,
        min_speech_duration_ms=MIN_SPEECH_MS,
        min_silence_duration_ms=MIN_SILENCE_MS,
        speech_pad_ms=SPEECH_PAD_MS,
    )
    gain = np.full(len(clean), 10 ** (SILENCE_DB / 20), dtype=np.float32)
    fade_n = max(1, int(sr * FADE_MS / 1000))
    half = np.linspace(0, 1, fade_n, dtype=np.float32)
    for w in speech:
        s = int(w["start"] / 16000 * sr); e = int(w["end"] / 16000 * sr)
        s, e = max(0, s), min(len(gain), e)
        if e <= s:
            continue
        gain[s:e] = 1.0
        fs = max(0, s - fade_n)
        if s - fs > 0:
            gain[fs:s] = np.maximum(gain[fs:s], half[:s - fs])
        fe = min(len(gain), e + fade_n)
        if fe - e > 0:
            gain[e:fe] = np.maximum(gain[e:fe], half[:fe - e][::-1])
    out = (clean.astype(np.float32) * gain)

    # Makeup gain: peak-match to original. noisereduce + DFN both shave
    # peaks (typically 5-12 dB) — restore loudness without exceeding the
    # original peak (so we never clip relative to the source). Capped at
    # +MAX_MAKEUP_GAIN_DB so a near-silent input doesn't get amplified
    # into hiss/noise.
    out_peak = float(np.max(np.abs(out))) if len(out) else 0.0
    if out_peak > 1e-6 and orig_peak > 1e-6:
        wanted = orig_peak / out_peak
        ceiling = 10 ** (MAX_MAKEUP_GAIN_DB / 20)
        out = out * min(wanted, ceiling)
        # Hard safety against >1.0 (shouldn't happen given peak-match):
        peak_now = float(np.max(np.abs(out)))
        if peak_now > 0.99:
            out = out * (0.99 / peak_now)
    return out, sr


def encode_passthrough(wav_path: Path, mp3_path: Path):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
         "-i", str(wav_path),
         "-c:a", "libmp3lame", "-b:a", MP3_BITRATE,
         "-ac", str(MP3_CHANNELS), str(mp3_path)],
        check=True,
    )


def encode_buffer(buf, sr, mp3_path: Path):
    # Pipe float32 mono into ffmpeg via stdin → libmp3lame.
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
         "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", MP3_BITRATE,
         "-ac", str(MP3_CHANNELS), str(mp3_path)],
        stdin=subprocess.PIPE,
    )
    proc.stdin.write(buf.astype(np.float32, copy=False).tobytes())
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {mp3_path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("roots", nargs="+", help="Site directories to walk.")
    ap.add_argument("--shard", type=int, default=0,
                    help="Worker index (0-based). Default 0.")
    ap.add_argument("--shards", type=int, default=1,
                    help="Total number of workers. Default 1.")
    args = ap.parse_args()
    if not (0 <= args.shard < args.shards):
        sys.exit(f"--shard must be in [0, {args.shards}), got {args.shard}")
    tag = f"[s{args.shard}/{args.shards}] " if args.shards > 1 else ""

    roots = [Path(p).resolve() for p in args.roots]
    for r in roots:
        if not r.is_dir():
            sys.exit(f"Not a directory: {r}")

    # Build the file list up front so we can report progress.
    print(f"{tag}Scanning…", flush=True)
    files = []
    for r in roots:
        files.extend(sorted(r.rglob("*.wav")))
        files.extend(sorted(r.rglob("*.WAV")))
    files = sorted(set(files))
    # Shard via stride — every N-th file starting at offset i. This
    # interleaves workers across directories, so the start-up cost (open
    # large dirs, populate filesystem cache) is amortized.
    if args.shards > 1:
        files = files[args.shard::args.shards]
    print(f"{tag}Found {len(files)} .wav files (shard {args.shard}/{args.shards})")

    print(f"{tag}Loading models…", flush=True)
    from df.enhance import enhance as dfn_enhance, init_df
    from silero_vad import load_silero_vad, get_speech_timestamps
    dfn_model, dfn_state, _ = init_df()
    dfn_sr = dfn_state.sr()
    vad_model = load_silero_vad()
    print(f"{tag}Models loaded (DFN @ {dfn_sr} Hz, Silero VAD @ 16 kHz)\n", flush=True)

    cleaned = passthrough = errors = 0
    t0 = time.time()
    for i, in_path in enumerate(files, 1):
        out_path = in_path.with_suffix(".mp3")
        try:
            dur = file_duration_s(in_path)
            if dur <= 0:
                raise ValueError("zero/invalid duration")
            if dur < MIN_DURATION_S:
                encode_passthrough(in_path, out_path)
                passthrough += 1
                reason = f"dur={dur:4.2f}s"
            else:
                ratio = speech_ratio(in_path, vad_model, get_speech_timestamps)
                if ratio < MIN_SPEECH_RATIO:
                    encode_passthrough(in_path, out_path)
                    passthrough += 1
                    reason = f"speech={ratio:5.1%}"
                else:
                    buf, sr = clean_buffer(in_path, dfn_model, dfn_state, dfn_sr,
                                           vad_model, dfn_enhance, get_speech_timestamps)
                    encode_buffer(buf, sr, out_path)
                    cleaned += 1
                    reason = f"speech={ratio:5.1%}  CLEANED"
        except Exception as e:
            errors += 1
            reason = f"ERROR: {e}"
        # Per-100-files progress line (silence individual lines to avoid 21k stdout).
        if i % 100 == 0 or i == len(files):
            dt = time.time() - t0
            rate = i / dt if dt > 0 else 0
            eta = (len(files) - i) / rate if rate > 0 else 0
            print(f"  {tag}[{i:>6d}/{len(files)}] cleaned={cleaned} "
                  f"passthrough={passthrough} err={errors}  "
                  f"{rate:5.1f} files/s  ETA {eta/60:5.1f} min",
                  flush=True)

    dt = time.time() - t0
    print(f"\n{tag}Done in {dt/60:.1f} min — "
          f"{cleaned} cleaned, {passthrough} plain-encoded, {errors} failed")


if __name__ == "__main__":
    main()
