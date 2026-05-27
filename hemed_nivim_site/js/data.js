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
        return Promise.resolve(HND._loaded[appId]);
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
            resolve(data);
        };
        s.onerror = function () {
            HND.log("data err", appId, s.src);
            reject(new Error("שגיאת טעינה: " + s.src));
        };
        document.head.appendChild(s);
    });
};

HND.unitWavePath = function (appId, unitId, n, side) {
    // side = "left" | "right"
    return HND.APPS[appId].dataRoot + "/unit_" + unitId + "/wave/" +
           n + "_" + side + ".wav";
};

// Shared audio element so a new play() always interrupts the previous —
// matches the original WaveMe MCI control's one-track-at-a-time model.
HND._audio = null;
HND.playWave = function (url, onEnded) {
    HND.log("audio play", url);
    if (!HND._audio) HND._audio = new Audio();
    try {
        HND._audio.pause();
        HND._audio.onended = onEnded || null;
        HND._audio.src = url;
        HND._audio.currentTime = 0;
        const p = HND._audio.play();
        if (p && p.catch) p.catch(function (err) {
            HND.log("audio fail", url, String(err && err.message || err));
            if (onEnded) onEnded();
        });
    } catch (e) {
        HND.log("audio throw", url, String(e && e.message || e));
        if (onEnded) onEnded();
    }
};
HND.stopWave = function () {
    if (HND._audio && !HND._audio.paused) HND.log("audio stop");
    if (HND._audio) { HND._audio.onended = null; HND._audio.pause(); }
};

// localStorage progress map: kesem.HND.<App>.<unitId>.<gameId> = {best, last, plays}.
HND._key = function (appId, unitId, gameId) {
    return "hnd." + appId + "." + unitId + "." + gameId;
};
HND.loadProgress = function (appId, unitId, gameId) {
    try {
        const raw = localStorage.getItem(HND._key(appId, unitId, gameId));
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
};
// Structured console logger. Every screen + interaction emits one of these
// lines so the user can copy-paste the console history to report issues.
// Output shape (matches Kesem_site's [kesem] CLICK pattern):
//     [hnd] <kind> <app/unit/game> ...details
HND.log = function (kind /*, ...args */) {
    const args = Array.prototype.slice.call(arguments, 1);
    console.log.apply(console, ["[hnd]", kind].concat(args));
};

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
HND._preloaded = {};
HND.preload = function (urls) {
    if (!Array.isArray(urls)) urls = [urls];
    urls.forEach(function (url) {
        if (HND._preloaded[url]) return;
        const img = new Image();
        img.src = url;
        HND._preloaded[url] = img;
        if (img.decode) img.decode().catch(function () {});
    });
};

// Build a list of frame URLs from a prefix and an index range/list.
//   HND.preloadFrames("data/.../GameHatama/goatwin", 25) → "...goatwin0.png" .. "goatwin24.png"
//   HND.preloadFrames("data/.../GameHatama/flower", [0,1,2], "_", 10) → flower0_0..flower2_9
HND.preloadFrames = function (appId, dir, names) {
    const root = "assets/" + appId + "/pictures/" + dir + "/";
    const list = [];
    names.forEach(function (n) { list.push(root + n + ".png"); });
    HND.preload(list);
    return list;
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
HND.showScoreForm = function (stage, appId, unitName, userName, score, errorsByQ, onExit, onReplay) {
    HND.log("score-form show", appId, "score=" + score);
    const root = "assets/" + appId + "/pictures/Main/";
    const overlay = HND._el("div", { class: "ctrl score-form" });
    overlay.style.cssText =
        "left:100px; top:0; width:600px; height:600px;" +
        "background-image:url('" + root + "scoreform.png');" +
        "background-size:100% 100%; z-index:50;";

    // Unit name in dark purple at top.
    overlay.appendChild(HND._el("div", {
        class: "score-unit",
        text: unitName + (userName ? "  ·  " + userName : ""),
    }));

    // "סיים את היחידה" praise line.
    let praise = "";
    if (score < 60)       praise = "כדאי לנסות שוב.";
    else if (score < 70)  praise = "כל הכבוד! המשך כך.";
    else if (score < 80)  praise = "יפה מאוד!";
    else if (score < 90)  praise = "מצוין!";
    else                  praise = "כל הכבוד! מושלם!";
    overlay.appendChild(HND._el("div", { class: "score-praise", text: praise }));

    // Animated score count-up on top of the circle.
    const scoreNum = HND._el("div", { class: "score-number", text: "0" });
    overlay.appendChild(scoreNum);
    let current = 0;
    const tick = setInterval(function () {
        current += Math.max(1, Math.floor(score / 20));
        if (current >= score) { current = score; clearInterval(tick); }
        scoreNum.textContent = String(current);
    }, 50);

    // Error breakdown (green=0 errors, yellow=1-2, red=3+).
    const errCounts = [0, 0, 0];
    (errorsByQ || []).forEach(function (e) {
        if (e === 0) errCounts[0]++;
        else if (e <= 2) errCounts[1]++;
        else errCounts[2]++;
    });
    const errBox = HND._el("div", { class: "score-errors" });
    errBox.appendChild(HND._el("div", { class: "err err-green",  text: String(errCounts[0]) }));
    errBox.appendChild(HND._el("div", { class: "err err-yellow", text: String(errCounts[1]) }));
    errBox.appendChild(HND._el("div", { class: "err err-red",    text: String(errCounts[2]) }));
    overlay.appendChild(errBox);

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

HND.saveProgress = function (appId, unitId, gameId, score) {
    try {
        const prev = HND.loadProgress(appId, unitId, gameId) || {best: 0, plays: 0};
        const next = {
            best:  Math.max(prev.best || 0, score),
            last:  score,
            plays: (prev.plays || 0) + 1,
            ts:    Date.now(),
        };
        localStorage.setItem(HND._key(appId, unitId, gameId), JSON.stringify(next));
        HND.log("progress save", appId + "/" + unitId + "/" + gameId,
                "score=" + score, "best=" + next.best, "plays=" + next.plays);
        return next;
    } catch (e) {
        HND.log("progress fail", String(e));
        return null;
    }
};
