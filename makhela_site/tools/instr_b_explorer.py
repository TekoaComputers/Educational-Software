#!/usr/bin/env python3
"""Generate a standalone HTML explorer for INSTR_B. Inlines the raw bytes
and the palette so it works under file://; the page has sliders for
sprite width, height, byte offset, row stride, and sprite count, and
re-renders into a canvas live so you can dial in the correct values."""
import base64, json, struct, os, sys


def parse_fli_palette(path):
    data = open(path, "rb").read()
    if struct.unpack("<H", data[4:6])[0] not in (0xAF11, 0xAF12):
        raise ValueError("not a FLI")
    pos = 128
    while pos < len(data) - 16:
        frame_size, magic, nchunks = struct.unpack("<IHH", data[pos:pos+8])
        if magic != 0xF1FA:
            pos += 1; continue
        cpos = pos + 16
        for _ in range(nchunks):
            csize, ctype = struct.unpack("<IH", data[cpos:cpos+6])
            if ctype in (4, 11):
                p = cpos + 6
                npackets = struct.unpack("<H", data[p:p+2])[0]; p += 2
                pal = [(0,0,0)] * 256
                cur = 0
                for _pk in range(npackets):
                    skip, cnt = data[p], data[p+1]; p += 2
                    cur += skip
                    n = cnt if cnt else 256
                    for k in range(n):
                        r,g,b = data[p],data[p+1],data[p+2]
                        if ctype == 11:
                            r=(r<<2)|(r>>4); g=(g<<2)|(g>>4); b=(b<<2)|(b>>4)
                        pal[cur+k] = (r,g,b); p += 3
                    cur += n
                return pal
            cpos += csize
        pos += frame_size
    raise ValueError("no palette chunk")


HTML = """<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>INSTR_B explorer</title>
<style>
body { font-family: monospace; background: #1a1d23; color: #ddd; margin: 12px; }
.row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
.row label { display: inline-block; width: 110px; }
.row input[type=number] { width: 80px; background:#222; color:#fff; border:1px solid #555; padding:2px 4px; }
.row input[type=range] { width: 260px; }
.row .val { display: inline-block; width: 40px; text-align: right; }
canvas { background: #444; image-rendering: pixelated; display:block; margin-top:12px; border:1px solid #666; }
.controls { background:#252830; padding:12px; border-radius:6px; max-width:680px; }
h2 { font-size: 14px; margin: 0 0 6px 0; color: #8ec5ff; }
.hint { font-size:11px; color:#888; margin-top:4px; }
</style>
</head><body>
<div class="controls">
<h2>INSTR_B sprite-sheet explorer</h2>
<div class="row"><label>start offset</label>
  <input type="range" id="off" min="0" max="64" value="4" step="1">
  <input type="number" id="off_n" value="4" step="1">
  <div class="hint">bytes to skip at start of file</div>
</div>
<div class="row"><label>sprite width</label>
  <input type="range" id="w" min="20" max="80" value="47" step="1">
  <input type="number" id="w_n" value="47">
</div>
<div class="row"><label>sprite height</label>
  <input type="range" id="h" min="20" max="80" value="48" step="1">
  <input type="number" id="h_n" value="48">
</div>
<div class="row"><label>row stride</label>
  <input type="range" id="stride" min="20" max="80" value="47" step="1">
  <input type="number" id="stride_n" value="47">
  <div class="hint">bytes per row (= width unless padded)</div>
</div>
<div class="row"><label>between-sprite gap</label>
  <input type="range" id="gap" min="0" max="64" value="0" step="1">
  <input type="number" id="gap_n" value="0">
</div>
<div class="row"><label>row break after</label>
  <input type="range" id="rowAt" min="1" max="20" value="5" step="1">
  <input type="number" id="rowAt_n" value="5">
  <div class="hint">after sprite N, insert extra bytes (for panel-style 5×2 layouts)</div>
</div>
<div class="row"><label>row break bytes</label>
  <input type="range" id="rowGap" min="0" max="512" value="0" step="1">
  <input type="number" id="rowGap_n" value="0">
</div>
<div class="row"><label># sprites</label>
  <input type="range" id="n" min="1" max="20" value="10">
  <input type="number" id="n_n" value="10">
</div>
<div class="row"><label>zoom</label>
  <input type="range" id="zoom" min="1" max="8" value="4">
  <input type="number" id="zoom_n" value="4">
</div>
<div class="row"><label>show as one strip</label>
  <input type="checkbox" id="stripChk">
  <div class="hint">also draws a raw strip of all bytes at the chosen width — useful for hunting boundaries</div>
</div>
<div class="row">
  <button id="copy" style="padding:6px 14px;background:#2d5a8a;color:#fff;border:0;border-radius:4px;cursor:pointer;font:bold 12px monospace;">copy params</button>
  <span id="copied" style="color:#7fc97f;font-size:12px;"></span>
</div>
<div class="hint" id="status"></div>
</div>
<canvas id="cv"></canvas>
<canvas id="strip"></canvas>
<script>
const RAW_B64 = "__RAW__";
const PALETTE = __PAL__;
const raw = (() => {
  const bin = atob(RAW_B64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
})();
const cv = document.getElementById('cv');
const stripCv = document.getElementById('strip');
const status = document.getElementById('status');

function get(id) { return document.getElementById(id); }
function val(id) { return parseInt(get(id).value, 10); }
function link(idA, idB) {
  get(idA).addEventListener('input', () => { get(idB).value = get(idA).value; render(); });
  get(idB).addEventListener('input', () => { get(idA).value = get(idB).value; render(); });
}
link('off','off_n'); link('w','w_n'); link('h','h_n');
link('stride','stride_n'); link('gap','gap_n');
link('rowAt','rowAt_n'); link('rowGap','rowGap_n');
link('n','n_n'); link('zoom','zoom_n');
get('stripChk').addEventListener('change', render);

document.getElementById('copy').addEventListener('click', () => {
  const text = [
    'INSTR_B params:',
    '  start_offset = ' + val('off'),
    '  width        = ' + val('w'),
    '  height       = ' + val('h'),
    '  stride       = ' + val('stride'),
    '  gap          = ' + val('gap'),
    '  row_break_after = ' + val('rowAt'),
    '  row_break_bytes = ' + val('rowGap'),
    '  count        = ' + val('n')
  ].join(String.fromCharCode(10));
  navigator.clipboard.writeText(text).then(() => {
    const c = document.getElementById('copied');
    c.textContent = 'copied to clipboard';
    setTimeout(() => c.textContent = '', 2000);
  }, () => {
    // Fallback for browsers blocking clipboard under file://
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    const c = document.getElementById('copied');
    c.textContent = 'copied (fallback)';
    setTimeout(() => c.textContent = '', 2000);
  });
});

function render() {
  const off=val('off'), w=val('w'), h=val('h'), stride=val('stride'),
        gap=val('gap'), n=val('n'), z=val('zoom'),
        rowAt=val('rowAt'), rowGap=val('rowGap');
  const perSpr = stride*h + gap;
  // Each sprite starts at off + i*perSpr + (rowGap if i >= rowAt else 0)
  function spriteOffset(i) {
    return off + i * perSpr + (i >= rowAt ? rowGap : 0);
  }
  const endOff = spriteOffset(n-1) + stride*h;
  status.textContent =
    `file=${raw.length} bytes • per sprite=${stride*h} px (+${gap} gap) = ${perSpr} • `+
    `row break ${rowGap}B after #${rowAt} • end offset = ${endOff}`;
  // Grid: 5 cols × ceil(n/5)
  const cols = Math.min(5, n);
  const rows = Math.ceil(n / cols);
  const pad = 4;
  const cellW = w*z + pad, cellH = h*z + pad;
  cv.width = cols*cellW + pad;
  cv.height = rows*cellH + pad;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#444';
  ctx.fillRect(0,0,cv.width,cv.height);
  for (let i = 0; i < n; i++) {
    const cx = (i % cols) * cellW + pad;
    const cy = Math.floor(i / cols) * cellH + pad;
    const imgData = ctx.createImageData(w, h);
    const spriteOff = spriteOffset(i);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = spriteOff + y*stride + x;
        const pi = srcIdx < raw.length ? raw[srcIdx] : 0;
        const rgb = PALETTE[pi] || [255,0,255];
        const di = (y*w + x) * 4;
        imgData.data[di+0] = rgb[0];
        imgData.data[di+1] = rgb[1];
        imgData.data[di+2] = rgb[2];
        imgData.data[di+3] = 255;
      }
    }
    // upscale via temp canvas + drawImage
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d').putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, cx, cy, w*z, h*z);
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText(String(i+1), cx + 2, cy + 12);
  }
  // Strip mode — draw raw bytes as one continuous row at chosen width
  if (get('stripChk').checked) {
    const W = stride;
    const H = Math.floor((raw.length - off) / W);
    stripCv.width = W * 2;
    stripCv.height = H * 2;
    const sctx = stripCv.getContext('2d');
    const imgData = sctx.createImageData(W, H);
    for (let i = 0; i < W*H; i++) {
      const pi = raw[off + i];
      const rgb = PALETTE[pi] || [255,0,255];
      imgData.data[i*4+0] = rgb[0];
      imgData.data[i*4+1] = rgb[1];
      imgData.data[i*4+2] = rgb[2];
      imgData.data[i*4+3] = 255;
    }
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(imgData, 0, 0);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(tmp, 0, 0, W*2, H*2);
    stripCv.style.display='block';
  } else {
    stripCv.style.display='none';
  }
}
render();
</script>
</body></html>"""


if __name__ == "__main__":
    iso = sys.argv[1] if len(sys.argv) > 1 else "/tmp/aliza_extract"
    out = sys.argv[2] if len(sys.argv) > 2 else "tools/instr_b_explorer.html"
    raw = open(os.path.join(iso, "INSTR_B"), "rb").read()
    pal = parse_fli_palette(os.path.join(iso, "ANIM", "M0.FLI"))
    html = (HTML
            .replace("__RAW__", base64.b64encode(raw).decode("ascii"))
            .replace("__PAL__", json.dumps(pal)))
    open(out, "w").write(html)
    print(f"wrote {out}  ({len(html)/1024:.1f} KB)")
    print("open it in a browser; the file works under file://")
