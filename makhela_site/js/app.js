/* Makhela — main app shell. Stage + router. The actual per-screen
   renderers live in screens.js. Pattern mirrors hemed_nivim_site/app.js.

   Hash routes:
     #/                          → main hub
     #/songs                     → song list
     #/songs/<key>               → song playback (e.g. #/songs/aba)
     #/about                     → about / credits
*/

(function () {
    const root = document.getElementById("app");
    let stage = null;
    // Data is loaded synchronously via <script src="data/*.js"> in index.html
    // (so we work under file://). Index by song-key for fast lookup.
    const songIndex = (() => {
        const idx = {};
        for (const s of (window.MKH && MKH.SONGS) || []) idx[s.key] = s;
        return idx;
    })();
    const menuOrder = ((window.MKH && MKH.MENU_ORDER) || [])
        .slice()
        .sort((a, b) => a.menu_index - b.menu_index);

    // -------- Stage management --------

    function makeStage(bgClass) {
        root.innerHTML = "";
        stage = document.createElement("div");
        stage.className = "stage" + (bgClass ? " " + bgClass : "");
        root.appendChild(stage);
        fitStage();
        return stage;
    }
    function fitStage() {
        if (!stage) return;
        const w = window.innerWidth, h = window.innerHeight;
        const s = Math.min(w / 640, h / 400);
        stage.style.transform = "scale(" + s + ")";
    }
    window.addEventListener("resize", fitStage);

    function addBackButton(onBack) {
        const b = document.createElement("button");
        b.className = "btn-back";
        b.title = "חזרה / יציאה";
        b.addEventListener("click", onBack || (() => location.hash = "#/"));
        stage.appendChild(b);
        return b;
    }

    function addTitle(text) {
        const t = document.createElement("div");
        t.className = "titlebar";
        t.textContent = text;
        stage.appendChild(t);
        return t;
    }

    // -------- Router --------

    function route() {
        const hash = location.hash || "#/";
        const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);
        // parts: [], ["songs"], ["songs","aba"], ["about"], ...
        if (parts.length === 0)                return MKH.screens.hub      ({ makeStage, addBackButton, addTitle });
        if (parts[0] === "songs" && !parts[1]) return MKH.screens.songs    ({ makeStage, addBackButton, addTitle, menuOrder, songIndex });
        if (parts[0] === "songs" && parts[1])  return MKH.screens.songPlay ({ makeStage, addBackButton, addTitle, key: parts[1], song: songIndex[parts[1]] });
        // about / credits are the same thing in this game — both play
        // credit.mp4 fullscreen with the "exit credits" hotspot.
        if (parts[0] === "about" || parts[0] === "credit")
                                               return MKH.screens.credit   ({ makeStage });
        if (parts[0] === "instruments" && parts[1] === "select")
                                               return MKH.screens.instrumentPicker({ makeStage });
        if (parts[0] === "instruments")        return MKH.screens.notesPlay({ makeStage });
        if (parts[0] === "freeplay")           return MKH.screens.memoryGame({ makeStage });
        if (parts[0] === "settings")           return MKH.screens.settings({ makeStage });
        if (parts[0] === "mini")               return MKH.screens.gameShow({ makeStage });
        // unknown → hub
        location.hash = "#/";
    }

    window.addEventListener("hashchange", route);
    window.addEventListener("DOMContentLoaded", route);

    // Expose minimal helpers for screen modules
    window.MKH = window.MKH || {};
    MKH.go = (path) => {
        MKH.log("nav", "->", "#/" + path.replace(/^\//, ""));
        location.hash = "#/" + path.replace(/^\//, "");
    };

    // Console debug logger (mirrors HND.log() in hemed_nivim_site).
    // Format: [makhela:category] arg1 arg2 …
    MKH.log = function (category /*, ...args */) {
        if (!MKH.debug) return;
        const args = Array.prototype.slice.call(arguments, 1);
        console.log("%c[makhela:" + category + "]",
            "color:#8ec5ff;font-weight:bold", ...args);
    };
    // Toggle via console: MKH.debug = false  (default on, easy to silence)
    MKH.debug = true;
})();
