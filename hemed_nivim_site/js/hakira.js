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
    // Pre-decode the scroll frames before any animation kicks in — the
    // entry-unroll CSS keyframes reference scroll5.png at 0% and the
    // browser would otherwise paint an empty parchment on the first run.
    const scrollPreload = HND.preloadFrames(app.id, "GameHakira", [
        "back", "picback", "line", "line2",
        "scroll0", "scroll1", "scroll2", "scroll3", "scroll4", "scroll5",
        "next_off", "next_on", "next_down",
        "reset_off", "reset_on", "reset_down",
    ]);

    // Per-unit calibration (orig CurrentCalibration). Hakira slot is 0
    // (cal-block 0). 1 of 31 Nivim units flips, otherwise default.
    const cal = HND.gameCalibrationFromSlot(unit, app.id, 0);
    const askCol  = cal.askCol;
    const ansCol  = cal.ansCol;
    const askSide = cal.askSide;
    const ansSide = cal.ansSide;
    const hintCol = cal.hintCol && cal.hintCol !== askCol && cal.hintCol !== ansCol
                  ? cal.hintCol : null;

    // Picture-mode adjustments (orig PlayGame:128-138):
    //   Any side = qPicture     → LinesIn = 3 (base picture-mode density)
    //   WhatToHint = qPicture   → LinesIn = 2 (override; hint pic is tall)
    //   WhatToAnswer = qPicture → Middle = 70 (text shifted left, pic on right)
    //   WhatToAsk = qPicture    → Middle = 30 (text shifted right, pic on left)
    const anyPic = cal.whatToAsk === 3 || cal.whatToAnswer === 3 || cal.whatToHint === 3;
    let LINES_IN = hintCol ? 6 : 12;
    if (anyPic)                 LINES_IN = 3;
    if (cal.whatToHint === 3)   LINES_IN = 2;
    let MIDDLE   = 50;     // default: askX=400, ansX=380
    if (cal.whatToAnswer === 3) MIDDLE   = 70;
    if (cal.whatToAsk === 3)    MIDDLE   = 30;
    // Orig GoNext:388,411 — Y-step compresses for small LinesIn (≤3).
    const Y_STEP = LINES_IN < 4 ? 360 / LINES_IN : 450 / LINES_IN;
    const Y0     = 45;
    // Orig X formulas (line 156):
    //   askX = 90 + 6*Middle + Blank (Blank=10 in non-scroll mode)
    //   ansX = 90 + 6*Middle - Blank
    //   numX = 692, hintX = 400
    const ASK_X  = 90 + 6 * MIDDLE + 10;
    const ANS_X  = 90 + 6 * MIDDLE - 10;
    const NUM_X  = 692;
    const HINT_X = 400;

    HND.log("hakira start", app.id + "/" + unit.id,
            "items=" + items.length, "linesIn=" + LINES_IN);

    // Layers — parchment image is the scroll background (positioned at
    // its original .frm coords). Text overlay must be at full stage (0..800)
    // coordinates so X=400 lands at form X=400 (not parchment-relative).
    const parchment = HND._el("div", {
        class: "ctrl hakira-parchment",
        "data-app": app.id,         // selects per-app scroll images in CSS
    });
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
        firstClick: false,
    };

    function sharedWave(name) {
        return "assets/" + app.id + "/sounds/" + name;
    }

    // Instructions overlay + game0.wav (orig CmdHelp_Click:196-204).
    // Auto-fires once on game start (orig Form_Activate doesn't do this
    // — but the help icon would, and it lets the user know to click).
    // F1 replays.
    let helpEl = null;
    function showHelpOverlay() {
        const text = (cal.instructionsFliped && window.HND_QASwitched)
                   ? cal.instructionsFliped : cal.instructions;
        if (!helpEl) {
            helpEl = HND._el("div", { class: "ctrl hakira-tip" });
            root.appendChild(helpEl);
        }
        if (text && text !== "0") {
            helpEl.textContent = text;
            helpEl.style.display = "block";
            setTimeout(function () { if (helpEl) helpEl.style.display = "none"; }, 4500);
        }
        HND.playWave(sharedWave("game0.wav"));
    }

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
    // Picture-mode (orig GoNext:380-456). When a side is qPicture, load
    // `data/<App>/unit_<id>/pic/<idx>.png` and render 130×140 at the
    // side-specific X. SideToAsk=qRight is the standard Hebrew layout.
    //   ask  → XString = 500 (qRight) / 150 (qLeft)
    //   ans  → XString = 150 (qRight) / 500 (qLeft)
    //   hint → XString = 300 (always)
    // After painting, the corresponding text shifts to (XString±150 or
    // XString-10) and Y+70 — replaces the in-row text.
    const PIC_W = 130, PIC_H = 140;
    const sideToAskRight = (cal.askSide === "right");
    function picXFor(role) {
        if (role === "ask")    return sideToAskRight ? 500 : 150;
        if (role === "answer") return sideToAskRight ? 150 : 500;
        if (role === "hint")   return 300;
        return null;
    }
    function picUrlFor(role, idx) {
        const what = role === "ask"    ? cal.whatToAsk
                  :  role === "answer" ? cal.whatToAnswer
                  :                      cal.whatToHint;
        if (what !== 3) return null;
        const dataRoot = (HND.APPS && HND.APPS[app.id] && HND.APPS[app.id].dataRoot)
                       || ("data/" + app.id);
        return dataRoot + "/unit_" + unit.id + "/pic/" + idx + ".png";
    }
    function drawPic(x, y, src) {
        const im = HND._el("div", { class: "hakira-cell hakira-pic" });
        im.style.cssText =
            "left:" + x + "px;" + "top:" + y + "px;" +
            "width:" + PIC_W + "px;height:" + PIC_H + "px;" +
            "background-image:url('" + src + "');" +
            "background-size:" + PIC_W + "px " + PIC_H + "px;" +
            "background-repeat:no-repeat;";
        textLayer.appendChild(im);
    }
    // Returns true if a picture was rendered for this role at row Y, and
    // also draws the row's text with the picture-mode offsets applied
    // (X += 150 or -= 10 depending on align; Y += 70). Returns false if
    // this row's side isn't qPicture — caller falls back to plain text.
    function drawRowWithMaybePic(opts) {
        // opts: { role, idx, Y, justify, text, cls, maxWidth }
        const pic = picUrlFor(opts.role, opts.idx);
        if (!pic) return false;
        const picX = picXFor(opts.role);
        drawPic(picX, opts.Y, pic);
        // Orig: vbCenter → vbRightJustify first; then:
        //   vbLeftJustify  → X -= 10,  align flips to right
        //   vbRightJustify → X += 150, align flips to left
        let just = opts.justify === "center" ? "right" : opts.justify;
        let tx;
        if (just === "left") { tx = picX - 10;  just = "right"; }
        else                 { tx = picX + 150; just = "left";  }
        drawText({
            cls:      opts.cls,
            top:      opts.Y + 70,
            x:        tx,
            justify:  just,
            maxWidth: opts.maxWidth,
            text:     opts.text,
        });
        return true;
    }

    function drawDivider(textY) {
        // Original (GameHakira.frm:390):
        //   LinePic.MaskB 400 - LinePic.Width/2 - YString/70, YString - 20
        // → top-left at (400 - W/2 - YString/70, YString - 20), where
        //   YString is the Y coordinate of the row's TEXT.
        // The divider sits 20 px ABOVE the text. X drifts left slightly as
        // Y grows to fake parchment perspective.
        const w = 550, h = 30;
        const xDrift = textY / 70;
        const div = HND._el("div", { class: "hakira-divider" });
        div.style.cssText =
            "left:" + (400 - w / 2 - xDrift) + "px;" +
            "top:"  + (textY - 20) + "px;" +
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
            // Pass the row's TEXT Y (= Y) to drawDivider; it places the
            // LinePic 20 px above the text per the original.
            if (state.currentCountIn > 0) drawDivider(Y);
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
            // Picture-mode: drawRowWithMaybePic renders the per-item pic at
            // X=500 (Hebrew layout) and shifts the text down/right (orig
            // GoNext:380-393 + :449-462). Falls through to plain text if
            // whatToAsk !== qPicture.
            if (!drawRowWithMaybePic({
                role: "ask", idx: origIdx, Y: Y,
                cls: "hakira-ask", justify: "left",
                maxWidth: NUM_X - ASK_X - 30,
                text: it[askCol] || "",
            })) drawText({
                cls:     "hakira-ask",
                top:     Y,
                x:       ASK_X,
                maxWidth: NUM_X - ASK_X - 30,    // up to just before the number
                justify: "left",
                text:    it[askCol] || "",
            });
            HND.log("hakira Q", "pos=" + state.currentPos,
                    "text=" + (it[askCol] || "").slice(0, 40));
            if (HND.unitWaveExists(unit, origIdx, "right")) {
                HND.playWave(HND.unitWavePath(app.id, unit.id, origIdx, askSide));
            }
            state.lineStatus = 1;
        }
        else if (state.lineStatus === 1) {
            // Case 1: A (answer) text — vbRightJustify with right edge at
            // ANS_X=380, on the SAME Y as the Q. Plays _left.wav.
            // Picture-mode: pic at X=150 (Hebrew layout), text shifts down.
            if (!drawRowWithMaybePic({
                role: "answer", idx: origIdx, Y: Y,
                cls: "hakira-ans", justify: "right",
                maxWidth: ANS_X - 90,
                text: it[ansCol] || "",
            })) drawText({
                cls:     "hakira-ans",
                top:     Y,
                x:       ANS_X,
                maxWidth: ANS_X - 90,
                justify: "right",
                text:    it[ansCol] || "",
            });
            HND.log("hakira A", "pos=" + state.currentPos);
            if (HND.unitWaveExists(unit, origIdx, "left")) {
                HND.playWave(HND.unitWavePath(app.id, unit.id, origIdx, ansSide));
            }
            if (hintCol) {
                state.lineStatus = 2;
            } else {
                advanceItem();
            }
        }
        else if (state.lineStatus === 2) {
            // Case 2: hint text vbCenter, Y = QA_Y + 35. No wave.
            // Picture-mode: pic at X=300, Y = base + 80 (orig:436), text
            // shifts to right-justify at picX+150 / Y+70 = +150.
            const hintText = it[hintCol] || "";
            if (!drawRowWithMaybePic({
                role: "hint", idx: origIdx, Y: Y + 80,
                cls: "hakira-hint", justify: "center",
                maxWidth: 800,
                text: hintText,
            })) drawText({
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
        if (state.ended || state.animating) return;
        // Browser unlocks autoplay after the FIRST user gesture.
        state.firstClick = true;
        if (state.currentCountIn === -1) {
            // Original: scroll rolls up then back down for a fresh batch.
            return doReset();
        }
        step();
    }
    function doReset(forceFullRestart) {
        if (state.animating) return;
        // Two distinct entry points:
        //   • CmdReset button (orig CmdReset_Click:210-216) — UNCONDITIONAL
        //     restart at item 0.
        //   • GoNext rollover when CurrentCountIn = -1 (orig GoNext:361):
        //     keep CurrentPos, only clear the visible rows and start a fresh
        //     parchment; reset to 0 only when CurrentPos > UBound(Lines).
        const unitDone = forceFullRestart || state.currentPos >= items.length;
        HND.log("hakira reset", unitDone ? "(unit done → pos 0)" : "(page full → continue)");
        state.animating = true;
        textLayer.classList.add("hidden");
        parchment.classList.remove("unrolling");
        parchment.classList.add("rolling-up");
        const onRollEnd = function () {
            parchment.removeEventListener("animationend", onRollEnd);
            // Always reset the on-parchment counter + line status; only
            // reset currentPos when the unit has actually been exhausted.
            if (unitDone) state.currentPos = 0;
            state.currentCountIn = 0;
            state.lineStatus = 0;
            // Keep header + instructions; drop only the rendered Q/A/hint rows.
            Array.from(textLayer.querySelectorAll(
                ".hakira-cell, .hakira-divider"
            )).forEach(function (n) { n.remove(); });
            parchment.classList.remove("rolling-up");
            parchment.classList.add("unrolling");
            const onUnrollEnd = function () {
                parchment.removeEventListener("animationend", onUnrollEnd);
                parchment.classList.remove("unrolling");
                textLayer.classList.remove("hidden");
                state.animating = false;
            };
            parchment.addEventListener("animationend", onUnrollEnd);
        };
        parchment.addEventListener("animationend", onRollEnd);
    }
    function playEntryUnroll() {
        textLayer.classList.add("hidden");
        parchment.classList.add("unrolling");
        state.animating = true;
        const onEnd = function () {
            parchment.removeEventListener("animationend", onEnd);
            parchment.classList.remove("unrolling");
            textLayer.classList.remove("hidden");
            state.animating = false;
        };
        parchment.addEventListener("animationend", onEnd);
    }
    function finish() {
        if (state.ended) return;
        state.ended = true;
        // Original CmdNext_Click is just `Unload Me` — Hakira is a flashcard
        // reader with no AddScore / ScoreForm.ShowGameScore calls anywhere
        // (grep returns 0 hits in GameHakira.frm). Don't save a fake score
        // and don't show the score form; just exit back to the game menu.
        HND.log("hakira FINISH");
        location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
        if (onComplete) onComplete();
    }

    // Hook the outer help icon to replay our instructions overlay
    // (orig F1 = CmdHelp_Click).
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
    }

    // Wait for the scroll PNGs to finish decoding before triggering the
    // unroll keyframes — otherwise on the first run the parchment paints
    // empty for a frame or two while scroll5 fetches.
    scrollPreload.then(function () {
        playEntryUnroll();
        showHelpOverlay();
    });

    parchment.addEventListener("click", userClick);
    // Drop focus on reset/next so Space-bar doesn't re-fire them via the
    // button's default activation behavior.
    reset.addEventListener("click", function (e) {
        e.stopPropagation();
        doReset(true);          // CmdReset_Click → always restart at item 0
        reset.blur();
    });
    next.addEventListener("click",  function (e) {
        e.stopPropagation();
        finish();
        next.blur();
    });
    // F-keys (orig Form_KeyUp:232-241): Space → advance, Esc → exit,
    // F1 → help. Esc is handled by app.js's outer F-key handler.
    document.addEventListener("keyup", function hakKey(e) {
        if (state.ended) {
            document.removeEventListener("keyup", hakKey);
            return;
        }
        if (e.key === " " || e.code === "Space") userClick();
        else if (e.key === "F1") { e.preventDefault(); showHelpOverlay(); }
    });
};
