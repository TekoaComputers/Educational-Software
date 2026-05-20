#!/usr/bin/env bash
# Sync original VB source (from Code/) and Master content (from Master/)
# into Kesem_site/_raw/ as the canonical archive for conversion + extraction.
# _raw/ is gitignored; nothing here ships to the web.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CODE_DIR="$(cd "$SITE_DIR/.." && pwd)"
TEKOA_DIR="$(cd "$CODE_DIR/.." && pwd)"
MASTER_DIR="$TEKOA_DIR/Master"

APPS=(Brahot Hagim Yeled Dvash)

mkdir -p "$SITE_DIR/_raw/code" "$SITE_DIR/_raw/master" "$SITE_DIR/assets/common/icons"

echo "Source roots:"
echo "  Code:   $CODE_DIR"
echo "  Master: $MASTER_DIR"
echo "  Dest:   $SITE_DIR/_raw"
echo

echo "[1/2] VB source from Code/ -> _raw/code/"
for app in "${APPS[@]}"; do
    src="$CODE_DIR/$app"
    dst="$SITE_DIR/_raw/code/$app"
    if [[ ! -d "$src" ]]; then
        echo "  MISSING: $src"
        continue
    fi
    mkdir -p "$dst"
    rsync -a \
        --include='*/' \
        --include='*.frm' --include='*.FRM' \
        --include='*.frx' --include='*.FRX' \
        --include='*.bas' --include='*.BAS' \
        --include='*.cls' --include='*.CLS' \
        --include='*.ctl' --include='*.CTL' \
        --include='*.ctx' --include='*.CTX' \
        --include='*.vbp' --include='*.VBP' \
        --include='*.vbw' --include='*.VBW' \
        --include='*.vbg' --include='*.VBG' \
        --include='*.res' --include='*.RES' \
        --exclude='*' \
        "$src/" "$dst/"
    printf "  %-10s %s\n" "$app" "$(du -sh "$dst" | cut -f1)"
done

echo
echo "[2/2] Master content -> _raw/master/  (excluding VB runtime + installers)"
EXCLUDES=(
    --exclude='*.dll' --exclude='*.exe' --exclude='*.tlb' --exclude='*.lnk'
    --exclude='Setup.info' --exclude='setup.info'
    --exclude='Autorun.inf' --exclude='autorun.inf'
    --exclude='clean.dat'   --exclude='60hz.txt'
)
for app in "${APPS[@]}"; do
    src="$MASTER_DIR/$app"
    dst="$SITE_DIR/_raw/master/$app"
    if [[ ! -d "$src" ]]; then
        echo "  MISSING: $src"
        continue
    fi
    mkdir -p "$dst"
    rsync -a "${EXCLUDES[@]}" "$src/" "$dst/"
    shopt -s nullglob
    for ico in "$src"/*.ico "$src"/*.ICO; do
        [[ -f "$ico" ]] || continue
        base="$(basename "$ico")"
        cp -n "$ico" "$SITE_DIR/assets/common/icons/$base"
    done
    shopt -u nullglob
    printf "  %-10s %s\n" "$app" "$(du -sh "$dst" | cut -f1)"
done

echo
echo "Totals:"
du -sh "$SITE_DIR/_raw"/* 2>/dev/null || true
echo
echo "Icons copied to assets/common/icons/:"
ls -1 "$SITE_DIR/assets/common/icons/" | grep -v '^\.gitkeep$' || echo "  (none)"
