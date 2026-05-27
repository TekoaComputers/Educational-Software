// Hakira — full port of GameHakira.frm.
//
//   Setup (PlayGame, line 116):
//     LinesIn = 6 (with hint) | 12 (no hint) | 3/2 (picture mode — not ported)
//     CurrentPos = 0, CurrentCountIn = 0, LineStatus = 0
//     Sides[] = [WhatToAsk, WhatToAnswer, WhatToHint] mapped to "Left"/"Right"/"Hint"
//     For Hebrew Hemed:  WhatToAsk = qRight, WhatToAnswer = qLeft, WhatToHint = qHint
//       → Sides = ["Right", "Left", "Hint"]  (our wave files are lowercased)
//     MyMiddle = 50, Blank = 10 (non-scroll mode)
//
//   Form_Activate → unroll scroll, play game0.wav (help wave).
//   WaveMe_Done(Status=1) → GoNext → first item draws.
//
//   GoNext (line 345) draws ONE LineStatus's text + plays its wave:
//     LineStatus=0  ask text on right-of-center, X = 90+6*MyMiddle+Blank = 400
//                   number ".N" on far right at x=692 in RGB(20,100,0)
//                   plays  <CurrentPos>_<Sides(0)>.wav = <pos>_right.wav
//     LineStatus=1  answer text on left-of-center, X = 90+6*MyMiddle-Blank = 380
//                   SAME Y as the Q (overlaid on same row)
//                   plays  <CurrentPos>_<Sides(1)>.wav = <pos>_left.wav
//     LineStatus=2  hint text below, Y = same + 35
//                   no _hint.wav usually → silent
//   After Case 2 → CurrentPos++, CurrentCountIn++, LineStatus = 0 → next item.
//   When CurrentCountIn > LinesIn or CurrentPos out of range → scroll back up.
//
//   Y formula (LinesIn ≥ 4): Y = CurrentCountIn * (450 / LinesIn) + 45
//                            For LinesIn=6: Y = 0, 75, 150, 225, 300, 375
//
//   Browser autoplay restriction: the very first audio play has to be
//   triggered by user click. Skip the help-wave step; first user click
//   plays the first item's Q wave and reveals its text.
window.HND = window.HND || {};

HND.startHakira = function (root, app, unit, onComplete) {
    const cols  = (unit.data && unit.data.columns) || [];
    const items = (unit.data && unit.data.items)  || [];
    if (!items.length) {
        root.innerHTML = '<div class="error">אין נתונים לחקירה ביחידה זו.</div>';
        return;
    }
    HND.preloadFrames(app.id, "GameHakira", [
        "back", "picback", "line", "line2",
        "scroll0", "scroll1", "scroll2", "scroll3", "scroll4", "scroll5",
        "next_off", "next_on", "next_down",
        "reset_off", "reset_on", "reset_down",
    ]);

    // Column mapping. cols[0]=hint, cols[1]=qLeft (translation),
    // cols[2]=qRight (Hebrew phrase). The wave files are named per the
    // original Sides() function: _left.wav matches qLeft (translation),
    // _right.wav matches qRight (Hebrew). _hint.wav rarely exists.
    const hintCol = cols[0] && cols[0] !== cols[1] && cols[0] !== cols[2] ? cols[0] : null;
    const ansCol  = cols[1] || cols[0];   // qLeft  → _left.wav
    const askCol  = cols[2] || cols[0];   // qRight → _right.wav

    // LinesIn per the .frm: with hint → 6, without → 12.
    const LINES_IN = hintCol ? 6 : 12;
    const Y_STEP = 450 / LINES_IN;      // 75px per line with hint, 37.5 without
    const Y0     = 45;
    // X positions (SideToAsk = qRight, the Hebrew layout):
    //   askX = 90 + 6*MyMiddle + Blank = 400  (right of center, left-justified)
    //   ansX = 90 + 6*MyMiddle - Blank = 380  (left of center, right-justified)
    //   numX = 692 (far right, right-justified, e.g. ".1")
    //   hintX = 400 (center)
    const ASK_X  = 400;
    const ANS_X  = 380;
    const NUM_X  = 692;
    const HINT_X = 400;

    HND.log("hakira start", app.id + "/" + unit.id,
            "items=" + items.length, "linesIn=" + LINES_IN);

    // Layers — parchment image is the scroll background (positioned at
    // its original .frm coords). Text overlay must be at full stage (0..800)
    // coordinates so X=400 lands at form X=400 (not parchment-relative).
    const parchment = HND._el("div", { class: "ctrl hakira-parchment" });
    const textLayer = HND._el("div", { class: "ctrl hakira-text-layer" });
    root.innerHTML = "";
    root.appendChild(parchment);
    root.appendChild(textLayer);

    // Header text (UnitName · UserName) painted at top of scroll, orange-brown.
    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
    const header = HND._el("div", { class: "ctrl hakira-header" });
    header.textContent = unit.name + (userName ? " · " + userName : "");
    textLayer.appendChild(header);

    // Instructions at the bottom of the scroll (y=560 in the original).
    const instr = HND._el("div", {
        class: "ctrl hakira-instructions",
        text: "לחץ על המגילה כדי להתקדם · מקש רווח להמשך",
    });
    textLayer.appendChild(instr);

    // CmdReset (240, 6480 → 16, 432) — restart scroll from top.
    // CmdNext  (0,   7440 → 0,  496) — exit the game.
    const reset = HND._el("button", { class: "ctrl hakira-reset", title: "התחל שוב" });
    const next  = HND._el("button", { class: "ctrl hakira-next",  title: "סיום" });
    root.appendChild(reset);
    root.appendChild(next);

    // Game state — matches the .frm globals.
    const state = {
        currentPos: 0,         // index into items
        currentCountIn: 0,     // accumulated rows on the parchment
        lineStatus: 0,         // 0=Q, 1=A, 2=hint
        seen: {},              // tracks viewed items for scoring
        ended: false,
        firstClick: false,     // gate autoplay until first user gesture
    };

    function escapeHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Draw helpers — match RePaintLine's DrawString calls.
    // VB6 DrawString justify semantics: vbLeftJustify means the LEFT
    // edge of the rendered text sits at the given X; vbRightJustify
    // means the RIGHT edge sits at X. We replicate by absolutely-
    // anchoring the cell to that edge (left: or right:) and letting
    // the text fill rightward / leftward inside it.
    function drawText(opts) {
        const el = HND._el("div", { class: "hakira-cell " + (opts.cls || "") });
        el.textContent = opts.text || "";
        let css = "top:" + opts.top + "px;";
        if (opts.justify === "right") {
            // Right edge anchored at opts.x; cell extends LEFT.
            css += "right:" + (800 - opts.x) + "px;";
            css += "max-width:" + opts.maxWidth + "px;";
            css += "text-align:right;";
        } else if (opts.justify === "left") {
            // Left edge anchored at opts.x; cell extends RIGHT.
            css += "left:" + opts.x + "px;";
            css += "max-width:" + opts.maxWidth + "px;";
            css += "text-align:left;";
        } else if (opts.justify === "center") {
            css += "left:0; right:0; text-align:center;";
        }
        if (opts.color) css += "color:" + opts.color + ";";
        if (opts.size)  css += "font-size:" + opts.size + "px;";
        el.style.cssText = css;
        textLayer.appendChild(el);
        return el;
    }
    function drawDivider(yTop) {
        // LinePic.MaskB at (400 - LinePic.Width/2 - YString/70, YString-20)
        // — the line2.png (550×30) divider; X drifts LEFT slightly as Y grows
        // to mimic the original parchment perspective.
        const w = 550, h = 30;
        const xDrift = (yTop + 20) / 70;   // YString in the original = yTop+20
        const div = HND._el("div", { class: "hakira-divider" });
        div.style.cssText =
            "left:" + (400 - w / 2 - xDrift) + "px;" +
            "top:" + (yTop - 20) + "px;" +
            "width:" + w + "px;height:" + h + "px;";
        textLayer.appendChild(div);
    }

    function currentYBase() {
        return state.currentCountIn * Y_STEP + Y0;
    }
    function currentItem() { return items[state.currentPos]; }

    function step() {
        if (state.ended) return;
        if (state.currentPos >= items.length) {
            // Original: ScrollUp = False → TimerScroll.Enabled = True (roll back).
            // We just finish the game.
            return finish();
        }
        const it = currentItem();
        const Y  = currentYBase();
        const origIdx = state.currentPos;

        if (state.lineStatus === 0) {
            // Case 0: number + Q (ask) text, play _right.wav.
            if (state.currentCountIn > 0) drawDivider(Y - 20);
            // Number ".N" — vbRightJustify at 692 - YString/70 (drifts left
            // as Y grows, matching the original parchment perspective).
            drawText({
                cls:     "hakira-num",
                top:     Y,
                x:       NUM_X - Y / 70,
                maxWidth: 70,
                justify: "right",
                text:    "." + (state.currentPos + 1),
            });
            // Ask text (Hebrew) — vbLeftJustify with left edge at ASK_X=400.
            drawText({
                cls:     "hakira-ask",
                top:     Y,
                x:       ASK_X,
                maxWidth: NUM_X - ASK_X - 30,    // up to just before the number
                justify: "left",
                text:    it[askCol] || "",
            });
            HND.log("hakira Q", "pos=" + state.currentPos,
                    "text=" + (it[askCol] || "").slice(0, 40));
            HND.playWave(HND.unitWavePath(app.id, unit.id, origIdx, "right"));
            state.lineStatus = 1;
        }
        else if (state.lineStatus === 1) {
            // Case 1: A (answer) text — vbRightJustify with right edge at
            // ANS_X=380, on the SAME Y as the Q. Plays _left.wav.
            drawText({
                cls:     "hakira-ans",
                top:     Y,
                x:       ANS_X,
                maxWidth: ANS_X - 90,
                justify: "right",
                text:    it[ansCol] || "",
            });
            HND.log("hakira A", "pos=" + state.currentPos);
            HND.playWave(HND.unitWavePath(app.id, unit.id, origIdx, "left"));
            if (hintCol) {
                state.lineStatus = 2;
            } else {
                advanceItem();
            }
        }
        else if (state.lineStatus === 2) {
            // Case 2: hint text vbCenter, Y = QA_Y + 35. No wave.
            const hintText = it[hintCol] || "";
            drawText({
                cls:     "hakira-hint",
                top:     Y + 35,
                justify: "center",
                text:    hintText,
            });
            HND.log("hakira hint", "pos=" + state.currentPos);
            advanceItem();
        }
    }

    function advanceItem() {
        state.seen[state.currentPos] = true;
        state.currentPos++;
        state.currentCountIn++;
        state.lineStatus = 0;
        if (state.currentCountIn > LINES_IN || state.currentPos >= items.length) {
            // Parchment full or list exhausted — wait one more click to roll up.
            // The original sets CurrentCountIn = -1 here and scrolls up.
            state.currentCountIn = -1;
        }
    }

    function userClick() {
        if (state.ended) return;
        // Browser unlocks autoplay after the FIRST user gesture.
        state.firstClick = true;
        if (state.currentCountIn === -1) {
            // Roll-up requested: reset the parchment (matches CmdReset_Click).
            return doReset();
        }
        step();
    }
    function doReset() {
        HND.log("hakira reset");
        state.currentPos = 0;
        state.currentCountIn = 0;
        state.lineStatus = 0;
        textLayer.innerHTML = "";
    }
    function finish() {
        if (state.ended) return;
        state.ended = true;
        const seen  = Object.keys(state.seen).length;
        const total = items.length;
        const score = Math.round((seen / total) * 100);
        HND.log("hakira FINISH", "score=" + score, "seen=" + seen + "/" + total);
        HND.saveProgress(app.id, unit.id, "hakira", score);
        // Show ScoreForm overlay — Hakira has no per-Q error tracking
        // (it's a flashcard reader), so feed empty errors array.
        let userName = "";
        try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
        const errorsByQ = new Array(seen).fill(0);
        const stage = root.parentElement;
        setTimeout(function () {
            HND.showScoreForm(
                stage, app.id, unit.name, userName, score, errorsByQ,
                function onExit() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                },
                function onReplay() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/hakira";
                }
            );
        }, 300);
        if (onComplete) onComplete(score);
    }

    parchment.addEventListener("click", userClick);
    // Drop focus on reset/next so Space-bar doesn't re-fire them via the
    // button's default activation behavior.
    reset.addEventListener("click", function (e) {
        e.stopPropagation();
        doReset();
        reset.blur();
    });
    next.addEventListener("click",  function (e) {
        e.stopPropagation();
        finish();
        next.blur();
    });
    document.addEventListener("keyup", function spaceKey(e) {
        if (state.ended) {
            document.removeEventListener("keyup", spaceKey);
            return;
        }
        if (e.key === " " || e.code === "Space") userClick();
    });
};
