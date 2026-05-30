// Match / Hatama — full port of GameHatama.frm.
//
//   Geometry (all from .frm, twips/15):
//     LinesIn = 9, Corner.Left = 60, Corner.Top = 110, Corner.Bottom = 42,
//     FullLinePic.Width = 660, LeftLinePic.Width = 40,
//     Corner.Right = Middle * FullLinePic.Width / 100 (Middle defaults 50 → 330).
//
//   Each row uses three sprites sliced by LinePicOrder (0..9) at 43px/row:
//     linesfull.png  — 660x430 (full paper strip)
//     linesleft.png  — 40x430  (ragged right edge of LEFT paper)
//     linesright.png — 40x430  (ragged left edge of RIGHT paper)
//
//   States (RTL = SideToAsk=qRight):
//     NotAnswered: only RIGHT paper visible (X=317→660 within row),
//                  RightLinePic at X=317, ask text drawn over the right paper.
//     InFocus:     both papers visible with small offset (CurrX=3) — gap.
//                  Both texts drawn (left + right).
//     Answered:    both papers visible with negative offset (CurrX=-6) so
//                  they overlap into ONE strip — color-tinted green.
//
//   Flow:  WaveStatus = 1 → NextQuestion (random unanswered, plays its
//          WhatToAnswer-side wave). User clicks matching row. If correct →
//          row → Answered, play praise sound, then NextQuestion.
//
//   Goat at (715,108) — goatlook<CurrentFocus>.png + good/win cycles.
//   Penalty number (red) at (740,350).
//   Flowers grow on left climbing stem at Y = 485 - 390/QCount*i,
//   X from FloweX.txt (3 species × ~10 frames).
window.HND = window.HND || {};

// FloweX.txt — pairs of (yMax, X) lookup along the climbing stem.
// FlowerX(i) = X-24+rand(0,2) for the Y range containing Y(i).
const HATAMA_FLOWER_XY = [
    [0,   36], [125, 36], [261, 34], [324, 30],
    [373, 28], [431, 28], [476, 35], [522, 38],
];
function hatamaFlowerX(yPx) {
    for (let i = 1; i < HATAMA_FLOWER_XY.length; i++) {
        if (yPx > HATAMA_FLOWER_XY[i-1][0] && yPx < HATAMA_FLOWER_XY[i][0]) {
            return HATAMA_FLOWER_XY[i][1] - 24 + Math.random() * 2;
        }
    }
    return HATAMA_FLOWER_XY[0][1] - 24;
}

HND.startMatch = function (root, app, unit, onComplete) {
    const cols  = (unit.data && unit.data.columns) || [];
    const items = (unit.data && unit.data.items)  || [];
    if (!items.length || cols.length < 2) {
        root.innerHTML = '<div class="error">אין נתוני התאמה ביחידה זו.</div>';
        return;
    }
    // Hebrew layout: WhatToAsk = qRight (the visible question text on the
    // right paper). WhatToAnswer = qLeft (audio side, the "translation").
    const askCol = cols[2] || cols[0];
    const ansCol = cols[1] || cols[0];

    const LINES_IN = 9;
    const QCount   = Math.min(items.length, LINES_IN);
    // IdOrder[]: random shuffled item indices, length QCount.
    const idOrder = HND._shuffle(items.map(function (_, i) { return i; })).slice(0, QCount);
    // LinePicOrder[]: which sprite-sheet row (0..9) each line uses.
    const linePicOrder = (function () {
        const arr = [];
        const taken = {};
        for (let i = 0; i < QCount; i++) {
            let p;
            do { p = Math.floor(Math.random() * 10); } while (taken[p]);
            taken[p] = true; arr.push(p);
            if (Object.keys(taken).length >= 8) { taken.__rst = 1; for (const k in taken) delete taken[k]; }
        }
        return arr;
    })();

    const state = {
        idStatus: new Array(QCount).fill("notAnswered"),
        qId: -1,            // current question index
        currentFocus: -1,   // current hovered/clicked row
        qAnswered: 0,
        errorCount: 0,
        penalty: 0,
        errorsPerQ: new Array(QCount).fill(0),
        gameEnabled: false,
        completed: false,
    };
    HND.log("match start", app.id + "/" + unit.id, "rows=" + QCount);

    // Pre-load all sprite-sheet frames so background-image swaps don't
    // flicker the first time each frame is needed. The row-paper composition
    // (linesfull/left/right) is critical — they appear at frame 1 of every
    // game so the user MUST see them decoded before buildLines() paints.
    const matchPreload = (function preloadMatchSprites() {
        const names = ["back", "linesleft", "linesright", "linesfull", "goatlook"];
        for (let i = 0; i <= 9; i++) names.push("goatlook" + i);
        for (let i = 0; i <= 6; i++) names.push("goatenter" + i);
        for (let i = 0; i <= 8; i++) names.push("goatgood_1_" + i);
        for (let i = 0; i <= 24; i++) names.push("goatwin" + i);
        for (let i = 0; i <= 9; i++) names.push("flower0_" + i);
        for (let i = 0; i <= 9; i++) names.push("flower1_" + i);
        for (let i = 0; i <= 6; i++) names.push("flower2_" + i);
        return HND.preloadFrames(app.id, "GameHatama", names);
    })();

    // Middle (% of paper width where the left/right split sits) is part of
    // each unit's header — TheUnitFile(14) per GamesMoudle.bas:223. Defaults
    // to 50% if missing or non-numeric.
    const unitMiddle = (function () {
        const m = parseInt((unit.data && unit.data.header && unit.data.header[14]) || "50", 10);
        return isNaN(m) ? 50 : m;
    })();
    // Corner.Right in row-local pixels (RePaintLine uses Middle/100 × FullLinePic.Width).
    // Per-row CSS uses --split-x; the four layer offsets (split-13, split-20,
    // split+27, etc.) are computed in CSS calc() from this single var.
    const splitX = Math.round(660 * unitMiddle / 100);

    // Persistent layers — kept across re-renders so CSS animations survive.
    const linesLayer  = HND._el("div", {
        class: "ctrl hat-lines-layer",
        "data-app": app.id,                // selects per-app paper images in CSS
    });
    const flowerLayer = HND._el("div", { class: "ctrl hat-flowers-layer" });
    const goat        = HND._el("div", { class: "ctrl hat-goat" });
    const header      = HND._el("div", { class: "ctrl hat-header" });
    const penaltyBox  = HND._el("div", { class: "ctrl hat-penalty", text: "0" });
    const hintBox     = HND._el("div", { class: "ctrl hat-hint" });
    root.innerHTML = "";
    root.appendChild(flowerLayer);
    root.appendChild(linesLayer);
    root.appendChild(goat);
    root.appendChild(header);
    root.appendChild(penaltyBox);
    root.appendChild(hintBox);

    // Header text: UnitName · UserName.
    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
    header.textContent = unit.name + (userName ? "  ·  " + userName : "");

    // Build the 9 line rows once.
    function buildLines() {
        linesLayer.innerHTML = "";
        for (let i = 0; i < QCount; i++) {
            const top = 110 + i * 42;
            const pic = linePicOrder[i];
            const line = HND._el("div", {
                class: "ctrl hat-line pic-" + pic,
                "data-row": i,
                style: "top:" + top + "px;" +
                       "--split-x:" + splitX + "px;",
                onclick: function () { onLineClick(i); },
                onmouseenter: function () { onLineHover(i); },
            });
            // Layered paper composition (matches RePaintLine slicing):
            // .paper-left / .paper-right use linesfull.png positioned
            //   at the row's slice; .edge-left / .edge-right are the
            //   ragged inner edges from linesleft/right.png.
            // Row composition mirrors RePaintLine (GameHatama.frm:396-451):
            //   • paper-right (full)         → FullLinePic sliced to LinePicOrder[i]
            //   • edge-right (torn left rim) → RightLinePic at x = split-13
            //   • paper-left (full)          → FullLinePic; revealed in InFocus/Answered
            //   • edge-left  (torn right rim of left paper) → LeftLinePic at x = split-17
            // Each is positioned with the same --split-x var and sliced via
            // background-position-y per .pic-N class.
            line.appendChild(HND._el("div", { class: "hat-paper hat-paper-right" }));
            line.appendChild(HND._el("div", { class: "hat-edge hat-edge-right" }));
            line.appendChild(HND._el("div", { class: "hat-paper hat-paper-left" }));
            line.appendChild(HND._el("div", { class: "hat-edge hat-edge-left" }));
            // Two text labels (right = ask, left = answer). The visibility
            // is controlled by .hat-line state classes.
            line.appendChild(HND._el("div", {
                class: "hat-text hat-text-right",
                text: items[idOrder[i]][askCol] || "",
            }));
            line.appendChild(HND._el("div", {
                class: "hat-text hat-text-left",
                text: items[idOrder[i]][ansCol] || "",
            }));
            linesLayer.appendChild(line);
        }
    }
    buildLines();

    // Pre-paint 9 seed flowers along the stem on entry.
    function plantSeedFlowers() {
        for (let i = 0; i < QCount; i++) {
            const y = 485 - 390 / QCount * i;
            const x = hatamaFlowerX(y);
            const seed = HND._el("div", {
                class: "ctrl hat-flower seed",
                style: "left:" + (x - 6) + "px; top:" + (y - 24) + "px;",
                "data-slot": i,
            });
            flowerLayer.appendChild(seed);
        }
    }
    plantSeedFlowers();

    // Grow the flower at sequential index `slotIdx` (= QAnswerd-1 in the
    // original). `errorCount` selects the species — 0=perfect (kind-0),
    // 1-2=ok (kind-1), 3+=withered (kind-2) — matching CheckAnswer's
    // `If ErrorCount = 3 Then FlowerKind = 2 Else FlowerKind = 1` (and
    // FlowerKind=0 default set by NextQuestion when no errors).
    function growFlower(slotIdx, errorCount) {
        const seed = flowerLayer.querySelector('[data-slot="' + slotIdx + '"]');
        if (!seed) return;
        let kind;
        if (errorCount === 0)       kind = 0;
        else if (errorCount <= 2)   kind = 1;
        else                        kind = 2;
        seed.classList.remove("seed");
        seed.classList.add("kind-" + kind, "growing");
    }

    function setLineState(rowIdx, stateName) {
        const line = linesLayer.children[rowIdx];
        if (!line) return;
        line.classList.remove("not-answered", "in-focus", "answered", "wrong-flash");
        line.classList.add(stateName);
    }
    function setGoatPose(pose) {
        // pose: "" (default look) | "f0..f8" (look-at-row) | "cheer" | "win"
        // Don't remove the base "ctrl" / "hat-goat" classes — only the
        // dynamic state classes.
        const KEEP = { ctrl: 1, "hat-goat": 1 };
        Array.from(goat.classList).forEach(function (c) {
            if (!KEEP[c]) goat.classList.remove(c);
        });
        if (pose) goat.classList.add(pose);
    }
    function setGoatLookRow(i) {
        setGoatPose(i >= 0 ? "f" + i : "");
    }

    function showPenalty() {
        penaltyBox.textContent = String(Math.floor(state.penalty));
    }

    function clearHint() { hintBox.textContent = ""; }
    function nextQuestion() {
        clearHint();
        // Pick a random unanswered Q (matches NextQuestion sub).
        const unanswered = [];
        for (let i = 0; i < QCount; i++) {
            if (state.idStatus[i] === "notAnswered") unanswered.push(i);
        }
        if (unanswered.length === 0) { return; }
        state.qId = unanswered[Math.floor(Math.random() * unanswered.length)];
        // Mark "in-focus" on the asked row's index? No — the original
        // marks the FIRST unanswered as the cursor for keyboard nav, not
        // the asked Q itself. We just play the audio for the asked Q.
        HND.log("match ask", "qId=" + state.qId, "origIdx=" + idOrder[state.qId]);
        // Play the answer-side wave for this Q (audio "asks" the user).
        HND.playWave(HND.unitWavePath(app.id, unit.id, idOrder[state.qId], "right"));
        state.gameEnabled = true;
        // Goat looks at the visible cursor — pick first unanswered.
        for (let i = 0; i < QCount; i++) {
            if (state.idStatus[i] === "notAnswered") {
                state.currentFocus = i;
                setGoatLookRow(i);
                break;
            }
        }
    }

    function onLineHover(rowIdx) {
        if (!state.gameEnabled) return;
        if (state.idStatus[rowIdx] !== "notAnswered") return;
        state.currentFocus = rowIdx;
        setGoatLookRow(rowIdx);
    }

    function onLineClick(rowIdx) {
        if (!state.gameEnabled) return;
        if (state.idStatus[rowIdx] === "answered") return;
        state.gameEnabled = false;
        state.currentFocus = rowIdx;
        setGoatLookRow(rowIdx);

        if (rowIdx === state.qId) {
            // Correct — transition NotAnswered → Answered.
            HND.log("match CORRECT", "row=" + rowIdx,
                    "origIdx=" + idOrder[rowIdx],
                    "errors=" + state.errorCount);
            // Briefly show InFocus to animate the join.
            setLineState(rowIdx, "in-focus");
            setTimeout(function () {
                setLineState(rowIdx, "answered");
                state.idStatus[rowIdx] = "answered";
                // Original ErrorsStatus(QId) bucket — 0=perfect, 1=1-2 errors,
                // 2=3+ errors. Stored by question id (= rowIdx on correct).
                const errBucket = state.errorCount === 0 ? 0 :
                                  state.errorCount <= 2 ? 1 : 2;
                state.errorsPerQ[state.qId] = errBucket;
                state.qAnswered++;
                growFlower(state.qAnswered - 1, state.errorCount);
                setGoatPose("cheer");
                setTimeout(function () { setGoatPose(""); }, 800);
                // Chain: play praise (answer) wave, then NextQuestion on done.
                // Matches the original WaveMe_Done Case 2 → 1 flow.
                HND.playWave(
                    HND.unitWavePath(app.id, unit.id, idOrder[rowIdx], "left"),
                    function onPraiseDone() {
                        state.errorCount = 0;
                        if (state.qAnswered >= QCount) {
                            finishGame();
                        } else {
                            nextQuestion();
                        }
                    }
                );
            }, 200);
        } else {
            // Wrong — Penalty += 20/QCount, capped at 60.
            HND.log("match WRONG", "row=" + rowIdx, "expected=" + state.qId);
            state.penalty = Math.min(60, state.penalty + 20 / QCount);
            state.errorCount = Math.min(3, state.errorCount + 1);
            showPenalty();
            const line = linesLayer.children[rowIdx];
            if (line) {
                line.classList.add("wrong-flash");
                setTimeout(function () { line.classList.remove("wrong-flash"); }, 600);
            }
            // After 3 errors, show hint (the answer text).
            if (state.errorCount >= 2) showHint();
            // ErrorCount = 3 → TimerError fires: flash the Q row 8 times
            // (original TimerError_Timer toggles RGB ±15/10/10) and ResetPos
            // (we don't drag boxes, so just lock briefly and re-enable).
            if (state.errorCount >= 3) {
                const qLine = linesLayer.children[state.qId];
                if (qLine) {
                    qLine.classList.add("triple-error-flash");
                    setTimeout(function () {
                        qLine.classList.remove("triple-error-flash");
                    }, 900);
                }
                state.gameEnabled = false;
                setTimeout(function () { state.gameEnabled = true; }, 950);
            } else {
                setTimeout(function () { state.gameEnabled = true; }, 600);
            }
        }
    }

    function showHint() {
        // Original PaintHint reads from WhatToHint (or WhatToAnswer if hint
        // is disabled). It must reveal the *answer side* — never the ask
        // side, which the user already hears. Prefer hint column if a
        // distinct one exists, else fall back to ansCol.
        const it = items[idOrder[state.qId]];
        const hintCol = cols[0] !== askCol && cols[0] !== ansCol ? cols[0] : null;
        const text = (hintCol && it[hintCol]) || it[ansCol] || "";
        hintBox.textContent = "רמז: " + text;
    }

    function finishGame() {
        state.completed = true;
        const score = Math.max(0, 100 - Math.floor(state.penalty));
        HND.log("match FINISH", "score=" + score, "penalty=" + state.penalty);
        setGoatPose("win");
        HND.saveProgress(app.id, unit.id, "match", score);
        // Original WaveMe_Done Case 100 → plays Win.WAV → Case 101 → WinGame.
        // WinGame calls ScoreForm.ShowGameScore. We delay 800ms (matching the
        // praise-wave window) and then show our ScoreForm overlay.
        const stage = root.parentElement;
        let userName = "";
        try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
        setTimeout(function () {
            HND.showScoreForm(
                stage, app.id, unit.name, userName, score, state.errorsPerQ,
                function onExit() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                },
                function onReplay() {
                    // Re-enter the match game.
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/match";
                }
            );
        }, 900);
        if (onComplete) onComplete(score);
    }

    // Initial render: paint all rows in notAnswered state.
    for (let i = 0; i < QCount; i++) setLineState(i, "not-answered");
    showPenalty();
    // Original PlayGame ends with Me.Show 1 and lets WaveMe_Done (after the
    // help-audio plays) trigger the first NextQuestion. The user reaches
    // this game via a click on the GameMenu sign, so audio is already
    // unlocked by the time we get here — call nextQuestion directly.
    nextQuestion();
};
