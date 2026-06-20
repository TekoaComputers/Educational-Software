#!/usr/bin/env bash
# Launch N parallel shards of clean_video_audio.py across the five sites.
# Each shard processes every N-th video file from the scan.
#
# Usage:
#     bash tools/clean_video_audio_parallel.sh
#     SHARDS=4 bash tools/clean_video_audio_parallel.sh
#     PYTHON=/path/to/python bash tools/clean_video_audio_parallel.sh
set -euo pipefail

SHARDS="${SHARDS:-4}"
PYTHON="${PYTHON:-/tmp/audioclean_venv/bin/python}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO/tools/clean_video_audio.py"

# makhela_site is intentionally excluded — its song videos are music-only
# and afftdn would hurt more than it helps.
ROOTS=(
    "$REPO/Kesem_site"
    "$REPO/Mikraot_site"
    "$REPO/hemed_nivim_site"
    "$REPO/Tirgolit_site"
)

LOGDIR="$(mktemp -d)"
trap 'echo; echo "Logs preserved in: $LOGDIR"' EXIT
echo "Launching $SHARDS shard(s), logs → $LOGDIR"

pids=()
for ((i=0; i<SHARDS; i++)); do
    log="$LOGDIR/shard_$i.log"
    "$PYTHON" "$SCRIPT" "${ROOTS[@]}" --shard "$i" --shards "$SHARDS" \
        > "$log" 2>&1 &
    pids+=($!)
    echo "  shard $i  pid=$!  log=$log"
done

fail=0
for pid in "${pids[@]}"; do
    if ! wait "$pid"; then fail=1; fi
done

echo
echo "=== last line per shard ==="
for ((i=0; i<SHARDS; i++)); do
    last=$(tail -n 1 "$LOGDIR/shard_$i.log")
    echo "  shard $i: $last"
done

exit "$fail"
