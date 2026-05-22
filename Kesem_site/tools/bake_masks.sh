#!/usr/bin/env bash
# Bake VB6 CmdPlus-style mask PNGs into a single alpha-blended image.
#
# Background: CSS `mask-image: url(...)` follows CORS rules, which Chrome
# treats as "blocked" for file:// pages. To avoid needing a web server, we
# pre-compose the masked sprite at build time: take the source image and
# inject the mask's luminance as the alpha channel.
#
# Usage:
#   tools/bake_masks.sh <src.png> <mask.png> <out.png>
#
# Convention: mask is white where opaque, black where transparent (matches
# Dvash.CmdPlus.MaskPicture and similar VB6 third-party controls).
#
# Example:
#   tools/bake_masks.sh assets/Dvash/menu/exit2.png \
#                       assets/Dvash/menu/exit3.png \
#                       assets/Dvash/menu/exit2_masked.png
set -euo pipefail
src="$1"; mask="$2"; out="$3"
ffmpeg -y -loglevel error \
  -i "$src" -i "$mask" \
  -filter_complex "[1:v]format=gray[m];[0:v][m]alphamerge" \
  "$out"
echo "baked: $out"
