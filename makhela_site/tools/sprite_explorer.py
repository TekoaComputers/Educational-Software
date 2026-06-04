#!/usr/bin/env python3
"""Generate a single standalone HTML that lets you calibrate sprite-sheet
parameters for every multi-frame binary in the Aliza ISO. Each file's
bytes + the FLI palette are inlined so the page works under file://.

Controls (per sheet):
  start offset, width, height, stride, gap, row-break-after, row-break-
  bytes, count, zoom.

Features:
  • Dropdown to switch between sheets. Saved params are kept per sheet.
  • Autosave to localStorage (key: "makhela:sprite_params") on every
    slider/number change. Reloading the page restores everything.
  • "Copy ALL params" button writes every sheet's current values as
    one block to the clipboard — paste back into chat and I'll wire
    the calibrated dimensions into tools/extract_*.py.

Usage:
  python3 tools/sprite_explorer.py /path/to/extracted/ISO [output.html]
"""
import base64, json, struct, sys, os


# --- FLI palette parser (same as extract_instr_b.py) ---
def parse_fli_palette(path):
    data = open(path, "rb").read()
    if struct.unpack("<H", data[4:6])[0] not in (0xAF11, 0xAF12):
        raise ValueError(f"{path}: not a FLI/FLC")
    pos = 128
    while pos < len(data) - 16:
        frame_size, magic, nchunks = struct.unpack("<IHH", data[pos:pos+8])
        if magic != 0xF1FA:
            pos += 1; continue
        cpos = pos + 16
        for _ in range(nchunks):
            if cpos + 6 > len(data): break
            csize, ctype = struct.unpack("<IH", data[cpos:cpos+6])
            if ctype in (4, 11):
                p = cpos + 6
                npackets = struct.unpack("<H", data[p:p+2])[0]; p += 2
                pal = [(0, 0, 0)] * 256
                cur = 0
                for _pk in range(npackets):
                    skip, cnt = data[p], data[p+1]; p += 2
                    cur += skip
                    n = cnt if cnt else 256
                    for k in range(n):
                        r, g, b = data[p], data[p+1], data[p+2]
                        if ctype == 11:
                            r = (r << 2) | (r >> 4)
                            g = (g << 2) | (g >> 4)
                            b = (b << 2) | (b >> 4)
                        pal[cur + k] = (r, g, b); p += 3
                    cur += n
                return pal
            cpos += csize
        pos += frame_size
    raise ValueError(f"{path}: no palette chunk")


# Default params per sheet. Pre-seeded with the best guesses (INSTR_B is
# the calibrated answer; the others use raw header-derived dimensions so
# you can see the distortion and tune away).
SHEETS = [
    # (label, ISO-relative path, default params)
    ("INSTR_B",  "INSTR_B",  {"off": 3, "topOff": 0, "yPush": 0, "skip": 0, "w": 48, "h": 49, "stride": 46, "gap": 6, "vGap": 0, "rowAt": 5, "rowGap": 88, "n": 10}),
    ("PRESS1",   "PRESS1",   {"off": 4, "topOff": 0, "yPush": 0, "skip": 0, "w": 33, "h": 45, "stride": 33, "gap": 0, "vGap": 0, "rowAt": 8, "rowGap": 0,  "n": 8}),
    ("PRESS_PR", "PRESS_PR", {"off": 4, "topOff": 0, "yPush": 0, "skip": 0, "w": 36, "h": 33, "stride": 36, "gap": 0, "vGap": 0, "rowAt": 5, "rowGap": 0,  "n": 5}),
    # TIMER appears to be TWO animation sets packed into one file —
    # different sprite dimensions before/after some boundary. The two
    # virtual entries below point at the same bytes but with their own
    # autosaved params so you can dial each set independently.
    ("TIMER (set 1)", "TIMER", {"off": 4, "topOff": 0, "yPush": 0, "skip": 0, "w": 42, "h": 52, "stride": 42, "gap": 0, "vGap": 0, "rowAt": 10,"rowGap": 0, "n": 2}),
    ("TIMER (set 2)", "TIMER", {"off": 4, "topOff": 0, "yPush": 0, "skip": 2, "w": 84, "h": 52, "stride": 84, "gap": 0, "vGap": 0, "rowAt": 10,"rowGap": 0, "n": 4}),
    ("TMUNKI",   "TMUNKI",   {"off": 4, "topOff": 0, "yPush": 0, "skip": 0, "w": 49, "h": 52, "stride": 49, "gap": 0, "vGap": 0, "rowAt": 10,"rowGap": 0,  "n": 10}),
    ("PLL",      "PLL",      {"off": 4, "topOff": 0, "yPush": 0, "skip": 0, "w": 75, "h": 51, "stride": 75, "gap": 0, "vGap": 0, "rowAt": 8, "rowGap": 0,  "n": 8}),
]


HTML = r"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Aliza sprite explorer</title>
<style>
body { font-family: monospace; background: #1a1d23; color: #ddd; margin: 12px; }
.row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
.row label { display: inline-block; width: 130px; }
.row input[type=number] { width: 80px; background:#222; color:#fff; border:1px solid #555; padding:2px 4px; }
.row input[type=range] { width: 260px; }
.row select { background:#222; color:#fff; border:1px solid #555; padding:4px 6px; min-width: 160px; }
.row button { padding:6px 14px; color:#fff; border:0; border-radius:4px; cursor:pointer; font:bold 12px monospace; }
.btn-primary { background:#2d5a8a; }
.btn-primary:hover { background:#3a6ea3; }
canvas { background: #444; image-rendering: pixelated; display:block; margin-top:12px; border:1px solid #666; }
.controls { background:#252830; padding:12px; border-radius:6px; max-width:740px; }
.workspace { display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; }
.anim-panel { background:#252830; padding:12px; border-radius:6px; min-width:240px; margin-top:12px; }
.anim-panel h3 { margin:0 0 8px 0; font-size:13px; color:#ffe089; }
.anim-panel canvas { margin:6px 0; }
.anim-panel .row { margin:6px 0; }
h2 { font-size:14px; margin:0 0 10px 0; color:#8ec5ff; }
.hint { font-size:11px; color:#888; margin-top:4px; }
#saveIndicator { color:#7fc97f; font-size:11px; margin-left:8px; }
#allParams { width:100%; height:180px; background:#111; color:#bee; border:1px solid #444; font-family:monospace; font-size:11px; padding:6px; margin-top:8px; resize:vertical; }
</style>
</head><body>
<div class="controls">
<h2>Aliza sprite-sheet explorer · autosaves per sheet</h2>

<div class="row">
  <label>sheet</label>
  <select id="sheet"></select>
  <span id="saveIndicator"></span>
</div>
<div class="row">
  <label>label (folder)</label>
  <input type="text" id="label" placeholder="e.g. clock_frames" style="width:240px;background:#222;color:#fff;border:1px solid #555;padding:3px 6px;font:12px monospace;">
  <div class="hint">your own name — becomes the assets/bitmaps/&lt;label&gt;/ output folder</div>
</div>

<div class="row"><label>start offset</label>
  <input type="range" id="off" min="-64" max="128" step="1">
  <input type="number" id="off_n" step="1">
  <div class="hint">bytes to skip at start of file (negative shifts read backward — pads pre-byte 0 with zeros)</div>
</div>
<div class="row"><label>top offset (rows)</label>
  <input type="range" id="topOff" min="-32" max="32" step="1">
  <input type="number" id="topOff_n" step="1">
  <div class="hint">per-sprite vertical phase: positive skips rows at top of each sprite, negative reads from previous sprite's tail</div>
</div>
<div class="row"><label>skip sprites</label>
  <input type="range" id="skip" min="0" max="20" step="1">
  <input type="number" id="skip_n">
  <div class="hint">skip the first N sprites (use to jump past one packed animation set into the next)</div>
</div>
<div class="row"><label>sprite width</label>
  <input type="range" id="w" min="4" max="120" step="1">
  <input type="number" id="w_n">
</div>
<div class="row"><label>sprite height</label>
  <input type="range" id="h" min="4" max="120" step="1">
  <input type="number" id="h_n">
</div>
<div class="row"><label>row stride</label>
  <input type="range" id="stride" min="4" max="120" step="1">
  <input type="number" id="stride_n">
  <div class="hint">bytes per row (= width unless padded)</div>
</div>
<div class="row"><label>between-sprite gap</label>
  <input type="range" id="gap" min="0" max="128" step="1">
  <input type="number" id="gap_n">
  <div class="hint">extra raw BYTES between consecutive sprites</div>
</div>
<div class="row"><label>v-gap (pixels/row)</label>
  <input type="range" id="vGap" min="-8" max="64" step="1">
  <input type="number" id="vGap_n">
  <div class="hint">extra pixels added to every row's pitch. Use when each row drifts one pixel from the top of its own row. Effective row pitch = stride + v-gap.</div>
</div>
<div class="row"><label>push down (pixels)</label>
  <input type="range" id="yPush" min="-32" max="32" step="1">
  <input type="number" id="yPush_n">
  <div class="hint">visual: shift the rendered sprite down by N pixels within its cell. Doesn't change byte reads — just for aligning to the in-game position.</div>
</div>
<div class="row"><label>row break after</label>
  <input type="range" id="rowAt" min="1" max="20" step="1">
  <input type="number" id="rowAt_n">
  <div class="hint">after sprite N, insert extra bytes</div>
</div>
<div class="row"><label>row break bytes</label>
  <input type="range" id="rowGap" min="0" max="512" step="1">
  <input type="number" id="rowGap_n">
</div>
<div class="row"><label># sprites</label>
  <input type="range" id="n" min="1" max="20" step="1">
  <input type="number" id="n_n">
</div>
<div class="row"><label>zoom</label>
  <input type="range" id="zoom" min="1" max="8" step="1">
  <input type="number" id="zoom_n">
</div>
<div class="row"><label>show as one strip</label>
  <input type="checkbox" id="stripChk">
</div>

<div class="row">
  <button class="btn-primary" id="copy">copy ALL params</button>
  <button id="reset" style="background:#7a3a3a;">reset this sheet</button>
  <span id="copied" style="color:#7fc97f;font-size:12px;"></span>
</div>
<div class="hint" id="status"></div>
<textarea id="allParams" readonly></textarea>
</div>

<div class="workspace">
  <div>
    <canvas id="cv"></canvas>
    <canvas id="stripCanvas"></canvas>
  </div>
  <div class="anim-panel">
    <h3>animation preview</h3>
    <canvas id="animCv"></canvas>
    <div class="row">
      <button class="btn-primary" id="playPause">▶ play</button>
      <span id="frameLabel" style="margin-left:8px;color:#bee;font-size:11px;">1/1</span>
    </div>
    <div class="row">
      <label style="display:inline-block;width:50px;">FPS</label>
      <input type="range" id="fps" min="1" max="30" value="6" style="width:120px;">
      <input type="number" id="fps_n" value="6" style="width:50px;background:#222;color:#fff;border:1px solid #555;padding:2px 4px;">
    </div>
    <div class="row">
      <label style="display:inline-block;width:50px;">zoom</label>
      <input type="range" id="animZoom" min="1" max="10" value="4" style="width:120px;">
      <input type="number" id="animZoom_n" value="4" style="width:50px;background:#222;color:#fff;border:1px solid #555;padding:2px 4px;">
    </div>
    <div class="row">
      <label style="font-size:11px;"><input type="checkbox" id="animTrans"> hide bg (key out black/tan)</label>
    </div>
  </div>
</div>

<script>
const SHEETS  = __SHEETS__;    // [{name, base64, default}]
const PALETTE = __PAL__;       // [[r,g,b], ...]
const STORAGE_KEY = "makhela:sprite_params";

const RAW = {};
for (const s of SHEETS) {
    const bin = atob(s.base64);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    RAW[s.name] = a;
}

function loadStored() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
}
function saveStored(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
}
let stored = loadStored();

function paramsFor(name) {
    const sheet = SHEETS.find(s => s.name === name);
    return Object.assign({}, sheet.default, stored[name] || {});
}
function storeParams(name, p) {
    stored[name] = p;
    saveStored(stored);
}
function resetParams(name) {
    delete stored[name];
    saveStored(stored);
}

function get(id) { return document.getElementById(id); }
function val(id) { return parseInt(get(id).value, 10); }
function setVal(id, v) {
    get(id).value = v;
    const numId = id + '_n';
    if (document.getElementById(numId)) document.getElementById(numId).value = v;
}

// Populate sheet dropdown
const select = get('sheet');
for (const s of SHEETS) {
    const o = document.createElement('option');
    o.value = s.name; o.textContent = s.name + '  (' + RAW[s.name].length + ' B)';
    select.appendChild(o);
}

let currentSheet = SHEETS[0].name;

const FIELDS = ['off', 'topOff', 'skip', 'w', 'h', 'stride', 'gap', 'vGap', 'yPush', 'rowAt', 'rowGap', 'n', 'zoom'];

function readUI() {
    const p = {};
    for (const f of FIELDS) p[f] = val(f);
    return p;
}
function writeUI(p) {
    for (const f of FIELDS) if (p[f] != null) setVal(f, p[f]);
}
const DEFAULT_ZOOM = 4;

function loadCurrentSheetIntoUI() {
    const p = paramsFor(currentSheet);
    if (p.zoom == null) p.zoom = DEFAULT_ZOOM;
    writeUI(p);
    // Label is a string — handled separately from numeric FIELDS.
    const labelInput = get('label');
    labelInput.value = (stored[currentSheet] && stored[currentSheet].label) || '';
}

function getCurrentLabel() {
    return get('label').value.trim();
}

function saveLabel() {
    const existing = stored[currentSheet] || readUI();
    existing.label = getCurrentLabel();
    stored[currentSheet] = existing;
    saveStored(stored);
}

function flashSaved() {
    const ind = get('saveIndicator');
    ind.textContent = 'autosaved ✓';
    setTimeout(() => ind.textContent = '', 1500);
}

function render() {
    const raw = RAW[currentSheet];
    const off = val('off'), topOff = val('topOff'), skip = val('skip');
    const w = val('w'), h = val('h');
    const stride = val('stride'), gap = val('gap'), vGap = val('vGap');
    const rowAt = val('rowAt'), rowGap = val('rowGap');
    const n = val('n'), z = val('zoom');
    const yPush = val('yPush');

    // vGap adds vGap extra pixels (bytes) to every row's pitch — so each
    // row starts vGap bytes later than the previous one. Use this when
    // each row drifts a pixel sideways/downward inside the sprite.
    // `gap` stays the raw byte gap between consecutive sprites.
    const rowPitch = stride + vGap;
    const perSpr = h * rowPitch + gap;
    function spriteOffset(i) {
        // i = render index; file index = i + skip. Row break still applies
        // to the FILE index so packed animation sets line up cleanly.
        const idx = i + skip;
        return off + idx * perSpr + (idx >= rowAt ? rowGap : 0) + topOff * stride;
    }
    const endOff = spriteOffset(n - 1) + h * rowPitch;
    get('status').textContent =
        'file=' + raw.length + ' B • row pitch ' + rowPitch + ' (stride ' + stride + '+vGap ' + vGap + ')' +
        ' • per sprite ' + (h*rowPitch) + '+' + gap + '=' + perSpr +
        ' • row break ' + rowGap + 'B after #' + rowAt +
        ' • end offset ' + endOff;

    // Grid
    const cols = Math.min(5, n);
    const rows = Math.ceil(n / cols);
    const pad = 4;
    const cellW = w*z + pad, cellH = h*z + pad;
    const cv = get('cv');
    cv.width = cols*cellW + pad;
    cv.height = rows*cellH + pad;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#444'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < n; i++) {
        const cx = (i % cols) * cellW + pad;
        const cy = Math.floor(i / cols) * cellH + pad;
        const imgData = ctx.createImageData(w, h);
        const spriteOff = spriteOffset(i);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const srcIdx = spriteOff + y*rowPitch + x;
                const pi = (srcIdx >= 0 && srcIdx < raw.length) ? raw[srcIdx] : 0;
                const rgb = PALETTE[pi] || [255, 0, 255];
                const di = (y*w + x) * 4;
                imgData.data[di] = rgb[0];
                imgData.data[di+1] = rgb[1];
                imgData.data[di+2] = rgb[2];
                imgData.data[di+3] = 255;
            }
        }
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        tmp.getContext('2d').putImageData(imgData, 0, 0);
        ctx.imageSmoothingEnabled = false;
        // Visual push-down — shift the rendered sprite within its cell.
        ctx.drawImage(tmp, cx, cy + yPush*z, w*z, h*z);
        ctx.fillStyle = '#888';
        ctx.font = '11px monospace';
        ctx.fillText(String(i+1), cx + 2, cy + 12);
    }

    // Strip mode
    const stripCanvas = get('stripCanvas');
    if (get('stripChk').checked) {
        const W = stride;
        const stripStart = Math.max(0, off);   // raw strip starts at clamped offset
        const H = Math.floor((raw.length - stripStart) / W);
        stripCanvas.width = W * 2;
        stripCanvas.height = H * 2;
        const sctx = stripCanvas.getContext('2d');
        const imgData = sctx.createImageData(W, H);
        for (let i = 0; i < W*H; i++) {
            const srcIdx = stripStart + i;
            const pi = (srcIdx >= 0 && srcIdx < raw.length) ? raw[srcIdx] : 0;
            const rgb = PALETTE[pi] || [255, 0, 255];
            imgData.data[i*4] = rgb[0];
            imgData.data[i*4+1] = rgb[1];
            imgData.data[i*4+2] = rgb[2];
            imgData.data[i*4+3] = 255;
        }
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = H;
        tmp.getContext('2d').putImageData(imgData, 0, 0);
        sctx.imageSmoothingEnabled = false;
        sctx.drawImage(tmp, 0, 0, W*2, H*2);
        stripCanvas.style.display = 'block';
    } else {
        stripCanvas.style.display = 'none';
    }

    // Update the all-params textarea so the user can see live what they'd copy
    refreshAllParams();
}

function refreshAllParams() {
    const out = [];
    out.push('# Aliza sprite-sheet params');
    for (const s of SHEETS) {
        const p = (s.name === currentSheet) ? readUI() : paramsFor(s.name);
        const label = (s.name === currentSheet) ? getCurrentLabel()
                      : ((stored[s.name] && stored[s.name].label) || '');
        out.push('');
        out.push('[' + s.name + ']');
        out.push('  source_file     = ' + (SHEETS.find(x => x.name === s.name).source || s.name));
        out.push('  label           = "' + label + '"');
        out.push('  start_offset    = ' + p.off);
        out.push('  top_offset_rows = ' + p.topOff);
        out.push('  skip_sprites    = ' + p.skip);
        out.push('  width           = ' + p.w);
        out.push('  height          = ' + p.h);
        out.push('  stride          = ' + p.stride);
        out.push('  gap             = ' + p.gap);
        out.push('  v_gap_pixels    = ' + p.vGap);
        out.push('  y_push_pixels   = ' + p.yPush);
        out.push('  row_break_after = ' + p.rowAt);
        out.push('  row_break_bytes = ' + p.rowGap);
        out.push('  count           = ' + p.n);
    }
    get('allParams').value = out.join(String.fromCharCode(10));
}

function onChange() {
    const p = readUI();
    p.label = getCurrentLabel();
    storeParams(currentSheet, p);
    flashSaved();
    render();
}

// Wire all controls
for (const f of FIELDS) {
    const slider = get(f);
    const num = get(f + '_n');
    slider.addEventListener('input', () => { num.value = slider.value; onChange(); });
    num.addEventListener('input',    () => { slider.value = num.value; onChange(); });
}
get('stripChk').addEventListener('change', render);
get('label').addEventListener('input', onChange);

select.addEventListener('change', () => {
    currentSheet = select.value;
    animFrame = 0;        // restart the animation preview on sheet swap
    loadCurrentSheetIntoUI();
    render();
});

get('copy').addEventListener('click', () => {
    const text = get('allParams').value;
    navigator.clipboard.writeText(text).then(() => {
        get('copied').textContent = 'copied ✓';
        setTimeout(() => get('copied').textContent = '', 2000);
    }, () => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        get('copied').textContent = 'copied (fallback) ✓';
        setTimeout(() => get('copied').textContent = '', 2000);
    });
});

get('reset').addEventListener('click', () => {
    resetParams(currentSheet);
    loadCurrentSheetIntoUI();
    render();
});

// --- Animation preview ---
let animFrame = 0;
let animTimer = null;
let animPlaying = false;
const TRANS = new Set(['0,0,0', '0,0,16', '252,212,168']);

function drawAnimFrame() {
    const raw = RAW[currentSheet];
    const off = val('off'), skip = val('skip');
    const w = val('w'), h = val('h');
    const stride = val('stride'), gap = val('gap'), vGap = val('vGap');
    const rowAt = val('rowAt'), rowGap = val('rowGap');
    const n = val('n'), z = parseInt(get('animZoom').value, 10) || 4;
    const keyOut = get('animTrans').checked;
    if (n <= 0) return;
    if (animFrame >= n) animFrame = 0;

    const animCv = get('animCv');
    animCv.width = Math.max(48, w*z);
    animCv.height = Math.max(48, h*z);
    const ctx = animCv.getContext('2d');
    ctx.fillStyle = '#666';
    ctx.fillRect(0, 0, animCv.width, animCv.height);

    const rowPitch = stride + vGap;
    const perSpr = h * rowPitch + gap;
    const fileIdx = animFrame + skip;
    const topOff = val('topOff');
    const spriteOff = off + fileIdx * perSpr + (fileIdx >= rowAt ? rowGap : 0) + topOff * stride;
    const imgData = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const srcIdx = spriteOff + y*rowPitch + x;
            const pi = (srcIdx >= 0 && srcIdx < raw.length) ? raw[srcIdx] : 0;
            const rgb = PALETTE[pi] || [255, 0, 255];
            const di = (y*w + x) * 4;
            const isBg = keyOut && TRANS.has(rgb.join(','));
            imgData.data[di]   = rgb[0];
            imgData.data[di+1] = rgb[1];
            imgData.data[di+2] = rgb[2];
            imgData.data[di+3] = isBg ? 0 : 255;
        }
    }
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d').putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // Centre the scaled sprite in the canvas, with the yPush nudge applied.
    const yPush = val('yPush');
    const dx = (animCv.width - w*z) / 2;
    const dy = (animCv.height - h*z) / 2 + yPush * z;
    ctx.drawImage(tmp, dx, dy, w*z, h*z);
    get('frameLabel').textContent = (animFrame + 1) + ' / ' + n;
}

function startAnim() {
    if (animTimer) return;
    const fps = parseInt(get('fps').value, 10) || 6;
    animTimer = setInterval(() => {
        const n = val('n');
        if (n > 0) animFrame = (animFrame + 1) % n;
        drawAnimFrame();
    }, 1000 / fps);
    animPlaying = true;
    get('playPause').textContent = '⏸ pause';
}
function stopAnim() {
    if (animTimer) { clearInterval(animTimer); animTimer = null; }
    animPlaying = false;
    get('playPause').textContent = '▶ play';
}

get('playPause').addEventListener('click', () => { if (animPlaying) stopAnim(); else startAnim(); });
['fps', 'animZoom'].forEach(id => {
    const slider = get(id), num = get(id + '_n');
    slider.addEventListener('input', () => { num.value = slider.value; if (id === 'fps' && animPlaying) { stopAnim(); startAnim(); } drawAnimFrame(); });
    num.addEventListener('input',    () => { slider.value = num.value; if (id === 'fps' && animPlaying) { stopAnim(); startAnim(); } drawAnimFrame(); });
});
get('animTrans').addEventListener('change', drawAnimFrame);

// Wrap render() so the animation preview also redraws on every param change.
const _origRender = render;
render = function () { _origRender(); drawAnimFrame(); };

// Initial state
select.value = currentSheet;
loadCurrentSheetIntoUI();
render();
</script>
</body></html>
"""


if __name__ == "__main__":
    iso = sys.argv[1] if len(sys.argv) > 1 else "/tmp/aliza_extract"
    out = sys.argv[2] if len(sys.argv) > 2 else "tools/sprite_explorer.html"

    pal = parse_fli_palette(os.path.join(iso, "ANIM", "M0.FLI"))

    sheets_payload = []
    for label, rel, defaults in SHEETS:
        path = os.path.join(iso, rel)
        if not os.path.isfile(path):
            print(f"  skip {label} (not found at {path})")
            continue
        b = open(path, "rb").read()
        sheets_payload.append({
            "name":    label,
            "source":  rel,          # ISO-relative source file
            "base64":  base64.b64encode(b).decode("ascii"),
            "default": defaults,
        })

    html = (HTML
            .replace("__SHEETS__", json.dumps(sheets_payload))
            .replace("__PAL__",    json.dumps(pal)))
    open(out, "w").write(html)
    print(f"wrote {out}  ({len(html)/1024:.1f} KB, {len(sheets_payload)} sheets)")
    print("open it in a browser; works under file://")
