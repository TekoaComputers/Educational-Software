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
    // True once any audio has successfully played — used to detect the
    // browser autoplay-block state. If a play() fails with NotAllowed-
    // Error before this turns true, we queue it to fire on the next
    // user gesture.
    let audioUnlocked = false;
    // Pending audio waiting for first user gesture (when MK.play was
    // called before the page had any user activation, e.g. when the
    // user lands on the page via URL bar / refresh). Cleared once the
    // browser allows playback.
    const pendingOnGesture = [];

    function primeOnGesture() {
        // Run any deferred plays now that we have user activation.
        audioUnlocked = true;
        while (pendingOnGesture.length) {
            const fn = pendingOnGesture.shift();
            try { fn(); } catch (e) {}
        }
    }
    // One-time listeners on multiple gesture types — first match wins.
    ["click", "keydown", "touchstart", "pointerdown"].forEach(function (ev) {
        document.addEventListener(ev, primeOnGesture, { once: true, capture: true });
    });

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
    //
    // If play() rejects with NotAllowedError (browser autoplay block),
    // the call is queued to fire on the next user gesture — so when
    // the user reloads / lands on a /play URL directly, the audio
    // doesn't drop silently. It plays as soon as they click.
    MK.play = function (relPath, opts) {
        opts = opts || {};
        if (isNonePath(relPath)) {
            MK.log("audio skip", relPath, "(None placeholder)");
            return Promise.resolve();
        }
        const url = "assets/" + String(relPath).replace(/^\/+/, "").toLowerCase();

        const doPlay = function () {
            const a = getAudio(url);
            if (opts.stopOthers !== false && current && current !== a) {
                try { current.pause(); current.currentTime = 0; } catch (e) {}
            }
            current = a;
            try { a.currentTime = 0; } catch (e) {}
            const endP = attachEndPromise(a);
            const playP = a.play();
            const safeStart = (playP && playP.catch) ? playP.catch(function (err) {
                const msg = String(err && err.message || err);
                // NotAllowedError = browser autoplay-block (no user
                // gesture yet). Queue for next gesture so the sound
                // isn't silently lost.
                if (err && err.name === "NotAllowedError" && !audioUnlocked) {
                    MK.log("audio queued for next gesture", url);
                    pendingOnGesture.push(function () {
                        try { a.play().catch(function () {}); } catch (e) {}
                    });
                } else {
                    MK.log("audio play failed", url, msg);
                }
            }) : Promise.resolve();
            // If play() resolves, we have audio permission for the rest
            // of the session — flip the unlocked flag so subsequent
            // late plays aren't queued unnecessarily.
            if (playP && playP.then) {
                playP.then(function () { audioUnlocked = true; }).catch(function () {});
            }
            return { safeStart, endP };
        };

        const result = doPlay();
        if (opts.await) {
            lastEnd = result.safeStart.then(function () { return result.endP; });
            return lastEnd;
        }
        lastEnd = result.safeStart;
        return result.safeStart;
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

    // Cancel any in-flight audio + reset the sequence promise. Each
    // screen calls this in its cleanup path if it wants to stop the
    // previous screen's audio. We DON'T auto-cancel on hashchange —
    // that races with click handlers that play an intro cue and then
    // navigate (e.g. KIVUN.btnShir_Click plays the song's L1.wav then
    // updates the URL; hashchange-on-cancel would pause L1 before
    // it could play).
    MK.cancelAudio = function () {
        MK.stop();
        lastEnd = Promise.resolve();
    };
})();
