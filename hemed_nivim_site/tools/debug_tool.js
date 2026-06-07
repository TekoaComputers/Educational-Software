// Tekoa Computers — in-page debug tool for Hemed / Nivim.
//
// What it does:
//   1. Floating panel (top-right of the page) listing every game element.
//   2. Per-element position/size editor (sliders + number inputs, live).
//   3. Chroma-key tool: pick any color → mask it transparent across every
//      sprite (goat / flower / Q-mark / sound button / picture). Also
//      patches CSS @keyframes so the cursor + flower bloom animations
//      pick up the keyed versions. Mutation-observes future sprite swaps
//      so the live goat ticker keeps using keyed frames.
//   4. Exports current overrides as CSS (clipboard) and the Python args
//      for baking the chroma-key permanently via port_hemed_nivim.py.
//
// How to load:
//   Option A: paste the entire file into the browser devtools console
//             while on the haklada page.
//   Option B: load on demand from the same origin:
//      fetch("tools/debug_tool.js").then(r => r.text()).then(eval);
//   Option C: add `<script src="tools/debug_tool.js"></script>` to
//             hemed_nivim_site/index.html (remove before commit).
//
// Toggle: __tcdebug.toggle() or click the × in the panel.

(function () {
    "use strict";
    if (window.__tcdebug) { window.__tcdebug.toggle(); return; }

    // Every named element class haklada/the engine uses. `multi:true`
    // means the position edit applies to ALL matches (e.g. flowers).
    const ELEMENTS = [
        { sel: ".hak-goat",         name: "Goat" },
        { sel: ".hak-flower",       name: "Flower (all)",   multi: true },
        { sel: ".hak-typing",       name: "Typing area" },
        { sel: ".hak-q-visible",    name: "Q-text top plank" },
        { sel: ".hak-knas",         name: "Knas penalty" },
        { sel: ".hak-sound",        name: "Sound button" },
        { sel: ".hak-header",       name: "Header" },
        { sel: ".hak-help",         name: "Help overlay" },
        { sel: ".hak-pic",          name: "Picture (qPicture mode)" },
        { sel: ".hak-flower-layer", name: "Flower layer (800×600)" },
    ];
    // Sprite-bearing classes the chroma-key targets.
    const SPRITE_SEL = [
        ".hak-goat", ".hak-flower", ".hak-sound", ".hak-pic",
        ".hak-cell.pending", ".hak-cell.cursor",
    ].join(", ");

    // -------- panel UI ---------------------------------------------------
    const panel = document.createElement("div");
    panel.id = "tcdebug-panel";
    panel.style.cssText = [
        "position:fixed", "top:8px", "right:8px", "width:340px",
        "max-height:calc(100vh - 16px)", "overflow:auto",
        "background:rgba(20,22,26,0.95)", "color:#eee",
        "font:12px/1.4 -apple-system,system-ui,sans-serif",
        "padding:8px", "border:1px solid #555", "border-radius:6px",
        "z-index:100000", "direction:ltr", "text-align:left",
    ].join(";");
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>Tekoa Game Debug</strong>
            <button id="tcd-close" style="background:#444;border:none;color:#eee;padding:2px 8px;cursor:pointer;border-radius:3px">×</button>
        </div>

        <div style="margin-bottom:8px">
            <label>Element:&nbsp;</label>
            <select id="tcd-sel" style="width:100%"></select>
        </div>

        <fieldset style="border:1px solid #444;padding:6px;margin-bottom:8px">
            <legend>Position / size (px)</legend>
            <div id="tcd-pos" style="display:grid;grid-template-columns:50px 1fr 60px;gap:4px;align-items:center"></div>
            <button id="tcd-pos-reset" style="margin-top:6px">Reset to stylesheet</button>
        </fieldset>

        <fieldset style="border:1px solid #444;padding:6px;margin-bottom:8px">
            <legend>Chroma-key (mask color → transparent)</legend>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                <input id="tcd-color" type="color" value="#000000">
                <small style="flex:1">Pick the BG color to make transparent</small>
            </div>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                <label>Tolerance</label>
                <input id="tcd-tol" type="range" min="0" max="100" value="12" style="flex:1">
                <span id="tcd-tolv">12</span>
            </div>
            <div style="display:flex;gap:4px">
                <button id="tcd-mask" style="flex:1">Apply</button>
                <button id="tcd-unmask" style="flex:1">Restore</button>
            </div>
            <small style="color:#aaa;display:block;margin-top:4px">
                Bakes the key into data: URLs and hooks the live frame
                swapper. Use Restore to revert in-page (re-load for full
                @keyframes restore).
            </small>
        </fieldset>

        <fieldset style="border:1px solid #444;padding:6px">
            <legend>Export</legend>
            <button id="tcd-css">Copy CSS overrides</button>
            <button id="tcd-pyargs">Copy ImageMagick args</button>
            <pre id="tcd-out" style="background:#000;color:#0f0;padding:4px;margin-top:6px;max-height:160px;overflow:auto;white-space:pre-wrap;font:11px ui-monospace,monospace"></pre>
        </fieldset>
    `;
    document.body.appendChild(panel);

    const $ = id => panel.querySelector("#" + id);

    // -------- element selector -------------------------------------------
    const sel = $("tcd-sel");
    ELEMENTS.forEach((e, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${e.name}  —  ${e.sel}`;
        sel.appendChild(opt);
    });

    // -------- position grid (left/top/width/height) ----------------------
    const PROPS = [
        { key: "left",   label: "Left",   max: 800 },
        { key: "top",    label: "Top",    max: 600 },
        { key: "width",  label: "Width",  max: 800 },
        { key: "height", label: "Height", max: 600 },
    ];
    const posGrid = $("tcd-pos");
    PROPS.forEach(p => {
        const lbl = document.createElement("label"); lbl.textContent = p.label;
        const sl  = document.createElement("input"); sl.type = "range"; sl.min = "0"; sl.max = String(p.max); sl.step = "1"; sl.id = "tcd-" + p.key;
        const nm  = document.createElement("input"); nm.type = "number"; nm.id = "tcd-" + p.key + "n"; nm.style.width = "55px";
        posGrid.appendChild(lbl); posGrid.appendChild(sl); posGrid.appendChild(nm);
    });

    let currentEl = null;
    let currentCfg = null;
    const overrides = {};         // selector → {prop: value}

    function readPx(el, prop) {
        const inline = el.style[prop];
        if (inline && inline.endsWith("px")) return parseFloat(inline);
        return parseFloat(getComputedStyle(el)[prop]) || 0;
    }
    function loadElement(i) {
        currentCfg = ELEMENTS[i];
        currentEl  = document.querySelector(currentCfg.sel);
        if (!currentEl) {
            $("tcd-out").textContent = `No DOM match for ${currentCfg.sel} — open the haklada game first.`;
            return;
        }
        PROPS.forEach(p => {
            const v = readPx(currentEl, p.key);
            $("tcd-" + p.key).value = v;
            $("tcd-" + p.key + "n").value = v;
        });
        $("tcd-out").textContent = `Loaded ${currentCfg.sel}.`;
    }
    sel.addEventListener("change", () => loadElement(parseInt(sel.value, 10)));

    function applyProp(prop, val) {
        if (!currentEl) return;
        const targets = currentCfg.multi
            ? document.querySelectorAll(currentCfg.sel)
            : [currentEl];
        targets.forEach(t => t.style[prop] = val + "px");
        overrides[currentCfg.sel] = overrides[currentCfg.sel] || {};
        overrides[currentCfg.sel][prop] = parseFloat(val);
    }
    PROPS.forEach(p => {
        const sl = $("tcd-" + p.key), nm = $("tcd-" + p.key + "n");
        sl.addEventListener("input", () => { nm.value = sl.value; applyProp(p.key, sl.value); });
        nm.addEventListener("input", () => { sl.value = nm.value; applyProp(p.key, nm.value); });
    });
    $("tcd-pos-reset").addEventListener("click", () => {
        if (!currentEl) return;
        const targets = currentCfg.multi
            ? document.querySelectorAll(currentCfg.sel)
            : [currentEl];
        targets.forEach(t => {
            PROPS.forEach(p => t.style[p.key] = "");
        });
        delete overrides[currentCfg.sel];
        loadElement(parseInt(sel.value, 10));
    });

    // -------- chroma-key -------------------------------------------------
    const chromaCache = {};       // (url|hex|tol) → data: URL
    const originalBg  = new Map(); // element → original inline bg
    let mutObs = null;
    let activeHex = null;
    let activeTol = null;

    $("tcd-tol").addEventListener("input", () => {
        $("tcd-tolv").textContent = $("tcd-tol").value;
    });

    function urlFromBg(bg) {
        const m = /url\(['"]?([^'")]+)['"]?\)/.exec(bg || "");
        return m ? m[1] : null;
    }

    async function chromaImg(url, hex, tol) {
        const k = url + "|" + hex + "|" + tol;
        if (chromaCache[k]) return chromaCache[k];
        const img = await new Promise((res, rej) => {
            const i = new Image();
            i.crossOrigin = "anonymous";
            i.onload  = () => res(i);
            i.onerror = rej;
            i.src = url;
        }).catch(() => null);
        if (!img) return null;
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        try { ctx.drawImage(img, 0, 0); }
        catch (e) { return null; }
        let d;
        try { d = ctx.getImageData(0, 0, img.width, img.height); }
        catch (e) {
            // Tainted canvas (CORS) — bail. Step 1 won't apply for this URL.
            return null;
        }
        const tr = parseInt(hex.slice(1, 3), 16);
        const tg = parseInt(hex.slice(3, 5), 16);
        const tb = parseInt(hex.slice(5, 7), 16);
        const thr2 = tol * tol * 3;
        for (let i = 0; i < d.data.length; i += 4) {
            const dr = d.data[i]   - tr;
            const dg = d.data[i+1] - tg;
            const db = d.data[i+2] - tb;
            if (dr*dr + dg*dg + db*db <= thr2) d.data[i+3] = 0;
        }
        ctx.putImageData(d, 0, 0);
        const out = c.toDataURL("image/png");
        chromaCache[k] = out;
        return out;
    }

    async function applyChromaToEl(el) {
        if (!activeHex) return;
        const bg = el.style.backgroundImage || getComputedStyle(el).backgroundImage;
        const url = urlFromBg(bg);
        if (!url || url.startsWith("data:")) return;
        const keyed = await chromaImg(url, activeHex, activeTol);
        if (keyed) el.style.backgroundImage = `url("${keyed}")`;
    }

    async function patchKeyframes(hex, tol) {
        for (const sheet of document.styleSheets) {
            let rules;
            try { rules = sheet.cssRules; }
            catch (e) { continue; }    // cross-origin sheet
            for (const rule of rules) {
                if (rule.type !== CSSRule.KEYFRAMES_RULE) continue;
                for (const kf of rule.cssRules) {
                    const url = urlFromBg(kf.style.backgroundImage);
                    if (!url) continue;
                    let abs;
                    try { abs = new URL(url, sheet.href || document.baseURI).toString(); }
                    catch (e) { abs = url; }
                    const keyed = await chromaImg(abs, hex, tol);
                    if (keyed) kf.style.backgroundImage = `url("${keyed}")`;
                }
            }
        }
    }

    $("tcd-mask").addEventListener("click", async () => {
        activeHex = $("tcd-color").value;
        activeTol = parseInt($("tcd-tol").value, 10);
        $("tcd-out").textContent = "Chroma-keying…";

        const cands = document.querySelectorAll(SPRITE_SEL);
        const urls  = new Set();
        for (const el of cands) {
            const bg = el.style.backgroundImage || getComputedStyle(el).backgroundImage;
            const url = urlFromBg(bg);
            if (url && !url.startsWith("data:")) urls.add(url);
            if (!originalBg.has(el)) originalBg.set(el, el.style.backgroundImage || "");
        }
        let done = 0, total = urls.size;
        for (const u of urls) {
            await chromaImg(u, activeHex, activeTol);
            done++;
            $("tcd-out").textContent = `Keyed ${done}/${total} sprite URLs…`;
        }
        for (const el of cands) await applyChromaToEl(el);

        if (mutObs) mutObs.disconnect();
        mutObs = new MutationObserver(muts => {
            for (const m of muts) if (m.attributeName === "style") applyChromaToEl(m.target);
        });
        for (const el of cands) mutObs.observe(el, { attributes: true, attributeFilter: ["style"] });

        await patchKeyframes(activeHex, activeTol);
        $("tcd-out").textContent =
            `Chroma-key applied for color ${activeHex} (tol ${activeTol}). ` +
            `Keyed ${done} sprite URL(s). Use Restore to undo.`;
    });

    $("tcd-unmask").addEventListener("click", () => {
        if (mutObs) { mutObs.disconnect(); mutObs = null; }
        originalBg.forEach((bg, el) => { el.style.backgroundImage = bg; });
        originalBg.clear();
        for (const k in chromaCache) delete chromaCache[k];
        activeHex = null; activeTol = null;
        $("tcd-out").textContent =
            "Restored inline backgrounds. Reload the page for full CSS @keyframes restore.";
    });

    // -------- export -----------------------------------------------------
    $("tcd-css").addEventListener("click", () => {
        let css = "";
        for (const s in overrides) {
            css += `${s} {\n`;
            for (const p in overrides[s]) css += `    ${p}: ${overrides[s][p]}px;\n`;
            css += "}\n";
        }
        if (activeHex) {
            css += `\n/* Chroma-key applied at runtime: mask ${activeHex} ` +
                   `(tolerance ${activeTol}).\n` +
                   `   Permanent fix: re-run port_hemed_nivim.py with the ` +
                   `convert flag below. */\n`;
        }
        $("tcd-out").textContent = css || "(no overrides yet — drag a slider)";
        if (css && navigator.clipboard) {
            navigator.clipboard.writeText(css).catch(() => {});
        }
    });
    $("tcd-pyargs").addEventListener("click", () => {
        if (!activeHex) {
            $("tcd-out").textContent = "Apply a chroma-key first.";
            return;
        }
        const cmd =
            `# In tools/port_hemed_nivim.py, convert_pictures():\n` +
            `subprocess.run([\n` +
            `    "convert", str(f),\n` +
            `    "-fuzz", "${activeTol}%",\n` +
            `    "-transparent", "${activeHex}",\n` +
            `    str(out),\n` +
            `])\n`;
        $("tcd-out").textContent = cmd;
        if (navigator.clipboard) navigator.clipboard.writeText(cmd).catch(() => {});
    });

    // -------- initial render --------------------------------------------
    loadElement(0);

    window.__tcdebug = {
        toggle: () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; },
        panel,
        cache: chromaCache,
        overrides,
    };
    console.log("Tekoa debug tool loaded. __tcdebug.toggle() to show/hide.");
})();
