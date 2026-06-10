// Audio helper modeled on VB6 sndPlaySound / PlayZad semantics.
//
// VB6 calls in the source come in two flavors:
//
//   sndPlaySound(file, 0)        SND_SYNC  — stops previous sound, plays
//                                            new one, BLOCKS caller until
//                                            the new sound ends
//   sndPlaySound(file, 1)        SND_ASYNC — stops previous, plays new,
//                                            returns immediately
//   PlayZad(file)  (GLOBAL.BAS)  wraps SND_SYNC (always blocks)
//
// Both flavors REPLACE the currently-playing sound. The difference is
// whether the caller waits before its next statement.
//
// Web port mapping:
//   MK.play(rel)                 fire-and-forget (= sndPlaySound …, 1)
//   await MK.play(rel, {await:1})block until end   (= sndPlaySound …, 0
//                                                   / = PlayZad)
//   MK.playSync(rel)             alias for the above (more readable)
//   MK.stop()                    paused / cleared
//
// Both modes return a Promise so a caller can opt into awaiting any
// call without having to remember the flag.
//
// Audio elements are cached by URL so repeat plays are cheap and there
// is exactly one Audio per file (matching the original Windows mixer's
// "one channel per file" implicit behavior — VB6's sndPlaySound is the
// system shared single channel).
(function () {
    const MK = (window.MK = window.MK || {});
    if (!MK.log) MK.log = function () { try { console.log.apply(console, ["[MK]"].concat([].slice.call(arguments))); } catch (e) {} };

    const cache = new Map();
    let current = null;
    // Last awaitable Promise — useful to "let the previous finish" even
    // without an explicit await at the call site.
    let lastEnd = Promise.resolve();

    function isNonePath(rel) {
        // VB6 .spi data uses literal "None" as a "no audio" marker.
        // Treat any path whose basename equals "none" (or empty) as a
        // no-op so the original `If WavFileName$(i) <> "None"` checks
        // map cleanly to "just call MK.play; it'll skip if N/A".
        if (!rel) return true;
        const lower = String(rel).replace(/^\/+/, "").toLowerCase();
        const base = lower.split("/").pop().replace(/\.wav$/, "");
        return base === "none" || base === "";
    }

    function getAudio(url) {
        let a = cache.get(url);
        if (!a) {
            a = new Audio(url);
            a.addEventListener("error", function () {
                MK.log("audio missing", url, a.error && a.error.code);
            });
            cache.set(url, a);
        }
        return a;
    }

    function attachEndPromise(a) {
        return new Promise(function (resolve) {
            const onDone = function () {
                a.removeEventListener("ended", onDone);
                a.removeEventListener("error", onDone);
                a.removeEventListener("pause", onDone);
                resolve();
            };
            a.addEventListener("ended", onDone);
            a.addEventListener("error", onDone);
            // pause handles "stopped because something else started"
            // — without this, awaitEnd never resolves when a later
            // MK.play interrupts.
            a.addEventListener("pause", onDone);
        });
    }

    // Core play. Returns a Promise<void>. With `await:true` it resolves
    // when the sound ends naturally (or is interrupted); otherwise it
    // resolves as soon as play() succeeds.
    MK.play = function (relPath, opts) {
        opts = opts || {};
        if (isNonePath(relPath)) {
            MK.log("audio skip", relPath, "(None placeholder)");
            return Promise.resolve();
        }
        const url = "assets/" + String(relPath).replace(/^\/+/, "").toLowerCase();
        const a = getAudio(url);

        // VB6 sndPlaySound stops the previously-playing sound before
        // starting the new one. Mirror that — but allow opt-out for
        // sequence callers that want layered audio.
        if (opts.stopOthers !== false && current && current !== a) {
            try { current.pause(); current.currentTime = 0; } catch (e) {}
        }
        current = a;
        try { a.currentTime = 0; } catch (e) {}
        const endP = attachEndPromise(a);
        const playP = a.play();
        const safeStart = (playP && playP.catch) ? playP.catch(function (err) {
            MK.log("audio play failed", url, String(err && err.message || err));
        }) : Promise.resolve();

        if (opts.await) {
            lastEnd = safeStart.then(function () { return endP; });
            return lastEnd;
        }
        lastEnd = safeStart;
        return safeStart;
    };

    // PlayZad equivalent — always blocks until the audio ends. Use at
    // call sites that mirror the original VB6 `PlayZad(...)` lines so
    // the next statement only runs after the audio completes.
    MK.playSync = function (rel) {
        return MK.play(rel, { await: true });
    };

    // Wait helper for the VB6 `Sleep N` pattern.
    MK.sleep = function (ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    };

    MK.stop = function () {
        if (current) {
            try { current.pause(); current.currentTime = 0; } catch (e) {}
        }
        current = null;
    };

    // Cancel any in-flight awaitable. Useful when navigating away
    // from a screen mid-sequence so stale promises don't linger.
    MK.cancelAudio = function () {
        MK.stop();
        lastEnd = Promise.resolve();
    };

    // Auto-cancel on hash change — when the user navigates away,
    // stop any playing audio and reset the sequence promise. Saves
    // every screen from needing a cleanup hook.
    window.addEventListener("hashchange", function () { MK.cancelAudio(); });
})();
