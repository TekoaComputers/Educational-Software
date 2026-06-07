// Apple — full port of GameApple.frm.
//
//   PlayGame:
//     QCount = min(LineCount, 9). Apples in canopy at fixed ApplePos[8].
//     Q_Corner.Y = A_Corner.Y = 540 (Q and A text at bottom).
//     A_Corner.X = 25 + 7.5*Middle + 5 + (750-7.5*Middle)/2  (right of center)
//     Q_Corner.X = 25 + (7.5*Middle)/2 - 5                   (left of center)
//     MiddlePic divider at (Middle*7.5+25, 550) between Q and A.
//     GoatX=629, GoatY=335 — goat starts at the right.
//
//   InitQuestion (line 455):
//     AllChar = WhatToAnswer text chars. SelectedChar[] = True for all
//     real letters. CharCount = count of selected real letters.
//     Q text drawn at Q_Corner.Y (= 540). PaintText renders A side with
//     Q_marks for unfilled chars. CmdSound auto-plays Q wave.
//
//   Form_KeyUp (line 568):
//     Iterates AllChar; any i where char matches the typed key AND
//     SelectedChar(i)=True gets cleared (filled). Multiple matches per
//     keypress (e.g., the word has 2 'A's, one key fills both).
//     GoNext = True if all real chars now filled.
//     Right → SmallGood.wav, goat = "yes". GoNext → praise + goat "pick".
//     Wrong → ra.wav, apple FALLS with the wrong char (AppleFrame=1),
//             ErrorCount++. ErrorsStatus by ErrorCount.
//
//   WinGame: BigApple.jpg at (192,0), ScoreTimer animates the score.
window.HND = window.HND || {};

HND.startApple = function (root, app, unit, onComplete) {
    const cols  = (unit.data && unit.data.columns) || [];
    const items = (unit.data && unit.data.items)  || [];
    if (!items.length) {
        root.innerHTML = '<div class="error">אין נתוני משחק תפוחים ביחידה זו.</div>';
        return;
    }
    (function preloadAppleSprites() {
        const names = ["back", "loah", "middle", "foliage", "bigapple"];
        for (let i = 0; i <= 7; i++) names.push("applered" + i);
        for (let i = 0; i <= 7; i++) names.push("appleyellow" + i);
        for (let i = 0; i <= 6; i++) names.push("q_mark" + i);
        names.push("goat_stand1", "goat_sad1");
        for (let i = 1; i <= 9; i++) names.push("goat_enter" + i);
        for (let i = 1; i <= 5; i++) names.push("goat_pick" + i);
        for (let i = 1; i <= 7; i++) names.push("goat_eat" + i);
        for (let i = 1; i <= 8; i++) names.push("goat_yes" + i);
        for (let i = 1; i <= 9; i++) names.push("goat_no" + i);
        for (let i = 1; i <= 8; i++) names.push("goat_win" + i);
        HND.preloadFrames(app.id, "GameApple", names);
    })();

    // Per-unit calibration (orig CurrentCalibration). Apple's slot is 7
    // (cal-block 4). Hemed+Nivim have several units with CombineQA="8"
    // or "7" and a handful with WhatToAsk=qLeft (flipped Q/A).
    const cal = HND.gameCalibrationFromSlot(unit, app.id, 4);
    const askCol  = cal.askCol;
    const ansCol  = cal.ansCol;
    // Apple honors WhatToAskSound for audio (orig CurrentSoundPlay:454),
    // independent of the text WhatToAsk side. Same in the CombineQA
    // chain — see GameApple.frm:637-639.
    const askSide = cal.askSoundSide;
    const ansSide = cal.ansSoundSide;

    // Layout — Middle=50 default. With SideToAsk=qRight, askCol on left,
    // ansCol on right (in our Hebrew layout we flip: ans=cols[1] on the
    // left, ask=cols[2] on the right side of the divider).
    const Q_X = 600;     // ask (Hebrew) text - right side
    const A_X = 200;     // answer text - left side (where typing happens)
    const TEXT_Y = 540;
    const DIVIDER_X = 400;
    // .frm-exact ApplePos[8] — the 8 apples in the tree canopy.
    const APPLE_POS = [
        [533, 136], [490, 220], [440, 242], [397, 108],
        [356, 195], [309, 144], [263, 242], [216, 146],
    ];
    // .frm-exact BasketPos[10] — overlapping piles at the bottom-left.
    // basket0_N.bmp / basket1_N.bmp painted per Stage; one basket pinned
    // per completed question (`BasketStatus(Current-1) += 1`).
    const BASKET_POS = [
        [91, 449], [29, 449], [60, 462], [155, 449], [122, 462],
        [87, 473], [-9, 461], [25, 473], [186, 462], [151, 473],
    ];

    // Honor calibration QLimit + IfRandom (orig PlayGame:504-528).
    const QCOUNT  = Math.min(cal.qLimit > 0 ? cal.qLimit : items.length, 9);
    const rawIdxs = items.map(function (_, i) { return i; });
    const idOrder = (cal.ifRandom ? HND._shuffle(rawIdxs) : rawIdxs).slice(0, QCOUNT);

    const state = {
        current: 0,
        // Per-Q state:
        answer: "",
        selected: [],         // per-char: must type? (false for spaces / punct)
        filled: [],           // per-char: typed correctly?
        errorCount: 0,
        errorsByQ: [],
        gameEnabled: false,
        completed: false,
        totalScore: 0,
        // Basket/stage state. Original BasketStatus is ReDim(QCount) — one
        // entry per question, value = errors-in-that-question. We init to
        // `null` (not 0) so renderBaskets can distinguish "question not
        // answered yet — don't draw a basket" from "question answered with
        // 0 errors — draw basket sprite N=0".
        stage: 0,             // 0 = red + basket0_N; 1 = yellow + basket1_N
        baskets: [],          // [qIdx] → null | errors-that-question
        // Per-question banned-key set. Original GameApple.frm:593:
        //   If BannedChars(KeyCode) = True Then Exit Sub
        //   Else BannedChars(KeyCode) = True
        // Once a physical key is pressed during a question, all subsequent
        // presses of the SAME key are ignored — no error, no apple drop,
        // no goat reaction. Reset on InitQuestion (.frm:461 ReDim).
        bannedKeys: new Set(),
    };
    for (let i = 0; i < QCOUNT; i++) state.baskets.push(null);
    HND.log("apple start", app.id + "/" + unit.id, "items=" + items.length, "QCOUNT=" + QCOUNT);

    // Layers
    // Read unit.Middle (TheUnitFile(14)) and pre-compute the X positions
    // PlayGame derives at .frm:342-346 for SideToAsk = qRight (default
    // Hebrew layout):
    //   A_Corner.X = 25 + (7.5 * Middle) / 2 - 5
    //   Q_Corner.X = 25 + 7.5 * Middle + 5 + (750 - 7.5*Middle)/2
    //   MiddlePic.MaskB Middle*7.5 + 25, 550
    // (For SideToAsk = qLeft both columns mirror with `100 - Middle` then
    // X is flipped via `800 - X` — handled by the same formula since we
    // don't expose the SideToAsk toggle in the port.)
    // Per GameMenu SLOT_TO_CAL_IDX map (app.js): apple = cfg block 4.
    // Used to read CombineQA, ErrorForHint, etc. from unit.cfg.
    const APPLE_CAL_IDX = 4;
    const unitMiddle = (function () {
        const h = (unit.data && unit.data.header) || [];
        const m = parseInt(h[14], 10);
        return isNaN(m) ? 50 : m;
    })();
    const aCornerX  = Math.round(25 + (7.5 * unitMiddle) / 2 - 5);
    const qCornerX  = Math.round(25 + 7.5 * unitMiddle + 5 + (750 - 7.5 * unitMiddle) / 2);
    const dividerX  = Math.round(unitMiddle * 7.5 + 25);
    HND.log("apple geom", "middle=" + unitMiddle, "aX=" + aCornerX,
            "qX=" + qCornerX, "divX=" + dividerX);

    const treeLayer    = HND._el("div", { class: "ctrl apple-tree-layer" });
    // Foliage overlay at the .frm-derived position (195, 75, native 378×245).
    // Original PaintApple blits Foliage.Mask with src_x = ApplePos.X-195 and
    // src_y = ApplePos.Y-75 per apple — same effect achieved with a single
    // positioned overlay above the static apples.
    const foliage      = HND._el("div", { class: "ctrl apple-foliage" });
    const header       = HND._el("div", { class: "ctrl apple-header" });
    const qText        = HND._el("div", { class: "ctrl apple-q" });
    const aText        = HND._el("div", { class: "ctrl apple-a" });
    const divider      = HND._el("div", { class: "ctrl apple-divider" });
    const sound        = HND._el("button", { class: "ctrl apple-sound", title: "השמע" });
    const goat         = HND._el("div", { class: "ctrl apple-goat enter" });
    setTimeout(function () { goat.classList.remove("enter"); }, 700);
    const fallLayer    = HND._el("div", { class: "ctrl apple-fall-layer" });
    // Expose the unit's Middle-derived X positions to CSS via custom props on
    // the game root, so all per-text rules can anchor with one source of truth.
    root.style.setProperty("--apple-a-x",   aCornerX  + "px");
    root.style.setProperty("--apple-q-x",   qCornerX  + "px");
    root.style.setProperty("--apple-div-x", dividerX  + "px");
    root.innerHTML = "";
    root.appendChild(treeLayer);
    root.appendChild(foliage);
    root.appendChild(header);
    root.appendChild(divider);
    root.appendChild(qText);
    root.appendChild(aText);
    root.appendChild(sound);
    root.appendChild(goat);
    root.appendChild(fallLayer);

    // Static tree apples — per the original InitQuestion (line 486-491),
    // 8 apples are painted at fixed ApplePos coords at the start of each
    // question via `PaintApple i, 1`. They sit in the canopy until the
    // user mistypes (then one falls with the wrong char).
    function renderTreeApples() {
        treeLayer.innerHTML = "";
        APPLE_POS.forEach(function (p, i) {
            const apple = HND._el("div", {
                class: "ctrl apple-static" +
                       (state.stage === 1 ? " yellow" : " red"),
            });
            apple.style.cssText = "left:" + p[0] + "px;top:" + p[1] + "px;";
            apple.dataset.slot = String(i);
            treeLayer.appendChild(apple);
        });
    }
    renderTreeApples();

    // Basket pile layer — TimerGoatBmp drops a basket at BasketPos[Current-1]
    // each time the goat returns from picking. Sprite `basket<stage>_<N>.bmp`
    // where N = number of apples in this basket (0..8).
    const basketLayer = HND._el("div", { class: "ctrl apple-basket-layer" });
    root.appendChild(basketLayer);
    // BasketStatus per the original GameApple.frm: ONE value per question
    // (state.baskets[i] = wrong-apple count for question i), and at end of
    // each Q the basket is drawn at BasketPos(i) with sprite index =
    // Abs(BasketStatus(i)). The Stage*2-1 trick in the .frm just makes
    // BasketStatus negative in Stage 0 / positive in Stage 1 so ScoreTimer
    // can animate it back to 0; we don't need the sign, just the count.
    function renderBaskets() {
        basketLayer.innerHTML = "";
        state.baskets.forEach(function (errors, qi) {
            if (errors == null) return;
            if (qi >= BASKET_POS.length) return;
            const p = BASKET_POS[qi];
            const b = HND._el("div", { class: "ctrl apple-basket" });
            // Original GameApple.frm:996-1000 — the basket-fill loop:
            //   For i = 0 To 7
            //       If AppleFrame(i) = 0 Then        ' still ON THE TREE
            //           AppleFrame(i) = 100
            //           BasketStatus(Current-1) += 1 * (Stage*2-1)
            //       End If
            //   Next i
            // So BasketStatus counts apples that DID NOT fall (= "good"
            // apples placed into the basket). Sprite N = good apples =
            // 8 - errorCount. Errors=0 → N=8 (full basket); errors=8 →
            // N=0 (empty basket = total failure).
            const n = Math.max(0, Math.min(8, 8 - errors));
            b.style.cssText =
                "left:" + p[0] + "px; top:" + (p[1] - 20) + "px;" +
                "background-image: url('assets/" + app.id +
                "/pictures/GameApple/basket" + state.stage + "_" + n + ".png');";
            basketLayer.appendChild(b);
        });
    }
    function addBasketFor(qIdx, errorCount) {
        // Original GameApple.frm:998 — BasketStatus(Current-1) = ... + 1
        // is called once per wrong apple. We compress that to a single
        // assignment with the final error count for this question.
        state.baskets[qIdx] = errorCount;
        // Stage 0 → 1 transition fires when the goat "eats" (line 897:
        // TimerGoatBmp Case 2 endpoint, after ErrorCount = 8 hits). The
        // original runs a goat-eat animation BEFORE flipping Stage = 1;
        // we cue the "eat" pose for a beat, then swap stage on the next
        // renderTreeApples (inside initQuestion).
        if (errorCount >= 8 && state.stage === 0) {
            HND.log("apple stage", "0 → 1 (goat ate)");
            setGoat("eat");
            // Delay the stage flip so the eat pose plays out; next
            // initQuestion will repaint with .yellow apples.
            setTimeout(function () { state.stage = 1; }, 700);
        }
        renderBaskets();
    }

    // Header
    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
    header.textContent = unit.name + (userName ? "  ·  " + userName : "");

    sound.addEventListener("click", function () {
        if (!state.gameEnabled) return;
        const idx = idOrder[state.current];
        if (idx != null) HND.playWave(HND.unitWavePath(app.id, unit.id, idx, askSide));
    });

    function isLetter(c) { return /[֐-׿A-Za-z0-9]/.test(c); }

    // Israeli Hebrew keyboard layout — physical key → Hebrew char (and
    // inverse). Matches the original's `Lang128 = Not Lang128` trick
    // that re-reads the same KeyCode in both keyboard layouts.
    const HEB_LAYOUT = {
        KeyQ:"/", KeyW:"'", KeyE:"ק", KeyR:"ר", KeyT:"א", KeyY:"ט",
        KeyU:"ו", KeyI:"ן", KeyO:"ם", KeyP:"פ",
        KeyA:"ש", KeyS:"ד", KeyD:"ג", KeyF:"כ", KeyG:"ע", KeyH:"י",
        KeyJ:"ח", KeyK:"ל", KeyL:"ך", Semicolon:"ף", Quote:",",
        KeyZ:"ז", KeyX:"ס", KeyC:"ב", KeyV:"ה", KeyB:"נ", KeyN:"מ",
        KeyM:"צ", Comma:"ת", Period:"ץ", Slash:".",
    };
    const HEB_TO_CODE = {};
    Object.keys(HEB_LAYOUT).forEach(function (k) { HEB_TO_CODE[HEB_LAYOUT[k]] = k; });
    function keyMatchesChar(e, expected) {
        if (!expected) return false;
        const got = e.key || "";
        if (got.toLowerCase() === expected.toLowerCase()) return true;
        if (HEB_LAYOUT[e.code] === expected) return true;
        if (HEB_TO_CODE[expected] === e.code) return true;
        return false;
    }

    function setGoat(stateName) {
        ["enter", "stand", "sad", "yes", "no", "eat", "pick", "win"].forEach(function (s) {
            goat.classList.remove(s);
        });
        void goat.offsetWidth;
        goat.classList.add(stateName);
        // "pick" runs the 1.6s walk-to-basket-and-back animation; everything
        // else is a brief reaction pose. "win" loops forever.
        if (stateName !== "win") {
            const dur = stateName === "pick" ? 1600 : 700;
            setTimeout(function () {
                goat.classList.remove(stateName);
                goat.classList.add("stand");
            }, dur);
        }
    }

    function initQuestion() {
        if (state.current >= QCOUNT) { winGame(); return; }
        const idx = idOrder[state.current];
        const ansText = (items[idx][ansCol] || "").trim();
        const askText = (items[idx][askCol] || "").trim();
        // Safety — original assumes every item has a typeable answer. If
        // ansText is empty (e.g., a unit configured for qPicture answer
        // which our port doesn't render, or a data file with a hole),
        // skip to the next question rather than render an untypeable Q.
        if (!ansText) {
            HND.log("apple skip empty answer", "q=" + (state.current + 1));
            state.current++;
            return initQuestion();
        }
        state.answer = ansText;
        state.selected = [];
        state.filled = [];
        for (let i = 0; i < ansText.length; i++) {
            const sel = isLetter(ansText[i]);
            state.selected.push(sel);
            state.filled.push(!sel);
        }
        state.errorCount = 0;
        state.bannedKeys.clear();
        state.gameEnabled = true;
        HND.log("apple question",
                "q=" + (state.current + 1) + "/" + QCOUNT,
                "origIdx=" + idx, "ans=" + ansText.slice(0, 40));
        qText.textContent = askText;
        renderAnswer();
        // Repaint the 8 static apples on the tree for this new question.
        // Also clear any apples that fell during the previous question —
        // original sets AppleFrame(i) = 0 for all 8 slots at InitQuestion
        // (.frm line 488) which makes PaintApple draw them back on the tree.
        renderTreeApples();
        clearFallenApples();
        // Play the question wave on every Q including the first. The user
        // reached this screen by clicking a game-sign, so audio is unlocked.
        HND.playWave(HND.unitWavePath(app.id, unit.id, idx, askSide));
    }

    // `justFilled` is a Set of indices freshly filled in this keypress —
    // those cells get the q_mark pop animation (original Form_KeyUp line
    // 622-628: QMark.MaskBstrech ..., i, ... cycles frames 2..6 at the
    // CharsX position before PaintText draws the actual letter).
    function renderAnswer(justFilled) {
        aText.innerHTML = "";
        for (let i = 0; i < state.answer.length; i++) {
            const cell = HND._el("span", { class: "apple-char" });
            if (!state.selected[i]) {
                cell.textContent = state.answer[i];
                cell.classList.add("non-letter");
            } else if (state.filled[i]) {
                cell.textContent = state.answer[i];
                cell.classList.add("filled");
                if (justFilled && justFilled.has(i)) cell.classList.add("popping");
            } else {
                cell.classList.add("qmark");
            }
            aText.appendChild(cell);
        }
    }

    // Detect the language of the current answer. Original GameApple.frm:
    // `IsHebrew` is True when AllChar contains any Hebrew code (> 128 in
    // cp1255). We use Unicode Hebrew range [0590..05FF].
    function answerIsHebrew() {
        return /[֐-׿]/.test(state.answer || "");
    }
    // Original GameApple.frm:660-664 — pick the variant of the pressed
    // physical key that matches the answer's language:
    //   AppleChar(i) = KeyChar1 / KeyChar2 depending on IsHebrew + code > 128.
    // KeyChar1 = current-layout char, KeyChar2 = swapped-layout char. In
    // the browser we read `e.key` (current layout) and derive the OTHER
    // layout from `e.code` (the physical-key id).
    function displayCharForKey(e) {
        const ansHe = answerIsHebrew();
        if (ansHe) {
            // Want Hebrew. If e.key already Hebrew use it; else look up
            // the Hebrew letter mapped to this physical key.
            if (/[֐-׿]/.test(e.key)) return e.key;
            if (HEB_LAYOUT[e.code]) return HEB_LAYOUT[e.code];
            return e.key;
        }
        // Want English. If e.key is ASCII letter use it; else derive from
        // physical key code (e.code = "KeyA".."KeyZ").
        if (/^[A-Za-z]$/.test(e.key)) return e.key;
        const m = e.code && e.code.match(/^Key([A-Z])$/);
        if (m) return m[1].toLowerCase();
        return e.key;
    }

    function onKey(e) {
        if (!state.gameEnabled || state.completed) return;
        if (e.key.length !== 1) return;
        // Unlock autoplay on first user interaction.
        if (!state.userInteracted) {
            state.userInteracted = true;
            const idx = idOrder[state.current];
            HND.playWave(HND.unitWavePath(app.id, unit.id, idx, askSide));
        }
        // Original .frm:593 — ignore repeats of the same physical key
        // within the same question (correct or wrong; either way, the
        // second press does nothing).
        const keyId = e.code || ("ch:" + e.key);
        if (state.bannedKeys.has(keyId)) {
            HND.log("apple key banned", "code=" + e.code + " key=" + e.key);
            return;
        }
        state.bannedKeys.add(keyId);
        const justFilled = new Set();
        // Any matching SELECTED char gets cleared in one keypress.
        // Accept either-layout matches per the original's Lang128 toggle.
        for (let i = 0; i < state.answer.length; i++) {
            if (state.selected[i] && !state.filled[i] &&
                keyMatchesChar(e, state.answer[i])) {
                state.filled[i] = true;
                justFilled.add(i);
            }
        }
        if (justFilled.size > 0) {
            HND.log("apple OK", "key=" + e.key, "matched=" + justFilled.size);
            renderAnswer(justFilled);
            setGoat("yes");
            // Check if all selected chars are filled.
            const goNext = state.selected.every(function (s, i) {
                return !s || state.filled[i];
            });
            const goNext_2 = state.selected.every(function (s, i) {
                return !s || state.filled[i];
            });
            const _unused = goNext_2;
            if (goNext) {
                state.gameEnabled = false;
                // Categorize error count.
                const cat = state.errorCount === 0 ? 0 :
                            state.errorCount <= 4 ? 1 : 2;
                state.errorsByQ.push(cat);
                HND.log("apple Q DONE",
                        "q=" + (state.current + 1), "errors=" + state.errorCount,
                        "cat=" + cat);
                const idx = idOrder[state.current];
                state.totalScore += (100 / QCOUNT);
                addBasketFor(state.current, state.errorCount);
                setGoat("pick");
                // Fade fallen apples during the goat's pick-up walk so they
                // visually go INTO the basket — original goat physically
                // picks each one up off the ground (frames 100..113).
                fadeOutFallenApples();
                // CombineQA dispatch (orig .frm:950-973) — sequences ask/
                // answer waves per cal mode "0"/"7"/"8"/"9". Audio sides
                // are WhatToAskSound / WhatToAnswerSound (independent of
                // the text Q/A side) per GameApple.frm:637-639.
                const advance = function () {
                    state.current++;
                    if (state.current >= QCOUNT) winGame();
                    else initQuestion();
                };
                const audioCal = Object.assign({}, cal, {
                    askSide: cal.askSoundSide,
                    ansSide: cal.ansSoundSide,
                });
                HND.playCombineFromCal(app.id, unit.id, idx, audioCal, advance);
            }
        } else if (isLetter(e.key) || HEB_LAYOUT[e.code]) {
            state.errorCount++;
            const wrongChar = displayCharForKey(e);
            HND.log("apple WRONG",
                    "key=" + e.key, "code=" + e.code,
                    "shown=" + wrongChar, "errors=" + state.errorCount);
            spawnFallingApple(wrongChar);
            // Original .frm:643-651 — at ErrorCount = 8 the goat goes into
            // the "eat" cycle and GameEnabled is set False. TimerGoatBmp
            // Case 2 (the eat-completion) then auto-advances to the next
            // question. The user cannot keep typing after all 8 apples
            // have fallen.
            if (state.errorCount >= 8) {
                state.gameEnabled = false;
                setGoat("eat");
                HND.log("apple Q FAIL", "q=" + (state.current + 1),
                        "errorCount=8 → auto-advance");
                state.errorsByQ.push(2);             // category 2 = many errors
                addBasketFor(state.current, state.errorCount);
                // Score: original AddScore uses 100/(QCount+1)/16 per tic,
                // for (8 - errors) tics. With errors=8, AddScore = 0 here.
                // Let the goat-eat animation play out (~1.6s), then move on.
                setTimeout(function () {
                    state.current++;
                    if (state.current >= QCOUNT) winGame();
                    else initQuestion();
                }, 1800);
            } else {
                setGoat("no");
            }
        }
    }

    // Spawn a falling apple — original AppleFall_Timer (GameApple.frm:167-235):
    //   Frame 1-8:  PaintApple(i, frame)         — apple wobbles on the tree
    //   Frame 9-16: Y = origY + (440-origY)/7*(frame-9)   — parabolic drop to y=440
    //   Frame 17:   apple lands; DrawString CharToDraw at
    //               (ApplePos.X+20, ApplePos.Y-50) in RGB(220,0,0)
    // Each slot has a DIFFERENT fall distance because original Y varies
    // (108-242). The wrong char appears as a separate label hovering ABOVE
    // the landed apple (NOT inside the apple sprite).
    function spawnFallingApple(ch) {
        const slots = Array.from(treeLayer.querySelectorAll(".apple-static"));
        if (!slots.length) return;
        const stillOnTree = slots.filter(function (n) { return n.style.opacity !== "0"; });
        const target = stillOnTree.length
            ? stillOnTree[Math.floor(Math.random() * stillOnTree.length)]
            : slots[0];
        const slotIdx = parseInt(target.dataset.slot, 10);
        const p = APPLE_POS[slotIdx];
        target.style.opacity = "0";
        // Per-apple fall distance (Y_end = 440 per .frm).
        const dy = 440 - p[1];
        // Original PaintApple uses ApplePic(Stage) — Stage 0 = red,
        // Stage 1 = yellow. The fallen apple must match the on-tree
        // apples' current color.
        const colorCls = state.stage === 1 ? "yellow" : "red";
        const apple = HND._el("div", { class: "apple-fall " + colorCls });
        apple.style.cssText =
            "left:" + p[0] + "px; top:" + p[1] + "px;" +
            "--fall-dy:" + dy + "px;";
        fallLayer.appendChild(apple);
        // Wrong-char label floats 50 px ABOVE the apple (DrawString at
        // ApplePos.Y - 50) in red, drops with the apple.
        const label = HND._el("div", { class: "apple-char-label", text: ch });
        label.style.cssText =
            "left:" + (p[0] + 20) + "px; top:" + (p[1] - 50) + "px;" +
            "--fall-dy:" + dy + "px;";
        fallLayer.appendChild(label);
        // Original keeps the apple at y=440 (frame 100+ phase, picked up
        // by the goat at end-of-Q). We leave them for the rest of the
        // question; cleanup happens in renderTreeApples on next Q.
    }
    function clearFallenApples() {
        fallLayer.innerHTML = "";
    }
    // Pick phase: when the goat walks across (state "pick"), the fallen
    // apples on the ground get scooped up one by one in the original
    // (TimerGoatBmp 100..113 phase, .frm:204-228). We approximate by
    // fading each .apple-fall + its .apple-char-label as the goat sweeps.
    function fadeOutFallenApples() {
        const items = fallLayer.children;
        const STEP = 1400 / Math.max(1, items.length);   // walk lasts ~1.6s
        for (let i = 0; i < items.length; i++) {
            (function (el, delay) {
                setTimeout(function () {
                    el.style.transition = "opacity 0.25s";
                    el.style.opacity = "0";
                }, delay);
            })(items[i], 100 + i * STEP);
        }
    }

    function winGame() {
        if (state.completed) return;
        state.completed = true;
        const score = Math.min(100, Math.round(state.totalScore));
        HND.log("apple FINISH", "score=" + score);
        HND.saveProgress(app.id, unit.id, "apple", score, state.errorsByQ);
        setGoat("win");
        if (score > 60) {
            HND.playWave("assets/" + app.id + "/sounds/win.wav");
        }
        const bigApple = HND._el("div", { class: "ctrl apple-big" });
        root.appendChild(bigApple);
        const stage = root.parentElement;

        // Drain animation — original ScoreTimer_Timer (GameApple.frm:757-805):
        //   AddScore = 100 / (QCount+1) / 16
        //   For each non-zero BasketStatus, every tick:
        //     - drop one apple from basket (decrement count)
        //     - TotalScore += AddScore
        //     - When the basket empties, TotalScore += AddScore * 8 (bonus)
        //   Tick interval ≈ 80 ms. tic.wav plays each tick.
        // We schedule one tick per (basket × apple) and update the basket
        // sprite + score number live.
        const drainPlan = [];     // each entry: {qIdx, remaining}
        state.baskets.forEach(function (errors, qi) {
            if (errors > 0) drainPlan.push({ qIdx: qi, remaining: errors });
        });
        let drainScore = 0;
        const TICK = 80;
        function drainTick() {
            const job = drainPlan[0];
            if (!job) {                                  // drained everything
                setTimeout(function () {
                    HND.showScoreForm(
                        stage, app.id, unit.name, userName, score, state.errorsByQ,
                        function onExit() {
                            location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                        },
                        function onReplay() {
                            location.hash = "#/" + app.id + "/unit/" + unit.id + "/apple";
                        }
                    );
                }, 400);
                return;
            }
            job.remaining--;
            state.baskets[job.qIdx] = job.remaining;
            renderBaskets();
            HND.playWave("assets/" + app.id + "/sounds/tic.wav");
            if (job.remaining === 0) drainPlan.shift();
            drainScore += score / Math.max(1, state.errorsByQ.length * 3);
            setTimeout(drainTick, TICK);
        }
        if (drainPlan.length) {
            setTimeout(drainTick, 400);                  // brief pause before drain
        } else {
            // Perfect game (no baskets): skip drain, go straight to score.
            setTimeout(function () {
                HND.showScoreForm(
                    stage, app.id, unit.name, userName, score, state.errorsByQ,
                    function onExit() {
                        location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                    },
                    function onReplay() {
                        location.hash = "#/" + app.id + "/unit/" + unit.id + "/apple";
                    }
                );
            }, 1400);
        }
        if (onComplete) onComplete(score);
    }

    function keyHandler(e) {
        if (state.completed) {
            document.removeEventListener("keydown", keyHandler);
            return;
        }
        // F1 = CmdHelp_Click — replays the game1.wav instructions per
        // GameApple.frm:248-266. Sound file may be shared across games.
        if (e.key === "F1") {
            e.preventDefault();
            HND.playWave("assets/" + app.id + "/sounds/game1.wav");
            return;
        }
        onKey(e);
    }
    document.addEventListener("keydown", keyHandler);

    initQuestion();
};
