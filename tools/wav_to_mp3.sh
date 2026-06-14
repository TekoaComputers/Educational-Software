#!/usr/bin/env bash
# Convert every .wav under the named site roots to a sibling .mp3.
# Originals are preserved. Already-converted files (where the .mp3 is
# newer than the .wav) are skipped, so this is safe to re-run.
#
# Quality: 64 kbps CBR mono — the source audio is 8-bit / 11-22 kHz,
# mostly speech. 64k is transparent for that fidelity and shrinks the
# typical file to ~10-15% of its WAV size.
#
# Parallelism: 6 workers (override with CORES=N).
#
# Usage:
#   bash tools/wav_to_mp3.sh
#   CORES=4 bash tools/wav_to_mp3.sh
set -euo pipefail

CORES="${CORES:-6}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

ROOTS=(
    "$REPO/Kesem_site"
    "$REPO/Mikraot_site"
    "$REPO/hemed_nivim_site"
)

convert_one() {
    local in="$1"
    local out="${in%.[wW][aA][vV]}.mp3"
    if [ -f "$out" ] && [ "$out" -nt "$in" ]; then
        return 0
    fi
    ffmpeg -y -loglevel error -nostdin -i "$in" \
        -c:a libmp3lame -b:a 64k -ac 1 "$out"
}
export -f convert_one

# Build the file list (NUL-separated for safety with weird names).
list_file=$(mktemp)
trap 'rm -f "$list_file"' EXIT
for root in "${ROOTS[@]}"; do
    [ -d "$root" ] || { echo "skip (missing): $root" >&2; continue; }
    find "$root" -type f -iname '*.wav' -print0 >> "$list_file"
done

total=$(tr -cd '\0' < "$list_file" | wc -c)
echo "Converting $total .wav files via $CORES workers…"
xargs -0 -P "$CORES" -I {} bash -c 'convert_one "$@"' _ {} < "$list_file"
echo "Done."
