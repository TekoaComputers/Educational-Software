#!/usr/bin/env bash
# Port one of the Kesem-suite VB6 apps into Kesem_site.
#
# Usage: tools/port_app.sh <AppName>
#   <AppName>: EnglishA | EnglishB | EnglishC | Heshbon | Ivrit |
#              KolKoreA | KolKoreB | KolKoreC | KolKoreD |
#              Shabat | Shirim | "Shirim&Meshalim"
#
# Steps automated:
#   1. Extract Master/<App>/clean.dat (RAR) → _raw/master/<App>/
#   2. Copy dapey_ke/{BMP,WAV,RASB,RASB_WAV} as-is into assets/<App>/
#      + extracted MENU into assets/<App>/menu/
#   3. Convert all *.bmp → *.png via ffmpeg, *.jpg → *.png
#   4. Transcode AVI/*.avi → mp4 (delegates to transcode_videos.py if a
#      mapping is registered, otherwise reports and continues)
#   5. Parse <App>/Sst.frm → data/layout/<App>/sst.json
#   6. parse_paths.py + parse_tafrosh.py for the app
#
# Manual follow-up (per-app config):
#   - js/apps/<App>.config.js  (template from Brahot.config.js)
#   - main_site_assets/<App>.png  (tile thumbnail for the launcher)
#   - index.html  (nav tile)
#
# Designed to be re-runnable (idempotent).

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$SCRIPT_DIR/.." && pwd)"
CODE="$(cd "$SITE/.." && pwd)"
TEKOA="$(cd "$CODE/.." && pwd)"
MASTER="$TEKOA/Master"

app="${1:?Usage: port_app.sh <AppName>}"

# Code/<App>/ holds the VB6 source we need (Sst.frm, etc.).
src="$CODE/$app"
if [[ ! -d "$src" ]]; then
    echo "missing: $src — does the app folder exist in Code/?"
    exit 1
fi

master="$MASTER/$app"
if [[ ! -d "$master" ]]; then
    echo "missing: $master — no Master folder for this app?"
    exit 1
fi

raw="$SITE/_raw/master/$app"
assets="$SITE/assets/$app"
layout_dir="$SITE/data/layout/$app"
mkdir -p "$raw" "$assets/bmp" "$assets/wav" "$assets/rasb" "$assets/rasb_wav" "$assets/menu" "$assets/avi" "$layout_dir"

echo "===================="
echo "Porting: $app"
echo "  src   = $src"
echo "  master= $master"
echo "  assets= $assets"
echo "===================="

# ----------------------------------------------------------------------
# 1. Extract clean.dat if MENU isn't yet in $raw
# ----------------------------------------------------------------------
if [[ -f "$master/clean.dat" && ! -d "$raw/MENU" ]]; then
    echo "[1/6] extracting clean.dat …"
    (cd "$raw" && unrar x -o+ -inul "$master/clean.dat")
    # The archive's root is a single <App>/ directory — flatten it. The
    # wrapping name often differs from $app in case (e.g. KolKoreA → KolkoreA),
    # so case-insensitively pick the only subdirectory if it matches.
    wrap=""
    for d in "$raw"/*/; do
        [[ -d "$d" ]] || continue
        base="$(basename "$d")"
        if [[ "${base,,}" == "${app,,}" ]]; then wrap="$d"; break; fi
    done
    if [[ -n "$wrap" ]]; then
        shopt -s dotglob
        mv "$wrap"* "$raw"/ 2>/dev/null || true
        rmdir "$wrap" 2>/dev/null || true
        shopt -u dotglob
    fi
else
    echo "[1/6] clean.dat already extracted (or absent), skip"
fi

# ----------------------------------------------------------------------
# 2. Copy content folders from master/dapey_ke (case-insensitive)
# ----------------------------------------------------------------------
copy_content_dir() {
    local kind="$1"   # BMP | WAV | RASB | RASB_WAV
    local dest="$2"   # target subdir in assets/<App>/
    local lo="${kind,,}"
    # First letter uppercase, rest lowercase — covers "Bmp", "Rasb", etc.
    local cap="${lo^}"
    local found=""
    for parent in "$master/dapey_ke" "$master/DAPEY_KE" "$master/Dapey_Ke"; do
        for name in "$kind" "$lo" "$cap"; do
            local cand="$parent/$name"
            [[ -d "$cand" ]] && found="$cand" && break 2
        done
    done
    if [[ -z "$found" ]]; then
        echo "  no $kind folder under $master/dapey_ke"
        return 0
    fi
    cp -rn "$found"/* "$assets/$dest"/ 2>/dev/null || true
}

echo "[2/6] copying dapey_ke content …"
copy_content_dir BMP bmp
copy_content_dir WAV wav
copy_content_dir RASB rasb
copy_content_dir RASB_WAV rasb_wav
# Some apps (KolKoreC/D, Shirim) store an additional BMP set at the
# clean.dat root (e.g. \bmp\Daf.bmp). The renderer references it via
# assetsRoot/bmp/, so merge raw/BMP into assets/<App>/bmp/ alongside the
# dapey_ke/Bmp per-stage pictures. No overwrite (-n) — dapey_ke wins.
if [[ -d "$raw/BMP" ]]; then
    cp -rn "$raw/BMP"/* "$assets/bmp"/ 2>/dev/null || true
fi
# MENU comes from the extracted clean.dat, not dapey_ke.
if [[ -d "$raw/MENU" ]]; then
    cp -rn "$raw/MENU"/* "$assets/menu"/ 2>/dev/null || true
fi

# ----------------------------------------------------------------------
# 3. Convert BMP → PNG (lower-case names) and JPG → PNG so the configs
#    can reference *.png consistently. Use ImageMagick (`convert`) for BMP
#    — it handles all the VB6-era BMP variants (RLE, paletted with weird
#    headers) more reliably than ffmpeg.
# ----------------------------------------------------------------------
echo "[3/6] converting BMP/JPG → PNG …"
to_png() {
    local src="$1" dst="$2"
    [[ -f "$dst" ]] && return 0
    if convert "$src" "$dst" 2>/dev/null; then
        return 0
    fi
    if ffmpeg -y -loglevel error -i "$src" "$dst" 2>/dev/null; then
        return 0
    fi
    echo "    convert failed: $src" >&2
    return 1
}

convert_flat() {
    local src_dir="$1" dst_dir="$2"
    [[ -d "$src_dir" ]] || return 0
    mkdir -p "$dst_dir"
    while IFS= read -r f; do
        local stem="$(basename "${f%.*}")"
        local out="$dst_dir/$(echo "$stem" | tr 'A-Z' 'a-z').png"
        to_png "$f" "$out" || true
    done < <(find "$src_dir" -maxdepth 1 -type f \( -iname "*.bmp" -o -iname "*.jpg" \))
}
convert_flat "$assets/bmp" "$assets/bmp"
convert_flat "$assets/menu" "$assets/menu"
# menu/<jpg subfolder>/* — flatten into menu/. Case varies: jpg | JPG | Jpg.
for sub in "$assets/menu/jpg" "$assets/menu/JPG" "$assets/menu/Jpg"; do
    [[ -d "$sub" ]] && convert_flat "$sub" "$assets/menu"
done

# ----------------------------------------------------------------------
# 4. Transcode AVI → MP4 (skip if no avi folder)
# ----------------------------------------------------------------------
echo "[4/6] transcoding AVI → MP4 …"
avi_src=""
for cand in "$master/dapey_ke/AVI" "$master/dapey_ke/avi" "$master/DAPEY_KE/AVI" "$master/DAPEY_KE/avi"; do
    [[ -d "$cand" ]] && avi_src="$cand" && break
done
if [[ -n "$avi_src" ]]; then
    while IFS= read -r f; do
        stem="$(basename "${f%.*}")"
        out="$assets/avi/$stem.mp4"
        [[ -f "$out" ]] && continue
        ffmpeg -y -loglevel error -i "$f" \
            -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
            -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p \
            -c:a aac -b:a 96k -ac 1 -movflags +faststart \
            "$out" || echo "    transcode failed: $f"
    done < <(find "$avi_src" -maxdepth 1 -type f \( -iname "*.avi" \))
else
    echo "  no AVI folder, skip"
fi

# ----------------------------------------------------------------------
# 5. Parse Sst.frm → layout JSON
# ----------------------------------------------------------------------
echo "[5/6] parsing Sst.frm …"
sst_frm=""
for cand in "$src/Sst.frm" "$src/SST.FRM" "$src/SST.frm"; do
    [[ -f "$cand" ]] && sst_frm="$cand" && break
done
if [[ -n "$sst_frm" ]]; then
    python3 "$SITE/tools/parse_frm.py" "$sst_frm" --out "$layout_dir/sst.json" 2>&1 | tail -1
else
    echo "  no Sst.frm found"
fi

# ----------------------------------------------------------------------
# 6. parse_paths + parse_tafrosh
# ----------------------------------------------------------------------
echo "[6/6] parse_paths + parse_tafrosh"
python3 "$SITE/tools/parse_paths.py" 2>&1 | grep -E "${app}:|^Wrote" | head -3 || true
python3 "$SITE/tools/parse_tafrosh.py" 2>&1 | grep -E "${app}|^Wrote" | head -3 || true

echo ""
echo "==== Manual follow-up for $app ===="
echo "1. Write js/apps/$app.config.js (template from Brahot.config.js)"
echo "2. Create main_site_assets/$app.png (240×180 tile thumbnail)"
echo "3. Add a tile to Code/index.html"
echo "4. Run python3 tools/build_bundle.py"
