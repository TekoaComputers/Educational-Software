#!/usr/bin/env python3
"""Scan assets/ and build catalogue.html — a single page where each asset is
previewable with an annotation textarea. Annotations auto-save to localStorage
and can be exported as JSON.

Rerun this script any time the assets folder changes.
"""
import os, json, glob, html
from pathlib import Path

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"

# Section definitions: (title, description, scan_glob, kind)
# kind in: image, video, audio, midi, text, json, data
SECTIONS = [
    ("Bitmaps — game screens & sprite atlases",
     "Decoded 256-colour bitmaps. The big 320×200 ones are full game screens; smaller ones are sprite atlases or icons.",
     "bitmaps/*.png", "image"),

    ("Songs — video (FLI + CDDA audio)",
     "Each song's animation muxed with its CD audio track. 10 songs total.",
     "songs/*.mp4", "video"),

    ("Songs — audio only",
     "The 10 CDDA audio tracks as standalone Opus. Same content as the MP4 video's audio.",
     "songs/*.opus", "audio"),

    ("Animations — main set",
     "Cutscenes and intermediate FLI animations played between game states.",
     "animations/*.mp4", "video"),

    ("Animations — durno (story scenes?)",
     "Subfolder of long animations. Possibly a story-mode or quiz mini-game.",
     "animations/durno/*.mp4", "video"),

    ("Animations — eff (menu effects)",
     "Short animations probably tied to menu transitions/clicks.",
     "animations/eff/*.mp4", "video"),

    ("Sound effects — song names",
     "Hebrew vocals announcing/describing each song.",
     "sfx/song_names/*.ogg", "audio"),

    ("Sound effects — instruments",
     "Hebrew vocals naming each instrument.",
     "sfx/instruments/*.ogg", "audio"),

    ("Sound effects — fx (instrument samples & general)",
     "Instrument sample clips + ambient/voice effects.",
     "sfx/fx/*.ogg", "audio"),

    ("Sound effects — doremi",
     "Female voice singing do-re-mi syllables for the practice mode.",
     "sfx/doremi/*.ogg", "audio"),

    ("Sound effects — menu",
     "Menu/UI clicks (alternate set from eff/).",
     "sfx/menu/*.ogg", "audio"),

    ("MIDI music",
     "MIDI files for background music: learning scales, victory tunes, etc.",
     "midi/*.mid", "midi"),

    ("Lyrics (Hebrew, CP1255)",
     "Per-song lyric text files.",
     "lyrics/*.txt", "text"),

    ("Song metadata (JSON)",
     "Parsed song info: note timings, CD track, video file, lyrics.",
     "songdata/*.json", "json"),
]


def file_size(path):
    s = os.path.getsize(path)
    if s < 1024: return f"{s} B"
    if s < 1024 * 1024: return f"{s / 1024:.1f} KB"
    return f"{s / 1024 / 1024:.2f} MB"


def png_size(path):
    """Read width/height from a PNG without external libs."""
    with open(path, "rb") as f:
        data = f.read(24)
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    import struct
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def mp4_duration(path):
    """Quick best-effort duration probe."""
    try:
        import subprocess
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=5)
        s = float(r.stdout.strip())
        m = int(s // 60); s = s - m * 60
        return f"{m}:{s:05.2f}"
    except Exception:
        return ""


def render_preview(rel_path, kind):
    """HTML snippet that renders a preview for the asset."""
    p = html.escape(rel_path)
    if kind == "image":
        return f'<img src="{p}" loading="lazy" alt="{p}">'
    if kind == "video":
        return f'<video src="{p}" controls preload="none" muted style="max-width:320px"></video>'
    if kind == "audio":
        return f'<audio src="{p}" controls preload="none"></audio>'
    if kind == "midi":
        return f'<span class="muted">[MIDI file — no inline preview]</span>'
    if kind == "text":
        try:
            with open(ROOT / rel_path, "rb") as f:
                txt = f.read().decode("cp1255", errors="replace")
            short = "\n".join(txt.splitlines()[:8])
            return f'<pre class="lyrics" dir="rtl">{html.escape(short)}</pre>'
        except Exception:
            return "<span class='muted'>[unreadable]</span>"
    if kind == "json":
        try:
            with open(ROOT / rel_path) as f:
                d = json.load(f)
            keys = list(d[0].keys()) if isinstance(d, list) and d else list(d.keys())
            count = len(d) if isinstance(d, list) else "obj"
            return f'<span class="muted">JSON, {count} items, keys: {", ".join(keys[:8])}</span>'
        except Exception:
            return "<span class='muted'>[unreadable JSON]</span>"
    return "<span class='muted'>[no preview]</span>"


def info_line(abs_path, rel_path, kind):
    bits = [file_size(abs_path)]
    if kind == "image":
        sz = png_size(abs_path)
        if sz: bits.insert(0, f"{sz[0]}×{sz[1]}")
    if kind == "video":
        d = mp4_duration(abs_path)
        if d: bits.insert(0, d)
    return "  ·  ".join(bits)


def main():
    # Load AI-generated annotations (if file is present) — these become the
    # default text in each textarea. The user's edits (auto-saved to
    # localStorage in the catalogue page) overlay on top of these defaults.
    ai_annotations = {}
    ai_path = ROOT / "annotations-ai.json"
    if ai_path.exists():
        try:
            ai_annotations = json.loads(ai_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"warning: failed to load {ai_path}: {e}")

    rows_html_by_section = []
    total = 0
    for title, desc, pattern, kind in SECTIONS:
        paths = sorted((ASSETS / Path(pattern).parent).glob(Path(pattern).name)) \
                if "/" in pattern else \
                sorted(ASSETS.glob(pattern))
        if not paths: continue
        rows = []
        for p in paths:
            rel = p.relative_to(ROOT).as_posix()  # e.g. assets/bitmaps/replay.png
            data_id = rel  # stable key for annotation storage
            info = info_line(p, rel, kind)
            preview = render_preview(rel, kind)
            ai_text = ai_annotations.get(rel, "")
            rows.append(f"""
              <tr>
                <td class="preview">{preview}</td>
                <td class="meta">
                  <code>{html.escape(p.name)}</code>
                  <div class="info">{info}</div>
                  <div class="path muted">{html.escape(rel)}</div>
                </td>
                <td class="annot">
                  <textarea data-id="{html.escape(data_id)}"
                            data-ai-default="{html.escape(ai_text)}"
                            placeholder="What did this do in the game? (one or two lines)"
                            rows="3">{html.escape(ai_text)}</textarea>
                </td>
              </tr>""")
        total += len(rows)
        rows_html_by_section.append(f"""
          <section>
            <h2>{html.escape(title)} <span class="muted">({len(rows)})</span></h2>
            <p class="desc">{html.escape(desc)}</p>
            <table>
              <thead><tr><th>Preview</th><th>File</th><th>Your note</th></tr></thead>
              <tbody>{"".join(rows)}</tbody>
            </table>
          </section>""")

    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Makhela assets catalogue ({total} items)</title>
<style>
  body {{
    font-family: system-ui, "Heebo", Arial, sans-serif;
    background: #1a1d23; color: #ddd;
    max-width: 1200px; margin: 0 auto; padding: 1rem;
    line-height: 1.45;
  }}
  h1 {{ color: #fff; margin-bottom: 0.3rem; }}
  h2 {{ color: #8ec5ff; margin-top: 2.5rem; border-bottom: 1px solid #444; padding-bottom: 0.3rem; }}
  .muted {{ color: #888; }}
  .desc {{ color: #aaa; margin: 0.3rem 0 1rem; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ text-align: left; color: #8ec5ff; padding: 0.3rem; font-weight: normal; font-size: 0.9rem; }}
  td {{ vertical-align: top; padding: 0.6rem 0.4rem; border-top: 1px solid #2a2d33; }}
  td.preview {{ width: 340px; }}
  td.preview img, td.preview video {{ max-width: 320px; max-height: 200px; background: #000; image-rendering: pixelated; display: block; }}
  td.preview audio {{ width: 320px; }}
  td.meta {{ width: 260px; }}
  td.meta code {{ font-size: 0.95rem; color: #ffe089; }}
  .info {{ color: #888; font-size: 0.85rem; margin: 0.2rem 0; }}
  .path {{ font-size: 0.78rem; }}
  td.annot {{ }}
  textarea {{ width: 100%; box-sizing: border-box; background: #2a2d33; color: #eee;
              border: 1px solid #444; border-radius: 4px; padding: 0.4rem;
              font-family: inherit; font-size: 0.95rem; resize: vertical; }}
  textarea:focus {{ border-color: #8ec5ff; outline: none; }}
  pre.lyrics {{ background: #2a2d33; padding: 0.4rem 0.6rem; margin: 0;
                max-height: 110px; overflow: auto; font-size: 0.85rem; }}
  #toolbar {{ position: sticky; top: 0; background: #1a1d23; padding: 0.8rem 0;
              border-bottom: 1px solid #333; z-index: 10; display: flex; gap: 0.5rem; align-items: center; }}
  button {{ background: #4a90c2; color: #fff; border: 0; border-radius: 4px;
            padding: 0.5rem 1rem; cursor: pointer; font-size: 0.95rem; }}
  button:hover {{ background: #5fa8d8; }}
  button.secondary {{ background: #333; }}
  #status {{ color: #6a6; font-size: 0.85rem; margin-left: auto; }}
  input[type="file"] {{ color: #aaa; }}
  .ai-reset {{
    background: transparent;
    color: #888;
    border: 1px solid #333;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
  }}
  .ai-reset:hover {{ color: #ffe089; border-color: #ffe089; }}
</style>
</head>
<body>

<h1>Makhela — asset catalogue</h1>
<p class="muted">{total} items. Watch/listen to each one and write what it did in the game.
   Notes auto-save to your browser. Click <b>Export</b> when done — I'll use the JSON to drive the JS reimplementation.</p>

<div id="toolbar">
  <button id="export">Export annotations (JSON)</button>
  <button id="import-btn" class="secondary">Import previous annotations…</button>
  <input id="import-file" type="file" accept="application/json" style="display:none">
  <button id="clear" class="secondary">Clear all</button>
  <span id="status">Auto-save: on</span>
</div>

{"".join(rows_html_by_section)}

<script>
const KEY = "makhela.annotations.v1";

function load() {{
  try {{ return JSON.parse(localStorage.getItem(KEY) || "{{}}"); }}
  catch (e) {{ return {{}}; }}
}}

function save(map) {{
  localStorage.setItem(KEY, JSON.stringify(map));
}}

function flash(msg, ok = true) {{
  const s = document.getElementById("status");
  s.textContent = msg;
  s.style.color = ok ? "#6a6" : "#e88";
  setTimeout(() => {{ s.textContent = "Auto-save: on"; s.style.color = "#6a6"; }}, 2000);
}}

// Hydrate textareas from localStorage. Textareas come PRE-FILLED with
// AI-generated annotations from annotations-ai.json (baked in at build
// time). If the user has any saved edits, those overlay the AI defaults.
const annotations = load();
const textareas = document.querySelectorAll("textarea[data-id]");
let filled = 0;
textareas.forEach(t => {{
  const id = t.dataset.id;
  if (id in annotations) {{
    // Saved value (may be empty if user cleared it intentionally) overrides AI
    t.value = annotations[id];
    filled++;
  }}
  // else: keep the AI default that was inlined into the textarea
}});
if (filled) flash(`Loaded ${{filled}} saved notes (over AI defaults)`);
else        flash(`AI annotations pre-loaded — edit as needed`);

// "Reset to AI default" button per textarea (small undo)
textareas.forEach(t => {{
  const ai = t.dataset.aiDefault || "";
  if (!ai) return;
  // Add a small reset button positioned below the textarea
  const btn = document.createElement("button");
  btn.textContent = "↺ AI default";
  btn.className = "ai-reset";
  btn.title = "Reset this textarea to the AI-generated default";
  btn.addEventListener("click", (e) => {{
    e.preventDefault();
    t.value = ai;
    const map = load();
    delete map[t.dataset.id];
    save(map);
  }});
  t.parentNode.appendChild(btn);
}});

// Auto-save on input (debounced)
let saveTimer = null;
textareas.forEach(t => t.addEventListener("input", () => {{
  const map = load();
  if (t.value.trim()) map[t.dataset.id] = t.value;
  else delete map[t.dataset.id];
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(map), 200);
}}));

// Export
document.getElementById("export").addEventListener("click", () => {{
  const map = load();
  const filled = Object.keys(map).length;
  const blob = new Blob([JSON.stringify(map, null, 2)], {{ type: "application/json" }});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "annotations.json"; a.click();
  URL.revokeObjectURL(url);
  flash(`Exported ${{filled}} annotations`);
}});

// Import
document.getElementById("import-btn").addEventListener("click", () => {{
  document.getElementById("import-file").click();
}});
document.getElementById("import-file").addEventListener("change", (e) => {{
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {{
    try {{
      const map = JSON.parse(r.result);
      save(map);
      let n = 0;
      textareas.forEach(t => {{ if (map[t.dataset.id]) {{ t.value = map[t.dataset.id]; n++; }} else {{ t.value = ""; }} }});
      flash(`Imported ${{n}} notes`);
    }} catch (err) {{ flash("Import failed: " + err.message, false); }}
  }};
  r.readAsText(f);
}});

// Clear
document.getElementById("clear").addEventListener("click", () => {{
  if (!confirm("Clear all annotations? This cannot be undone.")) return;
  localStorage.removeItem(KEY);
  textareas.forEach(t => t.value = "");
  flash("Cleared");
}});
</script>

</body>
</html>"""

    out = ROOT / "catalogue.html"
    out.write_text(html_doc, encoding="utf-8")
    print(f"Wrote {out}  ({total} assets across {len(rows_html_by_section)} sections)")


if __name__ == "__main__":
    main()
