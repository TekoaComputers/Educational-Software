// Hemed/Nivim data loader. The site runs from file:// (no server), so
// fetch() can't read JSON. The Python port emits both:
//   data/<App>/units.json   — convenient JSON
//   data/<App>/units.js     — inline `window.HND_DATA[<App>] = [...]`
// We load the JS files dynamically by injecting <script> tags, then
// resolve once both are present in window.HND_DATA.
window.HND = window.HND || {};

HND.APPS = {
    Hemed: { id: "Hemed", title: 'חמ"ד',           dataRoot: "data/Hemed" },
    Nivim: { id: "Nivim", title: "ניבים ופתגמים",   dataRoot: "data/Nivim" },
};

HND._loaded = {};
HND.loadUnits = function (appId) {
    if (HND._loaded[appId]) {
        HND.log("data hit", appId, "units=" + HND._loaded[appId].length);
        return Promise.resolve(HND._applyUnitOverrides(appId, HND._loaded[appId]));
    }
    HND.log("data load", appId);
    return new Promise(function (resolve, reject) {
        const s = document.createElement("script");
        s.src = HND.APPS[appId].dataRoot + "/units.js";
        s.onload = function () {
            const data = (window.HND_DATA || {})[appId];
            if (!data) { reject(new Error("units.js לא טען " + appId)); return; }
            HND._loaded[appId] = data;
            HND.log("data ok", appId, "units=" + data.length);
            resolve(HND._applyUnitOverrides(appId, data));
        };
        s.onerror = function () {
            HND.log("data err", appId, s.src);
            reject(new Error("שגיאת טעינה: " + s.src));
        };
        document.head.appendChild(s);
    });
};
// Force the next loadUnits() to re-merge overlay (e.g., after Save in
// lesson editor). Cheap since the base array is still cached.
HND.refreshUnits = function (appId) {
    HND.log("data refresh", appId);
};

HND.unitWavePath = function (appId, unitId, n, side) {
    // side = "left" | "right"
    return HND.APPS[appId].dataRoot + "/unit_" + unitId + "/wave/" +
           n + "_" + side + ".wav";
};

// Check whether a wave file exists per the port-time manifest (item._waves).
// Lets games mirror the original `If Exist(...) Then PlayWave` pattern
// without firing 404s the browser can't suppress.
HND.unitWaveExists = function (unit, itemIdx, side) {
    const items = unit && unit.data && unit.data.items;
    if (!items || !items[itemIdx]) return true;   // fail-open if no manifest
    const waves = items[itemIdx]._waves;
    if (!waves) return true;
    return waves.indexOf(String(side).toLowerCase()) !== -1;
};

// Q+A audio chaining per CurrentCalibration.CombineQA (GameHatama/Connect/
// American/Haklada all share the same dispatch shape):
//   "0" → play askSide alone
//   "7" → play ansSide, then chain to askSide
//   "8" → play right, then chain to left
//   "9" → play left,  then chain to right
// askSide / ansSide are "left" or "right" (the wave-file suffix).
HND.playCombineQA = function (appId, unitId, origIdx, mode, askSide, ansSide) {
    const p = function (side) { return HND.unitWavePath(appId, unitId, origIdx, side); };
    const chain = function (first, second) {
        HND.playWave(p(first), function () { HND.playWave(p(second)); });
    };
    switch (String(mode)) {
        case "7": chain(ansSide, askSide); break;
        case "8": chain("right", "left"); break;
        case "9": chain("left", "right"); break;
        case "0":
        default:  HND.playWave(p(askSide)); break;
    }
};

// Shared audio element so a new play() always interrupts the previous —
// matches the original WaveMe MCI control's one-track-at-a-time model.
// Original VB6 `Exist()`-checks every wave path before playing; we can't
// HEAD-check under file://, so instead we remember URLs that failed once
// and skip future attempts silently (acts like the missing-file branch in
// GameHakira.frm:494/525 "If Exist(...) = False Then PlayWave next/GoNext").
HND._audio = null;
HND._missingWaves = HND._missingWaves || Object.create(null);
// Re-enter the SAME game route — fix for CmdRePlay buttons that appeared
// dead because `location.hash = currentHash` is a no-op and doesn't fire
// `hashchange`. Bounce through `/games` first, then back via rAF so the
// router re-mounts the game cleanly.
HND.restartGame = function (appId, unitId, game) {
    const gameRoute  = "#/" + appId + "/unit/" + unitId + "/" + game;
    const menuRoute  = "#/" + appId + "/unit/" + unitId + "/games";
    location.hash = menuRoute;
    requestAnimationFrame(function () { location.hash = gameRoute; });
};

HND.playWave = function (url, onEnded) {
    if (HND._missingWaves[url]) {
        if (onEnded) onEnded();
        return;
    }
    // trace.js auto-logs `audio play <url>` via the wrapped Audio()
    // loadstart handler — no explicit log needed here.
    if (!HND._audio) HND._audio = new Audio();
    try {
        HND._audio.pause();
        HND._audio.onended = onEnded || null;
        // The `onerror` event fires when the SOURCE fails to load (404 /
        // decode error). That's the only signal we use to cache the URL
        // as missing — the original VB6 `If Exist(...) Then PlayWave`
        // pattern. play()-promise rejections (AbortError when the next
        // pause/play interrupts us, NotAllowedError under autoplay block)
        // are transient and must NOT poison the cache, or the very first
        // question's audio gets permanently silenced.
        HND._audio.onerror = function () {
            HND._missingWaves[url] = true;
            HND._audio.onerror = null;
            if (onEnded) onEnded();
        };
        HND._audio.src = url;
        HND._audio.currentTime = 0;
        const p = HND._audio.play();
        if (p && p.catch) p.catch(function () {
            // swallow — not a missing-file signal.
        });
    } catch (e) {
        if (onEnded) onEnded();
    }
};
HND.stopWave = function () {
    if (HND._audio && !HND._audio.paused) HND.log("audio stop");
    if (HND._audio) { HND._audio.onended = null; HND._audio.pause(); }
};

// localStorage progress map. Per-user keying matches the original VB6
// Allusers[CurrentUser].MaslulScores tree — each user has their own best/last
// per (appId, unitId, gameId). userName comes from the main-screen input;
// blank user falls back to a default bucket.
//   hnd.<userName|_>.<App>.<unitId>.<gameId> = {best, last, plays, ts}
HND._currentUser = function (appId) {
    try { return (localStorage.getItem("hnd." + appId + ".user") || "").trim() || "_"; }
    catch (e) { return "_"; }
};
HND._key = function (appId, unitId, gameId) {
    return "hnd." + HND._currentUser(appId) + "." + appId + "." + unitId + "." + gameId;
};
// Map (game, slot) → progress-key. Orig GameMenu.frm scores per CmdPlus1
// slot (GameId = slot×10, badge keyed by `Mid(CStr(GameId),1,1)`), so the
// THREE American variants (slots 2/3/4) and TWO Haklada variants (5/6)
// each have their own score. Single-slot games keep their plain name.
HND.SLOT_KEYS = {
    2: "american_sound", 3: "american_pic", 4: "american_text",
    5: "haklada_reg",    6: "haklada_dict",
};
HND.gameKey = function (game, slotIdx) {
    if (slotIdx == null) return game;
    return HND.SLOT_KEYS[slotIdx] || game;
};
// Each game runner reads sessionStorage.lastSlot (set by GameMenu click)
// to derive its own slot-specific key.
HND.currentSlotKey = function (appId, fallbackGame) {
    let slot = null;
    try {
        const raw = sessionStorage.getItem("hnd." + appId + ".lastSlot");
        if (raw != null && raw !== "") slot = parseInt(raw, 10);
    } catch (e) {}
    return HND.gameKey(fallbackGame, slot);
};
HND.loadProgress = function (appId, unitId, gameId) {
    try {
        const raw = localStorage.getItem(HND._key(appId, unitId, gameId));
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
};
// Structured console logger. All sites use the same trace.js prefix
// so logs look uniform across the suite:
//     [<app>/<screen>] <kind> ...details
// HND.log is an alias kept for compatibility with existing call sites;
// new code should call Tekoa.log directly.
HND.log = function (kind /*, ...args */) {
    if (window.Tekoa && Tekoa.log) {
        Tekoa.log.apply(null, arguments);
    } else {
        const args = Array.prototype.slice.call(arguments, 1);
        console.log.apply(console, ["[hnd]", kind].concat(args));
    }
};

// Global click logger — fires once per click on any clickable element so
// every button press prints WHICH button was pressed, without us having to
// remember to wire onclick handlers per-button.
//
// Each clickable gets a *unique* composite ID so the user can reference any
// individual button in conversation: "press <screen>:<role>:<label>".
// Roles include: title attribute, distinctive class name, position-derived
// id, or the row index for repeated elements.
(function installClickLogger() {
    if (typeof document === "undefined" || HND._clickLoggerInstalled) return;
    HND._clickLoggerInstalled = true;

    function isClickable(n) {
        if (!n || n === document.body || n === document) return false;
        const tag = (n.tagName || "").toLowerCase();
        if (tag === "button" || tag === "a" || tag === "select" || tag === "option") return true;
        if (n.getAttribute && n.getAttribute("role") === "button") return true;
        if (n.classList && (n.classList.contains("ctrl") ||
                            n.classList.contains("game-sign") ||
                            n.classList.contains("row") ||
                            n.classList.contains("studform-row") ||
                            n.classList.contains("ued-data-row") ||
                            n.classList.contains("calib-game-row") ||
                            n.classList.contains("lesson-unit-row"))) return true;
        // Element with explicit onclick handler attribute.
        if (n.onclick) return true;
        return false;
    }
    function buttonLabel(n) {
        // 1. Explicit data-debug-id (set by HND.makeButton or manually).
        if (n.dataset && n.dataset.debugId) return n.dataset.debugId;
        // 2. title attribute — usually our primary descriptive label.
        const title = (n.title || "").trim();
        // 3. ALL distinctive classes joined (so .cmd0 / .cmd1 etc. aren't lost
        //    behind a shared prefix like .studform-cmd).
        const cls = (n.className || "").toString().split(/\s+/).filter(function (c) {
            return c && c !== "ctrl" && c !== "row" && c !== "sel" &&
                   c !== "active" && c !== "done" && c !== "sub-btn";
        });
        const classKey = cls.length ? cls.join(".") : "(" + (n.tagName || "").toLowerCase() + ")";
        // 4. Text content (clipped).
        const txt = (n.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
        // 5. Sibling index — for repeated elements (rows, signs) inside a parent.
        let rowIndex = "";
        if (n.parentNode) {
            const sibs = Array.prototype.slice.call(n.parentNode.children);
            const sameClassSibs = sibs.filter(function (s) {
                return s.tagName === n.tagName && s.className === n.className;
            });
            if (sameClassSibs.length > 1) {
                rowIndex = "#" + sameClassSibs.indexOf(n);
            }
        }
        const desc = title || txt || "";
        return classKey + (desc ? ":" + desc : "") + rowIndex;
    }
    // We produce a richer label than trace.js's default (walks up the DOM
    // to the nearest clickable, includes role + sibling index). Tell
    // trace.js to skip its generic auto-click so we don't double-log.
    if (window.Tekoa && Tekoa.disableAutoClick) Tekoa.disableAutoClick();
    document.addEventListener("click", function (ev) {
        let n = ev.target;
        while (n && n !== document.body) {
            if (isClickable(n)) {
                HND.log("press", buttonLabel(n));
                return;
            }
            n = n.parentNode;
        }
    }, true);
})();

// Tiny DOM helper used by every game module. Each option key turns into
// an attribute, with class/text/style/onXxx handled specially.
HND._el = function (tag, opts, kids) {
    const node = document.createElement(tag);
    if (opts) Object.keys(opts).forEach(function (k) {
        if (k === "class") node.className = opts[k];
        else if (k === "text") node.textContent = opts[k];
        else if (k === "style" && typeof opts[k] === "object") Object.assign(node.style, opts[k]);
        else if (k.startsWith("on") && typeof opts[k] === "function")
            node.addEventListener(k.slice(2), opts[k]);
        else if (opts[k] != null) node.setAttribute(k, opts[k]);
    });
    (kids || []).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
};

// Pre-load image assets so CSS background-image swaps don't flicker on
// first display. Fetch + force-decode each PNG so it's GPU-ready before
// any animation frame asks for it. Without the decode() call the browser
// only downloads the file; the actual raster decode happens lazily on
// first paint, causing the first keyframe of a CSS animation to render
// as a blank tile.
HND._preloaded = {};        // url → { img, promise }
// Hidden sprite cache — for EACH preloaded URL we keep both:
//   1) an <img> tag mounted in the DOM (guarantees bitmap stays decoded)
//   2) a div with `background-image: url(...)` (guarantees the browser has
//      the texture in the CSS-bg path, which is a separate cache from <img>)
// The container sits at top:0 with opacity:0 + zero size — IN the viewport
// (not at top:-9999px which can skip rasterization). The browser fully
// paints both elements during preload, so per-element first-paint hits
// the CSS-bg cache instantly without a fetch-decode round trip.
HND._spriteCache = null;
function _getSpriteCache() {
    if (HND._spriteCache) return HND._spriteCache;
    const c = document.createElement("div");
    c.id = "hnd-sprite-cache";
    // Inside viewport so the browser actually rasterizes children. Zero
    // size + opacity:0 + pointer-events:none keeps it invisible/inert.
    // Cover the viewport with opacity:0 so children at native sprite size
    // are within the rasterization area but invisible. overflow:hidden
    // would cause browsers to skip painting clipped children (and we
    // need each child to be fully painted to warm GPU textures).
    c.style.cssText = "position:fixed; left:0; top:0; right:0; bottom:0;" +
                      "opacity:0; pointer-events:none; z-index:-1;";
    document.body.appendChild(c);
    HND._spriteCache = c;
    return c;
}
HND.preload = function (urls) {
    if (!Array.isArray(urls)) urls = [urls];
    const cache = _getSpriteCache();
    const promises = urls.map(function (url) {
        if (HND._preloaded[url]) return HND._preloaded[url].promise;
        // <img> tag IN the DOM — forces browser to load + retain bitmap.
        const img = new Image();
        img.style.cssText = "position:absolute; left:0; top:0; width:1px; height:1px;";
        const p = new Promise(function (resolve) {
            img.onload  = function () {
                // Mount a bg-image div AT NATIVE SIZE so the GPU pre-
                // rasterizes the texture at the dimensions the real CSS
                // bg-image will use. A 1×1 cache div makes the GPU store
                // a 1×1 texture; when a 170×178 element later requests
                // the same URL, the browser re-rasterizes at the new size
                // (texture-upload delay) → visible blank frame between
                // sprite swaps. Native-size cache → instant paint.
                const w = img.naturalWidth  || 1;
                const h = img.naturalHeight || 1;
                const bg = document.createElement("div");
                bg.style.cssText = "position:absolute; left:0; top:0; " +
                    "width:"  + w + "px; height:" + h + "px;" +
                    "background-image:url('" + url + "');" +
                    "background-size:" + w + "px " + h + "px;";
                cache.appendChild(bg);
                // decode() forces the bitmap decode to complete.
                if (img.decode) img.decode().then(resolve, resolve);
                else resolve();
            };
            img.onerror = function () { resolve(); };   // never reject — flicker > crash
        });
        img.src = url;
        cache.appendChild(img);
        HND._preloaded[url] = { img: img, promise: p };
        return p;
    });
    return Promise.all(promises);
};

// Build a list of frame URLs from a prefix and an index range/list and
// preload them. Returns a Promise that resolves once every image has
// finished decoding — await it before triggering CSS animations that
// reference those same URLs in keyframes, otherwise the first frame
// flickers as an empty box while the browser fetches+decodes mid-paint.
HND.preloadFrames = function (appId, dir, names) {
    const root = "assets/" + appId + "/pictures/" + dir + "/";
    const list = names.map(function (n) { return root + n + ".png"; });
    return HND.preload(list);
};

// Boot-time / menu-time preload — warms the browser cache for ALL game
// sprite sets so per-game entry doesn't pay the fetch+decode cost. Call
// from the game-menu screen (user typically spends ≥1 s picking a game,
// giving the network + GPU enough time to finish in the background).
// Idempotent: HND.preload caches each URL so re-calls are cheap.
HND.preloadAllGameSprites = function (appId) {
    const out = [];
    // Apple — GameApple/
    const appleNames = ["back", "loah", "middle", "foliage", "bigapple"];
    for (let i = 0; i <= 7; i++) appleNames.push("applered" + i);
    for (let i = 0; i <= 7; i++) appleNames.push("appleyellow" + i);
    for (let i = 0; i <= 6; i++) appleNames.push("q_mark" + i);
    appleNames.push("goat_stand1", "goat_sad1");
    for (let i = 1; i <= 9; i++) appleNames.push("goat_enter" + i);
    for (let i = 1; i <= 5; i++) appleNames.push("goat_pick" + i);
    for (let i = 1; i <= 7; i++) appleNames.push("goat_eat" + i);
    for (let i = 1; i <= 8; i++) appleNames.push("goat_yes" + i);
    for (let i = 1; i <= 9; i++) appleNames.push("goat_no" + i);
    for (let i = 1; i <= 8; i++) appleNames.push("goat_win" + i);
    for (let i = 0; i <= 10; i++) appleNames.push("goatani0_" + i);
    for (let i = 0; i <= 7; i++) appleNames.push("goatani2_" + i);
    out.push(HND.preloadFrames(appId, "GameApple", appleNames));
    // Haklada — GameHaklada/ (also used by american for shared goat/flower)
    const hakNames = ["backt", "backtp", "backtt", "backttp", "sound_on", "sound_off", "q_mark"];
    for (let i = 0; i <= 7; i++) hakNames.push("q_mark" + i);
    if (HND.GOAT_FRAMES) {
        for (let s = 0; s < HND.GOAT_FRAMES.length; s++)
            for (let f = 0; f < HND.GOAT_FRAMES[s]; f++)
                hakNames.push("goat" + s + "_" + f);
    }
    for (let i = 0; i <= 9; i++) {
        hakNames.push("flower1_" + i); hakNames.push("flower2_" + i); hakNames.push("flower3_" + i);
    }
    for (let i = 0; i <= 3; i++) hakNames.push("flower4_" + i);
    out.push(HND.preloadFrames(appId, "GameHaklada", hakNames));
    // American — GameAmerican/
    const amNames = ["back", "frame", "framefocus", "text", "textfocus", "sound", "sound_on", "hetzright0_1"];
    for (let i = 1; i <= 5; i++) amNames.push("hetzright1_" + i);
    for (let i = 1; i <= 8; i++) amNames.push("hetzright2_" + i);
    out.push(HND.preloadFrames(appId, "GameAmerican", amNames));
    // Match (Hatama) — GameHatama/
    const mNames = ["back", "linesleft", "linesright", "linesfull", "goatlook"];
    for (let i = 0; i <= 9; i++) mNames.push("goatlook" + i);
    for (let i = 0; i <= 6; i++) mNames.push("goatenter" + i);
    for (let i = 0; i <= 8; i++) mNames.push("goatgood_1_" + i);
    for (let i = 0; i <= 24; i++) mNames.push("goatwin" + i);
    for (let i = 0; i <= 9; i++) mNames.push("flower0_" + i);
    for (let i = 0; i <= 9; i++) mNames.push("flower1_" + i);
    for (let i = 0; i <= 6; i++) mNames.push("flower2_" + i);
    out.push(HND.preloadFrames(appId, "GameHatama", mNames));
    // Connect — GameConnect/
    out.push(HND.preloadFrames(appId, "GameConnect", [
        "box", "box2", "ball", "not",
        "star_0", "star_1", "star_2", "star_3",
        "smallstar_0", "smallstar_1", "smallstar_2", "smallstar_3",
    ]));
    // Hakira — GameHakira/ (sprite list per hakira.js preload)
    out.push(HND.preloadFrames(appId, "GameHakira", [
        "back", "picback", "line", "line2",
        "scroll0", "scroll1", "scroll2", "scroll3", "scroll4", "scroll5",
        "next_off", "next_on", "next_down",
        "reset_off", "reset_on", "reset_down",
    ]));
    return Promise.all(out);
};

// Build a stacked-<img> frame container inside `parent`. Each URL becomes
// an <img> child at absolute (0,0) covering the parent, opacity 0 by
// default. Returns a `show(idx)` function that toggles which child is
// visible (others stay loaded → GPU keeps all textures warm → frame
// switching is instant, no fetch/decode/upload gap, no transparent
// flash showing the parent's background through).
//
// Use this in place of CSS `@keyframes { N% { background-image: url(...) } }`
// sprite cycles, which always flash between frames because the browser
// invalidates the bg-image cache on every URL change.
//
//   const frames = HND.createFrameStack(parent, ["a.png","b.png","c.png"]);
//   frames.show(0);       // show first frame
//   frames.show(2);       // jump to third
//   frames.show(-1);      // hide all
//   frames.count;         // number of frames
//
// opts:
//   className   — class for each <img> (default "hnd-frame")
//   frameStyle  — extra CSS appended to each <img>.style.cssText
HND.createFrameStack = function (parent, urls, opts) {
    opts = opts || {};
    const imgs = [];
    const baseStyle = "position:absolute;left:0;top:0;width:100%;height:100%;" +
                      "opacity:0;pointer-events:none;user-select:none;";
    urls.forEach(function (url) {
        const img = document.createElement("img");
        img.src = url;
        img.className = opts.className || "hnd-frame";
        img.draggable = false;
        img.style.cssText = baseStyle + (opts.frameStyle || "");
        imgs.push(img);
        parent.appendChild(img);
    });
    let current = -1;
    return {
        count: imgs.length,
        imgs: imgs,
        show: function (n) {
            if (n === current) return;
            if (current >= 0 && imgs[current]) imgs[current].style.opacity = "0";
            if (n >= 0 && n < imgs.length) imgs[n].style.opacity = "1";
            current = n;
        },
    };
};

// Hide a game's root during its initial paint, then fade it in once all
// the preloaded sprites/backgrounds are decoded. Eliminates the first-
// frame flash where background-image fetches haven't completed before the
// browser commits the first frame.
//   root            — game's root element (the .game-stage child)
//   readyPromise    — Promise resolved when preload complete
//   delayMs         — extra delay AFTER preload (default 30ms — one extra
//                     animation frame so layout settles before the fade)
//   transitionMs    — fade-in duration (default 180ms)
// Safe to call multiple times; only the first call attaches the transition.
HND.fadeInOnReady = function (root, readyPromise, delayMs, transitionMs) {
    if (!root || root._hndFadeInBound) {
        // Just chain on the promise — root already gated.
        return readyPromise || Promise.resolve();
    }
    root._hndFadeInBound = true;
    const fadeMs = transitionMs != null ? transitionMs : 180;
    const wait   = delayMs != null ? delayMs : 30;
    root.style.opacity = "0";
    root.style.transition = "opacity " + fadeMs + "ms ease-out";
    const p = (readyPromise && readyPromise.then) ? readyPromise : Promise.resolve();
    return p.then(function () {
        setTimeout(function () { root.style.opacity = "1"; }, wait);
    });
};

HND._shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
};

// Show the end-of-game ScoreForm overlay (port of ScoreForm.frm).
// Shows scoreform.png parchment, unit/user header, animated score
// count-up, error-category breakdown (green=0 errors, yellow=1-2,
// red=3+), Exit & Replay buttons.
//   stage    — the .stage element to overlay onto
//   appId    — for image paths (Hemed/Nivim)
//   unitName — printed at top
//   userName — printed below unit name
//   score    — 0-100
//   errorsByQ— array of per-question error counts (0/1+/3+)
//   onExit   — called when Exit clicked
//   onReplay — called when Replay clicked (optional)
// `opts.skipWave = true` — caller has already played the score_*.wav
// (apple plays it BEFORE the 1.7 s finale pause per orig SoundStatus=-999
// flow, so the form should not replay it).
HND.showScoreForm = function (stage, appId, unitName, userName, score, errorsByQ, onExit, onReplay, opts) {
    HND.log("score-form show", appId, "score=" + score);
    const root = "assets/" + appId + "/pictures/Main/";
    const overlay = HND._el("div", { class: "ctrl score-form score-form-enter" });
    overlay.style.cssText =
        "left:100px; top:0; width:600px; height:600px;" +
        "background-image:url('" + root + "scoreform.png');" +
        "background-size:100% 100%; z-index:50;";
    // Pre-decode the form bg + button skins; trigger the slide-in only after
    // they're decoded so the first frame doesn't render an empty 600×600 box.
    const preload = HND.preload([
        root + "scoreform.png",
        root + "scoreexit.png", root + "scoreexit2.png",
        root + "scoreplay.png", root + "scoreplay2.png",
    ]);
    preload.then(function () {
        // Sin-eased slide-in from below (original Form_Activate uses Sin
        // curve on Top — line 153 of ScoreForm.frm sets Me.Top = FormTop - 560).
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { overlay.classList.add("score-form-on"); });
        });
    });
    // Per-bucket congratulation wave (Score_0/60/70/80/90.wav).
    const scoreBucket = score < 60 ? 0
                      : score < 70 ? 60
                      : score < 80 ? 70
                      : score < 90 ? 80
                                   : 90;
    if (!(opts && opts.skipWave)) {
        HND.playWave("assets/" + appId + "/sounds/score_" + scoreBucket + ".wav");
    }

    // DrawString tmpStr (UnitName + AllTips(116) " · "), (300, 5), 24pt,
    // RGB(100, 50, 80). We hard-code the separator " · " as the unicode
    // middle-dot since AllTips(116) holds the same character in the
    // localized resource file.
    overlay.appendChild(HND._el("div", {
        class: "score-unit",
        text: unitName + " ·",
    }));
    // DrawString UserName, (300, 155), 24pt, RGB(20, 50, 80).
    if (userName) {
        overlay.appendChild(HND._el("div", {
            class: "score-user", text: userName,
        }));
    }
    // DrawString AllTips(172) "סיימת את היחידה", (350, 200), 14pt,
    // RGB(20, 50, 80).
    overlay.appendChild(HND._el("div", {
        class: "score-finished", text: "סיימת את היחידה",
    }));

    // DrawString AllTips(124..128) praise, (200, 234), 44pt, triple-shadow.
    // AllTips(124..128) map to the 5 score buckets; we use stand-in Hebrew
    // phrases since the AllTips file isn't ported.
    let praise = "";
    if (score < 60)       praise = "נסה שוב";
    else if (score < 70)  praise = "המשך כך";
    else if (score < 80)  praise = "יפה מאוד";
    else if (score < 90)  praise = "מצוין";
    else                  praise = "מושלם";
    overlay.appendChild(HND._el("div", { class: "score-praise", text: praise }));

    // Animated score count-up at (212, 194) — ScoreTimer_Timer:
    //   currentScore += TotalScore / 20  (every 50 ms; 1 sec → 100%)
    //   Me.FontSize  = 24 + currentScore / 6   ← in POINTS (24..40 pt)
    //   top          = 194 - currentScore / 12 (rises by ~8 px over the run)
    //   color        = RGB(200 - 2*score, 1.5*score, 0)  (red → green)
    const scoreNum = HND._el("div", { class: "score-number", text: "0" });
    overlay.appendChild(scoreNum);
    let current = 0;
    const tick = setInterval(function () {
        current += Math.max(1, Math.floor(score / 20));
        if (current >= score) { current = score; clearInterval(tick); }
        scoreNum.textContent = String(current);
        // Use pt directly so we match Me.FontSize 1:1.
        scoreNum.style.fontSize = (24 + current / 6) + "pt";
        scoreNum.style.top      = (194 - current / 12) + "px";
        const r = Math.max(0, Math.min(255, 200 - current * 2));
        const g = Math.max(0, Math.min(255, current * 1.5));
        scoreNum.style.color = "rgb(" + r + ",  " + g + ", 0)";
    }, 50);

    // DrawString Err(i), (287, 352 + 29*i) for i=0..2.
    // Original buckets: 0 errors → green, 1-2 errors → yellow, 3+ → red.
    const errCounts = [0, 0, 0];
    (errorsByQ || []).forEach(function (e) {
        if (e === 0) errCounts[0]++;
        else if (e <= 2) errCounts[1]++;
        else errCounts[2]++;
    });
    for (let i = 0; i < 3; i++) {
        overlay.appendChild(HND._el("div", {
            class: "score-err score-err-" + i,
            text: String(errCounts[i]),
        }));
    }

    // Donut chart at (390, 385) — CircleTimer_Timer in ScoreForm.frm draws
    // arcs of growing radius (1→75) split into 3 sectors proportional to
    // Err[i] / (totalQ + 1). Final colors at Rcircle = 75:
    //   green  = RGB(50, 179, 0)
    //   yellow = RGB(255, 202, 0)
    //   red    = RGB(215, 0, 0)
    //
    // VB6 detail (the reason the chart appears FULL in the original): the
    // original does `ReDim ErrorsStatus(QCount)` which creates QCount+1
    // slots, then loops `For i = 0 To totalQ` filling Err[ErrorsStatus(i)].
    // The uninitialized last slot defaults to 0, so Σ Err = totalQ + 1 and
    // the denominator totalQ + 1 makes the arcs cover the full 2π. Our JS
    // `errorsByQ` has exactly QCount entries (no phantom slot), so we
    // divide by the actual Σ Err to get the same 100%-fill behaviour.
    const totalSum = errCounts[0] + errCounts[1] + errCounts[2];
    if (totalSum > 0) {
        const pie = HND._el("div", { class: "score-pie" });
        const slots = [
            { c: "rgb(50,179,0)",  n: errCounts[0] },
            { c: "rgb(255,202,0)", n: errCounts[1] },
            { c: "rgb(215,0,0)",   n: errCounts[2] },
        ];
        const stops = [];
        let acc = 0;
        slots.forEach(function (s) {
            if (s.n === 0) return;
            const span = (s.n / totalSum) * 100;          // % of full circle
            stops.push(s.c + " " + acc.toFixed(2) + "%");
            acc += span;
            stops.push(s.c + " " + acc.toFixed(2) + "%");
        });
        pie.style.background = "conic-gradient(" + stops.join(", ") + ")";
        overlay.appendChild(pie);
    }

    // Exit (scoreexit.png) — bottom-left in the .frm.
    const exitBtn = HND._el("button", {
        class: "ctrl score-exit",
        title: "יציאה",
        onclick: function () { overlay.remove(); if (onExit) onExit(); },
    });
    exitBtn.dataset.app = appId;
    overlay.appendChild(exitBtn);

    // Replay (scoreplay.png) — bottom-right in the .frm.
    if (onReplay) {
        const playBtn = HND._el("button", {
            class: "ctrl score-play",
            title: "הפעלה מחדש",
            onclick: function () { overlay.remove(); if (onReplay) onReplay(); },
        });
        playBtn.dataset.app = appId;
        overlay.appendChild(playBtn);
    }

    stage.appendChild(overlay);
};

// ====== Student roster (mirrors StudentForm.frm — Allusers + scores) ======
// Stored as a JSON array of names at hnd.<appId>.users. The active student
// is hnd.<appId>.user; HND._currentUser() reads it for per-student scoring.
HND.listStudents = function (appId) {
    try {
        const raw = localStorage.getItem("hnd." + appId + ".users");
        const arr = raw ? JSON.parse(raw) : [];
        // First-run migration: if a single legacy `hnd.<appId>.user` exists
        // but isn't in the list yet, pull it in so old progress stays linked.
        const active = (localStorage.getItem("hnd." + appId + ".user") || "").trim();
        if (active && arr.indexOf(active) === -1) {
            arr.unshift(active);
            localStorage.setItem("hnd." + appId + ".users", JSON.stringify(arr));
        }
        return arr;
    } catch (e) { return []; }
};
HND.saveStudents = function (appId, list) {
    try {
        localStorage.setItem("hnd." + appId + ".users", JSON.stringify(list));
    } catch (e) {}
};
HND.setActiveStudent = function (appId, name) {
    try { localStorage.setItem("hnd." + appId + ".user", name || ""); } catch (e) {}
};
HND.resetStudentScores = function (appId, name) {
    // Wipe every hnd.<name>.<appId>.<...>.<...> key.
    const prefix = "hnd." + (name || "_") + "." + appId + ".";
    const toDrop = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) toDrop.push(k);
    }
    toDrop.forEach(function (k) { localStorage.removeItem(k); });
    HND.log("students reset", appId, name, "keys=" + toDrop.length);
    return toDrop.length;
};
HND.deleteStudent = function (appId, name) {
    HND.resetStudentScores(appId, name);
    const list = HND.listStudents(appId).filter(function (n) { return n !== name; });
    HND.saveStudents(appId, list);
    // If we deleted the active student, clear the active pointer.
    const active = localStorage.getItem("hnd." + appId + ".user") || "";
    if (active === name) HND.setActiveStudent(appId, list[0] || "");
};
HND.renameStudent = function (appId, oldName, newName) {
    if (!newName || oldName === newName) return;
    // Re-key every score row from old → new.
    const oldPrefix = "hnd." + oldName + "." + appId + ".";
    const newPrefix = "hnd." + newName + "." + appId + ".";
    const moves = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(oldPrefix) === 0) moves.push(k);
    }
    moves.forEach(function (k) {
        const v = localStorage.getItem(k);
        localStorage.removeItem(k);
        localStorage.setItem(newPrefix + k.slice(oldPrefix.length), v);
    });
    const list = HND.listStudents(appId).map(function (n) {
        return n === oldName ? newName : n;
    });
    HND.saveStudents(appId, list);
    const active = localStorage.getItem("hnd." + appId + ".user") || "";
    if (active === oldName) HND.setActiveStudent(appId, newName);
    HND.log("students rename", appId, oldName + "→" + newName, "scores=" + moves.length);
};

// ====== Teacher-recorded audio (IndexedDB blob store) ======
// Mirrors the original UnitEditorForm's WaveLeft/Right/Hint per-row recording.
// In the desktop app each recording becomes a .wav file at
//   <NetPath>\units\<unitId>\wave\<itemIdx>_<Side>.wav
// In the browser port we keep blobs in IndexedDB keyed by
//   "<appId>:<unitId>:<itemIdx>:<side>"   (side ∈ "Left" | "Right" | "Hint")
HND.recordingStore = (function () {
    const DB_NAME = "hnd_wave";
    const STORE   = "recordings";
    let _db = null;
    function open() {
        if (_db) return Promise.resolve(_db);
        if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
        return new Promise(function (resolve, reject) {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function () {
                req.result.createObjectStore(STORE);
            };
            req.onsuccess = function () { _db = req.result; resolve(_db); };
            req.onerror   = function () { reject(req.error); };
        });
    }
    function tx(mode) {
        return open().then(function (db) {
            return db.transaction(STORE, mode).objectStore(STORE);
        });
    }
    function keyFor(appId, unitId, itemIdx, side) {
        return appId + ":" + unitId + ":" + itemIdx + ":" + side;
    }
    return {
        keyFor: keyFor,
        get: function (key) {
            return tx("readonly").then(function (s) {
                return new Promise(function (resolve, reject) {
                    const r = s.get(key);
                    r.onsuccess = function () { resolve(r.result || null); };
                    r.onerror   = function () { reject(r.error); };
                });
            });
        },
        has: function (key) {
            return tx("readonly").then(function (s) {
                return new Promise(function (resolve, reject) {
                    const r = s.count(key);
                    r.onsuccess = function () { resolve(r.result > 0); };
                    r.onerror   = function () { reject(r.error); };
                });
            });
        },
        put: function (key, blob) {
            return tx("readwrite").then(function (s) {
                return new Promise(function (resolve, reject) {
                    const r = s.put(blob, key);
                    r.onsuccess = function () { resolve(); };
                    r.onerror   = function () { reject(r.error); };
                });
            });
        },
        del: function (key) {
            return tx("readwrite").then(function (s) {
                return new Promise(function (resolve, reject) {
                    const r = s.delete(key);
                    r.onsuccess = function () { resolve(); };
                    r.onerror   = function () { reject(r.error); };
                });
            });
        },
    };
})();

// Start a recording session — opens a Stop modal, captures mic audio via
// MediaRecorder, stores the resulting blob under the given key.
// Returns a Promise<Blob | null> (null if cancelled / mic denied).
HND.recordWave = function (key, captionText) {
    return new Promise(function (resolve) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("הדפדפן אינו תומך בהקלטה.");
            resolve(null); return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            const chunks = [];
            const rec = new MediaRecorder(stream);
            rec.ondataavailable = function (ev) {
                if (ev.data && ev.data.size > 0) chunks.push(ev.data);
            };
            // Build a minimal modal: caption + Stop button + a red recording dot.
            const overlay = document.createElement("div");
            overlay.className = "ctrl hnd-record-modal";
            overlay.innerHTML =
                '<div class="hnd-rec-card">' +
                '  <div class="hnd-rec-dot"></div>' +
                '  <div class="hnd-rec-caption"></div>' +
                '  <div class="hnd-rec-time">0.0s</div>' +
                '  <button class="hnd-rec-stop" title="עצור והגן">עצור</button>' +
                '  <button class="hnd-rec-cancel" title="בטל">בטל</button>' +
                '</div>';
            overlay.querySelector(".hnd-rec-caption").textContent = captionText || "מקליט...";
            const stage = document.querySelector(".stage");
            (stage || document.body).appendChild(overlay);
            const t0 = Date.now();
            const timeEl = overlay.querySelector(".hnd-rec-time");
            const timer = setInterval(function () {
                timeEl.textContent = ((Date.now() - t0) / 1000).toFixed(1) + "s";
            }, 100);
            function cleanup() {
                clearInterval(timer);
                stream.getTracks().forEach(function (t) { t.stop(); });
                overlay.remove();
            }
            overlay.querySelector(".hnd-rec-stop").onclick = function () {
                rec.stop();
            };
            overlay.querySelector(".hnd-rec-cancel").onclick = function () {
                rec.ondataavailable = null;
                rec.stop();
                cleanup();
                HND.log("record cancelled", key);
                resolve(null);
            };
            rec.onstop = function () {
                cleanup();
                if (!chunks.length) { resolve(null); return; }
                const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
                HND.recordingStore.put(key, blob).then(function () {
                    HND.log("record saved", key, "size=" + blob.size, "type=" + blob.type);
                    resolve(blob);
                }).catch(function (e) {
                    HND.log("record save err", String(e));
                    resolve(null);
                });
            };
            rec.start();
            HND.log("record start", key);
        }).catch(function (e) {
            HND.log("record err", String(e));
            alert("לא ניתן להפעיל מיקרופון: " + (e.message || e));
            resolve(null);
        });
    });
};

// Playback for IndexedDB-stored blobs (right-click on a Wave button in the
// editor). Falls back to no-op if the recording doesn't exist.
HND.playRecording = function (key) {
    HND.recordingStore.get(key).then(function (blob) {
        if (!blob) { HND.log("playback miss", key); return; }
        const url = URL.createObjectURL(blob);
        HND.playWave(url, function () { URL.revokeObjectURL(url); });
    });
};

// ====== Calibration schema (parsed from Data/Calib.txt) ======
// Each app's Calib.txt declares which controls + option lists apply to each
// of the 8/9 games. We pre-parse it on the Python side into calib.js so the
// browser can load it without fetch (file:// origin).
HND._calibLoaded = {};
// Tips.txt entries — used for header separators ("AllTips(112)" =
// "שם התלמיד:", "AllTips(116)" = "שם היחידה:", praise tier strings
// AllTips(122..125), etc.). Loaded once per app and cached.
// Uses the SCRIPT-TAG pattern (not fetch) because the site is shipped
// for file:// — fetch() is blocked by CORS for cross-origin file
// requests but <script src> loads cleanly. Porter emits tips.js with
// `window.HND_TIPS["<app>"] = [...]`.
HND._tipsLoaded = HND._tipsLoaded || {};
HND.loadTips = function (appId) {
    if (HND._tipsLoaded[appId]) return Promise.resolve(HND._tipsLoaded[appId]);
    return new Promise(function (resolve) {
        const s = document.createElement("script");
        s.src = HND.APPS[appId].dataRoot + "/tips.js";
        s.onload = function () {
            const arr = (window.HND_TIPS || {})[appId] || [];
            HND._tipsLoaded[appId] = arr;
            HND.log("tips ok", appId, "n=" + arr.length);
            resolve(arr);
        };
        s.onerror = function () {
            HND.log("tips load fail", appId, s.src);
            HND._tipsLoaded[appId] = [];
            resolve([]);
        };
        document.head.appendChild(s);
    });
};
// Synchronous getter — returns "" if tips not loaded yet (caller should
// have awaited loadTips). Safe to call from any game render path.
HND.tip = function (appId, n) {
    const arr = HND._tipsLoaded[appId];
    return (arr && arr[n]) || "";
};

HND.loadCalibSchema = function (appId) {
    if (HND._calibLoaded[appId]) {
        return Promise.resolve(HND._calibLoaded[appId]);
    }
    return new Promise(function (resolve, reject) {
        const s = document.createElement("script");
        s.src = HND.APPS[appId].dataRoot + "/calib.js";
        s.onload = function () {
            const data = (window.HND_CALIB || {})[appId];
            if (!data) { reject(new Error("calib.js לא טען " + appId)); return; }
            HND._calibLoaded[appId] = data;
            HND.log("calib ok", appId, "games=" + data.length);
            resolve(data);
        };
        s.onerror = function () { reject(new Error("שגיאת טעינה: " + s.src)); };
        document.head.appendChild(s);
    });
};

// Per-game cfg field map (CalibrationType in GamesMoudle.bas:140-168). Each
// game's cfg block is 20 fields starting at i*20.
HND.CFG_FIELDS = {
    CanScroll:           0,
    CanStudentChange:    1,
    Disabled:            2,
    IfRandom:            3,
    Instructions:        4,
    QLimit:              5,
    SideToAsk:           6,
    WhatToAsk:           7,
    WhatToAnswer:        8,    // composite: "A+B" → A=WhatToAnswer, B=CombineQA
    WhatToHint:          9,
    TextForPicture:     10,
    ErrorForHint:       11,
    TLimit:             12,
    WhatToType:         13,
    WhatToAnswerSound:  14,
    WhatToAskSound:     15,
    CanSwitchQA:        16,
    CanSwitchTextToFill: 17,
    InstructionsFliped: 18,
};

// Map ComboPlus control name → cfg-field key.
HND.CALIB_CTL_TO_FIELD = {
    SetCanSwitchQA:           "CanSwitchQA",
    SetSideToAsk:             "SideToAsk",
    SetWhatToAsk:             "WhatToAsk",
    SetWhatToAnswer:          "WhatToAnswer",    // composite
    SetWhatToHint:            "WhatToHint",
    SetTextForPicture:        "TextForPicture",
    SetScroll:                "CanScroll",
    SetErrorForHint:          "ErrorForHint",
    SetTimeLimit:             "TLimit",
    SetQLimit:                "QLimit",
    SetRandom:                "IfRandom",
    SetCombineAQ:             "CombineQA",       // saved into WhatToAnswer slot
    SetWhatToType:            "WhatToType",
    SetWhatToAskSound:        "WhatToAskSound",
    SetWhatToAnswerSound:     "WhatToAnswerSound",
    SetCanSwitchTextToFill:   "CanSwitchTextToFill",
};

// Read/write a single calibration field for one game out of unit.cfg.
HND.getCalibField = function (unit, gameIdx, fieldName) {
    const cfg = unit && unit.cfg || [];
    const off = gameIdx * 20 + (HND.CFG_FIELDS[fieldName] || 0);
    const raw = String(cfg[off] || "");
    if (fieldName === "WhatToAnswer") {
        // Composite "A+B" — first char is WhatToAnswer, third char is CombineQA.
        return raw.length >= 1 ? raw.charAt(0) : "";
    }
    if (fieldName === "CombineQA") {
        const slot = String(cfg[gameIdx * 20 + HND.CFG_FIELDS.WhatToAnswer] || "");
        return slot.length >= 3 ? slot.charAt(2) : "0";
    }
    return raw;
};
// Slot index (game-menu position 0..8) → cfg-block index in unit.cfg.
// Mirrors SLOT_TO_CAL_IDX in app.js (the original GameMenu.frm's
// CheckDisable mapping).
HND.SLOT_TO_CAL_IDX = { 0:0, 1:1, 2:5, 3:6, 4:7, 5:2, 6:3, 7:4, 8:8 };

// Resolve every side + audio + column + flag the orig CurrentCalibration
// exposes — used by every game so per-unit teacher overrides are honored
// (orig GamesMoudle.bas:18-40 CalibrationType). Pass `gameIdx` (which
// 20-field cfg block to read) — most games take it as a constant; American
// has 3 modes mapped to slots 2/3/4 → cfg indices 5/6/7 (per app.js).
HND.resolveCalibration = function (unit, gameIdx) {
    const get = function (k) { return HND.getCalibField(unit, gameIdx, k); };
    const whatToAsk    = parseInt(get("WhatToAsk"),    10);
    const whatToAnswer = parseInt(get("WhatToAnswer"), 10);
    const whatToType   = parseInt(get("WhatToType"),   10) || 20;
    const whatToHint   = parseInt(get("WhatToHint"),   10);
    // Audio-side overrides (orig CurrentCalibration.WhatToAskSound /
    // WhatToAnswerSound): when a unit's audio uses a different side
    // than the text Q/A, these win. =4 (qDisabled) means no audio.
    // Fall back to WhatToAsk/WhatToAnswer when absent or qPicture (3).
    const askSoundRaw  = parseInt(get("WhatToAskSound"),    10);
    const ansSoundRaw  = parseInt(get("WhatToAnswerSound"), 10);
    const combineQA    = get("CombineQA") || "0";
    const textForPic   = parseInt(get("TextForPicture"), 10);
    const ifRandom     = String(get("IfRandom") || "True").toLowerCase() !== "false";
    const qLimit       = parseInt(get("QLimit"), 10);
    const instructions        = String((unit.cfg || [])[gameIdx * 20 + 4]  || "");
    const instructionsFliped  = String((unit.cfg || [])[gameIdx * 20 + 18] || "");
    // Side (qRight=0, qLeft=1, qHint=2, qPicture=3) → wave suffix +
    // column index. qPicture falls back to TextForPicture per orig
    // SetWaveName (GamesMoudle.bas:495).
    const SIDE_NAME = { 0: "right", 1: "left", 2: "hint" };
    const SIDE_COL  = { 0: 2, 1: 1, 2: 0 };
    function sideName(s) {
        if (s === 3) return SIDE_NAME[textForPic] || "right";
        return SIDE_NAME[s] || "right";
    }
    function sideCol(s) {
        if (s === 3) return SIDE_COL[textForPic] != null ? SIDE_COL[textForPic] : 2;
        return SIDE_COL[s] != null ? SIDE_COL[s] : 2;
    }
    const cols = (unit.data && unit.data.columns) || [];
    return {
        gameIdx,
        // raw integers (for switch statements in the per-game ports)
        whatToAsk, whatToAnswer, whatToType, whatToHint, textForPic,
        // CombineQA mode ("0"/"7"/"8"/"9")
        combineQA,
        ifRandom,
        qLimit: qLimit > 0 ? qLimit : 0,
        instructions,
        instructionsFliped,
        // wave-file suffix matching the TEXT side. Use askSide/ansSide
        // for games that play whatever side the user sees (Haklada,
        // Match, Connect, Hakira — orig .frms use SetWaveName(WhatToAsk)
        // directly). qDisabled (4) → null so callers can skip play.
        askSide:  sideName(whatToAsk),
        ansSide:  sideName(whatToAnswer),
        hintSide: sideName(whatToHint),
        // Audio-side overrides for games that honor `WhatToAskSound` /
        // `WhatToAnswerSound` (cfg fields 14/15). American + Apple are
        // the only games where the orig .frm reads these — see e.g.
        // GameAmerican.frm:454 `SetWaveName WhatToAskSound`. They let
        // a teacher show one side as text but PLAY a different side
        // as audio (e.g. text=translation, audio=Hebrew). =4 means
        // qDisabled (no audio) → null. When the field is absent or
        // out-of-range, fall back to the text side.
        askSoundSide: (askSoundRaw === 4) ? null :
                      (askSoundRaw >= 0 && askSoundRaw <= 2)
                          ? sideName(askSoundRaw) : sideName(whatToAsk),
        ansSoundSide: (ansSoundRaw === 4) ? null :
                      (ansSoundRaw >= 0 && ansSoundRaw <= 2)
                          ? sideName(ansSoundRaw) : sideName(whatToAnswer),
        whatToAskSound:    askSoundRaw,
        whatToAnswerSound: ansSoundRaw,
        // data.columns indices (cols[0]=hint, cols[1]=left, cols[2]=right)
        askCol:  cols[sideCol(whatToAsk)]    || cols[0],
        ansCol:  cols[sideCol(whatToAnswer)] || cols[0],
        hintCol: cols[sideCol(whatToHint)]   || cols[0],
        picMode: whatToAsk === 3 || whatToAnswer === 3,
        // per-unit typography (from data.txt header — see parse_data_txt)
        fonts: (unit.data && unit.data.fonts) || {},
    };
};

// Resolve calibration based on the slot the user clicked in the game
// menu (sessionStorage.hnd.<app>.lastSlot, set in showGameMenu). Each
// game called this from its startXxx() entry point so the cfg block is
// auto-selected (especially for American which has 3 modes).
HND.gameCalibrationFromSlot = function (unit, appId, fallbackGameIdx) {
    let slotIdx = -1;
    try { slotIdx = parseInt(sessionStorage.getItem("hnd." + appId + ".lastSlot"), 10); }
    catch (e) {}
    const idx = HND.SLOT_TO_CAL_IDX[slotIdx];
    return HND.resolveCalibration(
        unit,
        idx != null ? idx : (fallbackGameIdx != null ? fallbackGameIdx : 0)
    );
};

// Wrap HND.playCombineQA with auto-resolution of askSide/ansSide from
// the calibration — most callers were threading these manually.
// `opts.praiseMax` (default 3 for word-completion games; pass 2 for the
// Hatama family per orig WaveMe_Done :983 `Rnd*2+1`; pass 0 to skip,
// e.g. Connect which pre-plays good4.wav as the praise itself).
HND.playCombineFromCal = function (appId, unitId, origIdx, cal, then, opts) {
    opts = opts || {};
    const praiseMax = opts.praiseMax == null ? 3 : opts.praiseMax;
    const p = function (side) { return HND.unitWavePath(appId, unitId, origIdx, side); };
    // Skip null sides (qDisabled) — call the next link in the chain.
    const playOrSkip = function (side, next) {
        if (!side) { if (next) next(); return; }
        HND.playWave(p(side), next || null);
    };
    // Praise step: orig WaveMe_Done state machine plays `good<1..N>.wav`
    // AFTER the CombineQA chain and BEFORE Q-advance. Skip when praiseMax=0.
    const afterCombine = (praiseMax > 0) ? function () {
        const n = 1 + Math.floor(Math.random() * praiseMax);
        HND.playWave("assets/" + appId + "/sounds/good" + n + ".wav", then || null);
    } : then;
    const chain = function (a, b) {
        playOrSkip(a, function () { playOrSkip(b, afterCombine); });
    };
    switch (String(cal.combineQA)) {
        case "7": chain(cal.askSide, cal.ansSide); break;
        case "8": chain("right", "left"); break;
        case "9": chain("left",  "right"); break;
        case "0":
        default:  playOrSkip(cal.ansSide, afterCombine); break;
    }
};

HND.setCalibField = function (unit, gameIdx, fieldName, value) {
    const cfg = unit.cfg = (unit.cfg || []).slice();      // clone before mutate
    const off = gameIdx * 20 + (HND.CFG_FIELDS[fieldName] || 0);
    if (fieldName === "WhatToAnswer") {
        const cq = HND.getCalibField(unit, gameIdx, "CombineQA");
        cfg[off] = String(value) + "+" + String(cq);
    } else if (fieldName === "CombineQA") {
        const wa = HND.getCalibField(unit, gameIdx, "WhatToAnswer");
        cfg[gameIdx * 20 + HND.CFG_FIELDS.WhatToAnswer] = String(wa) + "+" + String(value);
    } else {
        cfg[off] = String(value);
    }
    return cfg;
};

// ====== Unit-content override (lesson editor's localStorage overlay) ======
// Saved as hnd.<appId>.unit_overrides = { <unitId>: { items: [...] } }.
// Items in the overlay completely replace the JSON items for that unit
// (column captions stay shared, since the original UI also keeps them).
HND.loadUnitOverrides = function (appId) {
    try {
        const raw = localStorage.getItem("hnd." + appId + ".unit_overrides");
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
};
HND.saveUnitOverrides = function (appId, overrides) {
    try {
        localStorage.setItem("hnd." + appId + ".unit_overrides",
                             JSON.stringify(overrides || {}));
    } catch (e) {}
};
// Merge overlay into a base units array (mutates returned copy). Both
// items (lesson editor) and cfg (calibration form) can be overridden.
// Entries in the overlay whose unit id ISN'T in the base array are treated
// as brand-new units (created by the teacher via UnitEditorForm "new unit"
// equivalent) and appended.
HND._applyUnitOverrides = function (appId, units) {
    const ov = HND.loadUnitOverrides(appId);
    if (!ov || !Object.keys(ov).length) return units;
    const baseIds = {};
    units.forEach(function (u) { baseIds[u.id] = true; });
    // Filter out tombstoned bundled units (orig DelUnit allows deleting any
    // unit; we keep the JSON intact and just hide via override flag).
    let merged = units.filter(function (u) {
        const o = ov[u.id];
        return !(o && o.deleted);
    }).map(function (u) {
        const o = ov[u.id];
        if (!o) return u;
        const out = Object.assign({}, u);
        if (o.items) {
            out.data = Object.assign({}, u.data || {});
            out.data.items = o.items;
        }
        if (o.cfg)     out.cfg = o.cfg;
        if (o.name)    out.name = o.name;
        if (o.subject) out.category = o.subject;
        out._overridden = true;
        return out;
    });
    // Append fully-new units that exist only in the overlay (negative-or-
    // synthetic id, never seen in the JSON load).
    Object.keys(ov).forEach(function (idStr) {
        const id = parseInt(idStr, 10);
        if (baseIds[id]) return;
        const o = ov[idStr];
        if (!o || !o.isNew) return;          // must be flagged as new
        merged.push({
            id:        id,
            name:      o.name || "יחידה חדשה",
            category:  o.subject || "",
            ramaLabel: o.ramaLabel || "",
            flags:     o.flags || [true, false, true, true],
            cfg:       o.cfg || [],
            data:      {
                columns: o.columns || ["רמז", "תרגום", "מקור"],
                items:   o.items   || [],
            },
            _overridden: true,
            _isNew:      true,
        });
    });
    return merged;
};

// Create a new (localStorage-only) unit and persist it. Returns the new
// unit's id. The id is a millisecond timestamp prefixed with 1e12 so it
// can never collide with the small JSON-shipped unit ids.
HND.createNewUnit = function (appId, opts) {
    const id = 1000000000000 + Date.now();
    const ov = HND.loadUnitOverrides(appId);
    ov[id] = Object.assign({
        isNew:    true,
        name:     "יחידה חדשה",
        subject:  "",
        ramaLabel: "",
        flags:    [true, false, true, true],
        columns:  ["רמז", "תרגום", "מקור"],
        items:    [],
        cfg:      [],
    }, opts || {});
    HND.saveUnitOverrides(appId, ov);
    HND.log("unit created", appId, "id=" + id);
    return id;
};

// Delete a localStorage-only unit. Existing JSON units cannot be deleted
// (only reverted) — returns false in that case.
HND.deleteNewUnit = function (appId, unitId) {
    const ov = HND.loadUnitOverrides(appId);
    const o = ov[unitId];
    if (!o || !o.isNew) return false;
    delete ov[unitId];
    HND.saveUnitOverrides(appId, ov);
    HND.log("unit deleted", appId, "id=" + unitId);
    return true;
};

// Compute total = number of (unit × game) pairs once the units load, and
// push it to Tekoa.Progress so the catalog battery has a denominator.
// The 7 sub-games are fixed across all hemed_nivim units.
HND.GAME_TYPES = ["american","apple","connect","hakira","haklada","hatamaplus","match"];
HND.publishProgressTotal = function (appId) {
    if (!window.Tekoa || !window.Tekoa.Progress) return;
    const units = HND._loaded[appId];
    if (!units || !units.length) return;
    window.Tekoa.Progress.setTotal(appId, units.length * HND.GAME_TYPES.length);
};

HND.saveProgress = function (appId, unitId, gameId, score, errorsByQ) {
    try {
        const prev = HND.loadProgress(appId, unitId, gameId) || {best: 0, plays: 0};
        const next = {
            best:  Math.max(prev.best || 0, score),
            last:  score,
            plays: (prev.plays || 0) + 1,
            ts:    Date.now(),
            // Per-question error buckets (matches AddScore's ErrorsStatus()
            // byte array in GamesMoudle.bas:571). 0/1/2 per Q, indexed by
            // question order. Saved against the LAST attempt; we also keep
            // a `bestErrorsByQ` paired with the best score so the score
            // form can render the right pie when reviewing best plays.
            errorsByQ: Array.isArray(errorsByQ) ? errorsByQ.slice() : (prev.errorsByQ || []),
            bestErrorsByQ:
                score >= (prev.best || 0) && Array.isArray(errorsByQ)
                    ? errorsByQ.slice()
                    : (prev.bestErrorsByQ || []),
        };
        localStorage.setItem(HND._key(appId, unitId, gameId), JSON.stringify(next));
        HND.log("progress save", appId + "/" + unitId + "/" + gameId,
                "score=" + score, "best=" + next.best, "plays=" + next.plays,
                "errs=" + (next.errorsByQ.length));
        // ---- bridge to Tekoa.Progress (catalog battery + breakdown) ----
        if (window.Tekoa && window.Tekoa.Progress) {
            const activityId = unitId + "/" + gameId;
            window.Tekoa.Progress.setScore(appId, activityId,
                { correct: next.best, total: 100, plays: next.plays });
            HND.publishProgressTotal(appId);
        }
        return next;
    } catch (e) {
        HND.log("progress fail", String(e));
        return null;
    }
};
