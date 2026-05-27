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

    const askCol = cols[2] || cols[0];
    const ansCol = cols[1] || cols[0];

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

    const QCOUNT  = Math.min(items.length, 9);
    const idOrder = HND._shuffle(items.map(function (_, i) { return i; })).slice(0, QCOUNT);

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
    };
    HND.log("apple start", app.id + "/" + unit.id, "items=" + items.length, "QCOUNT=" + QCOUNT);

    // Layers
    const flowerCanopy = HND._el("div", { class: "ctrl apple-canopy" });
    const treeLayer    = HND._el("div", { class: "ctrl apple-tree-layer" });
    const header       = HND._el("div", { class: "ctrl apple-header" });
    const qText        = HND._el("div", { class: "ctrl apple-q" });
    const aText        = HND._el("div", { class: "ctrl apple-a" });
    const divider      = HND._el("div", { class: "ctrl apple-divider" });
    const sound        = HND._el("button", { class: "ctrl apple-sound", title: "השמע" });
    const goat         = HND._el("div", { class: "ctrl apple-goat enter" });
    setTimeout(function () { goat.classList.remove("enter"); }, 700);
    const fallLayer    = HND._el("div", { class: "ctrl apple-fall-layer" });
    root.innerHTML = "";
    root.appendChild(flowerCanopy);
    root.appendChild(treeLayer);
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
            const apple = HND._el("div", { class: "ctrl apple-static" });
            apple.style.cssText = "left:" + p[0] + "px;top:" + p[1] + "px;";
            apple.dataset.slot = String(i);
            treeLayer.appendChild(apple);
        });
    }
    renderTreeApples();

    // Header
    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
    header.textContent = unit.name + (userName ? "  ·  " + userName : "");

    sound.addEventListener("click", function () {
        if (!state.gameEnabled) return;
        const idx = idOrder[state.current];
        if (idx != null) HND.playWave(HND.unitWavePath(app.id, unit.id, idx, "right"));
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
        if (stateName !== "win") {
            setTimeout(function () {
                goat.classList.remove(stateName);
                goat.classList.add("stand");
            }, 700);
        }
    }

    function initQuestion() {
        if (state.current >= QCOUNT) { winGame(); return; }
        const idx = idOrder[state.current];
        const ansText = (items[idx][ansCol] || "").trim();
        const askText = (items[idx][askCol] || "").trim();
        state.answer = ansText;
        state.selected = [];
        state.filled = [];
        for (let i = 0; i < ansText.length; i++) {
            const sel = isLetter(ansText[i]);
            state.selected.push(sel);
            state.filled.push(!sel);
        }
        state.errorCount = 0;
        state.gameEnabled = true;
        HND.log("apple question",
                "q=" + (state.current + 1) + "/" + QCOUNT,
                "origIdx=" + idx, "ans=" + ansText.slice(0, 40));
        qText.textContent = askText;
        renderAnswer();
        // Repaint the 8 static apples on the tree for this new question.
        renderTreeApples();
        // First Q must wait for user gesture (browser autoplay block).
        if (state.userInteracted) {
            HND.playWave(HND.unitWavePath(app.id, unit.id, idx, "right"));
        }
    }

    function renderAnswer() {
        aText.innerHTML = "";
        for (let i = 0; i < state.answer.length; i++) {
            const cell = HND._el("span", { class: "apple-char" });
            if (!state.selected[i]) {
                cell.textContent = state.answer[i];
                cell.classList.add("non-letter");
            } else if (state.filled[i]) {
                cell.textContent = state.answer[i];
                cell.classList.add("filled");
            } else {
                // Animated q_mark cursor for unfilled positions.
                cell.classList.add("qmark");
            }
            aText.appendChild(cell);
        }
    }

    function onKey(e) {
        if (!state.gameEnabled || state.completed) return;
        if (e.key.length !== 1) return;
        // Unlock autoplay on first user interaction.
        if (!state.userInteracted) {
            state.userInteracted = true;
            const idx = idOrder[state.current];
            HND.playWave(HND.unitWavePath(app.id, unit.id, idx, "right"));
        }
        let matched = 0;
        // Any matching SELECTED char gets cleared in one keypress.
        // Accept either-layout matches per the original's Lang128 toggle.
        for (let i = 0; i < state.answer.length; i++) {
            if (state.selected[i] && !state.filled[i] &&
                keyMatchesChar(e, state.answer[i])) {
                state.filled[i] = true;
                matched++;
            }
        }
        if (matched > 0) {
            HND.log("apple OK", "key=" + e.key, "matched=" + matched);
            renderAnswer();
            setGoat("yes");
            // Check if all selected chars are filled.
            const goNext = state.selected.every(function (s, i) {
                return !s || state.filled[i];
            });
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
                // Increment total score (per .frm scoring: 100/QCount points each).
                state.totalScore += (100 / (QCOUNT + 1));
                setGoat("pick");
                HND.playWave(
                    HND.unitWavePath(app.id, unit.id, idx, "left"),
                    function () {
                        state.current++;
                        if (state.current >= QCOUNT) winGame();
                        else initQuestion();
                    }
                );
            }
        } else if (isLetter(e.key) || HEB_LAYOUT[e.code]) {
            HND.log("apple WRONG", "key=" + e.key, "errors=" + (state.errorCount + 1));
            state.errorCount++;
            setGoat(state.errorCount >= 8 ? "eat" : "no");
            spawnFallingApple(e.key);
        }
    }

    // Spawn a falling apple with the wrong character — pick a still-on-tree
    // slot, hide that static apple, and animate the wrong-letter copy
    // falling from the same position (matches the original AppleFall
    // logic where AppleFrame transitions 1→16 as the apple drops).
    function spawnFallingApple(ch) {
        const slots = Array.from(treeLayer.querySelectorAll(".apple-static"));
        if (!slots.length) return;
        const stillOnTree = slots.filter(function (n) { return n.style.opacity !== "0"; });
        const target = stillOnTree.length ? stillOnTree[Math.floor(Math.random() * stillOnTree.length)] : slots[0];
        const slotIdx = parseInt(target.dataset.slot, 10);
        const p = APPLE_POS[slotIdx];
        target.style.opacity = "0";
        const apple = HND._el("div", { class: "apple-fall" });
        apple.style.cssText = "left:" + p[0] + "px;top:" + p[1] + "px;";
        apple.textContent = ch;
        fallLayer.appendChild(apple);
        setTimeout(function () { apple.remove(); }, 1500);
    }

    function winGame() {
        if (state.completed) return;
        state.completed = true;
        const score = Math.min(100, Math.round(state.totalScore));
        HND.log("apple FINISH", "score=" + score);
        HND.saveProgress(app.id, unit.id, "apple", score);
        setGoat("win");
        // Big apple sprite at (192, 0) per WinGame().
        const bigApple = HND._el("div", { class: "ctrl apple-big" });
        root.appendChild(bigApple);
        const stage = root.parentElement;
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
        if (onComplete) onComplete(score);
    }

    function keyHandler(e) {
        if (state.completed) {
            document.removeEventListener("keydown", keyHandler);
            return;
        }
        onKey(e);
    }
    document.addEventListener("keydown", keyHandler);

    initQuestion();
};
