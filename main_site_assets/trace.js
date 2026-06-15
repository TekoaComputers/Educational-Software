// trace.js — cross-site standardized event logger.
//
// All sites use this so every log line has the same shape:
//
//     [<app>/<screen>] <verb> <details>
//
// Auto-instruments four event sources so per-app code rarely needs to
// add explicit calls:
//
//   1. Document-level clicks — labels include tag + id + classes + visible text.
//   2. Document-level keydowns (skips when an INPUT/TEXTAREA is focused).
//   3. Audio playback — wraps `new Audio()` and emits `audio play <url>` /
//      `audio error <url>` / `audio end <url>` events.
//   4. `hashchange` — updates the current screen to mirror the URL hash
//      so deep links automatically advance the trace context.
//
// Explicit API (window.Tekoa):
//
//     Tekoa.setApp('Brahot');         // current app id
//     Tekoa.setScreen('game.connect'); // dotted screen path
//     Tekoa.log('verb', 'detail1', 'detail2'); // arbitrary line
//
// Load order in each site's index.html:
//
//     <script src="../main_site_assets/audio_format.js"></script>
//     <script src="../main_site_assets/feedback.js"></script>
//     <script src="../main_site_assets/trace.js"></script>
//
// feedback.js wraps console.* on load — trace.js loads after so every
// trace line is captured in the feedback widget's session log.
(function () {
    "use strict";

    var APP    = "app";
    var SCREEN = "boot";

    function fmtPrefix() { return "[" + APP + "/" + SCREEN + "]"; }

    function log(verb) {
        // Join remaining args with spaces; coerce non-strings via String().
        var parts = [fmtPrefix(), verb];
        for (var i = 1; i < arguments.length; i++) parts.push(String(arguments[i]));
        console.log(parts.join(" "));
    }

    // ---------- Helpers ----------
    function elLabel(el) {
        if (!el || el === document || el === window) return "?";
        var s = el.tagName ? el.tagName.toLowerCase() : "?";
        if (el.id) s += "#" + el.id;
        if (el.className && typeof el.className === "string") {
            var cls = el.className.trim().split(/\s+/).slice(0, 3);
            if (cls[0]) s += "." + cls.join(".");
        }
        // Visible text — short, single-line.
        var text = (el.innerText || el.value || el.title || "").trim();
        if (text) {
            text = text.replace(/\s+/g, " ");
            if (text.length > 30) text = text.slice(0, 30) + "…";
            s += ":" + text;
        }
        return s;
    }

    // ---------- Auto-instrument: clicks ----------
    var _autoClickEnabled = true;
    document.addEventListener("click", function (ev) {
        if (!_autoClickEnabled) return;
        // Skip clicks on our own feedback widget chrome.
        var t = ev.target;
        if (t && t.closest && t.closest(".__tk_fb__, [data-tekoa-noise]")) return;
        log("click", elLabel(t));
    }, true);

    // ---------- Auto-instrument: keydowns ----------
    document.addEventListener("keydown", function (ev) {
        var t = ev.target;
        // Don't log every keystroke when typing into an input field —
        // would leak user-typed names into the trace + spam the log.
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
                  t.isContentEditable)) {
            return;
        }
        var mods = "";
        if (ev.ctrlKey)  mods += "Ctrl+";
        if (ev.altKey)   mods += "Alt+";
        if (ev.metaKey)  mods += "Meta+";
        if (ev.shiftKey && ev.key && ev.key.length > 1) mods += "Shift+";
        log("key", mods + ev.key);
    }, true);

    // ---------- Auto-instrument: Audio playback ----------
    // audio_format.js already wraps `new Audio()` for the .wav → .mp3
    // rewrite. We wrap again — JS just nests the wrappers. Whichever
    // loaded first is now the "OrigAudio" from our point of view.
    if (window.Audio) {
        var Inner = window.Audio;
        window.Audio = function (src) {
            var a = new Inner(src);
            // a.src reflects whatever the upstream shim rewrote to.
            try {
                a.addEventListener("loadstart", function () {
                    log("audio play", a.currentSrc || a.src || "");
                });
                a.addEventListener("error", function () {
                    log("audio error", a.currentSrc || a.src || "");
                });
            } catch (e) {}
            return a;
        };
        window.Audio.prototype = Inner.prototype;
    }

    // ---------- Auto-instrument: hash changes ----------
    // Treat the URL hash (after #/) as the current screen by default —
    // apps can still override via Tekoa.setScreen() for finer-grained
    // sub-screens (e.g. modal dialogs).
    function screenFromHash() {
        var h = (location.hash || "").replace(/^#\/?/, "");
        if (!h) return "boot";
        // Replace / with . — `Nivim/unit/37/connect` → `Nivim.unit.37.connect`
        return h.replace(/\//g, ".");
    }
    window.addEventListener("hashchange", function () {
        var s = screenFromHash();
        if (s !== SCREEN) {
            SCREEN = s;
            log("screen", "→", s);
        }
    });

    // Seed screen from the initial hash if present.
    if (location.hash) SCREEN = screenFromHash();

    // ---------- Public API ----------
    // Merge into any existing window.Tekoa namespace (progress.js puts
    // Tekoa.Progress there; a blanket assignment would wipe it).
    window.Tekoa = window.Tekoa || {};
    Object.assign(window.Tekoa, {
        setApp:    function (name) { APP = name || "app"; log("boot", "app=" + APP); },
        setScreen: function (name) {
            SCREEN = name || "?";
            log("screen", "set", SCREEN);
        },
        getApp:    function () { return APP; },
        getScreen: function () { return SCREEN; },
        log:       log,
        // Opt-out for sites whose own click handler already produces a
        // better-labelled "press <thing>" line (e.g. hemed_nivim walks up
        // the DOM to the nearest clickable). Avoids double-logging.
        disableAutoClick: function () { _autoClickEnabled = false; },
        elLabel:   elLabel,
    });
})();
