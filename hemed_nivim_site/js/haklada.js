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
    (function preloadHakladaSprites() {
        const names = ["backt", "backtp", "backtt", "backttp", "sound_on", "sound_off",
                       "goat0_0", "q_mark"];
        for (let i = 0; i <= 7; i++) names.push("q_mark" + i);
        for (let i = 0; i <= 20; i++) names.push("goat1_" + i);
        HND.preloadFrames(app.id, "GameHaklada", names);
    })();

    // Hebrew layout (per original CurrentCalibration defaults):
    //   WhatToAsk    = qRight → Hebrew Q text shown/heard
    //   WhatToAnswer = qLeft  → translation, the side the user TYPES
    // PaintText (line 849) draws `WhatToAnswer` chars with Q_mark cursors.
    const askCol = cols[2] || cols[0];   // Hebrew Q (shown + audio)
    const ansCol = cols[1] || cols[0];   // translation A (typed)
    // Detect mode from currentUnit / slot title (not available here, so
    // default to practice mode where Q text is visible).
    const DICTATION = false;
    const TEXT_X = DICTATION ? 350 : 390;
    const TEXT_Y = DICTATION ? 355 : 405;
    const FLOWER_SPACE = 65;

    const QCOUNT = Math.min(items.length, 33);
    const idOrder = HND._shuffle(items.map(function (_, i) { return i; })).slice(0, QCOUNT);
    const flowerKinds = idOrder.map(function () { return Math.floor(Math.random() * 3); });

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
    const sound       = HND._el("button", { class: "ctrl hak-sound", title: "השמע שוב" });
    const header      = HND._el("div", { class: "ctrl hak-header" });
    // Goat — original starts off-screen at GoatX=900 and walks left.
    // Web port simplification: place at right side (600,380), idle goat0_0,
    // animate yes/no/win in place (matching CSS keyframes defined earlier).
    const goat        = HND._el("div", { class: "ctrl hak-goat" });
    root.innerHTML = "";
    // Note: actual BG is set by app.js makeStage(); planks are over that.
    root.appendChild(flowerLayer);
    root.appendChild(header);
    root.appendChild(qVisible);
    root.appendChild(typingArea);
    root.appendChild(knas);
    root.appendChild(sound);
    root.appendChild(goat);

    // Goat state controller — preserves base class while swapping pose.
    function setHakGoat(pose) {
        const KEEP = { ctrl: 1, "hak-goat": 1 };
        Array.from(goat.classList).forEach(function (c) {
            if (!KEEP[c]) goat.classList.remove(c);
        });
        if (pose) {
            void goat.offsetWidth;
            goat.classList.add(pose);
        }
        // Auto-revert non-win poses to idle after the animation duration.
        if (pose && pose !== "win") {
            setTimeout(function () {
                if (goat.classList.contains(pose)) goat.classList.remove(pose);
            }, 1100);
        }
    }

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
        HND.playWave(HND.unitWavePath(app.id, unit.id, idx, "right"));
    });

    function isLetter(ch) {
        if (!ch || ch.length === 0) return false;
        // Anything other than whitespace/punctuation.
        return /[֐-׿A-Za-z0-9]/.test(ch);
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
        // Original sets `Direction = -1` when the first real char is Hebrew
        // (i.e., > 128 in CP1255) and iterates the chars right-to-left.
        // For visually rendered Hebrew the LOGICAL string is already in
        // logical order (we apply `fix_hebrew` at port time), so the
        // typing order follows logical index — but for English content
        // we still walk left-to-right. Both happen to be index-increasing.
        state.rtl = hasHebrew;
        // First selected, not-yet-typed char.
        state.currentChar = state.selected.findIndex(function (s, i) {
            return s && !state.typed[i];
        });
        if (state.currentChar === -1) {     // all chars are non-letters; skip
            state.current++;
            return initQuestion();
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
        // Plays Q wave (right side = Hebrew).
        HND.playWave(HND.unitWavePath(app.id, unit.id, idx, "right"));
    }

    function renderTyping() {
        typingArea.innerHTML = "";
        for (let i = 0; i < state.answer.length; i++) {
            const ch = state.answer[i];
            const cell = HND._el("span", { class: "hak-cell" });
            if (!state.selected[i]) {
                // Non-letter (space, punct) — always rendered.
                cell.textContent = ch;
                cell.classList.add("non-letter");
            } else if (state.typed[i]) {
                cell.textContent = ch;
                cell.classList.add("typed");
            } else if (i === state.currentChar) {
                // Current cursor — animated Q mark.
                cell.classList.add("cursor");
            } else {
                // Pending — small Q mark.
                cell.classList.add("pending");
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
            const next = state.selected.findIndex(function (s, i) {
                return s && !state.typed[i] && i > state.currentChar;
            });
            if (next === -1) {
                // All chars typed → categorize, advance Q.
                state.gameEnabled = false;
                const cat = state.currErrors === 0 ? 0 :
                            state.currErrors <= 2 ? 1 : 2;
                state.errorsByQ.push(cat);
                HND.log("haklada Q DONE",
                        "q=" + (state.current + 1), "errors=" + state.currErrors,
                        "cat=" + cat);
                growFlower(state.current);
                setHakGoat("yes");
                const idx = idOrder[state.current];
                // Play praise wave (the left/translation side).
                HND.playWave(
                    HND.unitWavePath(app.id, unit.id, idx, "left"),
                    function () {
                        state.current++;
                        if (state.current >= QCOUNT) finishGame();
                        else initQuestion();
                    }
                );
                renderTyping();
            } else {
                state.currentChar = next;
                renderTyping();
            }
        } else if (/[a-zA-Z0-9֐-׿]/.test(e.key)) {
            // Wrong letter — original GameHaklada.frm:455
            //   Penalty += (20 / QCount) / (CharCount / 1.5)
            // CharCount = count of real (selected) characters in this Q's
            // answer. Short answers penalize more per mistake.
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
            setHakGoat("no");
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

    function growFlower(i) {
        const seed = flowerLayer.querySelector('[data-slot="' + i + '"]');
        if (!seed) return;
        seed.classList.remove("seed");
        seed.classList.add("growing");
    }

    function finishGame() {
        if (state.completed) return;
        state.completed = true;
        const score = Math.max(0, 100 - Math.floor(state.penalty));
        HND.log("haklada FINISH", "score=" + score, "penalty=" + state.penalty);
        HND.saveProgress(app.id, unit.id, "haklada", score);
        setHakGoat("win");
        const stage = root.parentElement;
        setTimeout(function () {
            HND.showScoreForm(
                stage, app.id, unit.name, userName, score, state.errorsByQ,
                function onExit() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                },
                function onReplay() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/haklada";
                }
            );
        }, 900);
        if (onComplete) onComplete(score);
    }

    // Wire keyboard once; remove on game-screen leave (best effort).
    function keyHandler(e) {
        if (state.completed) {
            document.removeEventListener("keydown", keyHandler);
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
            initQuestion();
        } else {
            sound.click();
        }
    });

    // Show "click to start" placeholder until the user clicks.
    typingArea.innerHTML = '<span class="hak-start-hint">לחץ להתחלה</span>';
};
