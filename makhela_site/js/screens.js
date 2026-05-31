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

    // Companion sound starter. Supports:
    //   "assets/sfx/.../x.ogg" — HTMLAudioElement
    //   "midi:<key>"           — PicoAudio synth (one-shot, not looped)
    function startCompanionSound(spec) {
        if (!spec) return { stop: () => {} };
        if (spec.startsWith("midi:")) {
            if (!window.PicoAudio || !MKH.midiBytes) return { stop: () => {} };
            const buf = MKH.midiBytes(spec.slice(5));
            if (!buf) return { stop: () => {} };
            try {
                const p = new PicoAudio();
                p.init();
                p.setMasterVolume(0.6);
                p.setData(p.parseSMF(buf));
                p.play();
                return { stop: () => { try { p.stop(); } catch (e) {} } };
            } catch (e) { return { stop: () => {} }; }
        } else {
            const a = new Audio(spec);
            a.play().catch(() => {});
            return { stop: () => { try { a.pause(); } catch (e) {} } };
        }
    }

    // playAnim — play a video and PAUSE A FRAME BEFORE THE END so the
    // browser doesn't reach the 'ended' state where it may release /
    // reset the visible frame.
    function playAnim(stage, url, opts) {
        opts = opts || {};
        if (!url) { if (opts.onEnd) opts.onEnd(); return null; }
        MKH.log("anim", "play", url);

        const v = document.createElement("video");
        v.src = url;
        v.autoplay = true;
        v.playsInline = true;
        v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;z-index:100";

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
        try { _ambient.pico.stop(); } catch (e) {}
        _ambient = null;
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

        if (!_ambient && !_ambientPending) {
            _ambientPending = true;
            const onFirstGesture = () => {
                document.removeEventListener("pointerdown", onFirstGesture);
                document.removeEventListener("keydown",     onFirstGesture);
                _ambientPending = false;
                startAmbient("1", 0.5);
            };
            document.addEventListener("pointerdown", onFirstGesture, { once: true });
            document.addEventListener("keydown",     onFirstGesture, { once: true });
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

        function handleHotspotClick(h) {
            clearAllIdleTimers();
            const entry = nextClickEntry(h);
            MKH.log("click", "hotspot", h.label, "anim=" + (entry && entry.anim));
            stage.querySelectorAll(".hotspot").forEach(b => b.remove());
            if (!entry) {
                // No anim defined — go straight to route or restore
                if (h.route) {
                    setPendingReturn("m0", h.returnAnims || h.returnAnim || "");
                    MKH.go(h.route.replace(/^#\//, ""));
                } else {
                    renderHotspots();
                }
                return;
            }
            playAnim(stage, entry.anim, {
                sound: entry.sound || "",
                onEnd: () => {
                    if (h.route) {
                        // Store the entire return-anims list (or legacy single string)
                        const ret = h.returnAnims && h.returnAnims.length
                            ? h.returnAnims
                            : (h.returnAnim ? [{ anim: h.returnAnim, sound: h.returnSound || "" }] : []);
                        setPendingReturn("m0", ret);
                        MKH.go(h.route.replace(/^#\//, ""));
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

    // ==================== Screen: Songs picker ====================
    function songs({ makeStage, addBackButton, addTitle, menuOrder, songIndex }) {
        MKH.log("screen", "songs");
        const stage = makeStage("song-list-bg");

        // Preview image filling the picture-box (the empty wooden-framed
        // square top-right of mus1.png).  Stage = 640×400 (2× the source
        // 320×200 bitmap).  Picture-box inner bounds measured from the
        // bitmap: approx x=251..297, y=58..123 in 320 coords →
        // x=502..594, y=116..246 in stage coords (96×130).
        // The thumbnails themselves are native 320×200 — `object-fit: cover`
        // crops them so the centre fills the box without distortion.
        const preview = document.createElement("img");
        preview.alt = "";
        preview.style.cssText = [
            "position:absolute",
            "left:502px", "top:116px",
            "width:92px",  "height:130px",
            "object-fit:cover",            // zoom-to-center, crop overflow
            "object-position:center",
            "image-rendering:pixelated",
            "pointer-events:none",
            "opacity:0",
            "transition:opacity 0.12s",
        ].join(";") + ";";
        stage.appendChild(preview);

        // The mus1.png background already has all 10 Hebrew song titles
        // painted on the paper scroll, in this visual order (top→bottom).
        // Each hotspot covers one printed line — fully transparent so the
        // original art shows through; hover gives a subtle highlight AND
        // pops a song-specific thumbnail into the picture-box.
        // y values are in 640×400 stage coords (mus1.png is 320×200 at 2×).
        const SONG_HOTSPOTS = [
            { key: "aviron",  y:  56 },   // רד אלינו אווירון
            { key: "tiktak",  y:  84 },   // שעון בן חיל
            { key: "ionatan", y: 112 },   // יונתן הקטן
            { key: "shofan",  y: 140 },   // השפן הקטן
            { key: "taish",   y: 168 },   // יש לנו תיש
            { key: "aba",     y: 196 },   // אבא שלי
            { key: "udi",     y: 224 },   // למה (הודי חמודי)
            { key: "zebra",   y: 252 },   // מדוע הזברה לובשת פיג'מה?
            { key: "parash",  y: 280 },   // פרש
            { key: "aliza",   y: 308 },   // הילדה הכי יפה בגן
        ];
        for (const h of SONG_HOTSPOTS) {
            const hs = makeHotspot({
                left: 110, top: h.y - 12, width: 380, height: 28,
                title: h.key,
                label: "Play song " + h.key,
                onClick: () => { MKH.log("click", "song", h.key); MKH.go("songs/" + h.key); },
            });
            hs.addEventListener("mouseenter", () => {
                preview.src = "assets/song_thumbs/" + h.key + ".png";
                preview.style.opacity = 1;
            });
            hs.addEventListener("mouseleave", () => {
                preview.style.opacity = 0;
            });
            hs.addEventListener("focus",   () => { preview.src = "assets/song_thumbs/" + h.key + ".png"; preview.style.opacity = 1; });
            hs.addEventListener("blur",    () => { preview.style.opacity = 0; });
            stage.appendChild(hs);
        }

        // Stop-hand back-button is already drawn into mus1.png at top-right
        // of the paper. Transparent hotspot over it.
        const back = makeHotspot({
            left: 510, top: 14, width: 70, height: 70,
            title: "חזרה",
            label: "Back to hub",
            onClick: () => { MKH.log("click", "back-from-songs"); MKH.go(""); },
        });
        stage.appendChild(back);
    }

    // ==================== Screen: Song playback ====================
    function songPlay({ makeStage, addBackButton, addTitle, key, song }) {
        MKH.log("screen", "songPlay", key);
        const stage = makeStage();
        // Pause hub ambient while the song video has its own audio; it
        // will be restarted by the hub screen on next entry.
        stopAmbient();
        if (!song) {
            const err = document.createElement("div");
            err.className = "loading";
            err.textContent = "Song not found: " + key;
            stage.appendChild(err);
            addBackButton(() => MKH.go("songs"));
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

        addBackButton(() => {
            video.pause();
            MKH.go("songs");
        });
    }

    // ==================== Screen: About ====================
    function about({ makeStage, addBackButton, addTitle }) {
        MKH.log("screen", "about");
        const stage = makeStage();
        stage.style.background = "linear-gradient(135deg, #2a3f5f 0%, #1a2d4a 100%)";
        addTitle("אודות — Makhela");
        addBackButton();

        const text = document.createElement("div");
        text.style.cssText = "position:absolute;inset:60px 40px 40px;color:#fff;direction:rtl;text-align:right;font-size:16px;line-height:1.7;overflow-y:auto";
        text.innerHTML = `
            <h2 style="color:#ffe089;margin-bottom:0.8rem">מקהלה</h2>
            <p>פורט דפדפן של לומדת המוזיקה של תקוע מחשבים (1995).</p>
            <p style="margin-top:0.6rem"><b>השירים הכלולים:</b> 10 שירי ילדים קלאסיים — תיק תק, אווירון, אבא שלי, יונתן הקטן, השפן הקטן, אודי-חמודי, הזברה, פרש, מקהלה עליזה, ויש לנו תיש.</p>
            <p style="margin-top:0.6rem"><b>מקור:</b> תקליטור CD-ROM של 'אליזה' (1995).</p>
            <p style="margin-top:0.6rem;font-size:14px;color:#bbb">Port: Lev Levin (2026). Original audio + animations extracted directly from the CD image.</p>
        `;
        stage.appendChild(text);
    }

    MKH.screens = { hub, songs, songPlay, about };
})();
