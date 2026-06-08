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
    // Resolve per-unit calibration (orig CurrentCalibration). Match's
    // slot is 1 (cal-block 1). Teacher units in Hemed+Nivim flip Q/A
    // (19/31 Nivim units use WhatToAsk=qLeft), so don't hardcode.
    const cal = HND.gameCalibrationFromSlot(unit, app.id, 1);
    const askCol  = cal.askCol;
    const ansCol  = cal.ansCol;
    const askSide = cal.askSide;
    const ansSide = cal.ansSide;

    const LINES_IN = 9;
    // Honor calibration QLimit (orig PlayGame:504) capped at LINES_IN.
    const QCount   = Math.min(cal.qLimit > 0 ? cal.qLimit : items.length, LINES_IN);
    // IdOrder[]: shuffled item indices when IfRandom (orig PlayGame:520-528).
    const rawIdxs = items.map(function (_, i) { return i; });
    const idOrder = (cal.ifRandom ? HND._shuffle(rawIdxs) : rawIdxs).slice(0, QCount);
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
    HND.fadeInOnReady(root, matchPreload);

    // Middle (% of paper width where the left/right split sits) is part of
    // each unit's header — TheUnitFile(14) per GamesMoudle.bas:223. Defaults
    // to 50% if missing or non-numeric.
    // Orig PlayGame:184-186: when WhatToAnswer=qRight AND WhatToAsk=qLeft
    // (teacher-flipped Q/A sides) the unit's Middle is mirrored to keep the
    // proportions consistent with the swapped sides.
    let unitMiddle = (function () {
        const m = parseInt((unit.data && unit.data.header && unit.data.header[14]) || "50", 10);
        return isNaN(m) ? 50 : m;
    })();
    if (cal.askSide === "left" && cal.ansSide === "right") {
        unitMiddle = 100 - unitMiddle;
    }
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
    // Original GameHatama.frm:725  FlowerPic(0).MaskB FlowerX(i), 485 - 390/QCount*i, 1
    // — MaskB places the picture's TOP-LEFT at (X, Y); no centering offset.
    function plantSeedFlowers() {
        for (let i = 0; i < QCount; i++) {
            const y = 485 - 390 / QCount * i;
            const x = hatamaFlowerX(y);
            const seed = HND._el("div", {
                class: "ctrl hat-flower seed",
                style: "left:" + x + "px; top:" + y + "px;",
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
    // Goat frame-stack — replaces CSS bg-image keyframes which flashed
    // between sprite swaps. All look (goatlook0..8), cheer (goatgood_1_0..8),
    // and win (goatwin0..24) frames mounted as stacked <img>s; only the
    // current one has opacity:1.
    const GOAT_BASE = "assets/" + app.id + "/pictures/GameHatama/";
    const goatFrameUrls = [];
    const goatFrameMap = { look: [], cheer: [], win: [] };
    for (let i = 0; i <= 8; i++) {
        goatFrameMap.look.push(goatFrameUrls.length);
        goatFrameUrls.push(GOAT_BASE + "goatlook" + i + ".png");
    }
    for (let i = 0; i <= 8; i++) {
        goatFrameMap.cheer.push(goatFrameUrls.length);
        goatFrameUrls.push(GOAT_BASE + "goatgood_1_" + i + ".png");
    }
    // Win cycles even-indexed sprites (orig hatGoatWin keyframes used 0,2,
    // 4,...,24); we mount only those to keep DOM size sane.
    for (let i = 0; i <= 24; i += 2) {
        goatFrameMap.win.push(goatFrameUrls.length);
        goatFrameUrls.push(GOAT_BASE + "goatwin" + i + ".png");
    }
    const goatStack = HND.createFrameStack(goat, goatFrameUrls,
                                           { className: "hat-goat-frame" });
    let goatCycleTimer = null;
    function stopGoatCycle() {
        if (goatCycleTimer) { clearInterval(goatCycleTimer); goatCycleTimer = null; }
    }
    // pose:
    //   ""        — default look (frame 0)
    //   "f0..f8"  — look-at-row variant (static frame N)
    //   "cheer"   — play cheer frames 0..8 once @ 80ms
    //   "win"     — loop win frames 0..12 @ ~150ms
    function setGoatPose(pose) {
        stopGoatCycle();
        if (!pose || pose === "") { goatStack.show(goatFrameMap.look[0]); return; }
        if (/^f([0-8])$/.test(pose)) {
            const n = parseInt(pose.slice(1), 10);
            goatStack.show(goatFrameMap.look[n]);
            return;
        }
        if (pose === "cheer") {
            let i = 0;
            goatStack.show(goatFrameMap.cheer[0]);
            goatCycleTimer = setInterval(function () {
                i++;
                if (i >= goatFrameMap.cheer.length) {
                    stopGoatCycle();
                    goatStack.show(goatFrameMap.look[0]);
                    return;
                }
                goatStack.show(goatFrameMap.cheer[i]);
            }, 80);
            return;
        }
        if (pose === "win") {
            let i = 0;
            goatStack.show(goatFrameMap.win[0]);
            goatCycleTimer = setInterval(function () {
                i = (i + 1) % goatFrameMap.win.length;
                goatStack.show(goatFrameMap.win[i]);
            }, 150);
            return;
        }
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
        // Orig NextQuestion:919 — `If 0 = ErrorForHint Then PaintHint`
        // (hint shown immediately on every Q when calibration is 0).
        if (cal.errorForHint === 0) showHint();
        // Play the WhatToAsk-side wave for this Q (orig CmdSound_Click).
        HND.playWave(HND.unitWavePath(app.id, unit.id, idOrder[state.qId], askSide));
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
                // Chain: play CombineQA sequence (orig WaveMe_Done flow).
                // "0" = ans side only; "7" = ask then ans; "8" = right→left;
                // "9" = left→right. Honors per-unit teacher overrides.
                const onDone = function () {
                    state.errorCount = 0;
                    if (state.qAnswered >= QCount) finishGame();
                    else                            nextQuestion();
                };
                // praiseMax=2 — orig WaveMe_Done case 2 :980-986 plays
                // good[1-2].wav (Hatama uses Rnd*2+1, not Rnd*3+1).
                HND.playCombineFromCal(app.id, unit.id, idOrder[rowIdx], cal,
                                       onDone, { praiseMax: 2 });
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
            // Orig CheckAnswer:638 — show hint at ErrorForHint threshold
            // (per-unit calibration). 0 means "always show on next-Q" and
            // is handled in nextQuestion(); >0 means "after N errors".
            const hintTrigger = cal.errorForHint != null ? cal.errorForHint : 2;
            if (hintTrigger > 0 && state.errorCount >= hintTrigger) showHint();
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
        // Orig PaintHint:856-887 — resolves the hint side via WhatToHint
        // (calibration field 9): qDisabled → skip, qPicture → TextForPicture
        // column, otherwise → StringHint column. data.js:836 already
        // resolves qPicture by routing sideCol(3) through textForPic, so
        // cal.hintCol is the correct column in every non-disabled case.
        if (cal.whatToHint === 0 /* qDisabled */) return;
        const it = items[idOrder[state.qId]];
        const text = (cal.hintCol && it[cal.hintCol]) || "";
        if (!text) return;
        hintBox.textContent = "רמז: " + text;
    }

    function finishGame() {
        state.completed = true;
        const score = Math.max(0, 100 - Math.floor(state.penalty));
        HND.log("match FINISH", "score=" + score, "penalty=" + state.penalty);
        setGoatPose("win");
        HND.saveProgress(app.id, unit.id, "match", score, state.errorsPerQ);
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
                    HND.restartGame(app.id, unit.id, "match");
                }
            );
        }, 900);
        if (onComplete) onComplete(score);
    }

    // Initial render: paint all rows in notAnswered state.
    for (let i = 0; i < QCount; i++) setLineState(i, "not-answered");
    showPenalty();

    // Help overlay (orig CmdHelp_Click — plays game1.wav + briefly shows
    // instructions text). Per cal.instructions / instructionsFliped.
    let helpEl = null;
    function showHelpOverlay() {
        const text = (cal.instructionsFliped && window.HND_QASwitched)
                   ? cal.instructionsFliped : cal.instructions;
        if (!helpEl) {
            helpEl = HND._el("div", { class: "ctrl hat-tip" });
            root.appendChild(helpEl);
        }
        if (text && text !== "0") {
            helpEl.textContent = text;
            helpEl.style.display = "block";
            setTimeout(function () { if (helpEl) helpEl.style.display = "none"; }, 5000);
        }
        HND.playWave("assets/" + app.id + "/sounds/game1.wav");
    }

    // CmdRePlay two-step exit (orig CmdExit_Click pattern).
    let replayBtn = null;
    function showReplayButton() {
        if (replayBtn) return;
        replayBtn = HND._el("button", {
            class: "ctrl hat-replay", title: "התחל מחדש",
        });
        replayBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            HND.restartGame(app.id, unit.id, "match");
        });
        root.appendChild(replayBtn);
    }
    if (root.parentElement) {
        const helpBtn = root.parentElement.querySelector(".help-icon");
        if (helpBtn) {
            const c = helpBtn.cloneNode(true);
            helpBtn.parentNode.replaceChild(c, helpBtn);
            c.addEventListener("click", function (e) {
                e.stopPropagation();
                showHelpOverlay();
            });
        }
        const exitBtn = root.parentElement.querySelector(".exit-icon");
        if (exitBtn) {
            const c = exitBtn.cloneNode(true);
            exitBtn.parentNode.replaceChild(c, exitBtn);
            c.addEventListener("click", function (e) {
                e.stopPropagation();
                if (!replayBtn) showReplayButton();
                else location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
            });
        }
    }

    function keyHandler(e) {
        if (state.completed) {
            document.removeEventListener("keydown", keyHandler);
            return;
        }
        if (e.key === "F1")  { e.preventDefault(); showHelpOverlay(); return; }
        if (e.key === "F12") {
            e.preventDefault();
            // Cheat: instant-win remaining rows.
            for (let i = 0; i < QCount; i++) {
                if (state.idStatus[i] === "notAnswered") {
                    state.idStatus[i] = "answered";
                    setLineState(i, "answered");
                    state.qAnswered++;
                    growFlower(state.qAnswered - 1, 0);
                }
            }
            finishGame();
            return;
        }
    }
    document.addEventListener("keydown", keyHandler);

    // Original PlayGame ends with Me.Show 1 and lets WaveMe_Done (after the
    // help-audio plays) trigger the first NextQuestion. The user reaches
    // this game via a click on the GameMenu sign, so audio is already
    // unlocked by the time we get here — call nextQuestion directly.
    showHelpOverlay();
    nextQuestion();
};
