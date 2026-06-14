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

Per-file routing:

1. duration < `MIN_DURATION_S` (1.0 s) → plain encode (no cleaning).
2. Silero VAD speech ratio < `MIN_SPEECH_RATIO` (0.20) → plain encode
   (music / SFX — the cleaning stages would damage them).
3. Otherwise → **full cleaning pipeline**, then encode.

The cleaning pipeline:

```
wav  ──►  noisereduce (stationary spectral gate)
         ──►  DeepFilterNet polish (60 % mix)
              ──►  Silero VAD silence gate (–60 dB outside windows)
                   ──►  peak-match makeup gain (cap +15 dB)
                        ──►  ffmpeg / libmp3lame 64 kbps mono
```

Every knob is a constant near the top of `wav_to_mp3.py` (DFN mix, VAD
threshold / pad, makeup-gain ceiling, etc). The settings landed via
interactive A/B tuning — change with care and re-listen.

### Parallel run

`tools/wav_to_mp3_parallel.sh` launches N shards (default 6). Each
worker loads its own DFN + VAD copy into the GPU (~620 MB GPU per
shard). Used on a CUDA box, 6 shards = ~13 min wall for ~21 k files vs
~47 min single-process.

```bash
bash tools/wav_to_mp3_parallel.sh
SHARDS=4 bash tools/wav_to_mp3_parallel.sh
```

The three site roots are hardcoded inside the wrapper.

To run a single-process / single-dir sanity batch:

```bash
python tools/wav_to_mp3.py <dir>           # 1 shard
python tools/wav_to_mp3.py <dir> --shard 0 --shards 4   # 1 shard of 4
```

### Plain converter (no cleaning)

`tools/wav_to_mp3.sh` — `libmp3lame -b:a 64k -ac 1` via `xargs -P 6`. No
models, no GPU. Use when you just want WAV → MP3 size reduction without
the cleaning behaviour.

## Don'ts

- **Don't re-run blindly on a tree where .mp3s already exist** —
  encoding cleaned-MP3 → cleaned-MP3 (decoded back through ffmpeg)
  loses fidelity twice. Re-run only when a setting changes.
- **Don't run the cleaning script on music videos** (.mp4 etc).
  DeepFilterNet treats music as noise; Silero VAD mutes anything that
  isn't speech. The `--shard` driver only walks `*.wav` so it's
  protected, but ad-hoc invocations on music files are not.
- **Don't delete the originals.** They're the playback fallback when a
  developer flips `setAudioFormat('wav')`, and the cleaning stages
  themselves need them as input on every re-run.

## Setup (one-time, for re-runs)

Models + deps live in a venv at `/tmp/audioclean_venv` (Python 3.11):

```bash
python3.11 -m venv /tmp/audioclean_venv
/tmp/audioclean_venv/bin/pip install \
    'torch==2.2.*' 'torchaudio==2.2.*' \
    --index-url https://download.pytorch.org/whl/cpu
/tmp/audioclean_venv/bin/pip install \
    noisereduce soundfile scipy numpy deepfilternet silero-vad
```

Then `tools/wav_to_mp3_parallel.sh` uses that venv via the `PYTHON`
env var (default: `/tmp/audioclean_venv/bin/python`).

The wrapper hits `ffmpeg` from `$PATH`.
