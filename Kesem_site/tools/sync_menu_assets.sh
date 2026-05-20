#!/usr/bin/env bash
# Copy each app's MENU/ folder (UI sprites + backgrounds) from
# Master/Clean/<App>/MENU -> Kesem_site/_raw/menu/<App>/
# Then convert BMPs -> PNG into assets/<App>/menu/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CODE_DIR="$(cd "$SITE_DIR/.." && pwd)"
TEKOA_DIR="$(cd "$CODE_DIR/.." && pwd)"
MASTER_CLEAN="$TEKOA_DIR/Master/Clean"

APPS=(Brahot Hagim Yeled Dvash)

for app in "${APPS[@]}"; do
    src="$MASTER_CLEAN/$app/MENU"
    [[ -d "$src" ]] || src="$MASTER_CLEAN/$app/Menu"
    [[ -d "$src" ]] || src="$MASTER_CLEAN/$app/menu"
    if [[ ! -d "$src" ]]; then
        echo "MISSING menu for $app"
        continue
    fi
    raw="$SITE_DIR/_raw/menu/$app"
    out="$SITE_DIR/assets/$app/menu"
    mkdir -p "$raw" "$out"
    rsync -a --include='*/' --include='*.[Bb][Mm][Pp]' --include='*.[Jj][Pp][Gg]' \
              --include='*.[Jj][Pp][Ee][Gg]' --include='*.[Pp][Nn][Gg]' \
              --exclude='*' "$src/" "$raw/"

    # Convert every BMP/JPG to lowercase-named PNG in assets/<App>/menu/.
    # JPGs are also re-encoded to PNG for a single uniform format.
    converted=0
    skipped=0
    while IFS= read -r -d '' f; do
        rel="${f#$raw/}"
        base="$(basename "${rel%.*}")"
        # lowercase the destination name; PNG extension
        lower="$(echo "$base" | tr '[:upper:]' '[:lower:]')"
        dst="$out/$lower.png"
        if [[ -f "$dst" && "$dst" -nt "$f" ]]; then
            skipped=$((skipped + 1))
            continue
        fi
        if convert "$f" "$dst" 2>/dev/null; then
            converted=$((converted + 1))
        fi
    done < <(find "$raw" -type f \( -iname '*.bmp' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print0)

    printf "  %-7s raw=%5s files | converted=%-4s skipped=%-4s\n" \
        "$app" \
        "$(find "$raw" -type f | wc -l)" \
        "$converted" \
        "$skipped"
done
