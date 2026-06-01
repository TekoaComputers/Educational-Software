/* Makhela — per-screen renderers. Each screen receives a helpers object:
     { makeStage, addBackButton, addTitle, ... }
   from app.js and returns nothing (it mutates the stage directly).

   Screens implemented in this first cut:
     hub        — main menu
     songs      — song picker (list view)
     songPlay   — MP4 video playback with optional lyrics overlay
     about      — credits / version info
*/

(function () {
    const MKH = window.MKH = window.MKH || {};

    // ----- helper to compose a hotspot button at given pixel coords -----
    function makeHotspot({ left, top, width, height, title, onClick, label }) {
        const b = document.createElement("button");
        b.className = "hotspot";
        b.style.left   = left   + "px";
        b.style.top    = top    + "px";
        b.style.width  = width  + "px";
        b.style.height = height + "px";
        if (title) b.title = title;
        if (label) b.setAttribute("aria-label", label);
        b.addEventListener("click", onClick);
        return b;
    }

    // Companion sound starter. Returns { stop, onEnd(cb) }. `onEnd` is null
    // when the sound doesn't expose an ended-event (e.g. MIDI).
    function startCompanionSound(spec) {
        if (!spec) return { stop: () => {}, onEnd: null };
        if (spec.startsWith("midi:")) {
            if (!window.PicoAudio || !MKH.midiBytes) return { stop: () => {}, onEnd: null };
            const buf = MKH.midiBytes(spec.slice(5));
            if (!buf) return { stop: () => {}, onEnd: null };
            try {
                const p = new PicoAudio();
                p.init();
                p.setMasterVolume(0.6);
                p.setData(p.parseSMF(buf));
                p.play();
                return { stop: () => { try { p.stop(); } catch (e) {} }, onEnd: null };
            } catch (e) { return { stop: () => {}, onEnd: null }; }
        } else {
            const a = new Audio(spec);
            a.play().catch(() => {});
            return {
                stop:  () => { try { a.pause(); } catch (e) {} },
                onEnd: (cb) => a.addEventListener("ended", cb, { once: true }),
            };
        }
    }

    // playAnim — play a video and PAUSE A FRAME BEFORE THE END so the
    // browser doesn't reach the 'ended' state where it may release /
    // reset the visible frame.
    //
    // Options:
    //   sound:     URL or "midi:<key>" played alongside the video
    //   endWith:   "video" (default) | "sound" — when the chosen track
    //              finishes, the whole anim ends (the OTHER one is
    //              cut). Useful when a short voice-over should gate a
    //              long looping animation.
    //   clipRect:  { x,y,w,h } in stage pixels — CSS clip-path inset that
    //              masks the video to a sub-region of the stage. The
    //              underlying stage background shows through everywhere
    //              outside the rect.
    //   onEnd:     callback when the anim is done.
    function playAnim(stage, url, opts) {
        opts = opts || {};
        if (!url) { if (opts.onEnd) opts.onEnd(); return null; }
        MKH.log("anim", "play", url);

        const v = document.createElement("video");
        v.src = url;
        v.autoplay = true;
        v.playsInline = true;
        v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;z-index:100";
        if (opts.clipRect) {
            const r = opts.clipRect;
            // Stage is 640x400 — clip-path inset relative to those bounds.
            const t = r.y, l = r.x;
            const ri = 640 - (r.x + r.w);
            const b = 400 - (r.y + r.h);
            v.style.clipPath = `inset(${t}px ${ri}px ${b}px ${l}px)`;
        }

        const sound = startCompanionSound(opts.sound);

        let fired = false;
        function finish() {
            if (fired) return;
            fired = true;
            try { v.pause(); } catch (e) {}
            sound.stop();
            MKH.log("anim", "ended", url);
            if (opts.onEnd) opts.onEnd();
        }

        const STOP_WINDOW = 0.06;
        v.addEventListener("timeupdate", () => {
            if (!fired && v.duration && v.currentTime >= v.duration - STOP_WINDOW) {
                finish();
            }
        });
        v.addEventListener("ended", finish);

        // If caller wants sound to drive the end-of-anim, hook the audio's
        // ended event. (MIDI sounds don't expose this — they always run to
        // the video's end.)
        if (opts.endWith === "sound" && sound.onEnd) {
            sound.onEnd(() => { MKH.log("anim", "sound-ended-cut", url); finish(); });
        }
        stage.appendChild(v);
        return v;
    }

    // ----- Pending return-animation storage. When a hotspot navigates
    //       away from a screen, we stash the screen-id + return-anim so
    //       the destination's "back" button can replay it on return. -----
    // ----- Ambient MIDI music via PicoAudio. Plays a base64-encoded
    //       MIDI file (from data/midi-blob.js) on a loop, with a volume
    //       knob. Designed for the hub but can be used by any screen.
    //       Browsers block autoplay until a user gesture — we hook the
    //       first hotspot click (or any click) to start playback.
    let _ambient = null;             // { pico, midiKey, loop, gain }
    let _ambientPending = false;     // waiting for first user gesture
    let _gestured = false;           // user has interacted at least once
    function startAmbient(midiKey, volume) {
        stopAmbient();
        if (!midiKey || !window.PicoAudio || !MKH.midiBytes) return;
        const buf = MKH.midiBytes(midiKey);
        if (!buf) return;
        try {
            const pico = new PicoAudio();
            pico.init();
            pico.setMasterVolume(volume == null ? 0.55 : volume);
            const parsed = pico.parseSMF(buf);
            pico.setData(parsed);
            pico.setLoop(true);
            pico.play();
            _ambient = { pico, midiKey, volume };
        } catch (e) {
            console.warn("PicoAudio failed:", e);
        }
    }
    function stopAmbient() {
        if (!_ambient) return;
        const p = _ambient.pico;
        _ambient = null;
        // PicoAudio's stop() halts the player but currently-sounding notes
        // can ring out via the synth's envelope. Belt-and-braces: zero the
        // master gain, stop, then suspend the underlying AudioContext so
        // nothing else can sneak through.
        try { p.setMasterVolume(0); } catch (e) {}
        try { p.stop(); }            catch (e) {}
        try { if (p.context && p.context.state === "running") p.context.suspend(); } catch (e) {}
    }

    const RETURN_KEY = "makhela:pendingReturn";
    function setPendingReturn(toScreen, animUrl, soundUrl) {
        if (!animUrl) { sessionStorage.removeItem(RETURN_KEY); return; }
        sessionStorage.setItem(RETURN_KEY, JSON.stringify({
            to: toScreen, anim: animUrl, sound: soundUrl || ""
        }));
    }
    function consumePendingReturn(screen) {
        try {
            const raw = sessionStorage.getItem(RETURN_KEY);
            if (!raw) return null;
            const p = JSON.parse(raw);
            if (p.to !== screen) return null;
            sessionStorage.removeItem(RETURN_KEY);
            return p;   // { to, anim, sound }
        } catch (e) { return null; }
    }

    // ==================== Screen: Hub ====================
    // Real m0 bedroom art as background, hotspots from data/hotspots.js.
    // Each hotspot: click → play clickAnim → (route OR idle) → if routed,
    // returning to hub plays the return anim before going idle.
    // Ambient MIDI background music (from data/midi-blob.js) loops.
    // Play a list of (anim, sound) entries in sequence; call onAllDone
    // when the last one finishes. Empty list → call onAllDone immediately.
    function playAnimSequence(stage, entries, onAllDone) {
        const list = (entries || []).filter(e => e && e.anim);
        if (list.length === 0) { if (onAllDone) onAllDone(); return; }
        let i = 0;
        function next() {
            if (i >= list.length) { if (onAllDone) onAllDone(); return; }
            const e = list[i++];
            playAnim(stage, e.anim, { sound: e.sound || "", onEnd: () => {
                // Remove the just-finished video so the next one in the
                // sequence shows its first frame (m0.png shows through
                // briefly between videos — fine because each anim starts
                // and ends in compatible poses).
                stage.querySelectorAll("video").forEach(el => el.remove());
                next();
            }});
        }
        next();
    }

    function hub({ makeStage }) {
        MKH.log("screen", "hub");
        const stage = makeStage();
        stage.style.backgroundImage = "url('assets/screens/m0.png')";  // T0
        stage.style.backgroundColor = "#000";

        if (!_ambient) {
            if (_gestured) {
                // User has already interacted; safe to start immediately
                // on hub re-entry (e.g. coming back from the credit screen
                // which had silenced + suspended the previous instance).
                startAmbient("child5", 0.05);
            } else if (!_ambientPending) {
                _ambientPending = true;
                const onFirstGesture = () => {
                    document.removeEventListener("pointerdown", onFirstGesture);
                    document.removeEventListener("keydown",     onFirstGesture);
                    _ambientPending = false;
                    _gestured = true;
                    startAmbient("child5", 0.05);
                };
                document.addEventListener("pointerdown", onFirstGesture, { once: true });
                document.addEventListener("keydown",     onFirstGesture, { once: true });
            }
        }

        const SCALE = 2;
        const hotspots = (window.MKH && MKH.HOTSPOTS && MKH.HOTSPOTS.m0) || [];

        // Idle scheduling. Each hotspot CAN define its own idleAnim +
        // timeToIdle; we run them on independent timers so multiple
        // ambient objects can blink/move at different cadences.
        const idleTimers = new Set();
        function clearAllIdleTimers() {
            for (const t of idleTimers) clearTimeout(t);
            idleTimers.clear();
        }
        function scheduleIdleFor(h) {
            if (!h.idleAnim || !h.timeToIdle) return;
            const t = setTimeout(() => {
                idleTimers.delete(t);
                // Don't fire if a click anim is currently playing
                if (stage.querySelector("video")) { scheduleIdleFor(h); return; }
                playAnim(stage, h.idleAnim, {
                    sound: h.idleSound || "",
                    onEnd: () => {
                        stage.querySelectorAll("video").forEach(el => el.remove());
                        scheduleIdleFor(h);  // repeat
                    },
                });
            }, h.timeToIdle);
            idleTimers.add(t);
        }

        // Click-cycle index per hotspot — remember which anim to play next
        const clickCycle = new Map();
        function nextClickEntry(h) {
            const arr = (h.clickAnims || []).filter(e => e && e.anim);
            if (arr.length === 0) {
                // legacy fallback
                if (h.clickAnim) return { anim: h.clickAnim, sound: h.clickSound || "" };
                return null;
            }
            const k = clickCycle.get(h) || 0;
            clickCycle.set(h, (k + 1) % arr.length);
            return arr[k];
        }

        function renderHotspots() {
            for (const h of hotspots) {
                const btn = makeHotspot({
                    left:   h.x * SCALE,
                    top:    h.y * SCALE,
                    width:  h.w * SCALE,
                    height: h.h * SCALE,
                    title:  h.label || "",
                    label:  h.desc  || h.label || "",
                    onClick: () => handleHotspotClick(h),
                });
                stage.appendChild(btn);
                scheduleIdleFor(h);
            }
        }

        // Apply a hotspot's route. Hash routes (#/foo) use the SPA router;
        // absolute / relative URLs (../index.html, http…) navigate the
        // window — used by "exit game" → site catalog.
        function applyRoute(route, h) {
            if (!route) return;
            if (route.startsWith("#/")) {
                const ret = h.returnAnims && h.returnAnims.length
                    ? h.returnAnims
                    : (h.returnAnim ? [{ anim: h.returnAnim, sound: h.returnSound || "" }] : []);
                setPendingReturn("m0", ret);
                MKH.go(route.replace(/^#\//, ""));
            } else {
                // External / catalog navigation
                window.location.href = route;
            }
        }

        function handleHotspotClick(h) {
            clearAllIdleTimers();
            const label = (h.label || "").toLowerCase();
            // The "exit game" hotspot mirrors the catalog-exit pattern used
            // by the other apps in this collection (../index.html), even
            // when no explicit route is set in the annotation.
            const effectiveRoute = h.route || (label === "exit game" ? "../index.html" : "");
            const entry = nextClickEntry(h);
            MKH.log("click", "hotspot", h.label, "anim=" + (entry && entry.anim) + " route=" + (effectiveRoute || "-"));
            stage.querySelectorAll(".hotspot").forEach(b => b.remove());
            if (!entry) {
                if (effectiveRoute) applyRoute(effectiveRoute, h);
                else renderHotspots();
                return;
            }
            playAnim(stage, entry.anim, {
                sound: entry.sound || "",
                onEnd: () => {
                    if (effectiveRoute) {
                        applyRoute(effectiveRoute, h);
                    } else {
                        stage.querySelectorAll("video").forEach(el => el.remove());
                        renderHotspots();
                    }
                },
            });
        }

        const ret = consumePendingReturn("m0");
        if (ret) {
            // ret may be an old string (single URL) or new list of entries
            const entries = Array.isArray(ret.anim)
                ? ret.anim
                : (typeof ret.anim === "string" && ret.anim ? [{ anim: ret.anim, sound: ret.sound || "" }] : []);
            playAnimSequence(stage, entries, () => {
                stage.querySelectorAll("video").forEach(el => el.remove());
                renderHotspots();
            });
        } else {
            renderHotspots();
        }
    }

    // Map "song N" label → song key, matching the printed order on mus1.png
    // (line 1 = aviron, line 2 = tiktak, … line 10 = aliza).
    const SONG_AT_LINE = {
        1:  "aviron",  2:  "tiktak", 3:  "ionatan", 4: "shofan",
        5:  "taish",   6:  "aba",    7:  "udi",     8: "zebra",
        9:  "parash",  10: "aliza",
    };
    const LINE_AT_SONG = (() => {
        const m = {};
        for (const n in SONG_AT_LINE) m[SONG_AT_LINE[n]] = parseInt(n, 10);
        return m;
    })();

    // ==================== Screen: Songs picker ====================
    // mus1.png background + hotspots from data/hotspots.js (screen "mus1"):
    //   • song 1..song 10  — single click plays the click anim + voice
    //                        intro AND selects that song into the preview
    //                        box; double click navigates to playback.
    //   • preview song     — plays the currently-selected song (no-op if
    //                        nothing selected).
    //   • exit             — back to hub.
    //   • any other label  — generic "play click anim, restore hotspots".
    function songs({ makeStage }) {
        MKH.log("screen", "songs");
        const stage = makeStage("song-list-bg");

        const SCALE = 2;
        const hotspots = (window.MKH && MKH.HOTSPOTS && MKH.HOTSPOTS.mus1) || [];

        // Thumbnail image overlay sized to the "preview song" hotspot.
        // Persistent: shows the currently-selected song; cleared otherwise.
        const previewHs = hotspots.find(h => (h.label || "").toLowerCase() === "preview song");
        const previewImg = document.createElement("img");
        previewImg.alt = "";
        if (previewHs) {
            previewImg.style.cssText = [
                "position:absolute",
                `left:${previewHs.x * SCALE}px`,
                `top:${previewHs.y * SCALE}px`,
                `width:${previewHs.w * SCALE}px`,
                `height:${previewHs.h * SCALE}px`,
                "object-fit:cover",
                "object-position:center",
                "image-rendering:pixelated",
                "pointer-events:none",
                "opacity:0",
                "transition:opacity 0.12s",
            ].join(";") + ";";
        }
        stage.appendChild(previewImg);

        // The "kid on chair" hotspot bounds (if defined) — used to clip the
        // song-line / kid-on-chair animations to that sub-region of the
        // screen, so menu1.fli only animates over the armchair, not the
        // paper scroll of songs.
        const kidOnChairHs = hotspots.find(h => (h.label || "").toLowerCase() === "kid on chair");
        const kidClipRect = kidOnChairHs ? {
            x: kidOnChairHs.x * SCALE,
            y: kidOnChairHs.y * SCALE,
            w: kidOnChairHs.w * SCALE,
            h: kidOnChairHs.h * SCALE,
        } : null;

        let selectedSong = null;
        function setSelected(key) {
            selectedSong = key;
            if (key) {
                previewImg.src = "assets/song_thumbs/" + key + ".png";
                previewImg.style.opacity = 1;
            } else {
                previewImg.style.opacity = 0;
            }
        }

        // Play a hotspot's click anim. `clip` masks to the kid-on-chair
        // box; `endWithSound` cuts the anim when its sound ends;
        // `keepHotspots: true` leaves the hotspots clickable so the user
        // can still hit "preview song" / "exit" while the anim plays.
        function playClickAnimFor(h, after, opts) {
            opts = opts || {};
            const arr = (h.clickAnims || []).filter(c => c && c.anim);
            const entry = arr[0]
                || (h.clickAnim ? { anim: h.clickAnim, sound: h.clickSound || "" } : null);
            if (!entry) { if (after) after(); return; }
            // Stop any in-progress anim before starting a new one
            stage.querySelectorAll("video").forEach(v => { try { v.pause(); } catch (e) {} v.remove(); });
            if (!opts.keepHotspots) {
                stage.querySelectorAll(".hotspot").forEach(b => b.remove());
            }
            playAnim(stage, entry.anim, {
                sound:    entry.sound || "",
                clipRect: opts.clip && kidClipRect ? kidClipRect : null,
                endWith:  opts.endWithSound && entry.sound ? "sound" : "video",
                onEnd: () => {
                    stage.querySelectorAll("video").forEach(v => v.remove());
                    if (after) after();
                },
            });
        }

        let clickPending = null;          // timer id for distinguishing dbl-click
        const DBLCLICK_MS = 250;

        function addHotspots() {
            stage.querySelectorAll(".hotspot").forEach(b => b.remove());
            for (const h of hotspots) {
                const label = (h.label || "").toLowerCase();
                const btn = makeHotspot({
                    left:   h.x * SCALE,
                    top:    h.y * SCALE,
                    width:  h.w * SCALE,
                    height: h.h * SCALE,
                    title:  h.label || "",
                    label:  h.desc  || h.label || "",
                    onClick: () => {},     // overridden below per hotspot type
                });

                if (label === "preview song") {
                    btn.onclick = () => {
                        MKH.log("click", "preview-song", "selected=" + selectedSong);
                        if (!selectedSong) {
                            playClickAnimFor(h, addHotspots);
                            return;
                        }
                        playClickAnimFor(h, () => MKH.go("songs/" + selectedSong));
                    };
                } else if (label === "exit") {
                    btn.onclick = () => {
                        MKH.log("click", "back-from-songs");
                        playClickAnimFor(h, () => MKH.go(""));
                    };
                } else if (label.startsWith("song ")) {
                    const num = parseInt(label.slice(5), 10);
                    const songKey = SONG_AT_LINE[num];
                    if (!songKey) continue;

                    btn.onclick = () => {
                        // Select IMMEDIATELY so "preview song" is active in
                        // the same tick — no waiting for the dbl-click
                        // resolution window or the click anim to finish.
                        MKH.log("click", "song-line", num, songKey);
                        setSelected(songKey);
                        if (clickPending) clearTimeout(clickPending);
                        clickPending = setTimeout(() => {
                            clickPending = null;
                            // Anim is clipped to kid box + ends with the voice
                            // intro. Hotspots stay clickable throughout so
                            // "preview song" can be hit any time.
                            playClickAnimFor(h, () => {}, {
                                clip: true, endWithSound: true, keepHotspots: true,
                            });
                        }, DBLCLICK_MS);
                    };
                    btn.addEventListener("dblclick", () => {
                        if (clickPending) { clearTimeout(clickPending); clickPending = null; }
                        MKH.log("dblclick", "song", songKey);
                        setSelected(songKey);
                        MKH.go("songs/" + songKey);
                    });
                } else if (label === "kid on chair") {
                    btn.onclick = () => {
                        MKH.log("click", "kid-on-chair", "selected=" + selectedSong);
                        // If a song is selected, this acts as a "play song"
                        // shortcut: voice intro m_N_1.ogg (where N = the
                        // song's line index) plays alongside the clipped
                        // anim; when the voice ends we navigate to playback.
                        // Without a selection: fall back to the hotspot's
                        // own click anim (just plays in place).
                        if (selectedSong) {
                            const n = LINE_AT_SONG[selectedSong];
                            const sound = n ? `assets/sfx/song_names/m_${n}_1.ogg` : "";
                            const arr = (h.clickAnims || []).filter(c => c && c.anim);
                            const animUrl = (arr[0] && arr[0].anim) || h.clickAnim || "";
                            stage.querySelectorAll("video").forEach(v => { try { v.pause(); } catch (e) {} v.remove(); });
                            playAnim(stage, animUrl, {
                                sound:    sound,
                                clipRect: kidClipRect,
                                endWith:  "sound",
                                onEnd:    () => MKH.go("songs/" + selectedSong),
                            });
                        } else {
                            playClickAnimFor(h, () => {}, {
                                clip: true, endWithSound: true, keepHotspots: true,
                            });
                        }
                    };
                } else {
                    btn.onclick = () => {
                        MKH.log("click", "songs:" + label);
                        playClickAnimFor(h, addHotspots);
                    };
                }
                stage.appendChild(btn);
            }
        }

        addHotspots();
    }

    // ==================== Screen: Song playback ====================
    function songPlay({ makeStage, addBackButton, addTitle, key, song }) {
        MKH.log("screen", "songPlay", key);
        const stage = makeStage();
        // Pause hub ambient while the song video has its own audio; it
        // will be restarted by the hub screen on next entry.
        stopAmbient();

        // Clean little "X" in the top-right — the only close affordance
        // on the song-playback screen. Goes back to the song picker.
        function addCloseX(onClose) {
            const x = document.createElement("button");
            x.className = "btn-x";
            x.textContent = "✕";
            x.title = "סגירה / Close";
            x.addEventListener("click", onClose);
            stage.appendChild(x);
        }

        if (!song) {
            const err = document.createElement("div");
            err.className = "loading";
            err.textContent = "Song not found: " + key;
            stage.appendChild(err);
            addCloseX(() => MKH.go("songs"));
            return;
        }

        const player = document.createElement("div");
        player.className = "song-player";
        stage.appendChild(player);

        const video = document.createElement("video");
        video.src = "assets/" + song.video;
        video.controls = true;
        video.autoplay = true;
        video.preload = "auto";
        video.addEventListener("ended", () => {
            // Auto-return to song list when the song finishes
            MKH.go("songs");
        });
        player.appendChild(video);

        // Lyrics overlay — toggleable. Sync to .scr note timings so that
        // instrumental intros / outros don't shove early lines on screen.
        const lyrics = document.createElement("div");
        lyrics.className = "lyrics-overlay";
        lyrics.textContent = "";    // empty during instrumental intro
        player.appendChild(lyrics);

        let lyricsOn = true;
        const toggle = document.createElement("button");
        toggle.className = "lyrics-toggle";
        toggle.textContent = "מילים: פעיל";
        toggle.addEventListener("click", () => {
            lyricsOn = !lyricsOn;
            lyrics.style.display = lyricsOn ? "" : "none";
            toggle.textContent = lyricsOn ? "מילים: פעיל" : "מילים: כבוי";
        });
        stage.appendChild(toggle);

        // Sync lyric lines to the actual per-note timestamps in song.notes
        // (the .scr file). For most songs the count of content-text lines
        // matches the note count exactly, so line i → note i's timestamp.
        // For songs with mismatched counts we map proportionally.
        video.addEventListener("loadedmetadata", () => {
            const lines = song.lyrics_lines.filter(l => l.trim());
            const notes = song.notes || [];
            if (lines.length === 0 || notes.length === 0) {
                lyrics.style.display = "none";
                return;
            }
            const noteTime = (i) => notes[i].min * 60 + notes[i].sec;

            // Build cue array: each entry = { t, text } where `t` is the
            // wall-clock second at which `text` should appear.
            const cues = [];
            if (lines.length === notes.length) {
                // Perfect 1:1 — most songs land here.
                for (let i = 0; i < lines.length; i++) {
                    cues.push({ t: noteTime(i), text: lines[i] });
                }
            } else if (lines.length > notes.length) {
                // More lines than notes (e.g. tiktak — 45 lines, 22 notes).
                // Split the inter-note interval evenly among the lines that
                // belong to that interval.
                for (let i = 0; i < lines.length; i++) {
                    const f      = (i * notes.length) / lines.length;
                    const idx    = Math.floor(f);
                    const fract  = f - idx;
                    const t0     = noteTime(idx);
                    const t1     = (idx + 1 < notes.length)
                        ? noteTime(idx + 1)
                        : t0 + 2;
                    cues.push({ t: t0 + (t1 - t0) * fract, text: lines[i] });
                }
            } else {
                // Fewer lines than notes (e.g. taish — 4 lines, 8 notes).
                // Each line covers multiple notes; place line i at note
                // floor(i * notes / lines).
                for (let i = 0; i < lines.length; i++) {
                    const idx = Math.floor(i * notes.length / lines.length);
                    cues.push({ t: noteTime(idx), text: lines[i] });
                }
            }
            // Ensure cues are sorted (defensive — file order should
            // already be monotonic but a stray sub-second tie shouldn't
            // re-order us).
            cues.sort((a, b) => a.t - b.t);

            video.ontimeupdate = () => {
                const t = video.currentTime;
                // Binary search the latest cue with cue.t <= t.
                let lo = 0, hi = cues.length - 1, found = -1;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    if (cues[mid].t <= t) { found = mid; lo = mid + 1; }
                    else                   { hi = mid - 1; }
                }
                const want = found >= 0 ? cues[found].text : "";
                if (lyrics.textContent !== want) lyrics.textContent = want;
            };
        });

        addCloseX(() => {
            video.pause();
            MKH.go("songs");
        });
    }

    // ==================== Screen: Credits ====================
    // Only credit.mp4 — no text, no buttons. The single transparent
    // "exit credits" hotspot from the user's annotation is the close.
    function credit({ makeStage }) {
        MKH.log("screen", "credit");
        const stage = makeStage();
        stage.style.background = "#000";
        // Let the hub's ambient music keep playing through the credits.
        // If the user gets here before triggering ambient (rare — they have
        // to be on the hub long enough), kick it off.
        if (!_ambient && _gestured) startAmbient("child5", 0.05);

        const v = document.createElement("video");
        v.src = "assets/animations/credit.mp4";
        v.autoplay = true; v.playsInline = true; v.preload = "auto";
        v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;z-index:50";
        v.addEventListener("ended", () => MKH.go(""));
        stage.appendChild(v);

        const SCALE = 2;
        const list = (window.MKH && MKH.HOTSPOTS && MKH.HOTSPOTS.credit) || [];
        for (const h of list) {
            const btn = makeHotspot({
                left:  h.x * SCALE, top:    h.y * SCALE,
                width: h.w * SCALE, height: h.h * SCALE,
                title: h.label || "", label: h.label || "",
                onClick: () => { MKH.log("click", "credit:" + h.label); v.pause(); MKH.go(""); },
            });
            stage.appendChild(btn);
        }
    }

    // ==================== Music instruments game ====================
    // Two screens: a notes player (mud1) with 8 colored note keys, and a
    // popup-style instrument picker (pan_inst) with 10 instruments. The
    // selected instrument persists across the two screens via sessionStorage,
    // so going back to the picker remembers the last choice.
    //
    //   #/instruments         → notesPlay (mud1)
    //   #/instruments/select  → instrumentPicker (pan_inst)
    //
    // Each note key plays the selected instrument's sample (from
    // assets/sfx/fx/*.ogg) at one of 8 diatonic pitches via the HTMLAudio
    // playbackRate trick — fine for an MVP. preservesPitch=false ensures
    // browsers actually pitch-shift instead of time-stretching.
    // Slot → nearest General MIDI program for note playback via PicoAudio.
    // Slot 4 (frog) has no realistic GM equivalent — we play the frog .ogg
    // sample as a novelty instead (any note key plays the same croak).
    const INSTRUMENT_GM = {
        1:  65,    // saxophone     → Alto Sax
        2:  13,    // xylophone     → Xylophone
        3:  0,     // piano         → Acoustic Grand Piano
        // 4: frog — sample, not GM
        5:  24,    // guitar        → Acoustic Guitar (nylon)
        6:  42,    // cello         → Cello
        7:  21,    // accordion     → Accordion
        8:  56,    // trumpet       → Trumpet
        9:  14,    // bell          → Tubular Bells
        10: 73,    // flute         → Flute
    };
    // Per-slot velocity tweak — bells/xylophone are loud, sax/violin softer
    // in the GM patches PicoAudio synthesizes. Tuned by ear to roughly even
    // out perceived volume across instruments.
    const INSTRUMENT_VEL = {
        1: 0x70, 2: 0x60, 3: 0x70, 5: 0x78, 6: 0x78,
        7: 0x70, 8: 0x60, 9: 0x50, 10: 0x70,
    };
    // do, re, mi, fa, sol, la, ti, do — diatonic C major, C4 to C5.
    const NOTE_MIDI = [60, 62, 64, 65, 67, 69, 71, 72];
    // Frog: still loaded from sfx/fx/ — we no longer slice the others into
    // notes (turned out they were just demo recordings, not 8-note scales).
    const FROG_SAMPLE = "lagu_ani";

    // Playback tempo — ms between consecutive note onsets when "play music"
    // walks the user's composition. Module-scope so the slider value
    // persists across hub<->mud1 navigations within a session.
    let _tempoMs = 240;

    // Persistent composition (just note indices 1-8). Survives navigating
    // away to pick a new instrument so the user doesn't lose their work.
    // Wiped when the user explicitly clicks the staff to clear it.
    let _composition = [];

    // Build a minimal Standard MIDI File: program change + one note on/off.
    // Returned as ArrayBuffer for PicoAudio.parseSMF().
    function buildSingleNoteSMF(program, note, velocity, durationTicks) {
        const v = Math.min(0x7f, Math.max(0, durationTicks)) & 0x7f;
        const bytes = [
            // MThd — format 0, 1 track, 96 ticks/quarter
            0x4d, 0x54, 0x68, 0x64,  0x00, 0x00, 0x00, 0x06,
            0x00, 0x00,  0x00, 0x01,  0x00, 0x60,
            // MTrk — 13-byte body
            0x4d, 0x54, 0x72, 0x6b,  0x00, 0x00, 0x00, 0x0d,
            0x00, 0xc0, program & 0x7f,
            0x00, 0x90, note    & 0x7f, velocity & 0x7f,
            v,    0x80, note    & 0x7f, 0x00,
            0x00, 0xff, 0x2f, 0x00
        ];
        return new Uint8Array(bytes).buffer;
    }

    // Single shared PicoAudio instance for note playback — Chrome caps
    // AudioContext count, so reuse rather than spawning per key.
    let _noteSynth = null;
    function getNoteSynth() {
        if (_noteSynth) {
            try {
                if (_noteSynth.context && _noteSynth.context.state === "suspended") {
                    _noteSynth.context.resume();
                }
            } catch (e) {}
            return _noteSynth;
        }
        if (!window.PicoAudio) return null;
        try {
            _noteSynth = new PicoAudio();
            _noteSynth.init();
            _noteSynth.setMasterVolume(0.85);
        } catch (e) { _noteSynth = null; }
        return _noteSynth;
    }

    // AudioContext for the frog .ogg sample (slot 4 only — everything else
    // goes through the MIDI synth).
    let _frogCtx = null;
    let _frogBuffer = null;
    let _lastFrog = null;
    function ensureFrogBuffer() {
        if (_frogBuffer) return Promise.resolve(_frogBuffer);
        if (!MKH.instrumentBytes) return Promise.resolve(null);
        const bytes = MKH.instrumentBytes(FROG_SAMPLE);
        if (!bytes) return Promise.resolve(null);
        if (!_frogCtx) {
            try { _frogCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { return Promise.resolve(null); }
        }
        if (_frogCtx.state === "suspended") {
            try { _frogCtx.resume(); } catch (e) {}
        }
        return new Promise(res => {
            try {
                _frogCtx.decodeAudioData(bytes.slice(0),
                    buf => { _frogBuffer = buf; res(buf); },
                    () => res(null));
            } catch (e) { res(null); }
        });
    }

    function playInstrumentNote(slot, noteIdx) {
        if (noteIdx < 1 || noteIdx > 8) return;
        // Slot 4 = frog: play the .ogg novelty croak on any key, no pitch.
        if (slot === 4) {
            ensureFrogBuffer().then(buf => {
                if (!buf || !_frogCtx) return;
                if (_lastFrog) { try { _lastFrog.stop(); } catch (e) {} }
                const src  = _frogCtx.createBufferSource();
                src.buffer = buf;
                src.connect(_frogCtx.destination);
                src.start(0);
                _lastFrog = src;
            });
            return;
        }
        const synth = getNoteSynth();
        if (!synth) return;
        const program  = INSTRUMENT_GM[slot];
        const midiNote = NOTE_MIDI[noteIdx - 1];
        const velocity = INSTRUMENT_VEL[slot] || 0x70;
        if (program == null) return;
        try {
            synth.stop();
            synth.setData(synth.parseSMF(
                buildSingleNoteSMF(program, midiNote, velocity, 72)));
            synth.play();
        } catch (e) { /* ignore */ }
    }
    // No-op now — kept for the call site in notesPlay so we don't have to
    // remove it. The MIDI synth has no per-note decode delay.
    function preloadInstruments() { /* kept as a no-op */ }

    const INSTRUMENT_KEY = "makhela:instrument";
    function getInstrument() {
        const n = parseInt(sessionStorage.getItem(INSTRUMENT_KEY), 10);
        return (n >= 1 && n <= 10) ? n : 1;
    }
    function setInstrument(n) {
        sessionStorage.setItem(INSTRUMENT_KEY, String(n));
    }

    // Render a thumbnail of the chosen instrument inside `target` (a
    // hotspot-shaped rect in original 320x200 coords, scaled by SCALE).
    // The art is cropped from pan_inst.png. Used on both pan_inst (in the
    // "select instrument" box) and mud1 (in the "instrument selector" box),
    // so the player always sees which instrument they're playing.
    function renderInstrumentThumb(stage, target, slot, SCALE) {
        const panHotspots = (MKH.HOTSPOTS && MKH.HOTSPOTS.pan_inst) || [];
        const srcLabel = "instrument " + slot;
        const src = panHotspots.find(h => (h.label || "").toLowerCase() === srcLabel);
        if (!src || !target) return;
        const sx = target.x * SCALE, sy = target.y * SCALE;
        const sw = target.w * SCALE, sh = target.h * SCALE;
        const iw = src.w * SCALE,    ih = src.h * SCALE;
        const pad = 4;
        const fit = Math.min((sw - pad * 2) / iw, (sh - pad * 2) / ih);
        const drawW = iw * fit, drawH = ih * fit;
        const ox = sx + (sw - drawW) / 2;
        const oy = sy + (sh - drawH) / 2;
        const thumb = document.createElement("div");
        thumb.className = "pan-sel-thumb";
        thumb.style.cssText =
            "position:absolute;pointer-events:none;z-index:140;" +
            "overflow:hidden;image-rendering:pixelated;" +
            "left:" + ox + "px;top:" + oy + "px;" +
            "width:" + drawW + "px;height:" + drawH + "px;";
        const inner = document.createElement("div");
        inner.style.cssText =
            "position:absolute;left:" + (-src.x * SCALE * fit) + "px;" +
            "top:" + (-src.y * SCALE * fit) + "px;" +
            "width:" + (640 * fit) + "px;height:" + (400 * fit) + "px;" +
            "background-image:url('assets/bitmaps/pan_inst.png');" +
            "background-size:" + (640 * fit) + "px " + (400 * fit) + "px;" +
            "background-repeat:no-repeat;" +
            "image-rendering:pixelated;";
        thumb.appendChild(inner);
        stage.appendChild(thumb);
    }

    function instrumentPicker({ makeStage }) {
        MKH.log("screen", "instrumentPicker");
        const stage = makeStage();
        stage.style.backgroundImage = "url('assets/bitmaps/pan_inst.png')";
        stage.style.backgroundColor = "#000";
        stopAmbient();

        const SCALE = 2;
        const hotspots = (MKH.HOTSPOTS && MKH.HOTSPOTS.pan_inst) || [];
        let selected = getInstrument();
        let voiceAudio = null;

        function stopVoice() {
            if (voiceAudio) { try { voiceAudio.pause(); } catch (e) {} voiceAudio = null; }
        }

        function render() {
            stage.querySelectorAll(".hotspot, .pan-sel-frame, .pan-sel-thumb").forEach(el => el.remove());
            let selectorH = null;
            let selectedH = null;
            for (const h of hotspots) {
                const label = (h.label || "").toLowerCase();
                const btn = makeHotspot({
                    left:  h.x * SCALE, top:    h.y * SCALE,
                    width: h.w * SCALE, height: h.h * SCALE,
                    title: h.label || "", label: h.label || "",
                    onClick: () => handleClick(h, label),
                });
                stage.appendChild(btn);
                // Highlight the currently-selected instrument with a soft
                // golden frame so the user knows what they're about to commit.
                if (label.startsWith("instrument ")) {
                    const n = parseInt(label.split(" ")[1], 10);
                    if (n === selected) {
                        selectedH = h;
                        const ring = document.createElement("div");
                        ring.className = "pan-sel-frame";
                        ring.style.cssText =
                            "position:absolute;pointer-events:none;z-index:150;" +
                            "border-radius:6px;box-shadow:inset 0 0 0 3px #ffe089,0 0 8px #ffe089;" +
                            "left:" + (h.x * SCALE) + "px;top:" + (h.y * SCALE) + "px;" +
                            "width:" + (h.w * SCALE) + "px;height:" + (h.h * SCALE) + "px;";
                        stage.appendChild(ring);
                    }
                } else if (label === "select instrument") {
                    selectorH = h;
                }
            }
            if (selectorH) renderInstrumentThumb(stage, selectorH, selected, SCALE);
        }

        function handleClick(h, label) {
            MKH.log("click", "pan_inst:" + h.label);
            if (label === "exit") {
                stopVoice();
                // Popup-style "exit" closes the picker back to the play screen.
                MKH.go("instruments");
            } else if (label === "select instrument") {
                stopVoice();
                MKH.go("instruments");
            } else if (label.startsWith("instrument ")) {
                const n = parseInt(label.split(" ")[1], 10);
                if (n >= 1 && n <= 10) {
                    selected = n;
                    setInstrument(n);
                    stopVoice();
                    // Hebrew narrator names the instrument.
                    voiceAudio = new Audio("assets/sfx/instruments/" + n + ".ogg");
                    voiceAudio.play().catch(() => {});
                    render();
                }
            }
        }

        render();
    }

    function notesPlay({ makeStage }) {
        MKH.log("screen", "notesPlay");
        const stage = makeStage();
        stage.style.backgroundImage = "url('assets/screens/mud1.png')";
        stage.style.backgroundColor = "#000";
        stopAmbient();

        const SCALE = 2;
        const hotspots = (MKH.HOTSPOTS && MKH.HOTSPOTS.mud1) || [];
        const instrument = getInstrument();
        let melodyTimer = null;

        // Warm the decoded-buffer cache so the first key tap is instant.
        preloadInstruments();

        // Sheet-music display state. The "music notes display" hotspot is
        // the staff area at the top of mud1; we stamp notki.png (the
        // original game's notehead sprite) on it as the user plays. Notes
        // accumulate left-to-right; when the row fills, it wraps to a new
        // line below.
        const noteDisplayH = hotspots.find(
            h => (h.label || "").toLowerCase() === "music notes display"
        );
        const placedNotes = [];
        let noteCol = 0, noteRow = 0;
        const NOTE_W = 19, NOTE_H = 19;
        const COL_W  = 26;                  // horizontal step per note
        const ROW_H  = 100;                 // vertical step per wrap
        const LEFT_PAD = 80;                // skip past the treble clef
        const RIGHT_PAD = 16;
        // y (stage px) for the LOWEST note (do = note 1). Each step up the
        // diatonic scale lifts the notehead by STEP_Y pixels.
        const STAFF_BASE_Y = 170;
        const STEP_Y = 11;

        function clearNotes() {
            placedNotes.forEach(p => p.el.remove());
            placedNotes.length = 0;
            noteCol = 0; noteRow = 0;
            _composition.length = 0;
        }
        function addNoteVisual(n) {
            if (!noteDisplayH || n < 1 || n > 8) return;
            const dx = noteDisplayH.x * SCALE;
            const dw = noteDisplayH.w * SCALE;
            const maxCol = Math.floor((dw - LEFT_PAD - RIGHT_PAD - NOTE_W) / COL_W);
            if (noteCol > maxCol) { noteCol = 0; noteRow += 1; }
            if (noteRow > 1) { clearNotes(); }
            const x = dx + LEFT_PAD + noteCol * COL_W;
            const y = STAFF_BASE_Y - (n - 1) * STEP_Y + noteRow * ROW_H;
            const el = document.createElement("img");
            el.src = "assets/bitmaps/notki.png";
            el.className = "music-note";
            el.style.cssText =
                "position:absolute;pointer-events:none;z-index:50;" +
                "image-rendering:pixelated;" +
                "left:" + x + "px;top:" + y + "px;" +
                "width:" + NOTE_W + "px;height:" + NOTE_H + "px;";
            stage.appendChild(el);
            // Remember which pitch this notehead represents so "play music"
            // can play back the actual sequence the user composed.
            placedNotes.push({ el, n });
            noteCol += 1;
        }

        function stopAll() {
            if (melodyTimer) { clearTimeout(melodyTimer); melodyTimer = null; }
            if (_noteSynth) { try { _noteSynth.stop(); } catch (e) {} }
            if (_lastFrog)  { try { _lastFrog.stop();  } catch (e) {} _lastFrog = null; }
        }

        function playNote(n) {
            playInstrumentNote(instrument, n);
            addNoteVisual(n);
            _composition.push(n);
        }

        // Re-stamp any notes the user had on the staff before navigating
        // away (typically to swap instruments). We replay the geometry via
        // addNoteVisual, which respects the row-wrap and clears if the
        // composition would overflow — same behavior as live entry.
        if (_composition.length) {
            const saved = _composition.slice();
            _composition.length = 0;       // addNoteVisual doesn't push; we
            saved.forEach(n => {           // re-push manually to preserve
                addNoteVisual(n);          // exact order in case wrap drops
                _composition.push(n);      // anything.
            });
        }

        function playMelody() {
            // Snapshot the user's composition. If empty, fall back to a
            // built-in do-re-mi sequence so the button still does
            // something useful on first use.
            const composed = placedNotes.slice();
            const usingComposition = composed.length > 0;
            const seq = usingComposition
                ? composed.map(p => p.n)
                : [1, 2, 3, 4, 5, 6, 7, 8];

            // Stop audio but DON'T clear the visuals — we toggle their
            // visibility so noteheads pop in one-by-one as the music plays.
            if (melodyTimer) { clearTimeout(melodyTimer); melodyTimer = null; }
            if (_noteSynth)  { try { _noteSynth.stop(); } catch (e) {} }
            if (_lastFrog)   { try { _lastFrog.stop();  } catch (e) {} _lastFrog = null; }

            // Hide every placed notehead before playback starts.
            if (usingComposition) {
                composed.forEach(p => { p.el.style.visibility = "hidden"; });
            }

            let i = 0;
            function step() {
                if (i >= seq.length) { melodyTimer = null; return; }
                if (usingComposition) composed[i].el.style.visibility = "visible";
                playInstrumentNote(instrument, seq[i++]);
                melodyTimer = setTimeout(step, _tempoMs);
            }
            step();
        }

        let selectorH = null;
        for (const h of hotspots) {
            const label = (h.label || "").toLowerCase();
            if (label === "instrument selector") selectorH = h;
            const btn = makeHotspot({
                left:  h.x * SCALE, top:    h.y * SCALE,
                width: h.w * SCALE, height: h.h * SCALE,
                title: h.label || "", label: h.label || "",
                onClick: () => {
                    MKH.log("click", "mud1:" + h.label);
                    if (label === "exit game") {
                        stopAll();
                        // Back to the main hub (m0) — the pendingReturn the
                        // m0 hotspot stashed plays its return anim there.
                        MKH.go("");
                    } else if (label === "instrument selector") {
                        stopAll();
                        MKH.go("instruments/select");
                    } else if (label === "play music") {
                        playMelody();
                    } else if (label === "music notes display") {
                        // Click the staff to wipe it clean.
                        clearNotes();
                    } else if (/^not\d+$/.test(label)) {
                        const n = parseInt(label.slice(3), 10);
                        if (n >= 1 && n <= 8) playNote(n);
                    }
                },
            });
            stage.appendChild(btn);
        }
        // Show which instrument is currently active in the selector box.
        if (selectorH) renderInstrumentThumb(stage, selectorH, instrument, SCALE);

        // Tempo control — small horizontal slider docked at the top centre
        // (between the spiral binding rings). RTL-friendly. Faster tempo
        // = lower ms-between-notes. Value persists across navigations via
        // _tempoMs at module scope.
        const tempo = document.createElement("div");
        tempo.className = "tempo-control";
        tempo.innerHTML =
            '<span class="tempo-label">קצב</span>' +
            '<button class="tempo-btn" data-act="fast">−</button>' +
            '<input type="range" min="80" max="600" step="20">' +
            '<button class="tempo-btn" data-act="slow">+</button>';
        stage.appendChild(tempo);
        const slider = tempo.querySelector("input[type=range]");
        slider.value = _tempoMs;
        slider.addEventListener("input", () => {
            _tempoMs = parseInt(slider.value, 10) || 240;
        });
        // +/- buttons nudge by one slider step (faster = lower ms, so the
        // visual + button decreases the value).
        tempo.querySelectorAll(".tempo-btn").forEach(b => {
            b.addEventListener("click", () => {
                const step = parseInt(slider.step, 10) || 20;
                let v = parseInt(slider.value, 10);
                v += (b.dataset.act === "fast" ? -step : step);
                v = Math.max(+slider.min, Math.min(+slider.max, v));
                slider.value = v;
                _tempoMs = v;
            });
        });
    }

    // ==================== Screen: Coming soon ====================
    // Placeholder for routes wired up in the m0 annotation that don't
    // yet have a real screen (instruments / freeplay / mini / settings).
    // Shows the screen title in Hebrew with an X back to the hub. The
    // pendingReturn the hub set is still consumed correctly on exit.
    function comingSoon({ makeStage, label }) {
        MKH.log("screen", "comingSoon", label);
        const stage = makeStage();
        stage.style.background = "linear-gradient(135deg, #4a3960 0%, #2a1f3a 100%)";
        stopAmbient();

        const wrap = document.createElement("div");
        wrap.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center;direction:rtl";
        wrap.innerHTML = `
            <div style="font-size:1.6rem;color:#ffe089;margin-bottom:0.4rem">${label}</div>
            <div style="font-size:1.0rem;opacity:0.8">בקרוב / Coming soon</div>
            <div style="font-size:0.85rem;opacity:0.55;margin-top:1.2rem">לחץ ✕ לחזרה</div>
        `;
        stage.appendChild(wrap);

        const x = document.createElement("button");
        x.className = "btn-x";
        x.textContent = "✕";
        x.title = "סגירה / Close";
        x.addEventListener("click", () => MKH.go(""));
        stage.appendChild(x);
    }

    MKH.screens = { hub, songs, songPlay, credit, comingSoon, instrumentPicker, notesPlay };
})();
