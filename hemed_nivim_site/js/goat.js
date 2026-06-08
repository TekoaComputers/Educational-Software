// Shared goat-walking helper — extracted from haklada.js so haklada,
// american, and any future game can drive the same TimerGoat-style
// animation. Mirrors GameHaklada.frm / GameAmerican.frm's TimerGoat_Timer
// (lines ~694-949 in both .frms — the logic is identical between the
// two games, only initial Y differs).
//
//   Statuses (orig GoatStatus, GoatPic(0..6).LoadAni):
//     0 = idle              (1 frame)
//     1 = jump              (21 frames) — moves to GetFlowerX(Current)
//     2 = walk-eat          (15 frames) — slower walk, flower-bloom synced
//     3 = correct-letter    (5 frames)  — small head-bob, used by haklada
//     4 = wrong-letter      (5 frames)  — small head-bob, used by haklada
//     5 = walk-eat-slow     (15 frames) — slowest walk, used for "withered"
//     6 = win-loop          (28 frames) — victory hop frames 14-16 + loop 19..27
//
//   Per-status TimerGoat.Interval (ms): orig lines 697-708.
//   Status 6 split: 70ms while GoatFrame<18, 100ms thereafter.
//
//   Row-down transition (when crossing Current=11/23/34): flip the
//   sprite at frame 5, drop Y 6px on frames 9-13. Orig lines 777-815.
window.HND = window.HND || {};

// Goat sprite frame counts, indexed by status. Mirrors disk asset count.
HND.GOAT_FRAMES = [1, 21, 15, 5, 5, 15, 28];

// Per-status tick interval (ms).
HND.GOAT_INTERVAL = [120, 55, 70, 70, 70, 110, 70];

/**
 * Create a goat controller bound to `root`. Returns
 *   { element, setStatus(s, targetIdx, bloomTarget), teardown(), state }
 *
 * @param {object} opts
 *   root:       Element  the game-root to append the goat into
 *   appId:      string   for `assets/<appId>/pictures/GameHaklada/`
 *   flowerX:    function (qIdx) → px (game-specific flower X positions)
 *   flowerY:    function (qIdx) → px (game-specific flower Y positions)
 *   QCOUNT:     number   total Q count (for clamping targetIdx)
 *   className:  string   CSS class for the goat div (e.g. "hak-goat" / "am-goat")
 *   initialX:   number   start X (default 900, off-screen right)
 *   initialY:   number   start Y (default flowerY(0) - 55)
 *   yOffset:    number   px above flower row (default -55, matches both games)
 */
HND.createGoat = function (opts) {
    const SPRITE_BASE = "assets/" + opts.appId + "/pictures/GameHaklada/";
    const flowerX = opts.flowerX;
    const flowerY = opts.flowerY;
    const QCOUNT  = opts.QCOUNT;
    const yOffset = opts.yOffset != null ? opts.yOffset : -55;
    // Optional callback to snap a bloom for ANY prior flower to its final
    // frame (orig TimerGoat:758-764 + :780 + :790-797 finalize earlier
    // rows when the goat crosses a row break). If omitted, finalization
    // is a no-op (current haklada behavior pre-this-change).
    const bloomFinalizer = opts.bloomFinalizer || function () {};
    // Orig TimerGoat:712-714 `LineXChange = FlowerSpace + 5 = 70` when the
    // current target is on the middle row (Current 11..22, 0-indexed 10..21).
    // Allow callers to opt in/out / override. Default ON, range matches orig.
    const xShift     = opts.lineXChange != null ? opts.lineXChange : 70;
    const midRowMin  = opts.midRowMin != null ? opts.midRowMin : 10;
    const midRowMax  = opts.midRowMax != null ? opts.midRowMax : 21;

    const goat = HND._el("div", { class: "ctrl " + (opts.className || "hak-goat") });
    opts.root.appendChild(goat);
    // Build stacked <img> frames for every (status, frame) combination.
    // Keeping every sprite mounted as a real DOM element guarantees the
    // browser holds each texture in GPU cache → frame switching is just
    // an opacity toggle, no fetch/decode/upload, no transparent flash
    // showing the parent's background through. Replaces the old
    // `goat.style.backgroundImage = ...` swap which suffered the same
    // fundamental flash as CSS @keyframes bg-image swaps.
    // Layout: rows by status; cols by frame. Flat URL list + offset map.
    const frameOffsets = [];   // status → start index in URL list
    const frameUrls = [];
    for (let s = 0; s < HND.GOAT_FRAMES.length; s++) {
        frameOffsets.push(frameUrls.length);
        for (let f = 0; f < HND.GOAT_FRAMES[s]; f++) {
            frameUrls.push(SPRITE_BASE + "goat" + s + "_" + f + ".png");
        }
    }
    const goatStack = HND.createFrameStack(goat, frameUrls, { className: "hnd-goat-frame" });

    const state = {
        status: 0,
        frame: 0,
        x: opts.initialX != null ? opts.initialX : 900,
        y: opts.initialY != null ? opts.initialY : flowerY(0) + yOffset,
        flip: false,
        flipped: false,
        rowChange: false,
        targetIdx: 0,
        tickHandle: null,
        bloomTarget: null,
        winShiftDir: -6,
    };

    function tickInterval() {
        if (state.status === 6 && state.frame >= 18) return 100;
        return HND.GOAT_INTERVAL[state.status];
    }

    function paint() {
        goat.style.left = state.x + "px";
        goat.style.top  = state.y + "px";
        goat.style.transform = state.flip ? "scaleX(-1)" : "";
        // Show the current (status, frame) via the frame-stack — flat-
        // index lookup, then opacity toggle inside the stack (no bg-image
        // swap, no flash).
        const idx = frameOffsets[state.status] + Math.min(
            state.frame, HND.GOAT_FRAMES[state.status] - 1);
        goatStack.show(idx);
    }

    function targetX(qIdx) {
        const i = Math.min(qIdx, QCOUNT - 1);
        const shift = (i >= midRowMin && i <= midRowMax) ? xShift : 0;
        return flowerX(i) - shift;
    }
    function targetY(qIdx) { return flowerY(Math.min(qIdx, QCOUNT - 1)) + yOffset; }

    function tick() {
        const status = state.status;
        const frames = HND.GOAT_FRAMES[status];
        state.frame += 1;

        // ===== Row-transition (orig TimerGoat:777-815) =====
        if ((status === 1 || status === 2 || status === 5) && state.rowChange) {
            if (state.frame === 5 && !state.flipped) {
                state.flip = !state.flip;
                state.flipped = true;
            }
            if (state.frame > 9 && state.frame < 14) state.y += 6;
        }

        // ===== Per-frame X/Y easing during walk =====
        // Status 1 (jump): frames 7-17 only (orig:768).
        // Status 2/5 (walk-eat): frames > 5 only (orig:772).
        const tx = targetX(state.targetIdx);
        const ty = targetY(state.targetIdx);
        if (status === 1 && state.frame > 6 && state.frame < 18) {
            const denom = Math.max(1, (frames - 8) - (state.frame - 6));
            state.x += (tx - state.x) / denom;
        } else if ((status === 2 || status === 5) && state.frame > 5) {
            const denom = Math.max(1, (frames - 5) - (state.frame - 5) + 1);
            state.x += (tx - state.x) / denom;
        }
        if (!state.rowChange && (status === 1 || status === 2 || status === 5)) {
            const remaining = frames - state.frame;
            state.y += (ty - state.y) / Math.max(1, remaining);
        }

        // ===== Status 6 victory-hop (orig TimerGoat:760-764) =====
        if (status === 6 && state.frame > 14 && state.frame < 17) {
            state.y += 5;
            state.x += state.winShiftDir;
        }
        // ===== Status 6 final-flower commit (orig TimerGoat:751-758) =====
        // At frame 16 the last-touched flower (targetIdx-1) is snapped to
        // its final frame so the win-hop doesn't leave it mid-bloom.
        if (status === 6 && state.frame === 16) {
            bloomFinalizer(state.targetIdx - 1);
        }
        // ===== Row-cross flower finalization (orig TimerGoat:780-797) =====
        // On the row-cross frames, the prior row's flowers are snapped to
        // their final frame so the goat doesn't leave them mid-bloom while
        // walking the new row.
        if ((status === 1 || status === 2 || status === 5) && state.rowChange) {
            //  frame 9 → finalize the just-vacated flower(targetIdx-1)
            if (state.frame === 9) {
                bloomFinalizer(state.targetIdx - 1);
            }
            //  frame FrameN → sweep-finalize the WHOLE prior row
            if (state.frame === frames) {
                for (let i = state.targetIdx - 12; i <= state.targetIdx - 2; i++) {
                    if (i >= 0) bloomFinalizer(i);
                }
            }
        }

        // ===== Frame overflow / state transition =====
        if (state.frame >= frames) {
            if (status === 6) {
                state.frame = 19;          // orig loop 19..27
            } else {
                state.frame = 0;
                if (status === 1 || status === 2 || status === 5) {
                    state.x = tx;
                    state.y = ty;
                }
                state.rowChange = false;
                state.flipped = false;
                state.status = 0;
            }
        }

        paint();
        // ===== Bloom in sync (orig TimerGoat:852-860) =====
        // FlowerStatus[Current-1] += 1 each frame > 4 if status 1/2/5.
        if ((status === 1 || status === 2 || status === 5)
            && state.frame > 4 && state.bloomTarget != null) {
            state.bloomTarget.step(state.frame);
        }
        state.tickHandle = setTimeout(tick, tickInterval());
    }

    function startTick() {
        if (state.tickHandle) return;
        state.tickHandle = setTimeout(tick, tickInterval());
    }

    function setStatus(s, targetIdx, bloomTarget) {
        state.status = s;
        state.frame = 0;
        state.flipped = false;
        state.bloomTarget = bloomTarget || null;
        if (targetIdx != null) {
            state.targetIdx = targetIdx;
            const prevRow = flowerY(Math.max(0, targetIdx - 1));
            const newRow  = flowerY(targetIdx);
            state.rowChange = (targetIdx > 0) && (newRow !== prevRow);
        } else {
            state.rowChange = false;
        }
        if (s === 6) {
            const i = Math.max(0, state.targetIdx);
            state.winShiftDir =
                (i >= 2 && flowerX(i - 2) < flowerX(i - 1)) ? +6 : -6;
        }
        paint();
        startTick();
    }

    function teardown() {
        if (state.tickHandle) {
            clearTimeout(state.tickHandle);
            state.tickHandle = null;
        }
    }

    // Initial paint of frame 0 of pose 0 (idle).
    paint();

    return {
        element: goat,
        state: state,
        setStatus: setStatus,
        teardown: teardown,
    };
};
