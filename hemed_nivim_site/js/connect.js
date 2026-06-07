// Connect — full port of GameConnect.frm.
//
//   LoadSet (line 387):
//     MaxLineNum = 8 (or 6 if picture mode). Each set draws up to MaxLineNum
//     pairs from the remaining pool. Boxes(0..N-1) = Q text, Boxes(N..2N-1)
//     = A text. Boxes scattered randomly at (50..690 x 50..480), non-overlap.
//     LoadSet is RE-CALLED after each set completes until the full unit
//     (all items) has been consumed.
//
//   Form_MouseUp (line 491):
//     - First click (OldChosenId=-1, ChosenId>-1): plays Boxes(ChosenId).wave
//       (the Q or A audio) but doesn't match yet.
//     - Second click matching the FIRST id (Boxes[A].Id == Boxes[B].Id):
//       both boxes fly to the bottom, rope drawn between, plays good4.wav.
//     - Second click NOT matching: ErrorCount++ on the old box, ra.wav.
//
//   WinGame (line 334):
//     gameScore = 100 - sum(ErrorCount * 15 / starCount)
//     starCount = total Q pairs across the WHOLE game (all sets combined).
//     Stars scatter on both sides as celebration.
window.HND = window.HND || {};

HND.startConnect = function (root, app, unit, onComplete) {
    const cols  = (unit.data && unit.data.columns) || [];
    const items = (unit.data && unit.data.items)  || [];
    if (!items.length || cols.length < 2) {
        root.innerHTML = '<div class="error">אין נתוני חיבור ביחידה זו.</div>';
        return;
    }
    // Sprite preload — note orig star/smallstar atlases only ship
    // frames 0..3 (LoadAni stops when file is missing). Orig
    // `Int(QStatus(i).aniState / 2)` can index frame 4 for perfect
    // answers, which silently no-ops in VB6 PicClass.MaskB. We clamp
    // to frame 3 max so perfect answers show the brightest VALID
    // frame instead of a blank slot.
    HND.preloadFrames(app.id, "GameConnect", [
        "box", "box2", "ball", "not",
        "star_0", "star_1", "star_2", "star_3",
        "smallstar_0", "smallstar_1", "smallstar_2", "smallstar_3",
    ]);

    // Per-unit calibration (orig CurrentCalibration). Connect's slot is 8.
    // 14/31 Nivim units use CombineQA="8" (right→left audio chain).
    const cal = HND.gameCalibrationFromSlot(unit, app.id, 8);
    const leftCol  = cal.askCol;     // "Q" box text — orig WhatToAsk side
    const rightCol = cal.ansCol;     // "A" box text — orig WhatToAnswer side
    const askSide  = cal.askSide;
    const ansSide  = cal.ansSide;
    // Orig LoadSet:399-401 — MaxLineNum=8 normally, =6 if either side
    // is qPicture (picture boxes are bigger so fewer fit per set).
    const MAX_LINES = cal.picMode ? 6 : 8;

    // Shared-sound helper (orig PlayWave AppPath\Data\Sounds\X.wav).
    function sharedWave(name) {
        return "assets/" + app.id + "/sounds/" + name;
    }
    // Per-item picture URL (orig BoxKind=qPicture loads
    // GamePath\pic\<id>.bmp). Same data-root convention as wave files.
    function pictureUrl(origIdx) {
        const dataRoot = (HND.APPS[app.id] || {}).dataRoot || "data/" + app.id;
        return dataRoot + "/unit_" + unit.id + "/pic/" + origIdx + ".png";
    }

    // Game-wide state — honor IfRandom (orig PlayGame).
    const rawPool = items.map(function (_, i) { return i; });
    const pool = cal.ifRandom ? HND._shuffle(rawPool) : rawPool;
    const game = {
        pool: pool,                      // indices still waiting for a set
        totalPairs: pool.length,         // matches starCount in WinGame
        totalErrors: 0,                  // sum of Q-box errorCount across sets
        errorsByItem: {},                // origIdx → 0/1/2 bucket for score-form
        starOrder: [],                   // origIdxs in answer order — drives star row
        setNum: 0,
        completed: false,
    };

    // Per-set state (rebuilt each LoadSet).
    let boxes = [];
    let picks = [];
    let ROUND = 0;
    const state = {
        selected: null,        // ChosenId — second click commits
        hoverId:  null,        // SelectedId — mouseenter (drives repulsion)
        matched:  {},
        mouseX: 0, mouseY: 0,  // current cursor position in stage px
        ropeTiming: 0,         // 0..50, ticks per frame for rope wave
    };

    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}

    function loadSet() {
        game.setNum++;
        const take = Math.min(game.pool.length, MAX_LINES);
        picks = game.pool.slice(0, take);
        game.pool = game.pool.slice(take);
        ROUND = picks.length;

        // BoxKind from orig LoadSet:428-433 — Q boxes have WhatToAsk
        // kind, A boxes have WhatToAnswer kind. qPicture (3) → picture
        // box; otherwise → text box.
        const qIsPic = (cal.whatToAsk === 3);
        const aIsPic = (cal.whatToAnswer === 3);
        boxes = [];
        picks.forEach(function (origIdx, i) {
            boxes.push({ pairId: i, kind: "Q", origIdx: origIdx,
                         text: items[origIdx][leftCol]  || "",
                         isPic: qIsPic,
                         errorCount: 0 });
        });
        picks.forEach(function (origIdx, i) {
            boxes.push({ pairId: i, kind: "A", origIdx: origIdx,
                         text: items[origIdx][rightCol] || "",
                         isPic: aIsPic,
                         errorCount: 0 });
        });
        // Per-box width & height based on ACTUAL text metrics (was a flat
        // 16px-per-char estimate that over-sized boxes by ~60% — causing
        // unavoidable overlaps with 16 boxes in the 700×430 field). We
        // attach a hidden span styled exactly like .connect-box, read its
        // natural offsetWidth, and clamp to a reasonable range. Long text
        // wraps to 2 lines and gets a taller box.
        const MAX_W = 260;        // single-line cap before wrap
        const MIN_W = 70;
        const PAD_W = 14;         // ~7px each side, matches CSS padding:0 10px
        const measurer = HND._el("span", {
            class: "connect-box kind-q",
            style: "position:absolute; left:-9999px; top:-9999px; " +
                   "visibility:hidden; white-space:nowrap; height:auto;",
        });
        root.appendChild(measurer);
        boxes.forEach(function (b) {
            if (b.isPic) {
                // Picture box — fixed sprite size from orig LoadBox:600-608
                // (uses LoadPic dimensions; we approximate at 165×140).
                b.w = 165;
                b.h = 140;
                return;
            }
            measurer.textContent = b.text || "";
            measurer.style.whiteSpace = "nowrap";
            measurer.style.width = "auto";
            const wNoWrap = measurer.offsetWidth + PAD_W;
            if (wNoWrap <= MAX_W) {
                b.w = Math.max(MIN_W, wNoWrap);
                b.h = 38;
            } else {
                b.w = MAX_W;
                measurer.style.whiteSpace = "normal";
                measurer.style.width = (MAX_W - PAD_W) + "px";
                const h = measurer.offsetHeight + 10;
                b.h = Math.max(46, Math.min(72, h));
            }
        });
        measurer.remove();

        // Non-overlapping random scatter — original GameConnect.frm:435-457
        // retries up to 100,000 times (`If timeOut < 100000`). We add a
        // best-fit-decreasing twist: place the LARGEST boxes first because
        // they're hardest to fit. Once placed, they don't block the smaller
        // boxes that can squeeze into the leftover gaps.
        const FIELD_X0 = 30, FIELD_X1 = 770;
        const FIELD_Y0 = 50, FIELD_Y1 = 555;
        const PAD = 6;
        const order = boxes.slice().sort(function (a, b) {
            return (b.w * b.h) - (a.w * a.h);
        });
        const placed = [];
        order.forEach(function (b) {
            const xRange = (FIELD_X1 - FIELD_X0) - b.w;
            const yRange = (FIELD_Y1 - FIELD_Y0) - b.h;
            let best = null;
            const MAX_TRIES = 100000;
            for (let tries = 0; tries < MAX_TRIES; tries++) {
                const x = FIELD_X0 + Math.random() * Math.max(0, xRange);
                const y = FIELD_Y0 + Math.random() * Math.max(0, yRange);
                let hit = false;
                for (let j = 0; j < placed.length; j++) {
                    const o = placed[j];
                    if (x < o.xk + o.w + PAD &&
                        x + b.w + PAD > o.xk &&
                        y < o.yk + o.h + PAD &&
                        y + b.h + PAD > o.yk) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) { b.xk = x; b.yk = y; best = true; break; }
                if (!best) { b.xk = x; b.yk = y; }
            }
            placed.push(b);
        });
        // Orig LoadSet:459-465 — every box starts at (400-w/2, -100),
        // i.e. dropping from above the screen, and the Timer_Timer
        // spring physics pulls each toward its (Xk, Yk) target.
        // Velocities start at 0 (per LoadSet — no `.Vx = ...`).
        boxes.forEach(function (b) {
            b.x = 400 - b.w / 2;
            b.y = -100;
            b.vx = 0;
            b.vy = 0;
        });

        state.selected = null;
        state.matched  = {};
        HND.log("connect loadSet", "set#" + game.setNum,
                "ROUND=" + ROUND, "pool left=" + game.pool.length);
        render();
    }

    // =====================================================================
    // Physics tick (orig Timer_Timer:617-779 — runs every 100ms).
    // Boxes spring toward (xk, yk) with damping; if hoverId is set,
    // OTHER boxes get inverse-square REPULSED from the hovered box
    // (lines 634-644). Selected/chosen boxes have Fx=Fy=0 so they
    // stay put. Velocity is forced to 0 each tick (orig:652-653) so
    // the motion is critically-damped — boxes snap to target without
    // overshoot, no perpetual oscillation.
    // =====================================================================
    const PHYS = { dt: 0.2, m: 1, k: 6, q: 500000 };
    let tickHandle = null;
    function simTick() {
        const sel = state.hoverId;   // hover, not pick — orig SelectedId
        const ch  = state.selected;  // pick — orig ChosenId
        for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            let Fx = -PHYS.k * (b.x - b.xk);
            let Fy = -PHYS.k * (b.y - b.yk);
            if (sel != null) {
                if (i === sel || i === ch) {
                    Fx = 0; Fy = 0; b.vx = 0; b.vy = 0;
                } else {
                    const o = boxes[sel];
                    const dx = (b.x + b.w / 2) - (o.x + o.w / 2);
                    const dy = (b.y + b.h / 2) - (o.y + o.h / 2);
                    const d2 = dx * dx + dy * dy;
                    if (d2 > 1) {
                        const inv = PHYS.q / Math.pow(d2, 1.5);
                        Fx += inv * dx;
                        Fy += inv * dy;
                    }
                }
            }
            b.x += PHYS.dt * PHYS.dt * Fx / PHYS.m + b.vx * PHYS.dt;
            b.y += PHYS.dt * PHYS.dt * Fy / PHYS.m + b.vy * PHYS.dt;
            b.vx = 0;   // orig:652 — forced zero (critically damped spring)
            b.vy = 0;
            if (b._node) {
                b._node.style.left = b.x + "px";
                b._node.style.top  = b.y + "px";
            }
        }
        // Always tick the rope draw — it handles both visible (selected
        // set) and hide (selected null) paths internally. Without an
        // unconditional call, clearing state.selected wouldn't hide the
        // ball cursor at its last-stuck position.
        if (state.selected != null) {
            state.ropeTiming = (state.ropeTiming + 1) % 50;
        }
        drawWavyRope();
    }
    function startTick() {
        if (tickHandle) return;
        // Original is 100ms. Keep matching.
        tickHandle = setInterval(simTick, 100);
    }
    function stopTick() {
        if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }

    // Wavy rope from ChosenId box to cursor (orig Timer_Timer:725-735).
    //   DisBM = 10 + (dx² + dy²)^0.25 — distance with smoothing offset
    //   numberOfLoops = Int(DisBM) * 1.5 — more segments when far
    //   per-segment offset:
    //     amplitude = 500 / DisBM   (close cursor = wild swing, far = subtle)
    //     phase     = ropeTiming * 2π / 50
    //     ox = amp * sin(i/N * π) * cos(phase)
    //     oy = amp * sin(i/N * π) * sin(phase)
    // We render this as a single SVG polyline with computed points.
    function drawWavyRope() {
        const line = state._liveRope;
        if (!line) return;
        if (state.selected == null || !state.mouseInside) {
            line.setAttribute("points", "");
            line.setAttribute("opacity", "0");
            updateBallCursor(false);
            return;
        }
        const b = boxes[state.selected];
        const bx = b.x + b.w / 2, by = b.y + b.h / 2;
        const dx = state.mouseX - bx, dy = state.mouseY - by;
        const DisBM = 10 + Math.pow(dx * dx + dy * dy, 0.25);
        const N = Math.max(4, Math.floor(DisBM * 1.5));
        const amp = 500 / DisBM;
        const phase = state.ropeTiming * (2 * Math.PI) / 50;
        const cosP = Math.cos(phase), sinP = Math.sin(phase);
        const pts = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const baseX = bx + dx * t;
            const baseY = by + dy * t;
            const offX = amp * Math.sin(t * Math.PI) * cosP;
            const offY = amp * Math.sin(t * Math.PI) * sinP;
            pts.push((baseX + offX).toFixed(1) + "," + (baseY + offY).toFixed(1));
        }
        line.setAttribute("points", pts.join(" "));
        line.setAttribute("opacity", "0.85");
        updateBallCursor(true);
    }

    function updateBallCursor(visible) {
        let ball = root.querySelector(".connect-ball");
        if (!visible) {
            if (ball) ball.style.opacity = "0";
            return;
        }
        if (!ball) {
            ball = HND._el("div", { class: "ctrl connect-ball" });
            root.appendChild(ball);
        }
        ball.style.left = (state.mouseX - 12) + "px";
        ball.style.top  = (state.mouseY - 12) + "px";
        ball.style.opacity = "1";
    }

    function render() {
        root.innerHTML = "";

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", "ctrl connect-ropes");
        svg.setAttribute("viewBox", "0 0 800 600");
        svg.style.cssText = "left:0;top:0;width:800px;height:600px;pointer-events:none;";
        root.appendChild(svg);

        // Live wavy rope from ChosenId box to cursor (orig Timer_Timer:
        // 725-735 — the ONLY rope the original draws). drawWavyRope()
        // updates points each tick based on ropeTiming.
        const liveRope = document.createElementNS(svgNS, "polyline");
        liveRope.setAttribute("class", "connect-rope-live");
        liveRope.setAttribute("fill", "none");
        liveRope.setAttribute("stroke", "#ffe19a");
        liveRope.setAttribute("stroke-width", "3");
        liveRope.setAttribute("stroke-linecap", "round");
        liveRope.setAttribute("opacity", "0");
        svg.appendChild(liveRope);
        state._liveRope = liveRope;

        boxes.forEach(function (b, i) {
            let cls = "ctrl connect-box"
                + (b.kind === "A" ? " kind-a" : " kind-q")
                + (state.matched[b.pairId] ? " done" : "")
                + (state.selected === i ? " sel" : "")
                + (b.isPic ? " pic" : "");
            let style = "left:" + b.x + "px; top:" + b.y + "px;" +
                        "width:" + b.w + "px; height:" + b.h + "px;";
            if (b.isPic) {
                style += "background-image:url('" + pictureUrl(b.origIdx) + "');";
            }
            const node = HND._el("div", {
                class: cls,
                style: style,
                text: b.isPic ? "" : b.text,
                onclick: function () { onPick(i, node); },
                onmouseenter: function () { state.hoverId = i; },
                onmouseleave: function () { if (state.hoverId === i) state.hoverId = null; },
            });
            if (b.isPic) {
                const cap = HND._el("span", { class: "connect-box-cap", text: b.text });
                node.appendChild(cap);
            }
            root.appendChild(node);
            b._node = node;   // keep ref so simTick can update style.left/top
        });

        // Per-Q score-row stars at y=545 (orig Timer_Timer:661-687).
        // Alternates right-side / left-side; each star's frame =
        // 4 - errorCount (capped 1..4). Unanswered Qs show frame 1
        // (seed star). origIdxs we've fully processed go in order.
        const starRow = HND._el("div", { class: "ctrl connect-score-row" });
        const totalSelected = (game.totalPairs - game.pool.length);
        let right = false, slot = 0;
        for (let n = 0; n < totalSelected; n++) {
            // Has this origIdx been answered (any set, any round)?
            // game.errorsByItem holds buckets per origIdx after each set
            // completes. For the CURRENT set's matched items, derive
            // bucket from boxes' errorCount.
            let bucket = null;
            const matchedInSetIdx = boxes.findIndex(function (b) {
                return b.kind === "Q" && state.matched[b.pairId]
                       && (game.totalPairs - game.pool.length - (ROUND - n - 1)) >= 0;
            });
            // Simpler: iterate finished origIdxs in order they were answered
            // (we don't track full history — use bucketByOrder if present).
            // Fallback: derive from game.errorsByItem if available.
            const seenOrigIdx = game.starOrder ? game.starOrder[n] : null;
            if (seenOrigIdx != null && game.errorsByItem.hasOwnProperty(seenOrigIdx)) {
                bucket = game.errorsByItem[seenOrigIdx];
            }
            // Frame: bucket 0 → 4 (perfect bloom); 1 → 3; 2 → 2; else 1 (seed)
            // Orig `Int(aniState/2)` would index frame 4 for perfect
            // but star atlas only ships 0..3 — clamp to 3 (visible
            // bright frame instead of orig's silent no-op).
            const frame = bucket == null ? 0
                        : bucket === 0 ? 3
                        : bucket === 1 ? 2 : 1;
            const x = right ? (730 - slot * 15) : (20 + slot * 15);
            if (right) slot++;
            right = !right;
            const star = HND._el("div", {
                class: "ctrl connect-qstar frame-" + frame,
                style: "left:" + x + "px; top:545px;",
            });
            starRow.appendChild(star);
        }
        root.appendChild(starRow);
    }

    // Track cursor in stage-px so the physics tick can draw the wavy
    // rope + ball cursor. Mapping (clientX,Y) → (0..800, 0..600) via
    // the .stage element's bounding rect (it may be scaled by CSS).
    root.onmousemove = function (ev) {
        const rect = root.getBoundingClientRect();
        const scaleX = rect.width  / 800;
        const scaleY = rect.height / 600;
        state.mouseX = (ev.clientX - rect.left) / (scaleX || 1);
        state.mouseY = (ev.clientY - rect.top)  / (scaleY || 1);
        state.mouseInside = true;
    };
    // When the cursor leaves the stage entirely, hide the ball + rope
    // so they don't get stuck at the edge.
    root.onmouseleave = function () {
        state.mouseInside = false;
        updateBallCursor(false);
        if (state._liveRope) state._liveRope.setAttribute("opacity", "0");
    };

    // Audio chain after a correct match (orig WaveMe_Done:787-810).
    // SECOND-clicked box drives the chain — its OWN side first, then
    // (for mode "7") chain its pair's side. "8"/"9" force literal
    // right/left order regardless of which box was clicked.
    function playMatchAudio(secondBox, firstBox) {
        const secondSide = secondBox.isPic ? null
                         : (secondBox.kind === "Q") ? askSide : ansSide;
        const firstSide  = firstBox.isPic ? null
                         : (firstBox.kind === "Q") ? askSide : ansSide;
        const wave = function (side) {
            return side ? HND.unitWavePath(app.id, unit.id, secondBox.origIdx, side) : null;
        };
        // Orig sequence (Form_MouseUp:532 → WaveMe_Done:787-810):
        //   1. good4.wav plays IMMEDIATELY on match.
        //   2. WaveMe_Done fires when good4 ends → CombineQA chain.
        const playOrSkip = function (url, next) {
            if (!url) { if (next) next(); return; }
            HND.playWave(url, next || null);
        };
        HND.playWave(sharedWave("good4.wav"), function () {
            switch (String(cal.combineQA)) {
                case "7":
                    // Play second-clicked box's wave, then chain pair (first box's wave).
                    playOrSkip(wave(secondSide), function () {
                        // For the chain, play firstBox's wave (same item id,
                        // other side). unitWavePath uses secondBox.origIdx
                        // because both boxes share the same origIdx.
                        playOrSkip(
                            firstSide
                                ? HND.unitWavePath(app.id, unit.id, secondBox.origIdx, firstSide)
                                : null,
                            null);
                    });
                    break;
                case "8":
                    // Literal right → left (orig:799-800).
                    playOrSkip(HND.unitWavePath(app.id, unit.id, secondBox.origIdx, "right"), function () {
                        playOrSkip(HND.unitWavePath(app.id, unit.id, secondBox.origIdx, "left"), null);
                    });
                    break;
                case "9":
                    playOrSkip(HND.unitWavePath(app.id, unit.id, secondBox.origIdx, "left"), function () {
                        playOrSkip(HND.unitWavePath(app.id, unit.id, secondBox.origIdx, "right"), null);
                    });
                    break;
                case "0":
                default:
                    // Just the second-clicked box's own wave (orig:807).
                    playOrSkip(wave(secondSide), null);
                    break;
            }
        });
    }

    function onPick(i, node) {
        const b = boxes[i];
        if (state.matched[b.pairId]) return;
        if (state.selected === null) {
            state.selected = i;
            HND.log("connect pick", "kind=" + b.kind, "pair=" + b.pairId);
            // Orig BoxClick:497 — plays the clicked box's OWN side wave
            // (Q box → askSide audio, A box → ansSide audio). Picture
            // boxes have no wave so skip silently.
            if (!b.isPic) {
                const pickSide = (b.kind === "Q") ? askSide : ansSide;
                if (pickSide) {
                    HND.playWave(HND.unitWavePath(app.id, unit.id, b.origIdx, pickSide));
                }
            }
            render();
            // The wavy rope draws each physics tick (simTick → drawWavyRope).
            return;
        }
        const prev = boxes[state.selected];
        if (state.selected === i) { state.selected = null; render(); return; }
        if (prev.pairId === b.pairId && prev.kind !== b.kind) {
            state.matched[b.pairId] = true;
            HND.log("connect CORRECT", "pair=" + b.pairId,
                    "set done=" + (Object.keys(state.matched).length) + "/" + ROUND);
            state.selected = null;
            // Track per-Q bucket immediately so the score-row star
            // animates when matched (orig Timer_Timer:675-686 has the
            // aniState ramp up from 0). Use the Q-box's errorCount.
            const qBox = boxes.find(function (x) {
                return x.pairId === b.pairId && x.kind === "Q";
            });
            const errs = (qBox || prev).errorCount;
            const bucket = errs === 0 ? 0 : errs <= 2 ? 1 : 2;
            game.errorsByItem[b.origIdx] = bucket;
            game.starOrder.push(b.origIdx);
            // Match-to-bottom: matched boxes fly to bottom-center stack
            // (orig Form_MouseUp:518-526). Already-matched boxes get
            // pushed off-screen so the new pair has room.
            boxes.forEach(function (other) {
                if (state.matched[other.pairId] && other !== b && other !== prev) {
                    other.yk = 640;     // off the bottom
                }
            });
            // ChosenId > QCount-1 → A box was second; flip the X stack.
            const secondIsA = (b.kind === "A");
            if (secondIsA) {
                b.xk    = 400 - b.w;
                prev.xk = 400;
            } else {
                b.xk    = 400;
                prev.xk = 400 - prev.w;
            }
            b.yk    = 600 - b.h;
            prev.yk = 600 - prev.h;
            // good4.wav + CombineQA chain — driven by SECOND-clicked box.
            playMatchAudio(b, prev);
            render();
            if (Object.keys(state.matched).length === ROUND) onSetComplete();
        } else {
            HND.log("connect WRONG", "prev=" + prev.pairId, "now=" + b.pairId);
            prev.errorCount = Math.min(3, prev.errorCount + 1);
            // Orig Form_MouseUp:541 — ra.wav only; no visual feedback.
            HND.playWave(sharedWave("ra.wav"));
            state.selected = null;
            render();
        }
    }

    function onSetComplete() {
        // Roll set's errors into the game-wide total (per-Q buckets +
        // starOrder already pushed in onPick when each match landed).
        boxes.forEach(function (b) {
            if (b.kind !== "Q") return;
            game.totalErrors += b.errorCount;
        });
        if (game.pool.length > 0) {
            setTimeout(function () { loadSet(); }, 1200);
        } else if (!game.completed) {
            setTimeout(function () { finish(); }, 1200);
        }
    }

    function finish() {
        if (game.completed) return;
        game.completed = true;
        // Per .frm WinGame: gameScore = 100 - sum(errorCount * 15 / starCount).
        const starCount = game.totalPairs;
        const score = Math.max(0, Math.round(
            100 - (game.totalErrors * 15 / starCount)));
        HND.log("connect FINISH",
                "score=" + score,
                "errors=" + game.totalErrors,
                "sets=" + game.setNum);

        const errorsByQ = items.map(function (_, idx) {
            return game.errorsByItem.hasOwnProperty(idx)
                ? game.errorsByItem[idx] : 0;
        });
        HND.saveProgress(app.id, unit.id, "connect", score, errorsByQ);
        runWinAnimation(score, errorsByQ);
        if (onComplete) onComplete(score);
    }

    // Win animation port (orig WinTimer_Timer:826-963 — runs every
    // 100ms in two phases):
    //   PHASE 1 (winT 0..26): one big star per matched Q rises from
    //     the bottom row toward a random scatter target with gravity-
    //     -dominated physics (Fy=15, no Fx spring); score counts up
    //     from 0 to gameScore via font-size animation.
    //   PHASE 2 (winT 26): "explode!!!" — spawn smallStars from each
    //     star, falling with Fy=35 and bouncing off the bottom edge,
    //     wrapping at left/right. Plays Score_<bucket>.WAV.
    //   PHASE 3 (winT >= 27): smallStars keep flying, big score and
    //     AllTips(124..128) praise text display.
    // We compress to ~3.5s before transitioning to the standard
    // showScoreForm overlay (Score_X.wav already plays from there).
    function runWinAnimation(score, errorsByQ) {
        // Kill physics tick first — boxes shouldn't repel anymore.
        stopTick();
        // Hide the boxes + ropes (they're now-irrelevant).
        const fade = root.querySelectorAll(".connect-box, .connect-rope-live, .connect-ball, .connect-tip");
        fade.forEach(function (el) { el.style.opacity = "0"; el.style.transition = "opacity 0.3s"; });

        const winLayer = HND._el("div", { class: "ctrl connect-win-layer" });
        root.appendChild(winLayer);
        const scoreEl = HND._el("div", { class: "ctrl connect-win-score" });
        winLayer.appendChild(scoreEl);
        const praiseEl = HND._el("div", { class: "ctrl connect-win-praise" });
        winLayer.appendChild(praiseEl);

        // Spawn one big star per Q in the orig score-row position.
        // Each has its OWN errors bucket so the frame index reflects
        // perfection (frame 4 = full bloom, 1 = withered).
        const stars = [];
        let right = false, slot = 0;
        errorsByQ.forEach(function (errBucket) {
            const x = right ? (730 - slot * 15) : (20 + slot * 15);
            if (right) slot++;
            right = !right;
            // Star atlas ships 0..3 only (see preload comment).
            const frame = errBucket === 0 ? 3
                        : errBucket === 1 ? 2 : 1;
            const star = HND._el("div", {
                class: "ctrl connect-bigstar frame-" + frame,
                style: "left:" + (x - 12) + "px; top:" + (545 - 12) + "px;",
            });
            // Random scatter target so each star arcs to a different spot.
            stars.push({
                el: star, x: x, y: 545,
                xk: 100 + Math.random() * 600, yk: 50,
                vx: 0, vy: -150 + Math.random() * 50,
                bucket: errBucket,
            });
            winLayer.appendChild(star);
        });

        let winT = 0;
        const winInterval = setInterval(function () {
            // Phase 1: stars arc upward + scoreEl counts up.
            if (winT < 27) {
                const Dt = 0.2, m = 1, k = 6;
                stars.forEach(function (s) {
                    const Fx = -k * (s.x - s.xk);
                    const Fy = 15;            // gravity (orig:837)
                    s.x += Dt * Dt * Fx / m + s.vx * Dt;
                    s.y += Dt * Dt * Fy / m + s.vy * Dt;
                    s.vx = (Dt * Fx / m + s.vx) / 1.3;   // orig damping (line 844)
                    s.vy = Dt * Fy / m + s.vy;
                    s.el.style.left = (s.x - 12) + "px";
                    s.el.style.top  = (s.y - 12) + "px";
                });
                const displayed = Math.floor(winT * score / 27);
                scoreEl.textContent = String(displayed);
                scoreEl.style.fontSize = (winT * 3 + 1) + "pt";
                const c = winT * 8;
                scoreEl.style.color = "rgb(" + Math.min(c, 230) + "," +
                                      Math.min(c, 230) + "," +
                                      Math.min(c + 20, 254) + ")";
            }
            // Phase 2 transition: explode + show full score
            if (winT === 26) {
                explodeSmallStars(winLayer, stars);
                playScoreBucketSound(score);
                scoreEl.style.fontSize = "100pt";
                scoreEl.textContent = String(score);
                scoreEl.style.color = "rgb(230,230,254)";
                praiseEl.textContent = bucketPraise(score);
            }
            winT++;
            // Orig WinTimer:960 — `If winT > 500 Then CmdExit_Click`.
            // After 50s (500 ticks × 100ms), auto-exit back to the
            // game menu. Otherwise the animation just keeps looping
            // (small stars bouncing forever) until the user hits the
            // outer Exit button. Faithful to original UX.
            if (winT > 500) {
                clearInterval(winInterval);
                location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
            }
        }, 100);
    }

    function explodeSmallStars(layer, fromStars) {
        // Orig WinTimer:915-934 — for each star, spawn (4-ErrorCount)
        // smallStars at the same position with random Vx/Vy. They
        // bounce off the bottom (Vy = -Rnd*150) and wrap at sides.
        const pieces = [];
        fromStars.forEach(function (src) {
            const count = Math.max(1, 5 - (src.bucket === 0 ? 0 : src.bucket === 1 ? 1 : 3));
            for (let n = 0; n < count; n++) {
                const piece = HND._el("div", {
                    class: "ctrl connect-smallstar frame-" + Math.floor(Math.random() * 4),
                });
                pieces.push({
                    el: piece, x: src.x, y: src.y,
                    vx: Math.random() * 500 - 500,
                    vy: -(Math.random() * 100 + 30),
                });
                layer.appendChild(piece);
            }
        });
        const Dt = 0.2, m = 1, Fy = 35;
        const bounce = setInterval(function () {
            pieces.forEach(function (p) {
                p.x += Dt * Dt * 0 / m + p.vx * Dt;
                p.y += Dt * Dt * Fy / m + p.vy * Dt;
                p.vy = Dt * Fy / m + p.vy;
                if (p.y > 580) {
                    p.vy = -Math.random() * 250 - 80;
                    p.vx = -Math.random() * 100 + 50;
                }
                if (p.x < 0 || p.x > 775) p.vx = -p.vx;
                if (p.y < 0) p.vy = -p.vy;
                p.el.style.left = p.x + "px";
                p.el.style.top  = p.y + "px";
            });
        }, 100);
        // Clean up after the animation finishes.
        setTimeout(function () {
            clearInterval(bounce);
            pieces.forEach(function (p) { p.el.remove(); });
        }, 3000);
    }

    function bucketPraise(score) {
        // Orig WinTimer:938-954 — AllTips(124..128) per score bucket.
        if (score < 60)      return "נסה שוב";
        if (score < 70)      return "המשך כך";
        if (score < 80)      return "יפה מאוד";
        if (score < 90)      return "מצוין";
        return "מושלם";
    }

    function playScoreBucketSound(score) {
        // Orig WinTimer:938-954 — Score_<bucket>.WAV (also played by
        // HND.showScoreForm; trigger ours here for the explosion beat).
        const bucket = score < 60 ? 0
                     : score < 70 ? 60
                     : score < 80 ? 70
                     : score < 90 ? 80 : 90;
        HND.playWave(sharedWave("score_" + bucket + ".wav"));
    }

    // Instructions overlay + game8.wav (orig Form_Paint:562 +
    // CmdHelp_Click:237-242). showTip = 30 frames in original (~3s
    // at 100ms/frame) — we use a 4s setTimeout. Plays game8.wav
    // (Connect's help wave); falls back silently if missing.
    let tipEl = null;
    function showHelpOverlay() {
        const text = (cal.instructionsFliped && window.HND_QASwitched)
                   ? cal.instructionsFliped : cal.instructions;
        if (!tipEl) {
            tipEl = HND._el("div", { class: "ctrl connect-tip" });
            root.appendChild(tipEl);
        }
        if (text && text !== "0") {
            tipEl.textContent = text;
            tipEl.style.display = "block";
            setTimeout(function () { if (tipEl) tipEl.style.display = "none"; }, 4000);
        }
        HND.playWave(sharedWave("game8.wav"));
    }

    // CmdExit two-step replay (orig CmdExit_Click:222-231). First exit
    // click reveals replay; second exit-click actually exits.
    let replayBtn = null;
    function showReplayButton() {
        if (replayBtn) return;
        replayBtn = HND._el("button", {
            class: "ctrl connect-replay",
            title: "התחל מחדש",
        });
        replayBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            location.hash = "#/" + app.id + "/unit/" + unit.id + "/connect";
        });
        root.appendChild(replayBtn);
    }

    // Hook outer nav buttons. F1 → instruction overlay + game8.wav;
    // exit → two-step replay reveal.
    if (root.parentElement) {
        const helpBtn = root.parentElement.querySelector(".help-icon");
        if (helpBtn) {
            const cloneIt = helpBtn.cloneNode(true);
            helpBtn.parentNode.replaceChild(cloneIt, helpBtn);
            cloneIt.addEventListener("click", function (e) {
                e.stopPropagation();
                showHelpOverlay();
            });
        }
        const exitBtn = root.parentElement.querySelector(".exit-icon");
        if (exitBtn) {
            // Clone wipes app.js's exit handler — we re-implement orig
            // CmdExit_Click:222-231 two-step here:
            //   1st click: surface CmdRePlay button.
            //   2nd click (replay already visible): exit back to menu.
            const cloneIt = exitBtn.cloneNode(true);
            exitBtn.parentNode.replaceChild(cloneIt, exitBtn);
            cloneIt.addEventListener("click", function (e) {
                e.stopPropagation();
                if (!replayBtn) {
                    showReplayButton();
                } else {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                }
            });
        }
    }

    // F1 / F12 cheat keys (orig Form_KeyUp:251-263). F12 forces win.
    function keyHandler(e) {
        if (game.completed) {
            document.removeEventListener("keydown", keyHandler);
            return;
        }
        if (e.key === "F1") { e.preventDefault(); showHelpOverlay(); return; }
        if (e.key === "F12") { e.preventDefault(); finish(); return; }
    }
    document.addEventListener("keydown", keyHandler);

    // Teardown on game leave — also kills the physics tick + any
    // running win-animation interval (matches haklada/american pattern).
    let teardownObs = null;
    if (root.parentElement && root.parentElement.parentElement) {
        teardownObs = new MutationObserver(function () {
            if (!root.isConnected) {
                stopTick();
                document.removeEventListener("keydown", keyHandler);
                if (teardownObs) teardownObs.disconnect();
            }
        });
        teardownObs.observe(root.parentElement.parentElement,
                            { childList: true, subtree: true });
    }

    HND.log("connect start", app.id + "/" + unit.id,
            "items=" + items.length,
            "sets=" + Math.ceil(items.length / MAX_LINES));
    // Show instructions overlay + game8.wav on first paint
    // (orig Form_Paint:562 auto-fires CmdHelp_Click).
    showHelpOverlay();
    loadSet();
    startTick();   // boxes fall from (400, -100) to their scatter target
};
