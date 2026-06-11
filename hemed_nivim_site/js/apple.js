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
    const preloadDone = (function preloadAppleSprites() {
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
        // goatani0_* (pick-walk) + goatani2_* (eat-walk) sprites.
        for (let i = 0; i <= 10; i++) names.push("goatani0_" + i);
        for (let i = 0; i <= 7; i++) names.push("goatani2_" + i);
        return HND.preloadFrames(app.id, "GameApple", names);
    })();
    // Hide the STAGE (not just gameRoot) until ALL sprites + the bg.png
    // are decoded, then fade in. Gating on root (= gameRoot) leaves the
    // .stage element's background-image flashing because it's the parent
    // — fade the parent to cover everything including the bg.png.
    const stageEl = root.parentElement;          // .stage div from makeStage
    HND.fadeInOnReady(stageEl || root, preloadDone);

    // Per-unit calibration (orig CurrentCalibration). Apple's slot is 7
    // (cal-block 4). Hemed+Nivim have several units with CombineQA="8"
    // or "7" and a handful with WhatToAsk=qLeft (flipped Q/A).
    const cal = HND.gameCalibrationFromSlot(unit, app.id, 4);
    const askCol  = cal.askCol;
    const ansCol  = cal.ansCol;
    // Per orig GameApple.frm — audio playback ALWAYS uses the TEXT sides
    // (WhatToAsk / WhatToAnswer), NOT the audio-override fields. The
    // *Sound variants are only used at orig:697 to decide whether to
    // SHOW the sound button (`If Not WhatToAskSound = qDisabled Then …`).
    // The CombineQA chain at orig:637-661 + :951-967 calls
    //   SetWaveName CurrentCalibration.WhatToAsk
    //   SetWaveName CurrentCalibration.WhatToAnswer
    // exclusively. An earlier port revision wrongly bound these to the
    // sound-override sides — fixed back to the text sides.
    const askSide = cal.askSide;
    const ansSide = cal.ansSide;

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
        basketStages: [],     // [qIdx] → null | stage AT TIME OF PLACEMENT
                              // (so a later stage flip doesn't recolor history)
        // Per-question banned-key set. Original GameApple.frm:593:
        //   If BannedChars(KeyCode) = True Then Exit Sub
        //   Else BannedChars(KeyCode) = True
        // Once a physical key is pressed during a question, all subsequent
        // presses of the SAME key are ignored — no error, no apple drop,
        // no goat reaction. Reset on InitQuestion (.frm:461 ReDim).
        bannedKeys: new Set(),
    };
    for (let i = 0; i < QCOUNT; i++) {
        state.baskets.push(null);
        state.basketStages.push(null);
    }
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
    // Orig PlayGame:340-355 — A_Corner/Q_Corner X assignment:
    //   DEFAULT (WhatToAnswer != qRight OR WhatToAsk != qLeft):
    //     A_Corner.X = RIGHT formula = 25 + 7.5*M + 5 + (750-7.5*M)/2
    //     Q_Corner.X = LEFT  formula = 25 + (7.5*M)/2 - 5
    //   FLIPPED (WhatToAnswer=qRight AND WhatToAsk=qLeft):
    //     Middle ← 100 - Middle, then A on LEFT, Q on RIGHT.
    //   THEN if SideToAsk=qLeft: mirror via 800 - X.
    // cal.askSide / cal.ansSide are "right"/"left" strings per data.js
    // SIDE_NAME. We expose SideToAsk via cal.sideToAskLeft when needed
    // (currently the port doesn't expose it, so defaults to qRight).
    let effMiddle = unitMiddle;
    let aCornerX, qCornerX;
    const flipped = (cal.ansSide === "right" && cal.askSide === "left");
    if (flipped) {
        effMiddle = 100 - unitMiddle;
        aCornerX = Math.round(25 + (7.5 * effMiddle) / 2 - 5);
        qCornerX = Math.round(25 + 7.5 * effMiddle + 5 + (750 - 7.5 * effMiddle) / 2);
    } else {
        aCornerX = Math.round(25 + 7.5 * effMiddle + 5 + (750 - 7.5 * effMiddle) / 2);
        qCornerX = Math.round(25 + (7.5 * effMiddle) / 2 - 5);
    }
    const dividerX = Math.round(effMiddle * 7.5 + 25);
    HND.log("apple geom", "middle=" + unitMiddle, "aX=" + aCornerX,
            "qX=" + qCornerX, "divX=" + dividerX);

    // Picture-mode (orig PlayGame:369-372 + :545-549). When EITHER side
    // is qPicture, the bottom-left "loah" chalkboard is painted and a
    // per-Q picture is revealed top-down (TimerShowPic).
    const picMode = (cal.whatToAsk === 3 || cal.whatToAnswer === 3);
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
    // Sound icon (orig CmdSound) — visibility gated on calibration.
    // Per .frm:697-702: only loaded/shown when WhatToAskSound != qDisabled,
    // which corresponds to cal.askSoundSide != null in the port helper.
    const sound        = HND._el("button", { class: "ctrl apple-sound", title: "השמע" });
    if (!cal.askSoundSide) sound.style.display = "none";
    // Orig Form_Paint:693-694 — TimerGoatFileName="Enter" fires AFTER the
    // help wave (game4.wav) is loaded. Don't start "enter" at DOM-create;
    // chain it from the initial showHelpOverlay onDone callback below.
    const goat         = HND._el("div", { class: "ctrl apple-goat" });
    // Build a stack of all goat-frame <img> tags inside the goat element.
    // Each frame lives PERMANENTLY in the DOM so the browser keeps every
    // texture warm in GPU cache. Frame switching = just toggle which img
    // has opacity:1 — no CSS background-image swap, no fetch/decode/upload
    // delay between frames, no transparent gap showing the back.png.
    // poseSpecs: { poseName: [filePrefix, frameCount, fileSuffix?] }
    const POSES = {
        stand:  ["goat_stand", 1],
        sad:    ["goat_sad",   1],
        enter:  ["goat_enter", 9],
        yes:    ["goat_yes",   8],
        no:     ["goat_no",    9],
        eat:    ["goat_eat",   7],
        pick:   ["goat_pick",  5],
        win:    ["goat_win",   8],
        // pick-walk + eat-walk are positioned by JS, sprite cycled too
        "pick-walk": ["goatani0_", 11, true],  // 0-indexed (goatani0_0..10)
        "eat-walk":  ["goatani2_", 8,  true],  // 0-indexed (goatani2_0..7)
    };
    const goatFrames = {};   // poseName → array of <img> elements
    for (const pose in POSES) {
        const spec = POSES[pose];
        const prefix = spec[0], count = spec[1], zeroIdx = spec[2];
        const arr = [];
        for (let i = 0; i < count; i++) {
            const n = zeroIdx ? i : (i + 1);
            const img = document.createElement("img");
            img.className = "apple-goat-frame";
            img.dataset.pose  = pose;
            img.dataset.frame = String(n);
            img.src = "assets/" + app.id + "/pictures/GameApple/" + prefix + n + ".png";
            img.draggable = false;
            arr.push(img);
            goat.appendChild(img);
        }
        goatFrames[pose] = arr;
    }
    // Show frame N of `pose` (others hidden). 0-based.
    function showGoatFrame(pose, idx) {
        // Hide ALL frames across ALL poses first, then show the target.
        // (Was: only hid siblings in the same pose, so switching poses
        // left the previous pose's last-shown frame visible — produced
        // multiple overlapping goat sprites on screen.)
        for (const p in goatFrames) {
            const arr = goatFrames[p];
            for (let i = 0; i < arr.length; i++) arr[i].style.opacity = "0";
        }
        const arr = goatFrames[pose];
        if (arr && arr[idx]) arr[idx].style.opacity = "1";
    }
    // Clear all goat frames (all opacity 0).
    function hideAllGoatFrames() {
        for (const pose in goatFrames) {
            const arr = goatFrames[pose];
            for (let i = 0; i < arr.length; i++) arr[i].style.opacity = "0";
        }
    }
    hideAllGoatFrames();
    const fallLayer    = HND._el("div", { class: "ctrl apple-fall-layer" });
    // Picture-mode UI — only created when the unit's calibration uses
    // qPicture. loah is the chalkboard background; qPicBox holds the
    // per-Q image with a top-down clip-path reveal (CSS) driven by
    // setting `--pic-reveal` per question.
    const loah    = picMode ? HND._el("div", { class: "ctrl apple-loah" })    : null;
    const qPicBox = picMode ? HND._el("div", { class: "ctrl apple-qpic" })    : null;
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
    if (loah)    root.appendChild(loah);
    if (qPicBox) root.appendChild(qPicBox);

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
    // BasketStatus per the original GameApple.frm:
    //   state.baskets[i]      → wrong-apple count for question i, or null
    //   state.basketStages[i] → 0 or 1 = stage AT THE TIME basket was placed
    // Orig PlayGame:998 increments `BasketStatus(i) += 1 * (Stage*2 - 1)`
    // once per wrong apple, encoding stage in the SIGN. The point is that
    // each basket's color is locked at creation: orig uses BitBlt to paint
    // each basket once at BasketPos and never re-paints prior baskets on
    // stage transitions. We mirror that with a parallel stages array so
    // later stage flips don't recolor history.
    function renderBaskets() {
        basketLayer.innerHTML = "";
        state.baskets.forEach(function (errors, qi) {
            if (errors == null) return;
            if (qi >= BASKET_POS.length) return;
            const p = BASKET_POS[qi];
            const b = HND._el("div", { class: "ctrl apple-basket" });
            const basketStage = state.basketStages[qi] != null
                              ? state.basketStages[qi] : state.stage;
            // Sprite N = current GOOD apples in basket. Default: 8 - errors
            // (initial state). During score-drain, state.basketsLiveGood[qi]
            // overrides and decrements toward 0 — basket VISIBLY EMPTIES per
            // orig ScoreTimer (.frm:765-774).
            const baseGood = 8 - errors;
            const liveOverride = state.basketsLiveGood
                              && state.basketsLiveGood[qi] != null
                              ?  state.basketsLiveGood[qi] : null;
            const good = liveOverride != null ? liveOverride : baseGood;
            const n = Math.max(0, Math.min(8, good));
            b.style.cssText =
                "left:" + p[0] + "px; top:" + (p[1] - 20) + "px;" +
                "background-image: url('assets/" + app.id +
                "/pictures/GameApple/basket" + basketStage + "_" + n + ".png');";
            basketLayer.appendChild(b);
        });
    }
    function addBasketFor(qIdx, errorCount) {
        // Stage capture only — visual render is deferred via placeBasketWhenGoatArrives.
        // Per orig .frm:861-866 the basket is BitBlt'd by TimerGoatBmp Case 0
        // ONLY when GoatX is between -40 and 0 (~80% through the walk-out),
        // i.e. when the goat physically arrives at the basket pile area.
        // The basket's color is locked at this capture time (orig encodes
        // it in BasketStatus sign via Stage*2-1); we use a parallel
        // basketStages array so the basket keeps its red/yellow regardless
        // of a later stage flip.
        state.baskets[qIdx]      = errorCount;
        state.basketStages[qIdx] = state.stage;
        // NOTE: do NOT call renderBaskets() here — that would draw the
        // basket immediately while the goat is still at home. The caller
        // schedules placeBasketWhenGoatArrives() inside the pick-walk chain.
    }
    // Place the basket "when the goat arrives" — schedules a render at
    // ~80% of the pick-walk (matching orig's GoatX<-40 trigger point,
    // 1.6s × 0.8 ≈ 1280ms). Pass `0` delay for the eat path which has no
    // home-to-basket walk (basket already placed during the failed Q).
    function placeBasketWhenGoatArrives(delay) {
        setTimeout(renderBaskets, delay != null ? delay : 1280);
    }

    // Header
    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
    // Orig Form_Paint:709-710 — TempStr = UnitName + AllTips(116) +
    // UserName + AllTips(112). AllTips(116) = "שם היחידה:" (unit name
    // label), AllTips(112) = "שם התלמיד:" (student name label). In
    // Hebrew RTL display this reads naturally as:
    //   "שם התלמיד: <user>  שם היחידה: <unit>"
    function renderHeader() {
        // Orig Form_Paint:709-710 — exact byte concatenation, no extra
        // spaces:  UnitName + AllTips(116) + UserName + AllTips(112).
        //   AllTips(116) = "שם היחידה:"  (unit-name label, follows value)
        //   AllTips(112) = "שם התלמיד:"  (student-name label)
        // In RTL display this reads naturally as:
        //   "שם התלמיד: <user>  שם היחידה: <unit>"
        const sepUnit = HND.tip(app.id, 116) || " · ";
        const sepUser = HND.tip(app.id, 112) || "";
        header.textContent = unit.name + sepUnit
                           + (userName ? userName + sepUser : "");
    }
    renderHeader();
    if (HND.loadTips) HND.loadTips(app.id).then(renderHeader);

    sound.addEventListener("click", function () {
        if (!state.gameEnabled) return;
        const idx = idOrder[state.current];
        // Orig CmdSound_Click:279 uses WhatToAsk (text side), not WhatToAskSound.
        // cal.askSide = TEXT side; cal.askSoundSide = audio-override side.
        if (idx != null) HND.playWave(HND.unitWavePath(app.id, unit.id, idx, cal.askSide));
    });

    // Match VB6 RealChar — accepts Hebrew letters + ASCII letters + digits
    // (GamesMoudle.bas:534 — CharID > 47 And CharID < 58 includes 0-9).
    // Punctuation / control chars are filtered upstream by e.key.length===1.
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

    // Orig goat state durations — all timers tick at 70 ms (TimerGoatJpg
    // and TimerGoatBmp .frm:40,46). Frame counts from disk (see preload
    // list). Duration = frameCount × 70 ms.
    //   enter: 9 × 70 = 630   |   yes: 8 × 70 = 560
    //   no:    9 × 70 = 630   |   eat: 7 × 70 = 490
    //   pick:  5 × 70 = 350   |   win INITIAL: 8 × 70 = 560 (then loop class)
    // Walk durations — orig TimerGoatBmp Case 0 (pick) moves GoatX -= 25
    // each tick after a 4-tick warmup; distance 629 → off-screen (<-200)
    // ≈ 829 px → ~33 movement ticks + 4 warmup = ~37 ticks × 70 ms ≈ 2590.
    // Eat-walk Case 2 moves -18 px before GoatX<220 and -25 after, giving
    // a slightly longer ~2800 ms total.
    const GOAT_DUR = {
        enter: 630, yes: 560, no: 630, eat: 490, pick: 350,
        "pick-walk": 2590, "eat-walk": 2800, win: 560,    // win = INITIAL only
        sad: 0, stand: 0, "": 0,
    };
    // JS-driven goat frame cycler — replaces CSS keyframes that flashed
    // back.png between background-image swaps. All frame <img>s already
    // live in the DOM (built above); cycling = just toggling opacity.
    let goatChainTimer = null;
    let goatFrameTimer = null;
    function _stopGoatTimers() {
        if (goatChainTimer) { clearTimeout(goatChainTimer); goatChainTimer = null; }
        if (goatFrameTimer) { clearInterval(goatFrameTimer); goatFrameTimer = null; }
    }
    function _applyGoatClass(stateName) {
        // Keep "visible" + class hooks for non-sprite styling (eat-walk
        // background-size override, transform animations for walk-translate).
        ["enter", "stand", "sad", "yes", "no", "eat", "pick",
         "pick-walk", "eat-walk", "win", "win-loop"]
            .forEach(function (s) { goat.classList.remove(s); });
        void goat.offsetWidth;
        if (stateName) goat.classList.add(stateName);
        goat.classList.add("visible");
    }
    // Cycle through frames of a pose at 70 ms/frame (orig TimerGoatJpg).
    // opts:
    //   loopFrom    — index to restart at on overflow (for "win" loop)
    //   loopForMs   — keep cycling (wrap-around) for this many ms total,
    //                 then stop + onDone. Used by walks where the position
    //                 transform animation is longer than one frame cycle
    //                 — orig TimerGoatBmp loops the sprite cycle for the
    //                 full walk duration (37 ticks × 70 ms for pick-walk).
    //   onDone      — called when finished (overflow OR loopForMs expires).
    function _cycleFrames(pose, opts) {
        opts = opts || {};
        const arr = goatFrames[pose];
        if (!arr || !arr.length) return;
        let i = 0;
        showGoatFrame(pose, 0);
        if (arr.length === 1) {
            if (opts.onDone) opts.onDone();
            return;
        }
        // Walk-style: wrap frames continuously for a fixed duration.
        if (opts.loopForMs) {
            goatFrameTimer = setInterval(function () {
                i = (i + 1) % arr.length;
                showGoatFrame(pose, i);
            }, 70);
            goatChainTimer = setTimeout(function () {
                if (goatFrameTimer) { clearInterval(goatFrameTimer); goatFrameTimer = null; }
                goatChainTimer = null;
                if (opts.onDone) opts.onDone();
            }, opts.loopForMs);
            return;
        }
        // One-shot: play 0..N-1, then onDone (or loopFrom for win).
        goatFrameTimer = setInterval(function () {
            i++;
            if (i >= arr.length) {
                if (opts.loopFrom != null) {
                    i = opts.loopFrom;
                    showGoatFrame(pose, i);
                } else {
                    clearInterval(goatFrameTimer);
                    goatFrameTimer = null;
                    if (opts.onDone) opts.onDone();
                }
                return;
            }
            showGoatFrame(pose, i);
        }, 70);
    }
    // setGoat(state, [onDone]) — drives a JS frame-cycle for the state.
    function setGoat(stateName, onDone) {
        _stopGoatTimers();
        _applyGoatClass(stateName);
        // Static-frame poses — no cycle.
        if (stateName === "stand") { showGoatFrame("stand", 0); return; }
        if (stateName === "sad")   { showGoatFrame("sad",   0); return; }
        // "win" two-phase (orig:976-980): cycle frames 0..7 once, then loop
        // from frame 3 (= TimerGoatCount=4 in 1-indexed orig) forever.
        if (stateName === "win") {
            _cycleFrames("win", { loopFrom: 3 });
            // No onDone — win is terminal.
            return;
        }
        // Walks — sprite frames LOOP for the full walk duration (matches
        // orig TimerGoatBmp where TimerGoatBmpCount wraps via
        // `If TimerGoatBmpCount > FrameN Then TimerGoatBmpCount = 1`
        // until GoatX < -200). Without looping, the goat would freeze on
        // its last sprite for ~70% of the position animation.
        if (stateName === "pick-walk" || stateName === "eat-walk") {
            _cycleFrames(stateName, {
                loopForMs: GOAT_DUR[stateName],
                onDone: onDone,
            });
            return;
        }
        // Other states (enter, yes, no, eat, pick): play through frames
        // once, then onDone or fall back to stand.
        _cycleFrames(stateName, {
            onDone: function () {
                if (onDone) onDone();
                else { _applyGoatClass("stand"); showGoatFrame("stand", 0); }
            },
        });
    }
    // "pick" in orig is TWO phases: goat_pick frames at home position
    // (.frm:660-690 — TimerGoatJpg cycles goat_pick1..5), THEN the
    // goatani0 walk-to-basket (.frm:846-870 — TimerGoatBmp Case 0).
    // Chain them via setGoat callbacks so they don't race.
    function pickThenWalk(onDone) {
        setGoat("pick", function () {
            setGoat("pick-walk", function () {
                // Snap goat back to stand pose at home. setGoat() handles
                // both the class swap AND showing the stand frame —
                // _applyGoatClass alone leaves the last pick-walk sprite
                // visible (only the CSS class changed, not the frame).
                setGoat("stand");
                if (onDone) onDone();
            });
        });
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
        let realCharCount = 0;
        for (let i = 0; i < ansText.length; i++) {
            const sel = isLetter(ansText[i]);
            state.selected.push(sel);
            state.filled.push(!sel);
            if (sel) realCharCount++;
        }
        // Edge case: answer has no real letters (all punctuation / spaces).
        // Orig would render the Q but never accept any keypress as
        // completing — game stuck. Skip to next Q instead.
        if (realCharCount === 0) {
            HND.log("apple skip no-letters", "q=" + (state.current + 1));
            state.current++;
            return initQuestion();
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
        // Picture-mode: orig TimerShowPic:1015-1018 has TWO branches:
        //   Small  (W<150 AND H<120): native size, CENTERED at
        //     (27+(130-W)/2, 299+(130-H)/2), top-down 9-slice reveal.
        //   Large: StretchBlt to 150×120 at (17, 302), INSTANT (no reveal).
        // We load the image to measure naturalWidth/Height, then apply.
        if (qPicBox) {
            const dataRoot = (HND.APPS && HND.APPS[app.id] && HND.APPS[app.id].dataRoot)
                           || ("data/" + app.id);
            const url = dataRoot + "/unit_" + unit.id + "/pic/" + idx + ".png";
            qPicBox.classList.remove("revealing", "instant");
            qPicBox.style.backgroundImage = "url('" + url + "')";
            const probe = new Image();
            probe.onload = function () {
                const w = probe.naturalWidth, h = probe.naturalHeight;
                if (w < 150 && h < 120) {
                    // Small — native size, centered in the 130×... slot.
                    qPicBox.style.width  = w + "px";
                    qPicBox.style.height = h + "px";
                    qPicBox.style.left   = (27 + (130 - w) / 2) + "px";
                    qPicBox.style.top    = (299 + (130 - h) / 2) + "px";
                    qPicBox.style.backgroundSize = w + "px " + h + "px";
                    void qPicBox.offsetWidth;
                    qPicBox.classList.add("revealing");
                } else {
                    // Large — stretch-fit to 150×120 at (17, 302), instant.
                    qPicBox.style.width  = "150px";
                    qPicBox.style.height = "120px";
                    qPicBox.style.left   = "17px";
                    qPicBox.style.top    = "302px";
                    qPicBox.style.backgroundSize = "150px 120px";
                    qPicBox.classList.add("instant");
                }
            };
            probe.src = url;
        }
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
        // initQuestion already played the Q wave on game start. Marker only.
        state.userInteracted = true;
        // Orig Form_KeyUp:581-593 ordering:
        //   1. KeyChar1/2 = GetCharFromKey(KeyCode); test RealChar
        //   2. If isRealChar = False Then Exit Sub  (line 590 — NO ban!)
        //   3. If BannedChars(KeyCode) Then Exit Sub Else add ban
        // The ban only applies to letter/digit keys. Modifiers and symbols
        // are filtered out BEFORE the ban check, so they can be pressed
        // any number of times without "using up" a ban slot.
        const isReal = isLetter(e.key) || !!HEB_LAYOUT[e.code];
        if (!isReal) return;
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
            // Check if all selected chars are filled.
            const goNext = state.selected.every(function (s, i) {
                return !s || state.filled[i];
            });
            // Orig Form_KeyUp:638 — `PlayWave SmallGood.wav` on EVERY
            // correct keypress (even mid-word). Only the final keypress of
            // the word also triggers the CombineQA + good[N] chain below.
            if (!goNext) {
                HND.playWave("assets/" + app.id + "/sounds/smallgood.wav");
            }
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
                // Orig: NO score awarded on Q completion. Score accrues
                // ONLY during ScoreTimer drain (AddScore per tick + 8×bonus
                // per emptied basket). Removing this prevents double-count.
                addBasketFor(state.current, state.errorCount);
                // Orig sequence (.frm:632-694): yes-frames → on overflow,
                // play CombineQA chain → on chain done, pick-frames → on
                // overflow, goatani0 walk → on walk done, InitQuestion.
                // CombineQA uses TEXT sides per orig:951-967 (NOT the
                // *Sound override fields). cal.askSide/ansSide already
                // hold these — no override needed.
                setGoat("yes", function () {
                    // Orig flow (.frm:957-958 + TimerGoatJpg overflow):
                    // After yes-frames overflow, BOTH chains run in parallel:
                    //   (a) Audio: CombineQA wave → SoundStatus=13 →
                    //       good[N].wav → SoundStatus=-10 → InitQuestion.
                    //   (b) Goat: pick-frames (350 ms) → TimerGoatBmpAni=0 →
                    //       walk-to-basket (~2.59 s).
                    // Case -10 only fires InitQuestion if TimerGoatBmpAni<0,
                    // so the actual advance waits for whichever finishes
                    // LATER. We use a 2-arm counter: both arms must complete
                    // before advancing.
                    let armsRemaining = 2;
                    function arm() {
                        if (--armsRemaining === 0) {
                            state.current++;
                            if (state.current >= QCOUNT) {
                                // Orig:937 — WinGame triggered by Enter
                                // overflow after the walk-back.
                                setGoat("enter", function () { winGame(); });
                            } else {
                                initQuestion();
                            }
                        }
                    }
                    // Arm A: audio chain (CombineQA + good[1-3].wav praise).
                    HND.playCombineFromCal(app.id, unit.id, idx, cal,
                                           arm, { praiseMax: 3 });
                    // Arm B: visual chain (pick-frames → walk → basket place).
                    fadeOutFallenApples();
                    placeBasketWhenGoatArrives(2420);
                    pickThenWalk(arm);
                });
            } else {
                // Partial fill — just the brief yes pose; auto-returns to stand.
                setGoat("yes");
            }
        } else {
            // Wrong key. (The isReal gate at the top of onKey already
            // ensured this is a letter/digit/Hebrew-mapped key.)
            state.errorCount++;
            const wrongChar = displayCharForKey(e);
            HND.log("apple WRONG",
                    "key=" + e.key, "code=" + e.code,
                    "shown=" + wrongChar, "errors=" + state.errorCount);
            spawnFallingApple(wrongChar);
            // Orig Form_KeyUp:671-675 — ra2.wav on the 8th-error (eat path),
            // ra.wav on 1-7 (no path). Played BEFORE AppleFall.Enabled=True.
            const wrongWave = state.errorCount >= 8 ? "ra2.wav" : "ra.wav";
            HND.playWave("assets/" + app.id + "/sounds/" + wrongWave);
            // Original .frm:643-651 — at ErrorCount = 8 the goat goes into
            // the "eat" cycle and GameEnabled is set False. TimerGoatBmp
            // Case 2 (the eat-completion) then auto-advances to the next
            // question. The user cannot keep typing after all 8 apples
            // have fallen.
            if (state.errorCount >= 8) {
                state.gameEnabled = false;
                HND.log("apple Q FAIL", "q=" + (state.current + 1),
                        "errorCount=8 → auto-advance");
                state.errorsByQ.push(2);             // category 2 = many errors
                addBasketFor(state.current, state.errorCount);
                // Orig sequence (.frm:847-902): eat frames at home → frame
                // overflow → TimerGoatBmpAni=2 walk-out → walk OFF SCREEN
                // → reset to (629,335) → STAGE = 1 → InitQuestion. Stage
                // flip is the LAST step before the next-Q init, not at the
                // start of eat. The basket already placed retains stage 0
                // (captured at addBasketFor); the next basket will be stage 1.
                setGoat("eat", function () {
                    // Orig:907 — eat-walk uses GoatPic(2) sprites at GoatY+88
                    // (lower on screen, carrying off the bad-apple basket).
                    // Orig eat-walk Case 2: moves -18 px/tick until GoatX<220,
                    // then -25/tick. Slower than pick-walk → ~2800 ms total.
                    // Basket placement at ~80% = ~2240 ms after walk start.
                    placeBasketWhenGoatArrives(2240);
                    setGoat("eat-walk", function () {
                        if (state.stage === 0) {
                            HND.log("apple stage", "0 → 1 (eat-walk end)");
                            state.stage = 1;
                        }
                        // Snap to stand pose at home (same fix as pick-walk).
                        setGoat("stand");
                        state.current++;
                        if (state.current >= QCOUNT) {
                            // Same orig sequence as the correct path: after
                            // walk-out, Enter cycle walks goat back home,
                            // THEN WinGame paints BigApple.
                            setGoat("enter", function () { winGame(); });
                        } else {
                            initQuestion();
                        }
                    });
                });
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
    // Pick phase: when the goat walks across (.pick-walk), the fallen
    // apples on the ground get scooped up one by one (orig TimerGoatBmp
    // phase 100..113, .frm:204-228 — goat erases each apple as GoatX
    // passes its X position). We sync each apple's fade to the goat's
    // X-arrival time: walk is 1.6s from x=629 to x=-820, so goat reaches
    // any apple at x_apple when goat-x crosses it.
    //   goatX(t) = 629 - (1450 * t/1600)   (1450px span over 1600ms)
    //   time-to-reach(x_apple) = (629 - x_apple) * 1600 / 1450
    // Each apple-fall sprite uses the slot's APPLE_POS.X as the trigger X.
    function fadeOutFallenApples() {
        const items = fallLayer.children;
        const WALK_DUR = 1600, WALK_SPAN = 1450;
        for (let i = 0; i < items.length; i++) {
            const el = items[i];
            const left = parseInt(el.style.left, 10) || 100;
            // Goat sprite is 170 px wide; treat its CENTER (left+85) as the
            // pickup line. Subtract 85 so the apple disappears as the goat
            // OVERLAPS it, not when its leading edge reaches the apple's X.
            const apple_x = left + 12;          // apple sprite is ~24 wide
            const goatLeadX = apple_x + 85;
            const t = Math.max(0, Math.min(WALK_DUR,
                (629 - goatLeadX) * WALK_DUR / WALK_SPAN));
            (function (node, delay) {
                setTimeout(function () {
                    node.style.transition = "opacity 0.18s";
                    node.style.opacity = "0";
                }, delay);
            })(el, t);
        }
    }

    function winGame() {
        if (state.completed) return;
        state.completed = true;
        HND.log("apple FINISH", "drain begins");
        // Orig WinGame:1022-1030 hides CmdExit/CmdHelp/CmdSound and paints
        // BigApple at (192, 0). saveProgress moved to drain end so the
        // recorded score reflects the ACTUAL drain-accumulated value
        // (AddScore × ticks + 8×bonus per empty basket) per orig formula,
        // not a flat 100/QCOUNT per Q completed.
        sound.style.display = "none";
        if (root.parentElement) {
            const helpBtn = root.parentElement.querySelector(".help-icon");
            const exitBtn = root.parentElement.querySelector(".exit-icon");
            if (helpBtn) helpBtn.style.display = "none";
            if (exitBtn) exitBtn.style.display = "none";
        }
        // Fully remove replayBtn from DOM (was display:none before, which
        // left a dead button in place + leaked event listener).
        if (replayBtn && replayBtn.parentNode) {
            replayBtn.parentNode.removeChild(replayBtn);
            replayBtn = null;
        }
        // Clear any fallen apples still on the ground from the last Q —
        // orig WinGame paints over the whole stage with BigApple.
        clearFallenApples();
        // Orig Form_Paint:786-810 — goat-pose is decided MID-DRAIN as
        // TotalScore accumulates: > 60 triggers "win" + Win.WAV; otherwise
        // "sad" at end of drain. We pre-set "sad" here and the drain loop
        // upgrades to "win" if the score crosses 60.
        setGoat("sad");
        const bigApple = HND._el("div", { class: "ctrl apple-big" });
        root.appendChild(bigApple);
        const stage = root.parentElement;

        // Drain animation — original ScoreTimer_Timer (GameApple.frm:757-840):
        //   AddScore = 100 / (QCount+1) / 16
        //   Each tick: pick FIRST non-empty basket, DROP ONE GOOD APPLE
        //   (basket sprite goes from N → N-1, i.e. basket VISIBLY EMPTIES),
        //   TotalScore += AddScore. When the basket empties, TotalScore +=
        //   AddScore * 8 (bonus). After all baskets empty: switch to score-
        //   tier wave + DrawString praise, then end. tic.wav plays per tick
        //   ONLY if Win.WAV isn't already playing (orig:791,797). Win.WAV
        //   starts MID-DRAIN as soon as TotalScore > 60.
        // Port: state.baskets[i] = errorCount; goodApples = 8 - errors.
        // Drain decrements goodApples toward 0 (matches orig direction).
        const live = HND._el("div", { class: "ctrl apple-score-live" });
        root.appendChild(live);
        function renderLiveScore(s) {
            live.textContent = String(Math.floor(s));
            const px = 40 + Math.floor(s) / 2;       // orig:792 font size formula
            live.style.fontSize = px + "px";
        }
        renderLiveScore(0);
        const drainPlan = [];
        state.baskets.forEach(function (errors, qi) {
            if (errors == null) return;
            const good = 8 - errors;                  // GOOD apples to drain out
            if (good > 0) drainPlan.push({ qIdx: qi, remaining: good });
        });
        const ADD_SCORE = 100 / (QCOUNT + 1) / 16;
        let totalScore = 0;
        let winFired = false;
        // Orig ScoreTimer:791,797 gates tic.wav on `WaveMe.Mode != mciModePlay`
        // — never plays a new tic while the previous is still in flight.
        // Mirror: track a "currently playing" flag via tic.wav's onended.
        let ticBusy = false;
        const TICK = 80;
        function finishAndShowScore() {
            // Score-tier wave + DrawString praise (orig:817-840). Buckets:
            // 0/60/70/80/90 selected by TotalScore range. AllTips entries
            // 124..128 are the praise strings:
            //   124 = "נסה שנית" (try again)  — for 0..59
            //   125 = "כמעט טוב" (almost good) — for 60..69
            //   126 = "טוב" (good)            — for 70..79
            //   127 = "טוב מאוד" (very good)   — for 80..89
            //   128 = "מצוין" (excellent)     — for 90..100
            const finalScore = Math.min(100, Math.round(totalScore));
            let bucket = "0", tipIdx = 124;
            if      (finalScore >= 90) { bucket = "90"; tipIdx = 128; }
            else if (finalScore >= 80) { bucket = "80"; tipIdx = 127; }
            else if (finalScore >= 70) { bucket = "70"; tipIdx = 126; }
            else if (finalScore >= 60) { bucket = "60"; tipIdx = 125; }
            // Praise text — orig:828-830 DrawString triple-shadow at (390, 254).
            const praise = HND.tip(app.id, tipIdx) || "";
            if (praise) {
                const praiseEl = HND._el("div", { class: "ctrl apple-praise", text: praise });
                root.appendChild(praiseEl);
            }
            // Chain: play score wave; when it ends, run the 1.7 s finale
            // (orig WaveMe_Done case -999, .frm:1086-1093):
            //   For i = 0 To 30: Sleep 70 - i ... TimerGoatJpg_Timer
            // sum(70-i for i=0..30) = 31×70 - 31×30/2·avg ≈ 1705 ms. The
            // goat-bounce/sad loop keeps cycling during this window. After
            // it, AddScore is recorded and the form is Unloaded.
            // Persist score AFTER drain so the saved value reflects the
            // actual drain math (AddScore × ticks + bonuses) per orig
            // SoundStatus=-999 → `AddScore CurrentUnit.unitId, ...` flow.
            HND.log("apple FINISH", "score=" + finalScore);
            HND.saveProgress(app.id, unit.id, HND.currentSlotKey(app.id, "apple"), finalScore, state.errorsByQ);
            HND.playWave("assets/" + app.id + "/sounds/score_" + bucket + ".wav", function () {
                setTimeout(function () {
                    HND.showScoreForm(
                        stage, app.id, unit.name, userName, finalScore, state.errorsByQ,
                        function onExit()   { location.hash = "#/" + app.id + "/unit/" + unit.id + "/games"; },
                        function onReplay() { HND.restartGame(app.id, unit.id, "apple"); }
                    );
                }, 1705);
            });
        }
        function drainTick() {
            const job = drainPlan[0];
            if (!job) { finishAndShowScore(); return; }
            // Decrement THIS basket's good apples (orig: BasketStatus toward 0).
            job.remaining--;
            state.basketsLiveGood = state.basketsLiveGood || {};
            state.basketsLiveGood[job.qIdx] = job.remaining;
            renderBaskets();
            totalScore += ADD_SCORE;
            // Basket empty? +bonus (orig:769 `AddScore * 8`).
            if (job.remaining === 0) {
                totalScore += ADD_SCORE * 8;
                drainPlan.shift();
            }
            renderLiveScore(totalScore);
            // Orig:785-797 — once score crosses 60, swap goat to "win" and
            // play Win.WAV ONCE (mid-drain). tic.wav stops thereafter.
            if (!winFired && totalScore > 60) {
                winFired = true;
                setGoat("win");
                HND.playWave("assets/" + app.id + "/sounds/win.wav");
            } else if (!winFired && !ticBusy) {
                // Orig:791,797 — tic.wav only if WaveMe.Mode != mciModePlay.
                // Skip if previous tic still playing; clear flag on onended.
                ticBusy = true;
                HND.playWave("assets/" + app.id + "/sounds/tic.wav",
                             function () { ticBusy = false; });
            }
            setTimeout(drainTick, TICK);
        }
        if (drainPlan.length) {
            setTimeout(drainTick, 400);                  // brief pause before drain
        } else {
            // Perfect game (no baskets to drain): credit full 100, play
            // Win.WAV, then chain into finishAndShowScore on its end so
            // the score wave doesn't overlap Win.WAV.
            totalScore = 100; renderLiveScore(100); setGoat("win");
            winFired = true;
            HND.playWave("assets/" + app.id + "/sounds/win.wav", finishAndShowScore);
        }
        if (onComplete) onComplete(0);
    }

    // Instructions overlay + game4.wav (orig CmdHelp_Click:248-266 +
    // WaveMe_Done SoundStatus=1 case at .frm:1054). Accepts optional onDone
    // callback so the caller can serialize the next-action (e.g. initial
    // initQuestion) AFTER the help wave finishes — orig Form_Paint:715
    // sets SoundStatus=1 so WaveMe_Done can fire InitQuestion on wave end.
    let helpEl = null;
    function showHelpOverlay(onDone) {
        const text = (cal.instructionsFliped && window.HND_QASwitched)
                   ? cal.instructionsFliped : cal.instructions;
        if (!helpEl) {
            helpEl = HND._el("div", { class: "ctrl apple-tip" });
            root.appendChild(helpEl);
        }
        if (text && text !== "0") {
            helpEl.textContent = text;
            helpEl.style.display = "block";
        }
        // Orig CmdHelp_Click:252-256 — overlay shown until SoundStatus=25
        // fires from WaveMe_Done (i.e. until game4.wav finishes). Tie our
        // overlay-hide to the wave's onended callback, not a fixed timer.
        HND.playWave("assets/" + app.id + "/sounds/game4.wav", function () {
            if (helpEl) helpEl.style.display = "none";
            if (onDone) onDone();
        });
    }

    // CmdRePlay two-step exit (orig CmdExit_Click:237-246).
    let replayBtn = null;
    function showReplayButton() {
        if (replayBtn) return;
        replayBtn = HND._el("button", {
            class: "ctrl apple-replay", title: "התחל מחדש",
        });
        replayBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            HND.restartGame(app.id, unit.id, "apple");
        });
        // Append to the STAGE (sibling of exit/help icons) so positioning
        // shares the same containing block as those nav buttons — keeps the
        // CmdRePlay sprite aligned with CmdExit per orig (75/15=5 px to the
        // right of CmdExit's right edge). Appending inside gameRoot put it
        // in a different positioning context.
        (root.parentElement || root).appendChild(replayBtn);
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
        if (e.key === "F1") { e.preventDefault(); showHelpOverlay(); return; }
        // Orig Form_KeyUp:569-576 only handles Esc + F1 — no F12 cheat.
        onKey(e);
    }

    // DEV helper — run `appleSkipToEnd()` (or with `(errors)` per Q) from
    // the browser console to fast-forward to the end-game flow without
    // playing through all 9 questions. Useful for testing the WinGame /
    // ScoreTimer / praise / score-form sequence.
    //   appleSkipToEnd()      — credits remaining Qs as perfect (score=100)
    //   appleSkipToEnd(2)     — credits with 2 errors each (mid-score)
    //   appleSkipToEnd(8)     — credits with max errors (sad/fail end)
    function skipToEndFn(errorsPerQ) {
        if (state.completed) { HND.log("apple DEV", "already completed"); return; }
        const errs = Math.max(0, Math.min(8, errorsPerQ != null ? errorsPerQ : 0));
        HND.log("apple DEV", "skip to end, errors/Q=" + errs);
        state.gameEnabled = false;
        while (state.current < QCOUNT) {
            const cat = errs === 0 ? 0 : errs <= 4 ? 1 : 2;
            state.errorsByQ.push(cat);
            addBasketFor(state.current, errs);
            state.current++;
        }
        renderBaskets();
        setGoat("enter", function () { winGame(); });
    }
    window.appleSkipToEnd = skipToEndFn;
    document.addEventListener("keydown", keyHandler);

    // Teardown on game leave: remove key handler, cancel pending timers,
    // unregister the appleSkipToEnd console handle so a stale one from a
    // prior game can't operate on this game's state. Watches the SPA root
    // for child removal (the router clears the stage on navigation).
    const pendingTimers = new Set();
    const origSetTimeout = window.setTimeout;
    function trackedTimeout(fn, ms) {
        const id = origSetTimeout(function () {
            pendingTimers.delete(id);
            fn();
        }, ms);
        pendingTimers.add(id);
        return id;
    }
    // Cancel all in-flight timers + handlers; safe to call multiple times.
    let tornDown = false;
    function teardown() {
        if (tornDown) return;
        tornDown = true;
        pendingTimers.forEach(function (id) { clearTimeout(id); });
        pendingTimers.clear();
        if (goatChainTimer) { clearTimeout(goatChainTimer); goatChainTimer = null; }
        document.removeEventListener("keydown", keyHandler);
        // Only clear the global handle if it's still ours (a newer game
        // may have already overwritten it).
        if (window.appleSkipToEnd === skipToEndFn) window.appleSkipToEnd = null;
    }
    let teardownObs = null;
    if (root.parentElement && root.parentElement.parentElement) {
        teardownObs = new MutationObserver(function () {
            if (!root.isConnected) {
                teardown();
                if (teardownObs) teardownObs.disconnect();
            }
        });
        teardownObs.observe(root.parentElement.parentElement,
                            { childList: true, subtree: true });
    }

    // Orig Form_Paint:693-716 — first paint loads GoatPic, calls
    // CmdHelp_Click (help wave), sets SoundStatus=1 + TimerGoatFileName=
    // "Enter". WaveMe_Done then gates first InitQuestion on the help-wave's
    // end. We chain the same: show help, then fire goat-enter animation,
    // then InitQuestion once enter completes — no overlapping audio,
    // no goat appearing before its time.
    showHelpOverlay(function () {
        setGoat("enter", function () { initQuestion(); });
    });
};
