#!/usr/bin/env python3
"""
Parse a VB6 .frm file into a JSON layout tree.
"""
from __future__ import annotations
"""

Each control becomes an entry with: type, name, index, left/top/width/height
(in original twips AND converted to design pixels), plus any string properties
we care about (Caption, Picture refs).

Coordinate system:
    The forms in this project run on a 640x480 screen (Form_Load does
    ScrRes.ChangeScreenSettings 640, 480). The form's ClientWidth/ClientHeight
    in twips is the design-time extent — we convert with the form's own ratio.

Usage:
    parse_frm.py <input.frm> [--out out.json]
"""

import sys
import re
import json
import argparse
from pathlib import Path

# Decode Hebrew strings from the legacy Windows-1255 / ISO-8859-8 codepage.
SOURCE_ENCODING = "cp1255"

# Properties we copy verbatim from each control / form.
STRING_PROPS = {"Caption", "Name", "Picture", "MouseIcon", "Icon", "ToolTipText"}
NUM_PROPS = {"Left", "Top", "Width", "Height", "Index",
             "ClientWidth", "ClientHeight", "ClientLeft", "ClientTop",
             "ScaleWidth", "ScaleHeight", "ScaleMode",
             "BackColor", "ForeColor", "Visible", "BorderStyle",
             # AutoSize=-1 (True) on a PictureBox means the box resizes to the
             # loaded Picture's natural dims at runtime. Yeled Sst btnIcon
             # designed at 112x91 but tem_*.bmp is 112x115; without honoring
             # AutoSize the icons render squished.
             "AutoSize"}


def read_frm(path: Path) -> list[str]:
    raw = path.read_bytes()
    text = raw.decode(SOURCE_ENCODING, errors="replace")
    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return text.split("\n")


BEGIN_RE = re.compile(r"^\s*Begin\s+(?P<type>[A-Za-z0-9_.]+)\s+(?P<name>\S+)\s*$")
END_RE = re.compile(r"^\s*End\s*$")
PROP_RE = re.compile(r"^\s*(?P<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?P<val>.+?)\s*$")
# Things that we DO NOT treat as 'End' of control block:
# `EndProperty` closes a property group (Font etc.) — we just skip BeginProperty/EndProperty.
END_PROP_RE = re.compile(r"^\s*EndProperty\s*$")
BEGIN_PROP_RE = re.compile(r"^\s*BeginProperty\s+(\S+)")


def parse_value(s: str):
    """Convert a VB property value string to a Python value."""
    s = s.strip()
    if s.startswith('"'):
        # String literal — may contain escaped doublequotes "" inside.
        # VB also allows trailing comments after the closing quote.
        m = re.match(r'^"((?:[^"]|"")*)"', s)
        if m:
            return m.group(1).replace('""', '"')
        return s.strip('"')
    if s.startswith("&H") and s.endswith("&"):
        try:
            return int(s[2:-1], 16)
        except ValueError:
            return s
    # Hex without trailing &
    if s.startswith("&H"):
        try:
            return int(s[2:].rstrip("&"), 16)
        except ValueError:
            return s
    # Resource ref like "file.frx":0000 — string handled above
    if re.match(r"^-?\d+$", s):
        return int(s)
    if re.match(r"^-?\d*\.\d+$", s):
        return float(s)
    # Strip trailing comment after value (after first single quote)
    s_clean = re.split(r"\s+'", s, maxsplit=1)[0].strip()
    if re.match(r"^-?\d+$", s_clean):
        return int(s_clean)
    return s


def parse_block(lines, idx, depth=0):
    """Parse one Begin..End block; returns (block_dict, next_idx)."""
    # The Begin line itself is lines[idx-1]
    block = {"type": None, "name": None, "props": {}, "children": []}
    while idx < len(lines):
        line = lines[idx]
        idx += 1
        if BEGIN_PROP_RE.match(line):
            # Skip nested BeginProperty..EndProperty (Font groups etc.)
            while idx < len(lines) and not END_PROP_RE.match(lines[idx]):
                idx += 1
            if idx < len(lines):
                idx += 1  # consume EndProperty
            continue
        m = BEGIN_RE.match(line)
        if m:
            child = {
                "type": m.group("type"),
                "name": m.group("name"),
                "props": {},
                "children": [],
            }
            child_parsed, idx = parse_block(lines, idx, depth + 1)
            child["props"] = child_parsed["props"]
            child["children"] = child_parsed["children"]
            block["children"].append(child)
            continue
        if END_RE.match(line):
            return block, idx
        m = PROP_RE.match(line)
        if m:
            key = m.group("key")
            val = parse_value(m.group("val"))
            if key in STRING_PROPS or key in NUM_PROPS:
                block["props"][key] = val
            # Skip everything else (lots of VB-only props we don't care about)
            continue
        # Otherwise ignore (blank lines, comments, etc.)
    return block, idx


def parse_form(path: Path) -> dict:
    lines = read_frm(path)
    # Find the first `Begin VB.Form ...` line — that's our root.
    idx = 0
    while idx < len(lines):
        m = BEGIN_RE.match(lines[idx])
        if m and m.group("type") == "VB.Form":
            form = {
                "type": m.group("type"),
                "name": m.group("name"),
                "props": {},
                "children": [],
            }
            idx += 1
            parsed, _ = parse_block(lines, idx)
            form["props"] = parsed["props"]
            form["children"] = parsed["children"]
            return form
        idx += 1
    raise RuntimeError(f"No VB.Form block found in {path}")


def detect_design(form: dict, override_w: int | None, override_h: int | None):
    """Pick the design canvas (in pixels).

    Priority:
      1. Explicit --design override (when both width and height given).
      2. If the form is in ScaleMode=Pixel and has ScaleWidth/ScaleHeight,
         use those — that's VB6's authored design canvas in pixels.
      3. Otherwise convert ClientWidth/Height (twips) at native 96 DPI
         (15 twips per pixel).
    """
    if override_w and override_h:
        return override_w, override_h, "override"
    props = form["props"]
    if props.get("ScaleMode") == 3 and props.get("ScaleWidth") and props.get("ScaleHeight"):
        return int(props["ScaleWidth"]), int(props["ScaleHeight"]), "scale"
    cw = props.get("ClientWidth") or 11628
    ch = props.get("ClientHeight") or 8568
    return round(cw / 15), round(ch / 15), "twips/15"


def to_pixels(form: dict, design_w: int, design_h: int) -> dict:
    """Add an x/y/w/h pixel field per control based on the form's twip extent."""
    cw = form["props"].get("ClientWidth")
    ch = form["props"].get("ClientHeight")
    DESIGN_W, DESIGN_H = design_w, design_h
    if not cw or not ch:
        # Fall back to a typical VB6 form size to avoid div-by-zero.
        cw = cw or 11628
        ch = ch or 8568

    twips_per_px_x = cw / DESIGN_W
    twips_per_px_y = ch / DESIGN_H

    def convert(node):
        p = node["props"]
        if all(k in p for k in ("Left", "Top", "Width", "Height")):
            node["px"] = {
                "x": round(p["Left"] / twips_per_px_x, 1),
                "y": round(p["Top"] / twips_per_px_y, 1),
                "w": round(p["Width"] / twips_per_px_x, 1),
                "h": round(p["Height"] / twips_per_px_y, 1),
            }
        for c in node["children"]:
            convert(c)

    form["design"] = {"width": DESIGN_W, "height": DESIGN_H,
                      "client_w_twips": cw, "client_h_twips": ch}
    convert(form)
    return form


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--design", default=None,
                    help="Force design canvas, e.g. 640x480. "
                         "Omit to auto-detect from ScaleWidth/Height.")
    args = ap.parse_args()

    form = parse_form(args.input)
    if args.design:
        dw, dh = (int(x) for x in args.design.lower().split("x"))
    else:
        dw, dh = None, None
    dw, dh, source = detect_design(form, dw, dh)
    print(f"  design: {dw}x{dh}  ({source})", file=sys.stderr)
    form = to_pixels(form, dw, dh)
    out_text = json.dumps(form, ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(out_text, encoding="utf-8")
        print(f"Wrote {args.out} ({len(form['children'])} top-level controls)")
    else:
        print(out_text)


if __name__ == "__main__":
    main()
