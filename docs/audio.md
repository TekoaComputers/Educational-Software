# Audio pipeline — WAV → cleaned MP3

The Kesem, Mikraot, and Hemed/Nivim sites default to playing `.mp3`
versions of every audio asset. Originals (`.wav`) are kept on disk and
in git; a runtime shim transparently rewrites every audio URL.

## Runtime — `main_site_assets/audio_format.js`

Loaded before any other script in each site's `index.html`. Wraps:

- `new Audio(url)` constructor
- `HTMLMediaElement.src` setter (covers `audio.src = '…/x.wav'`)
- `HTMLSourceElement.src` setter (covers `<source src="…/x.wav">`)
- `window.fetch`
- `XMLHttpRequest.open`

Each rewrites a trailing `.wav` to `.mp3`. No app-side code changes are
needed.

**Console toggle** (no UI by design):

```js
setAudioFormat('wav')   // play originals
setAudioFormat('mp3')   // play mp3 (default)
audioFormat()           // current
```

Choice is persisted in `localStorage`; reload to apply.

## Batch conversion — `tools/wav_to_mp3.py`

Pure-CPU ffmpeg + numpy. No models, no GPU, no VAD. Settled here after
several iterations through Whisper/DFN/inverse-dominance pipelines —
ffmpeg's built-in `afftdn` (FFT-domain denoiser) turned out to do the
job adequately on the bulk of the corpus, and a small whole-file RMS
safety-net catches the rare cases it over-suppresses.

Per-file routing:

```
                          INPUT WAV
                              │
                              ▼
   1. not a regular file / 0 bytes               → SKIP
   2. path in EXCLUDE_FROM_CLEANING (Ivrit)      → PASSTHROUGH (raw mp3)
   3. afftdn-chain to float buffer in memory
                              │
                              ▼
              Δ = RMS(whole proc) − RMS(whole orig)
                              │
                  ┌───────────┴───────────┐
                Δ ≥ −3 dB              Δ < −3 dB
                  │                       │
                  ▼                       ▼
              AFFTDN              compute makeup gain
              (as-is)             cap by MAX_MAKEUP_GAIN_DB + 0.99 peak
                                      │
                                      ▼
                                  re-measure Δ
                                  ┌────────┴────────┐
                                Δ ≥ −3 dB        Δ < −3 dB
                                  │                  │
                                  ▼                  ▼
                            AFFTDN_AMPLIFIED     FALLBACK
                                                (raw mp3, preserves loudness)
```

The afftdn chain:

```
ffmpeg -af "highpass=f=60,                                # kill rumble
            afftdn=nr=6:nf=-25,                           # FFT denoiser
            lowpass=f=5000,                               # kill high hiss
            aresample=44100:resampler=soxr:precision=28"  # clean upsample
       -c:a libmp3lame -b:a 64k -ac 1 …
```

`afftdn` short-clip refusals (FFT analysis window > signal length) fall
through to plain libmp3lame encode (`afftdn_error_pass`), so every WAV
ends up with an MP3.

Tunables (constants near the top of `wav_to_mp3.py`):

| Constant | Value | Role |
|---|---|---|
| `AFFTDN_NR_DB` | 6 | noise reduction strength; lower = fewer musical-noise artifacts but more residual hiss |
| `AFFTDN_NF_DB` | −25 | noise-floor estimate |
| `HIGHPASS_HZ` | 60 | rumble + 50/60 Hz hum cutoff |
| `LOWPASS_HZ` | 5000 | aliasing-band cutoff |
| `TARGET_SR` | 44100 | delivery rate after soxr |
| `MP3_BITRATE` | 64k | mono CBR |
| `FALLBACK_LOSS_DB` | 3 | |Δ| > this triggers amplify → maybe fallback |
| `MAX_MAKEUP_GAIN_DB` | 15 | ceiling on makeup-gain dB |
| `PEAK_CEILING` | 0.99 | post-gain peak cap |
| `EXCLUDE_FROM_CLEANING` | `/Kesem_site/assets/Ivrit/` | path-substring matches go straight to passthrough |

### Parallel run

`tools/wav_to_mp3_parallel.sh` launches N shards (default 8 — pure-CPU,
no GPU contention). 21k files = ~4 min wall on a 24-core box.

```bash
bash tools/wav_to_mp3_parallel.sh
SHARDS=12 bash tools/wav_to_mp3_parallel.sh
PYTHON=/path/to/python bash tools/wav_to_mp3_parallel.sh
```

The three site roots are hardcoded inside the wrapper.

Single-process / single-dir sanity batch:

```bash
python tools/wav_to_mp3.py <dir>                          # 1 shard
python tools/wav_to_mp3.py <dir> --shard 0 --shards 4     # shard 0 of 4
```

### Plain converter (no cleaning)

`tools/wav_to_mp3.sh` — `libmp3lame -b:a 64k -ac 1` via `xargs -P 6`. No
afftdn, no safety net. Use only when you want byte-for-byte content
preservation in MP3 form.

## Output buckets (last full-corpus run, 21,423 files, 4 min 29 s)

| Route | Count | % |
|---|---|---|
| `afftdn` | 18,159 | 84.8 % |
| `passthrough` (Ivrit exclusion) | 2,894 | 13.5 % |
| `afftdn_error_pass` (short-clip refusal → raw mp3) | 322 | 1.5 % |
| `afftdn_amplified` (safety net rescued) | 36 | 0.2 % |
| `fallback` (safety net couldn't rescue → raw mp3) | 8 | 0 % |
| `skipped` (empty file / directory misnamed `.wav`) | 4 | 0 % |
| `errors` | 0 | 0 % |

21,419 / 21,419 valid WAVs → MP3s. The four "skipped" are persistent
broken inputs (3 zero-byte Hagim placeholders + a directory misnamed
`avara.wav`).

## Don'ts

- **Don't delete the originals.** They're the playback fallback when a
  developer flips `setAudioFormat('wav')`, and the pipeline itself
  reads them as input on every re-run.
- **Don't re-run blindly with tighter settings.** Each run rewrites
  every MP3 in-place. To experiment, run on a single subfolder first
  (`python tools/wav_to_mp3.py Kesem_site/assets/Brahot`).

## Setup (one-time, for re-runs)

The current pipeline only needs `numpy`, `scipy`, `soundfile`, and
`ffmpeg`. The existing venv at `/tmp/audioclean_venv` already has them
(plus the older Whisper/DFN install — unused now but harmless).

```bash
python3 -m venv /tmp/audioclean_venv
/tmp/audioclean_venv/bin/pip install numpy scipy soundfile
# ffmpeg ≥ 4.2 with afftdn (built-in since 4.2)
```

The wrapper hits `ffmpeg` from `$PATH`.

## History — what we tried before settling on afftdn

In rough order, each abandoned for the noted reason:

1. **noisereduce + DFN + Silero VAD gate + makeup gain.** Best on
   stationary hiss but over-suppressed Hebrew fricatives (ש, ח, etc.)
   and clipped word fragments where VAD boundaries fell wrong.
2. **Whisper-VAD swap** (ivrit-ai/faster-whisper-v2-d4) replacing
   Silero. Better window boundaries; same broadband over-suppression.
3. **Per-folder inverse-dominance EQ** (PSD non-speech vs in-speech →
   continuous gain curve). Best speech-preservation on the worst
   buzzy files but expensive (~13 min/run, GPU).
4. **AudioSep** (text-prompt source separation). Heavy + over-processed.
5. **`afftdn` alone** — what we ended up with. Adequate on 99 % of the
   corpus, trivial to run, no models.

If a particular subdir still sounds wrong, the inverse-dominance code
is preserved in `tools/audio_test/run_inverse.py` for ad-hoc rescue
work.
