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
    HND.preloadFrames(app.id, "GameConnect", [
        "box", "box2", "ball", "not",
        "star_0", "star_1", "star_2", "star_3",
        "smallstar_0", "smallstar_1", "smallstar_2", "smallstar_3", "smallstar_4",
    ]);

    // Per-unit calibration (orig CurrentCalibration). Connect's slot is 8.
    // 14/31 Nivim units use CombineQA="8" (right→left audio chain).
    const cal = HND.gameCalibrationFromSlot(unit, app.id, 8);
    const leftCol  = cal.askCol;     // "Q" box text — orig WhatToAsk side
    const rightCol = cal.ansCol;     // "A" box text — orig WhatToAnswer side
    const askSide  = cal.askSide;
    const ansSide  = cal.ansSide;
    const MAX_LINES = 8;

    // Game-wide state — honor IfRandom (orig PlayGame).
    const rawPool = items.map(function (_, i) { return i; });
    const pool = cal.ifRandom ? HND._shuffle(rawPool) : rawPool;
    const game = {
        pool: pool,                      // indices still waiting for a set
        totalPairs: pool.length,         // matches starCount in WinGame
        totalErrors: 0,                  // sum of Q-box errorCount across sets
        errorsByItem: {},                // origIdx → 0/1/2 bucket for score-form
        setNum: 0,
        completed: false,
    };

    // Per-set state (rebuilt each LoadSet).
    let boxes = [];
    let picks = [];
    let ROUND = 0;
    const state = { selected: null, matched: {} };

    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}

    function loadSet() {
        game.setNum++;
        const take = Math.min(game.pool.length, MAX_LINES);
        picks = game.pool.slice(0, take);
        game.pool = game.pool.slice(take);
        ROUND = picks.length;

        boxes = [];
        picks.forEach(function (origIdx, i) {
            boxes.push({ pairId: i, kind: "Q", origIdx: origIdx,
                         text: items[origIdx][leftCol]  || "",
                         errorCount: 0 });
        });
        picks.forEach(function (origIdx, i) {
            boxes.push({ pairId: i, kind: "A", origIdx: origIdx,
                         text: items[origIdx][rightCol] || "",
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
            measurer.textContent = b.text || "";
            measurer.style.whiteSpace = "nowrap";
            measurer.style.width = "auto";
            const wNoWrap = measurer.offsetWidth + PAD_W;
            if (wNoWrap <= MAX_W) {
                b.w = Math.max(MIN_W, wNoWrap);
                b.h = 38;
            } else {
                // Two-line wrap at MAX_W.
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
                    if (x < o.x + o.w + PAD &&
                        x + b.w + PAD > o.x &&
                        y < o.y + o.h + PAD &&
                        y + b.h + PAD > o.y) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) { b.x = x; b.y = y; best = true; break; }
                if (!best) { b.x = x; b.y = y; }   // fallback: last random
            }
            placed.push(b);
        });

        state.selected = null;
        state.matched  = {};
        HND.log("connect loadSet", "set#" + game.setNum,
                "ROUND=" + ROUND, "pool left=" + game.pool.length);
        render();
    }

    function render() {
        root.innerHTML = "";

        const setsTotal = Math.ceil(game.totalPairs / MAX_LINES);
        root.appendChild(HND._el("div", {
            class: "ctrl connect-header",
            text: unit.name
                  + (userName ? "  ·  " + userName : "")
                  + "   (סבב " + game.setNum + "/" + setsTotal + ")",
        }));

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", "ctrl connect-ropes");
        svg.setAttribute("viewBox", "0 0 800 600");
        svg.style.cssText = "left:0;top:0;width:800px;height:600px;pointer-events:none;";
        root.appendChild(svg);

        // Live cursor rope (visible only while a box is selected). Mirrors
        // the not.bmp segments the original tiles from box center to cursor.
        const liveRope = document.createElementNS(svgNS, "line");
        liveRope.setAttribute("class", "connect-rope-live");
        liveRope.setAttribute("stroke", "#ffe19a");
        liveRope.setAttribute("stroke-width", "3");
        liveRope.setAttribute("stroke-dasharray", "5 4");
        liveRope.setAttribute("opacity", "0");
        svg.appendChild(liveRope);
        state._liveRope = liveRope;

        Object.keys(state.matched).forEach(function (pairIdStr) {
            const pid = parseInt(pairIdStr, 10);
            const q = boxes.find(function (b) { return b.pairId === pid && b.kind === "Q"; });
            const a = boxes.find(function (b) { return b.pairId === pid && b.kind === "A"; });
            const line = document.createElementNS(svgNS, "line");
            line.setAttribute("x1", q.x + q.w / 2);
            line.setAttribute("y1", q.y + q.h / 2);
            line.setAttribute("x2", a.x + a.w / 2);
            line.setAttribute("y2", a.y + a.h / 2);
            line.setAttribute("stroke", "#d8b07a");
            line.setAttribute("stroke-width", "4");
            line.setAttribute("stroke-dasharray", "6 3");
            line.setAttribute("opacity", "0.85");
            svg.appendChild(line);
        });

        boxes.forEach(function (b, i) {
            const node = HND._el("div", {
                class: "ctrl connect-box"
                       + (b.kind === "A" ? " kind-a" : " kind-q")
                       + (state.matched[b.pairId] ? " done" : "")
                       + (state.selected === i ? " sel" : ""),
                style: "left:" + b.x + "px; top:" + b.y + "px;" +
                       "width:" + b.w + "px; height:" + b.h + "px;",
                text: b.text,
                onclick: function () { onPick(i, node); },
            });
            root.appendChild(node);
        });

        const doneInSet = Object.keys(state.matched).length;
        const doneTotal = game.totalPairs - game.pool.length - (ROUND - doneInSet);
        root.appendChild(HND._el("div", {
            class: "ctrl connect-status" + (doneInSet === ROUND ? " done" : ""),
            text: "חבר את הביטוי לפתרון — "
                  + doneTotal + " מתוך " + game.totalPairs,
        }));
    }

    function spawnStars(boxA, boxB) {
        const cx = (boxA.x + boxA.w / 2 + boxB.x + boxB.w / 2) / 2;
        const cy = (boxA.y + boxA.h / 2 + boxB.y + boxB.h / 2) / 2;
        for (let n = 0; n < 7; n++) {
            const star = HND._el("div", { class: "ctrl connect-star" });
            const angle = (n / 7) * Math.PI * 2;
            const dist  = 30 + Math.random() * 40;
            star.style.cssText =
                "left:" + (cx - 12) + "px;top:" + (cy - 12) + "px;" +
                "--dx:" + Math.cos(angle) * dist + "px;" +
                "--dy:" + Math.sin(angle) * dist + "px;";
            root.appendChild(star);
            setTimeout(function () { star.remove(); }, 900);
        }
    }

    function updateLiveRope(stageX, stageY) {
        const line = state._liveRope;
        if (!line) return;
        if (state.selected === null) {
            line.setAttribute("opacity", "0");
            return;
        }
        const sel = boxes[state.selected];
        line.setAttribute("x1", sel.x + sel.w / 2);
        line.setAttribute("y1", sel.y + sel.h / 2);
        line.setAttribute("x2", stageX);
        line.setAttribute("y2", stageY);
        line.setAttribute("opacity", "0.85");
    }
    // Stage-wide mousemove updates the live rope while a pick is pending.
    // root is the .stage div; its bounding rect maps client coords → stage px.
    root.onmousemove = function (ev) {
        if (state.selected === null) return;
        const rect = root.getBoundingClientRect();
        const scaleX = rect.width  / 800;
        const scaleY = rect.height / 600;
        const sx = (ev.clientX - rect.left) / (scaleX || 1);
        const sy = (ev.clientY - rect.top)  / (scaleY || 1);
        updateLiveRope(sx, sy);
    };

    function onPick(i, node) {
        const b = boxes[i];
        if (state.matched[b.pairId]) return;
        if (state.selected === null) {
            state.selected = i;
            HND.log("connect pick", "kind=" + b.kind, "pair=" + b.pairId);
            // Selecting a box plays the OPPOSITE side's audio so the user
            // can identify what to match (orig BoxClick:497 plays the
            // selected box's `.wave` field, which is the opposite-side wave).
            const pickSide = (b.kind === "Q") ? ansSide : askSide;
            HND.playWave(HND.unitWavePath(app.id, unit.id, b.origIdx, pickSide));
            render();
            updateLiveRope(b.x + b.w / 2, b.y + b.h / 2);
            return;
        }
        const prev = boxes[state.selected];
        if (state.selected === i) { state.selected = null; render(); return; }
        if (prev.pairId === b.pairId && prev.kind !== b.kind) {
            state.matched[b.pairId] = true;
            HND.log("connect CORRECT", "pair=" + b.pairId,
                    "set done=" + (Object.keys(state.matched).length) + "/" + ROUND);
            state.selected = null;
            // On correct match, orig WaveMe_Done:787-810 dispatches by
            // CombineQA — "0" plays just one side, "7"/"8"/"9" chain.
            HND.playCombineFromCal(app.id, unit.id, b.origIdx, cal);
            spawnStars(prev, b);
            render();
            if (Object.keys(state.matched).length === ROUND) onSetComplete();
        } else {
            HND.log("connect WRONG", "prev=" + prev.pairId, "now=" + b.pairId);
            prev.errorCount = Math.min(3, prev.errorCount + 1);
            node.classList.add("wrong");
            const prevNode = root.querySelectorAll(".connect-box")[state.selected];
            if (prevNode) prevNode.classList.add("wrong");
            state.selected = null;
            setTimeout(function () { render(); }, 400);
        }
    }

    function onSetComplete() {
        // Roll set's errors + per-item buckets into the game totals BEFORE
        // boxes get wiped by the next loadSet().
        boxes.forEach(function (b) {
            if (b.kind !== "Q") return;
            game.totalErrors += b.errorCount;
            const bucket = b.errorCount === 0 ? 0 : b.errorCount <= 2 ? 1 : 2;
            game.errorsByItem[b.origIdx] = bucket;
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

        // errorsByQ in original-pool order (so score-form flowers line up
        // with the canonical question list).
        const errorsByQ = items.map(function (_, idx) {
            return game.errorsByItem.hasOwnProperty(idx)
                ? game.errorsByItem[idx] : 0;
        });
        HND.saveProgress(app.id, unit.id, "connect", score, errorsByQ);
        burstWinStars();
        const stage = root.parentElement;
        setTimeout(function () {
            HND.showScoreForm(
                stage, app.id, unit.name, userName, score, errorsByQ,
                function onExit() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                },
                function onReplay() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/connect";
                }
            );
        }, 1200);
        if (onComplete) onComplete(score);
    }

    function burstWinStars() {
        for (let i = 0; i < 12; i++) {
            const star = HND._el("div", { class: "ctrl connect-bigstar" });
            const startX = (i % 2 === 0 ? 730 - (i / 2) * 15 : 20 + ((i - 1) / 2) * 15);
            const targetX = 100 + Math.random() * 600;
            star.style.cssText =
                "left:" + startX + "px; top:545px;" +
                "--tx:" + (targetX - startX) + "px;" +
                "--ty:-450px;";
            root.appendChild(star);
            setTimeout(function () { star.remove(); }, 1800);
        }
    }

    HND.log("connect start", app.id + "/" + unit.id,
            "items=" + items.length,
            "sets=" + Math.ceil(items.length / MAX_LINES));
    loadSet();
};
