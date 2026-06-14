#!/usr/bin/env bash
# Launch N parallel shards of wav_to_mp3.py. Each worker loads its own
# DFN + VAD into the GPU and chews on every N-th file from the scan.
#
# Usage:
#     bash tools/wav_to_mp3_parallel.sh
#     SHARDS=4 bash tools/wav_to_mp3_parallel.sh
#     PYTHON=/path/to/python bash tools/wav_to_mp3_parallel.sh
#
# GPU memory cost: ~620 MB per shard. The default of 6 fits comfortably
# in 8+ GB GPUs.
set -euo pipefail

SHARDS="${SHARDS:-6}"
PYTHON="${PYTHON:-/tmp/audioclean_venv/bin/python}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO/tools/wav_to_mp3.py"

ROOTS=(
    "$REPO/Kesem_site"
    "$REPO/Mikraot_site"
    "$REPO/hemed_nivim_site"
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

# Tail the final progress line of every shard while we wait, then collect.
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
