// Haklada (Dictation/Typing) — full port of GameHaklada.frm.
//
//   Two modes:
//     Dictation (backt.jpg):  TextX=350, TextY=355  — Q text hidden, only audio.
//     Practice  (backtt.jpg): TextX=390, TextY=405  — Q text visible above.
//
//   PlayGame (line 489):
//     QCount = min(LineCount, 33)
//     IdOrder[] = shuffled item indices
//     FlowerKind[] = random per-question flower species (0..2)
//     Current = 0, CurrErrors = 0, Penalty = 0
//
//   InitQuestion (line ~150):
//     AllChar  = split CurrentCalibration.WhatToAnswer text into bytes
//     SelectedChar[i] = whether the i-th char must be typed (depends on
//       WhatToType: 20=all letters, 21=first only, 22=last only).
//       Spaces / punctuation always SelectedChar=False (non-letter).
//     CurrChar = first SelectedChar index
//     If !Dictation: render Q text on top plank at (TextX, TextY-80).
//     CmdSound_Click → play the Q wave (WhatToAsk side).
//
//   Form_KeyUp (line 349) checks if key matches AllChar(CurrChar):
//     Correct → SmallGood.wav, mark SelectedChar(CurrChar)=False, advance.
//       All chars typed? → ErrorsStatus[Current] by CurrErrors (0/1-2/3+),
//         CurrErrors=0, play praise wave, Current++, GoatStatus=1/2/5,
//         FlowerFrameTo=9/5/3, grow that flower.
//     Wrong → ra.wav, CurrErrors++, Penalty += 20/QCount, Knas++.
//       CurrErrors > 1 → show the correct letter in red briefly.
//
//   PaintText (line 846): renders the answer with each non-typed
//     SELECTED char replaced by a small Q_Mark sprite. The current
//     CurrChar position gets a 30-wide big BigQMarkPic (animated cursor).
//
//   GetFlowerX/Y (line 614): 33 flower positions on 3 rows (y=110/135/160),
//     FlowerSpace=65 apart, snaking right→left, left→right, right→left.
//
//   WinGame (line 982): AddScore + ScoreForm.ShowGameScore.
window.HND = window.HND || {};

HND.startHaklada = function (root, app, unit, onComplete) {
    const cols  = (unit.data && unit.data.columns) || [];
    const items = (unit.data && unit.data.items)  || [];
    if (!items.length) {
        root.innerHTML = '<div class="error">אין נתוני הקלטה ביחידה זו.</div>';
        return;
    }
    const hakladaPreload = (function preloadHakladaSprites() {
        const names = ["backt", "backtp", "backtt", "backttp", "sound_on", "sound_off",
                       "q_mark"];
        for (let i = 0; i <= 7; i++) names.push("q_mark" + i);
        // Goat poses 0..6 — frame counts from HND.GOAT_FRAMES (js/goat.js).
        for (let s = 0; s < HND.GOAT_FRAMES.length; s++)
            for (let f = 0; f < HND.GOAT_FRAMES[s]; f++)
                names.push("goat" + s + "_" + f);
        for (let i = 0; i <= 9; i++) {
            names.push("flower1_" + i); names.push("flower2_" + i); names.push("flower3_" + i);
        }
        for (let i = 0; i <= 3; i++) names.push("flower4_" + i);
        return HND.preloadFrames(app.id, "GameHaklada", names);
    })();
    HND.fadeInOnReady(root, hakladaPreload);

    // Detect dictation mode from the game-menu slot the user picked.
    // Slot 5 (הקלטה רגילה) = practice → cfg block 2, Slot 6 (הכתבה) =
    // dictation → cfg block 3 (see app.js SLOT_TO_CAL_IDX).
    let DICTATION = false;
    try {
        const lastSlot = sessionStorage.getItem("hnd." + app.id + ".lastSlot");
        const lastMode = sessionStorage.getItem("hnd." + app.id + ".lastMode") || "";
        DICTATION = (lastSlot === "6") || lastMode.indexOf("הכתבה") !== -1;
    } catch (e) {}
    const GAME_IDX = DICTATION ? 3 : 2;

    // CurrentCalibration fields (orig GamesMoudle.bas:19-78). Sides:
    // qRight=0, qLeft=1, qHint=2, qPicture=3. WhatToAnswer is composite
    // "A+B" where B is CombineQA — HND.getCalibField handles the split.
    const cal = function (k) { return HND.getCalibField(unit, GAME_IDX, k); };
    const whatToAsk    = parseInt(cal("WhatToAsk"),    10);   // 0..3
    const whatToAnswer = parseInt(cal("WhatToAnswer"), 10);   // 0..3
    const whatToType   = parseInt(cal("WhatToType"),   10) || 20;  // 20/21/22
    const combineQA    = cal("CombineQA") || "0";             // "0"/"7"/"8"/"9"
    const textForPic   = parseInt(cal("TextForPicture"), 10);
    const ifRandom     = String(cal("IfRandom") || "True").toLowerCase() !== "false";
    const qLimitRaw    = parseInt(cal("QLimit"), 10);
    const instructions = String((unit.cfg || [])[GAME_IDX * 20 + 4] || "");
    const instructionsFliped = String((unit.cfg || [])[GAME_IDX * 20 + 18] || "");

    // GameQASwitched (orig public global, toggled by some menus). No UI
    // hook in our port — opt in via `window.HND_QASwitched=true` or URL
    // param `?qa=1`. When on, swap ask <-> answer side + column + audio.
    const QASwitched = (function () {
        if (window.HND_QASwitched) return true;
        try { return /[?&]qa=1\b/.test(location.search + location.hash); }
        catch (e) { return false; }
    })();

    // Side (0/1/2/3) → wave-file suffix. qPicture(3) falls back to
    // CurrentCalibration.TextForPicture (orig SetWaveName, GamesMoudle.bas:495).
    const SIDE_NAME = { 0: "right", 1: "left", 2: "hint" };
    function sideName(s) {
        if (s === 3) return SIDE_NAME[textForPic] || "right";
        return SIDE_NAME[s] || "right";
    }
    // Side → column index in unit.data.columns. Hemed/Nivim layout:
    // cols[0]=qHint, cols[1]=qLeft, cols[2]=qRight (per hakira.js:51).
    const SIDE_COL = { 0: 2, 1: 1, 2: 0 };
    function sideCol(s) {
        if (s === 3) return SIDE_COL[textForPic] != null ? SIDE_COL[textForPic] : 2;
        return SIDE_COL[s] != null ? SIDE_COL[s] : 2;
    }
    let askSide = sideName(whatToAsk);
    let ansSide = sideName(whatToAnswer);
    let askCol  = cols[sideCol(whatToAsk)]    || cols[0];
    let ansCol  = cols[sideCol(whatToAnswer)] || cols[0];
    // Side → per-line `_sel_*` key for WhatToType=23 lookups
    const SIDE_SEL = { 0: "_sel_right", 1: "_sel_left", 2: "_sel_hint" };
    function sideSel(s) {
        if (s === 3) return SIDE_SEL[textForPic] || "_sel_right";
        return SIDE_SEL[s] || "_sel_right";
    }
    let ansSelKey = sideSel(whatToAnswer);
    let askSelKey = sideSel(whatToAsk);
    if (QASwitched) {
        let t = askSide; askSide = ansSide; ansSide = t;
        t = askCol;     askCol  = ansCol;  ansCol  = t;
        t = askSelKey;  askSelKey = ansSelKey; ansSelKey = t;
    }
    const PIC_MODE = (whatToAsk === 3) || (whatToAnswer === 3);

    // Per-unit typography (orig GamesMoudle.bas:70-78 OpenUnitFile loads
    // FontColor / FontSize / FontName per side). Falls back to sensible
    // CSS defaults if unit data lacks the values (size=0 means default).
    const unitFonts = (unit.data && unit.data.fonts) || {};
    function fontSideKey(s) {
        if (s === 0) return "right";
        if (s === 1) return "left";
        if (s === 2) return "hint";
        if (s === 3) return ({0:"right",1:"left",2:"hint"})[textForPic] || "right";
        return "right";
    }
    const ansFont = unitFonts[fontSideKey(whatToAnswer)] || {};
    const askFont = unitFonts[fontSideKey(whatToAsk)]    || {};
    function fontCss(f, fallbackPx) {
        const size = f.size > 0 ? f.size : (fallbackPx || 16);
        const name = (f.name && f.name !== "0") ? f.name : "David CLM";
        const color = f.color || "#2a1d0a";
        return { fontSize: size + "px", fontFamily: '"' + name + '", "David CLM", Arial, sans-serif', color: color };
    }

    const TEXT_X = DICTATION ? 350 : (PIC_MODE ? 265 : 390);
    const TEXT_Y = DICTATION ? 355 : (PIC_MODE ? 415 : 405);
    const TEXT_MAX_W = PIC_MODE ? 350 : 550;
    const FLOWER_SPACE = 65;

    // Shared app-level sound assets (orig AppPath\Data\Sounds\*.wav).
    function sharedWave(name) {
        return "assets/" + app.id + "/sounds/" + name;
    }

    // Apply QLimit (orig PlayGame line 504): use calibration limit if
    // set, else all items; cap at 33 (flower count).
    const QCOUNT = Math.min(qLimitRaw > 0 ? qLimitRaw : items.length, 33);
    const rawIdxs = items.map(function (_, i) { return i; });
    const idOrder = (ifRandom ? HND._shuffle(rawIdxs) : rawIdxs).slice(0, QCOUNT);
    // FlowerKind init with dedup so no two adjacent flowers share a kind
    // (orig PlayGame line 513-517): pick random, re-roll if matches prev.
    const flowerKinds = [];
    for (let i = 0; i < QCOUNT; i++) {
        let k = Math.floor(Math.random() * 3);
        if (i > 0 && k === flowerKinds[i - 1]) k = Math.floor(Math.random() * 3);
        flowerKinds.push(k);
    }

    const state = {
        current: 0,
        currErrors: 0,
        penalty: 0,
        errorsByQ: [],          // per-Q category (0=perfect, 1=1-2 errors, 2=3+)
        gameEnabled: false,
        completed: false,
        answer: "",             // chars of the current Q's answer
        selected: [],           // per-char: must type? (false for spaces)
        typed: [],              // per-char: typed correctly?
        currentChar: 0,         // index of char to type next
        showLastWrong: false,
    };
    HND.log("haklada start", app.id + "/" + unit.id,
            "items=" + items.length, "QCOUNT=" + QCOUNT);

    // GetFlowerX/Y from the original: 33 positions, snaking three rows.
    function flowerX(i) {
        if (i <= 10) return 700 - i * FLOWER_SPACE;
        if (i <= 22) return 25 + (i - 11) * FLOWER_SPACE;
        return 700 - (i - 23) * FLOWER_SPACE;
    }
    function flowerY(i) {
        if (i <= 10) return 110;
        if (i <= 22) return 135;
        return 160;
    }

    // Persistent layers — survive re-render so animations don't restart.
    const flowerLayer = HND._el("div", { class: "ctrl hak-flower-layer" });
    const planks      = HND._el("div", { class: "ctrl hak-planks" });
    const qVisible    = HND._el("div", { class: "ctrl hak-q-visible" });
    const typingArea  = HND._el("div", { class: "ctrl hak-typing" });
    const knas        = HND._el("div", { class: "ctrl hak-knas", text: "0" });
    // Apply per-unit typography from unit.data.fonts (orig OpenUnitFile
    // loads FontSize / FontName / FontColor per side from Data.txt).
    const ansStyle = fontCss(ansFont, 32);    // bottom plank: 2rem default
    Object.assign(typingArea.style, ansStyle);
    const askStyle = fontCss(askFont, 26);    // top plank: 1.6rem default
    Object.assign(qVisible.style, askStyle);

    // Position the typing area + Q-text plank PER MODE. Orig Form_Load
    // sets TextX / TextY based on (Dictation, WhatToAsk==qPicture):
    //   practice text: 390/405      practice picture: 265/415
    //   dictation text:350/355      dictation picture:265/375
    // Box is centered horizontally on TextX with width TextMaxWidth=550
    // (text mode) or 350 (picture mode). The CSS defaults assume
    // practice/text — override here for dictation / picture variants.
    typingArea.style.left = (TEXT_X - 310) + "px";    // 620-wide box
    typingArea.style.top  = TEXT_Y + "px";
    typingArea.style.width = "620px";
    if (PIC_MODE) {
        typingArea.style.left  = (TEXT_X - 175) + "px";   // 350-wide box
        typingArea.style.width = "350px";
    }
    qVisible.style.left = (TEXT_X - TEXT_MAX_W / 2) + "px";
    qVisible.style.width = TEXT_MAX_W + "px";
    qVisible.style.top  = (TEXT_Y - 80) + "px";
    const sound       = HND._el("button", { class: "ctrl hak-sound", title: "השמע שוב" });
    const header      = HND._el("div", { class: "ctrl hak-header" });
    root.innerHTML = "";
    root.appendChild(flowerLayer);
    root.appendChild(header);
    root.appendChild(qVisible);
    root.appendChild(typingArea);
    root.appendChild(knas);
    root.appendChild(sound);

    // Per-slot bloom controllers — kept so goat.js can finalize ANY prior
    // flower on row-crosses (orig TimerGoat:780/790-797 sweep-finalization).
    const blooms = new Array(QCOUNT);
    function finalizeBloomAt(idx) {
        const b = blooms[idx];
        if (b && b.finish) b.finish();
    }

    // Goat — shared with American game via js/goat.js. Original GoatX=900
    // (off-screen right), GoatY=55 (top of meadow above flower row 110).
    const goatCtl = HND.createGoat({
        root: root,
        appId: app.id,
        flowerX: flowerX, flowerY: flowerY, QCOUNT: QCOUNT,
        className: "hak-goat",
        // yOffset default = -55 → goat top sits 55px above flower row.
        bloomFinalizer: finalizeBloomAt,
    });
    const goat = goatCtl.element;
    const goatState = goatCtl.state;
    function setGoatStatus(s, targetIdx, bloomTarget) {
        if (bloomTarget && targetIdx != null) blooms[targetIdx] = bloomTarget;
        return goatCtl.setStatus(s, targetIdx, bloomTarget);
    }
    function paintGoat() { /* no-op — helper paints internally */ }

    // Pre-render flower slots (1 per Q). Position the sprite's top-left
    // exactly at the original's MaskB(GetFlowerX, GetFlowerY) — no offset.
    for (let i = 0; i < QCOUNT; i++) {
        const fl = HND._el("div", {
            class: "ctrl hak-flower seed kind-" + flowerKinds[i],
            style: "left:" + flowerX(i) + "px; top:" + flowerY(i) + "px;",
            "data-slot": i,
        });
        flowerLayer.appendChild(fl);
    }

    // Header: UnitName · UserName (RGB(50,100,210) per Form_Paint).
    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
    header.textContent = unit.name + (userName ? "  ·  " + userName : "");

    sound.addEventListener("click", function () {
        const idx = idOrder[state.current];
        if (idx == null) return;
        HND.playWave(HND.unitWavePath(app.id, unit.id, idx, askSide));
    });

    function isLetter(ch) {
        if (!ch || ch.length === 0) return false;
        // Anything other than whitespace/punctuation.
        return /[֐-׿A-Za-z0-9]/.test(ch);
    }

    // Walk `selected[]` from `start` in `step` direction (+1 or -1),
    // return index of first selected & not-yet-typed char. -1 if none.
    function findSelected(selected, typed, start, step) {
        for (let i = start; i >= 0 && i < selected.length; i += step) {
            if (selected[i] && !typed[i]) return i;
        }
        return -1;
    }

    // Israeli Hebrew keyboard map (physical key code → Hebrew char).
    // Original VB6 does this via `Lang128 = Not Lang128` and re-reads the
    // KeyCode twice: once for English, once for Hebrew. We get the same
    // by mapping the physical KeyboardEvent.code to its Hebrew glyph and
    // accepting whichever (e.key or mapped) matches the expected letter.
    const HEB_LAYOUT = {
        KeyQ:"/", KeyW:"'", KeyE:"ק", KeyR:"ר", KeyT:"א", KeyY:"ט",
        KeyU:"ו", KeyI:"ן", KeyO:"ם", KeyP:"פ",
        KeyA:"ש", KeyS:"ד", KeyD:"ג", KeyF:"כ", KeyG:"ע", KeyH:"י",
        KeyJ:"ח", KeyK:"ל", KeyL:"ך", Semicolon:"ף", Quote:",",
        KeyZ:"ז", KeyX:"ס", KeyC:"ב", KeyV:"ה", KeyB:"נ", KeyN:"מ",
        KeyM:"צ", Comma:"ת", Period:"ץ", Slash:".",
    };
    // Reverse: Hebrew char → physical key code (for the case where the user
    // has Hebrew layout active but the expected char is English).
    const HEB_TO_CODE = {};
    Object.keys(HEB_LAYOUT).forEach(function (k) { HEB_TO_CODE[HEB_LAYOUT[k]] = k; });

    function keyMatches(e, expected) {
        if (!expected) return false;
        const got = e.key;
        if (got && got.toLowerCase() === expected.toLowerCase()) return true;
        // Try the layout-flipped char for this physical key.
        const hebFromCode = HEB_LAYOUT[e.code];
        if (hebFromCode && hebFromCode === expected) return true;
        // And the inverse: if expected is English and user typed Hebrew (or
        // vice-versa) on the same physical key.
        const expCode = HEB_TO_CODE[expected];
        if (expCode && expCode === e.code) return true;
        return false;
    }

    function initQuestion() {
        if (state.current >= QCOUNT) { finishGame(); return; }
        const idx = idOrder[state.current];
        const text = (items[idx][ansCol] || "").trim();
        state.answer = text;
        state.selected = [];
        state.typed = [];
        let hasHebrew = false;
        for (let i = 0; i < text.length; i++) {
            const sel = isLetter(text[i]);
            state.selected.push(sel);
            state.typed.push(!sel);          // non-letters count as already filled
            if (/[֐-׿]/.test(text[i])) hasHebrew = true;
        }
        // WhatToType (orig InitQuestion 209-228 + GamesMoudle.bas qAll/
        // qFirst/qLast/qSelected constants):
        //   20=all letters, 21=first only, 22=last only,
        //   23=per-char Boolean flags from unit data (SelectLeft/Right/Hint).
        if (whatToType === 21 || whatToType === 22) {
            const realIdxs = [];
            for (let i = 0; i < state.selected.length; i++) {
                if (state.selected[i]) realIdxs.push(i);
            }
            if (realIdxs.length > 0) {
                const keepIdx = whatToType === 21
                    ? realIdxs[0]
                    : realIdxs[realIdxs.length - 1];
                for (let i = 0; i < state.selected.length; i++) {
                    if (state.selected[i] && i !== keepIdx) {
                        state.selected[i] = false;
                        state.typed[i] = true;
                    }
                }
            }
        } else if (whatToType === 23) {
            const flags = (items[idx][ansSelKey]) || [];
            for (let i = 0; i < state.selected.length; i++) {
                if (state.selected[i] && flags[i] === false) {
                    state.selected[i] = false;
                    state.typed[i] = true;
                }
            }
        }
        // Original sets `Direction = -1` for Hebrew (cp1255 byte > 128)
        // BECAUSE the VB6 .txt files stored Hebrew in VISUAL order
        // (reversed). Our port's `fix_hebrew` (port_hemed_nivim.py:40)
        // un-reverses it to LOGICAL order before we ever see it — so
        // text[0] is the LOGICAL first letter (visually rightmost in
        // Hebrew via CSS direction:rtl). Always walk forward.
        state.rtl = hasHebrew;
        state.currentChar = findSelected(state.selected, state.typed, 0, +1);
        if (state.currentChar === -1) {
            // CharCount=0 fallback (orig InitQuestion line 256-263): no
            // selectable chars after WhatToType filtering → force ALL
            // real chars selected so the Q is at least playable.
            let restored = false;
            for (let i = 0; i < state.answer.length; i++) {
                if (isLetter(state.answer[i])) {
                    state.selected[i] = true;
                    state.typed[i]    = false;
                    restored = true;
                }
            }
            if (restored) {
                state.currentChar = findSelected(state.selected, state.typed, 0, +1);
            } else {
                // Genuinely no real chars (rare). Advance.
                state.current++;
                return initQuestion();
            }
        }
        state.currErrors = 0;
        state.gameEnabled = true;
        HND.log("haklada question",
                "q=" + (state.current + 1) + "/" + QCOUNT,
                "origIdx=" + idx,
                "answer=" + text.slice(0, 40));

        // Practice mode: show the Q text on the top plank.
        if (!DICTATION) {
            qVisible.textContent = items[idx][askCol] || "";
            qVisible.style.display = "block";
        } else {
            qVisible.style.display = "none";
        }
        renderTyping();
        // First question: jump the goat onto the meadow from off-screen
        // (orig Form_Paint sets GoatStatus=1 once after firstPaint).
        if (state.current === 0 && goatState.status === 0 && goatState.x >= 800) {
            setGoatStatus(1, 0);
        }
        // Plays Q wave per CurrentCalibration.WhatToAsk (orig
        // CmdSound_Click). Picture mode falls back to TextForPicture.
        HND.playWave(HND.unitWavePath(app.id, unit.id, idx, askSide));
        // Picture mode: reveal the per-Q picture line-by-line at
        // (512, 324) over ~330ms (orig TimerShowPic: 10 frames at 30ms).
        if (PIC_MODE) showPictureForIdx(idx);
    }

    function renderTyping() {
        typingArea.innerHTML = "";
        for (let i = 0; i < state.answer.length; i++) {
            const ch = state.answer[i];
            const cell = HND._el("span", { class: "hak-cell" });
            if (state.selected[i] && !state.typed[i]) {
                if (i === state.currentChar) {
                    cell.classList.add("cursor");      // animated big Q-mark
                } else {
                    cell.classList.add("pending");     // small Q-mark
                }
            } else {
                // Real char rendered as text:
                //   - typed letter (user got it right)
                //   - non-selected letter (WhatToType=21/22 reveals)
                //   - space / punctuation
                cell.textContent = ch;
                if (isLetter(ch)) cell.classList.add("typed");
                else              cell.classList.add("non-letter");
            }
            typingArea.appendChild(cell);
        }
    }

    function onKey(e) {
        if (!state.gameEnabled || state.completed) return;
        if (e.key === "Escape") return;
        if (e.key.length !== 1 && e.key !== "Backspace") return;
        const expected = state.answer[state.currentChar];
        if (!expected) return;
        // Accept the expected letter typed in either Hebrew OR English
        // keyboard layout on the matching physical key (matches the original
        // `Lang128 = Not Lang128 / GetCharFromKey` double-check in .frm).
        if (keyMatches(e, expected)) {
            state.typed[state.currentChar] = true;
            // Always walk forward in logical order — our data is already
            // fix_hebrew'd so Hebrew text is in natural left-to-right
            // logical order (CSS direction:rtl handles visual display).
            const next = findSelected(state.selected, state.typed,
                                      state.currentChar + 1, +1);
            if (next === -1) {
                // All chars typed → categorize, advance Q.
                state.gameEnabled = false;
                const cat = state.currErrors === 0 ? 0 :
                            state.currErrors <= 2 ? 1 : 2;
                state.errorsByQ.push(cat);
                HND.log("haklada Q DONE",
                        "q=" + (state.current + 1), "errors=" + state.currErrors,
                        "cat=" + cat);
                const bloom = growFlower(state.current, cat);
                const idx = idOrder[state.current];
                // Sequencing (orig Form_KeyUp:413-432 → WaveMe_Done:944-979):
                //  1. CombineQA-driven ask/answer chain plays first.
                //  2. WaveMe_Done case 55 fires when the LAST wave in step
                //     1 ends — at THAT point the goat walk starts AND
                //     good[1-3].wav plays. Goat walks during good[N].
                //  3. WaveMe_Done case -10 (after good[N]) → InitQuestion.
                // i.e. goat motion is DEFERRED until step 2 — port now
                // matches this rather than starting goat alongside step 1.
                const goatStatus = cat === 0 ? 1 : cat === 1 ? 2 : 5;
                const onChainEnd = function () {
                    setGoatStatus(goatStatus,
                                  Math.min(state.current + 1, QCOUNT - 1),
                                  bloom);
                    const praiseN = Math.floor(Math.random() * 3) + 1;
                    HND.playWave(sharedWave("good" + praiseN + ".wav"),
                        function () {
                            state.current++;
                            if (state.current >= QCOUNT) finishGame();
                            else initQuestion();
                        });
                };
                const wave = function (side) {
                    return HND.unitWavePath(app.id, unit.id, idx, side);
                };
                if (combineQA === "7") {
                    HND.playWave(wave(askSide), function () {
                        HND.playWave(wave(ansSide), onChainEnd);
                    });
                } else if (combineQA === "8") {
                    HND.playWave(wave("right"), function () {
                        HND.playWave(wave("left"), onChainEnd);
                    });
                } else if (combineQA === "9") {
                    HND.playWave(wave("left"), function () {
                        HND.playWave(wave("right"), onChainEnd);
                    });
                } else {
                    HND.playWave(wave(ansSide), onChainEnd);
                }
                renderTyping();
            } else {
                state.currentChar = next;
                // Brief correct-letter goat reaction (orig GoatStatus=3).
                setGoatStatus(3);
                // SmallGood.wav — short feedback ping per correct letter
                // (orig Form_KeyUp line 437).
                HND.playWave(sharedWave("smallgood.wav"));
                renderTyping();
            }
        } else if (/[a-zA-Z0-9֐-׿]/.test(e.key)) {
            // Wrong letter — original GameHaklada.frm:455
            //   Penalty += (20 / QCount) / (CharCount / 1.5)
            // CharCount = count of real (selected) chars in this Q.
            const charCount = state.selected.reduce(function (n, s) {
                return s ? n + 1 : n;
            }, 0) || 1;
            state.currErrors++;
            state.penalty = Math.min(
                60,
                state.penalty + (20 / QCOUNT) / (charCount / 1.5)
            );
            knas.textContent = String(Math.floor(state.penalty));
            HND.log("haklada WRONG", "q=" + (state.current + 1),
                    "expected=" + expected, "got=" + e.key,
                    "chars=" + charCount,
                    "currErrors=" + state.currErrors,
                    "penalty=" + state.penalty.toFixed(2));
            // ra.wav + goat status 4 (orig Form_KeyUp line 449/451).
            HND.playWave(sharedWave("ra.wav"));
            setGoatStatus(4);
            // After 2 errors, briefly show the expected letter in red.
            if (state.currErrors >= 2) flashAnswer();
            shakeTyping();
        }
    }

    function flashAnswer() {
        const cur = typingArea.children[state.currentChar];
        if (!cur) return;
        cur.classList.remove("cursor");
        cur.classList.add("hint-show");
        cur.textContent = state.answer[state.currentChar];
        // 200ms flash per the original TimerShow tick (faster than the
        // 800ms we had — keeps the dictation pace tight).
        setTimeout(function () {
            cur.classList.remove("hint-show");
            cur.textContent = "";
            cur.classList.add("cursor");
        }, 200);
    }
    function shakeTyping() {
        typingArea.classList.remove("shake");
        void typingArea.offsetWidth;
        typingArea.classList.add("shake");
    }

    // Build a bloom controller for slot `i`. `cat` 0=perfect (FlowerFrameTo
    // 9, kind preserved), 1=1-2 errors (5, kind preserved), 2=3+ errors
    // (3, kind switches to flower4 "eaten"). Returns { step(goatFrame),
    // finish() }: step() advances bloom by 1 (capped at FrameTo) and is
    // called from the goat tick to stay synchronized with the walk; if
    // never stepped (F12 cheat / immediate-call sites), finish() snaps
    // to the final frame.
    const FLOWER_BASE = "assets/" + app.id + "/pictures/GameHaklada/";
    function growFlower(slotIdx, cat) {
        const seed = flowerLayer.querySelector('[data-slot="' + slotIdx + '"]');
        if (!seed) return { step: function () {}, finish: function () {} };
        seed.classList.remove("seed");
        const wilt = (cat === 2);
        const target = cat === 0 ? 9 : cat === 1 ? 5 : 3;
        let kindNum = wilt ? 4 : (flowerKinds[slotIdx] + 1);
        const lastFrame = wilt ? 3 : 9;
        const finalIdx  = Math.min(target, lastFrame);
        function setFrame(frameIdx) {
            seed.style.backgroundImage =
                "url('" + FLOWER_BASE + "flower" + kindNum + "_" + frameIdx + ".png')";
            seed.style.opacity = "1";
        }
        // Initial frame so the seed pose is replaced immediately.
        setFrame(0);
        let cur = 0;
        return {
            step: function () {
                if (cur >= target) return;
                cur += 1;
                setFrame(Math.min(cur, lastFrame));
            },
            finish: function () {
                cur = target;
                setFrame(finalIdx);
            },
        };
    }

    // Picture mode reveal — original TimerShowPic blits successive
    // bands of QPic at (512, 324), 10 frames at 30ms (~330ms total).
    // Falls back silently if no picture is shipped for this question.
    function showPictureForIdx(origIdx) {
        let pic = root.querySelector(".hak-pic");
        if (!pic) {
            pic = HND._el("div", { class: "ctrl hak-pic" });
            root.appendChild(pic);
        }
        // Path mirrors data/<App>/unit_<id>/wave/ next to it.
        const dataRoot = (HND.APPS[app.id] || {}).dataRoot || "data/" + app.id;
        const url = dataRoot + "/unit_" + unit.id + "/pic/" + origIdx + ".png";
        pic.style.backgroundImage = "url('" + url + "')";
        pic.classList.remove("reveal");
        void pic.offsetWidth;
        pic.classList.add("reveal");
    }

    // F1 help overlay + game2.wav (practice) / game3.wav (dictation).
    // Original Form_Paint calls CmdHelp_Click once after firstPaint;
    // CmdHelp_Click draws CurrentCalibration.Instructions at (400, 40)
    // and plays the wave. WaveMe_Done erases the overlay (orig line 941
    // `BitBlt 100, 40, 600, 30`).
    let helpEl = null;
    function showHelpOverlay() {
        const text = (QASwitched && instructionsFliped) ? instructionsFliped : instructions;
        if (!text || text === "0") return;
        if (!helpEl) {
            helpEl = HND._el("div", { class: "ctrl hak-help" });
            root.appendChild(helpEl);
        }
        helpEl.textContent = text;
        helpEl.style.display = "block";
        const hide = function () { if (helpEl) helpEl.style.display = "none"; };
        // Orig CmdHelp_Click:316-328 — `game2.wav` (practice) or
        // `game3.wav` (dictation), with `If Exist(...) Then ... Else
        // PlayWave game2.wav` fallback. Our shared sounds dir only has
        // game2.wav (game3 is the per-unit variant and our port doesn't
        // ship those), so dictation also rolls back to game2.
        const playFb = function (url, fb) {
            if (HND._missingWaves && HND._missingWaves[url]) {
                HND.playWave(fb, hide);
            } else {
                HND.playWave(url, function () { hide(); });
                // If the primary URL 404s, the playWave error cache will
                // catch it; trigger fallback on next user gesture. For
                // simplicity here just attempt fallback after 500ms if
                // hide hasn't fired (wave never started).
                setTimeout(function () {
                    if (helpEl && helpEl.style.display !== "none" &&
                        HND._missingWaves && HND._missingWaves[url]) {
                        HND.playWave(fb, hide);
                    }
                }, 500);
            }
        };
        const primary  = sharedWave(DICTATION ? "game3.wav" : "game2.wav");
        const fallback = sharedWave("game2.wav");
        if (primary === fallback) HND.playWave(primary, hide);
        else                       playFb(primary, fallback);
        setTimeout(hide, 8000);
    }

    function finishGame() {
        if (state.completed) return;
        state.completed = true;
        const score = Math.max(0, 100 - Math.floor(state.penalty));
        HND.log("haklada FINISH", "score=" + score, "penalty=" + state.penalty);
        HND.saveProgress(app.id, unit.id, "haklada", score, state.errorsByQ);
        // Win loop + win.wav (orig TimerGoat case 6 line 744; ScoreForm
        // opens from WaveMe_Done case 79 — AFTER win.wav finishes).
        // Goat stays at its last-walked position (just-completed flower)
        // and dances in place — matches the original. The orig ScoreForm
        // was a separate VB6 window so it didn't visually cover the goat;
        // our score form is in the same stage but raise the goat above
        // it so the user can still see the dance.
        goat.style.zIndex = "60";          // above score form (z=50)
        setGoatStatus(6);
        const stage = root.parentElement;
        const showScores = function () {
            HND.showScoreForm(
                stage, app.id, unit.name, userName, score, state.errorsByQ,
                function onExit() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                },
                function onReplay() {
                    HND.restartGame(app.id, unit.id, "haklada");
                }
            );
        };
        // Fallback in case win.wav is missing / fails — show score after 4s.
        let shown = false;
        const showOnce = function () { if (!shown) { shown = true; showScores(); } };
        HND.playWave(sharedWave("win.wav"), showOnce);
        setTimeout(showOnce, 4000);
        if (onComplete) onComplete(score);
    }

    // Teardown — cancel goat tick + remove key listener when this
    // haklada root is removed from the DOM (e.g. user navigates back
    // to game-menu). Avoids leaked timers + a stale key handler that
    // would still mutate `state` after the game element is detached.
    function teardown() {
        goatCtl.teardown();
        document.removeEventListener("keydown", keyHandler);
        if (teardownObs) teardownObs.disconnect();
    }
    let teardownObs = null;
    if (root.parentElement && root.parentElement.parentElement) {
        teardownObs = new MutationObserver(function () {
            if (!root.isConnected) teardown();
        });
        teardownObs.observe(root.parentElement.parentElement,
            { childList: true, subtree: true });
    }

    // Wire keyboard once; remove on game-screen leave (best effort).
    function keyHandler(e) {
        if (state.completed) {
            document.removeEventListener("keydown", keyHandler);
            return;
        }
        // F11/F12 cheats (orig Form_KeyUp 351-360): F12 skips to next
        // Q with the "3+ errors" goat+flower; F11 jumps to win loop.
        // Only allow F12 while a question is active — pressing it mid
        // audio-chain would race with the pending advance() callback.
        if (e.key === "F12") {
            e.preventDefault();
            if (state.gameEnabled && state.current < QCOUNT) {
                state.gameEnabled = false;
                state.errorsByQ.push(2);
                const bloom = growFlower(state.current, 2);
                bloom.finish();        // F12 = no animated walk; snap bloom.
                setGoatStatus(5, Math.min(state.current + 1, QCOUNT - 1));
                state.current++;
                if (state.current >= QCOUNT) finishGame();
                else initQuestion();
            }
            return;
        }
        if (e.key === "F11") {
            e.preventDefault();
            setGoatStatus(6);
            return;
        }
        onKey(e);
    }
    document.addEventListener("keydown", keyHandler);

    // Click on parchment to focus / replay the audio. The original starts
    // audio in CmdSound_Click; we wait for first user gesture to comply
    // with browser autoplay policy.
    typingArea.addEventListener("click", function () {
        if (!state.gameEnabled && state.current === 0) {
            // Show calibration instructions overlay + game2/3.wav once
            // (orig Form_Paint calls CmdHelp_Click after firstPaint).
            showHelpOverlay();
            initQuestion();
        } else {
            sound.click();
        }
    });

    // ShowWave flag (unit.flags[2]) — original CmdSound.Visible=False
    // by default; Form_Paint sets Visible=True only if CurrentUnit.ShowWave.
    // In dictation mode it's always shown (so the user can hear the Q
    // again — there's no visible Q text to fall back on).
    const flags = (unit && unit.flags) || [];
    const showWave = flags[2] !== false;
    if (!showWave && !DICTATION) sound.style.display = "none";

    // Picture-mode background swap — orig Form_Load loads backttp.jpg
    // (practice+pic) or backtp.jpg (dictation+pic) instead of the
    // text-only backtt/backt variants. Stage bg is set by app.js
    // makeStage(); override here for the picture-mode variants.
    if (root.parentElement) {
        const bgName = DICTATION
            ? (PIC_MODE ? "backtp" : "backt")
            : (PIC_MODE ? "backttp" : "backtt");
        const url = "assets/" + app.id + "/pictures/GameHaklada/" + bgName + ".png";
        root.parentElement.style.backgroundImage = "url('" + url + "')";
    }

    // Hook the existing app.js help icon to fire OUR calibration
    // instructions overlay + game2/3.wav (orig CmdHelp_Click). Without
    // this the icon would just `alert()` the generic help text from
    // HELP_TEXTS["haklada"].
    if (root.parentElement) {
        const helpBtn = root.parentElement.querySelector(".help-icon");
        if (helpBtn) {
            const cloneIt = helpBtn.cloneNode(true);  // wipe old listeners
            helpBtn.parentNode.replaceChild(cloneIt, helpBtn);
            cloneIt.addEventListener("click", function (e) {
                e.stopPropagation();
                showHelpOverlay();
            });
        }
    }

    // Goat is already painted at frame 0 / pose 0 by HND.createGoat above.

    // Show "click to start" placeholder until the user clicks.
    typingArea.innerHTML = '<span class="hak-start-hint">לחץ להתחלה</span>';
};
