// American (Multi-choice) — full port of GameAmerican.frm.
//
//   getHotSpot (text-text path, lines 219-244):
//     HotSpots[i].Top  = 160 + i*62  (4 options, 62px apart)
//     HotSpots[i].Left = 170, Right = 670 (width 500, height 60)
//     HetzhSpots[i].X  = HotSpots.Left - 90 = 80
//     HetzhSpots[i].Y  = HotSpots row mid - 45
//     QSpot  Left=150, Top=80, Right=650, Bottom=140
//     CmdSound at QSpot.Right+10 = 660, QSpot.Top+2 = 82
//
//   InitQuestion (line 141):
//     4 HotSpots filled with random IDs; guaranteed the correct one is
//     among them. Paints text.bmp + DrawString at center per slot.
//
//   Hetz arrow states (TimerHetzh):
//     HetzhStatus = 0 idle / 1 correct (HetzRight1_1..5 anim)
//                    2 wrong  (HetzRight2_1..8 anim)
//
//   CheckAnswer (line 564):
//     Correct → ErrorsStatus[Current] by CurrErrors (0/1-2/3+),
//       play <n>_left.wav praise then good_N.wav → goat animates,
//       grow flower, Current++. If Current>QCount → WinGame.
//     Wrong → ra.wav, GoatStatus=4, CurrErrors++, Penalty += 20/QCount.
//       CurrErrors > 2: briefly show the correct answer (move hetz).
//
//   Form_KeyUp: Up/Left = HetzhPos--, Down/Right = HetzhPos++,
//               Enter = CheckAnswer.
//   Form_MouseMove: hovering a hotspot sets HetzhPos + repaints.
//   Form_MouseDown: clicking sets HetzhPos + CheckAnswer.
window.HND = window.HND || {};

HND.startAmerican = function (root, app, unit, onComplete) {
    const cols  = (unit.data && unit.data.columns) || [];
    const items = (unit.data && unit.data.items)  || [];
    if (items.length < 4 || cols.length < 2) {
        root.innerHTML = '<div class="error">צריך לפחות 4 פריטים למשחק אמריקאי.</div>';
        return;
    }
    (function preloadAmericanSprites() {
        const names = ["back", "frame", "framefocus", "text", "textfocus", "sound", "sound_on"];
        for (let i = 1; i <= 5; i++) names.push("hetzright1_" + i);
        for (let i = 1; i <= 8; i++) names.push("hetzright2_" + i);
        names.push("hetzright0_1");
        HND.preloadFrames(app.id, "GameAmerican", names);
        // Shared flower sprites from GameHaklada. Frame counts:
        //   flower1: 0..9, flower2: 0..9, flower3: 0..9, flower4: 0..3.
        const goatFlowerNames = [];
        for (let i = 0; i <= 9; i++) goatFlowerNames.push("flower1_" + i);
        for (let i = 0; i <= 9; i++) goatFlowerNames.push("flower2_" + i);
        for (let i = 0; i <= 9; i++) goatFlowerNames.push("flower3_" + i);
        for (let i = 0; i <= 3; i++) goatFlowerNames.push("flower4_" + i);
        HND.preloadFrames(app.id, "GameHaklada", goatFlowerNames);
    })();

    // Original American has 3 modes mapped to GameMenu slots 2/3/4:
    //   slot 2 → "לפי קול"    (by sound — Q-side wave-only, no Q text)
    //   slot 3 → "לפי תמונה"  (by picture — Q is the picture)
    //   slot 4 → "לפי טקסט"   (by text — both Q + audio visible) ← default
    // The slot index is stashed in sessionStorage on game-menu click;
    // read it here to branch the InitQuestion rendering.
    let modeSlot = 4;   // default = by-text
    try {
        const v = sessionStorage.getItem("hnd." + app.id + ".lastSlot");
        if (v != null) modeSlot = parseInt(v, 10);
    } catch (e) {}
    const MODE_BY_SOUND = (modeSlot === 2);
    const MODE_BY_PIC   = (modeSlot === 3);
    HND.log("american mode", "slot=" + modeSlot,
            "bySound=" + MODE_BY_SOUND, "byPic=" + MODE_BY_PIC);

    const askCol = cols[2] || cols[0];   // Hebrew Q text
    const ansCol = cols[1] || cols[0];   // translation A text
    const FLOWER_SPACE = 65;
    const QCOUNT = Math.min(items.length, 33);
    const idOrder = HND._shuffle(items.map(function (_, i) { return i; })).slice(0, QCOUNT);
    const flowerKinds = idOrder.map(function () { return Math.floor(Math.random() * 3); });

    // GetFlowerX/Y (lines 514-533): same snaking 3-row path as Haklada.
    function flowerX(i) {
        if (i <= 10) return 700 - i * FLOWER_SPACE;
        if (i <= 22) return 25 + (i - 11) * FLOWER_SPACE;
        return 700 - (i - 23) * FLOWER_SPACE;
    }
    function flowerY(i) {
        if (i <= 10) return 440 + 22;
        if (i <= 22) return 465 + 22;
        return 490 + 22;
    }

    const state = {
        current: 0,
        hotSpotsId: [0, 0, 0, 0],
        hetzhPos: 0,
        currErrors: 0,
        penalty: 0,
        errorsByQ: [],
        gameEnabled: false,
        completed: false,
        userInteracted: false,
    };
    HND.log("american start", app.id + "/" + unit.id, "items=" + items.length, "QCount=" + QCOUNT);

    // Help banner — Form_Paint draws CurrentCalibration.Instructions at
    // (400, 40) in RGB(40,80,190) centered. Read from this unit's cfg
    // (American modes map to cal blocks 5/6/7 → slot 2/3/4). Field 4 of
    // each 20-field block is the Instructions string.
    const AMER_CAL_IDX = modeSlot === 2 ? 5 : modeSlot === 3 ? 6 : 7;
    const helpBanner = (function () {
        const cfg = unit.cfg || [];
        const text = String(cfg[AMER_CAL_IDX * 20 + 4] || "").trim();
        return text;
    })();

    // ===== Persistent layers =====
    const flowerLayer = HND._el("div", { class: "ctrl am-flower-layer" });
    const help        = HND._el("div", { class: "ctrl am-help", text: helpBanner });
    const header      = HND._el("div", { class: "ctrl am-header" });
    const qFrame      = HND._el("div", { class: "ctrl am-q-frame", title: "השמע" });
    const qText       = HND._el("span", { class: "am-q-text" });
    qFrame.appendChild(qText);
    const sound       = HND._el("button", { class: "ctrl am-sound", title: "השמע שוב" });
    const penaltyBox  = HND._el("div", { class: "ctrl am-penalty", text: "0" });
    const optionsLayer = HND._el("div", { class: "ctrl am-options-layer" });
    root.innerHTML = "";
    root.appendChild(flowerLayer);
    root.appendChild(header);
    if (helpBanner) root.appendChild(help);
    root.appendChild(qFrame);
    root.appendChild(sound);
    root.appendChild(penaltyBox);
    root.appendChild(optionsLayer);

    // Header — UnitName · UserName (RGB(20,40,200) per Form_Paint).
    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
    header.textContent = unit.name + (userName ? "  ·  " + userName : "");

    // Pre-render the 33 flower slots along the snaking path.
    for (let i = 0; i < QCOUNT; i++) {
        const fl = HND._el("div", {
            class: "ctrl am-flower seed kind-" + flowerKinds[i],
            style: "left:" + (flowerX(i) - 12) + "px; top:" + (flowerY(i) - 30) + "px;",
            "data-slot": i,
        });
        flowerLayer.appendChild(fl);
    }

    function playQWave() {
        const idx = idOrder[state.current];
        if (idx != null) HND.playWave(HND.unitWavePath(app.id, unit.id, idx, "right"));
    }
    sound.addEventListener("click", function (e) {
        e.stopPropagation();
        if (state.gameEnabled) { state.userInteracted = true; playQWave(); }
    });
    qFrame.addEventListener("click", function () {
        if (state.gameEnabled) { state.userInteracted = true; playQWave(); }
    });

    function initQuestion() {
        if (state.current >= QCOUNT) { finishGame(); return; }
        const idx = idOrder[state.current];
        const correct = items[idx];
        // Pick 3 distractors + the correct answer, shuffled.
        const pool = items.map(function (_, i) { return i; })
                          .filter(function (i) { return i !== idx; });
        const distractors = HND._shuffle(pool).slice(0, 3);
        state.hotSpotsId = HND._shuffle(distractors.concat([idx]));
        state.hetzhPos = 0;
        state.currErrors = 0;
        HND.log("american question",
                "q=" + (state.current + 1) + "/" + QCOUNT,
                "origIdx=" + idx, "ask=" + (correct[askCol] || "").slice(0, 40));
        if (MODE_BY_SOUND) {
            // QuestionAsBonus / by-sound: blank the Q text — the user
            // must listen to the wave to know what to pick.
            qText.textContent = "🔊";
            qFrame.classList.add("am-q-frame-sound");
        } else if (MODE_BY_PIC) {
            // by-picture: we don't ship per-unit images, so render the
            // ask column inside a picture frame (closest visual proxy).
            qText.textContent = correct[askCol] || "";
            qFrame.classList.add("am-q-frame-pic");
        } else {
            qText.textContent = correct[askCol] || "";
            qFrame.classList.remove("am-q-frame-sound", "am-q-frame-pic");
        }
        renderOptions();
        state.gameEnabled = true;
        // First Q must wait for user interaction (browser autoplay block);
        // subsequent Qs play automatically since interaction has occurred.
        if (state.userInteracted) playQWave();
    }

    // Build the 4 option rows once, then mutate focus state in place so we
    // don't tear down the DOM (and the click target) on every mouseenter.
    let optionNodes = [];
    let hetzNode = null;
    function renderOptions() {
        optionsLayer.innerHTML = "";
        optionNodes = [];
        state.hotSpotsId.forEach(function (hotId, i) {
            const top = 160 + i * 62;
            const opt = HND._el("div", {
                class: "ctrl am-option",
                style: "top:" + top + "px;",
                onclick: function () { onPickOption(i); },
                onmouseenter: function () {
                    if (!state.gameEnabled) return;
                    setFocus(i);
                },
            });
            opt.appendChild(HND._el("span", {
                class: "am-option-text",
                text: items[hotId][ansCol] || "",
            }));
            optionsLayer.appendChild(opt);
            optionNodes.push(opt);
        });
        // Single hetz arrow that moves between option rows.
        hetzNode = HND._el("div", { class: "ctrl am-hetz" });
        optionsLayer.appendChild(hetzNode);
        applyFocus();
    }
    function setFocus(i) {
        state.hetzhPos = i;
        applyFocus();
    }
    function applyFocus() {
        optionNodes.forEach(function (n, i) {
            if (i === state.hetzhPos) n.classList.add("focus");
            else n.classList.remove("focus");
        });
        if (hetzNode) {
            hetzNode.style.top = (160 + state.hetzhPos * 62 + 5) + "px";
            hetzNode.classList.add("on");
        }
    }

    function onPickOption(i) {
        if (!state.gameEnabled) return;
        state.hetzhPos = i;
        applyFocus();
        // Original commits the first click. Unlock autoplay AND check
        // the answer; if it happens to be correct the praise wave plays
        // immediately, otherwise the wrong-feedback plays.
        if (!state.userInteracted) {
            state.userInteracted = true;
            // Pre-fetch wave (warms the audio element so the praise/wrong
            // playback inside checkAnswer doesn't hit the autoplay gate).
            try { playQWave(); HND.stopWave(); } catch (e) {}
        }
        checkAnswer();
    }

    function checkAnswer() {
        const idx = idOrder[state.current];
        const picked = state.hotSpotsId[state.hetzhPos];
        const correct = (picked === idx);
        if (correct) {
            HND.log("american CORRECT",
                    "q=" + (state.current + 1), "errors=" + state.currErrors);
            state.gameEnabled = false;
            // Hetz CORRECT cycle (HetzhStatus=1 → HetzRight1_1..5).
            const opt = optionNodes[state.hetzhPos];
            if (opt) opt.classList.add("done");
            if (hetzNode) {
                hetzNode.classList.remove("on", "wrong");
                void hetzNode.offsetWidth;
                hetzNode.classList.add("correct", "done");
            }
            const cat = state.currErrors === 0 ? 0 :
                        state.currErrors <= 2 ? 1 : 2;
            state.errorsByQ.push(cat);
            growFlower(state.current);
            // Original GameAmerican.frm:1010 — celebratory good_N.wav
            // (good1..good3 random) AFTER the answer's left.wav. We chain
            // both so the praise lines up with the goat's "yes" pose
            // before advancing.
            const goodN = 1 + Math.floor(Math.random() * 3);
            HND.playWave(
                HND.unitWavePath(app.id, unit.id, idx, "left"),
                function () {
                    HND.playWave(
                        "assets/" + app.id + "/sounds/good" + goodN + ".wav",
                        function () {
                            state.current++;
                            if (state.current >= QCOUNT) finishGame();
                            else initQuestion();
                        }
                    );
                }
            );
        } else {
            HND.log("american WRONG",
                    "q=" + (state.current + 1), "pickedIdx=" + picked, "errors=" + (state.currErrors + 1));
            state.currErrors++;
            state.penalty = Math.min(60, state.penalty + 20 / QCOUNT);
            penaltyBox.textContent = String(Math.floor(state.penalty));
            // Original GameAmerican.frm:662 — ra.wav buzzer on wrong pick.
            HND.playWave("assets/" + app.id + "/sounds/ra.wav");
            const opt = optionNodes[state.hetzhPos];
            if (opt) {
                opt.classList.add("wrong");
                setTimeout(function () { opt && opt.classList.remove("wrong"); }, 500);
            }
            // Hetz WRONG cycle (HetzhStatus=2 → HetzRight2_1..8).
            if (hetzNode) {
                hetzNode.classList.remove("correct");
                void hetzNode.offsetWidth;
                hetzNode.classList.add("wrong");
                setTimeout(function () {
                    hetzNode && hetzNode.classList.remove("wrong");
                }, 800);
            }
            // After 3 errors, briefly highlight the correct option.
            if (state.currErrors > 2) {
                const correctSlot = state.hotSpotsId.indexOf(idx);
                if (correctSlot >= 0) {
                    setFocus(correctSlot);
                    const correctOpt = optionNodes[correctSlot];
                    if (correctOpt) {
                        correctOpt.classList.add("reveal");
                        setTimeout(function () {
                            correctOpt && correctOpt.classList.remove("reveal");
                        }, 600);
                    }
                }
            }
        }
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
        HND.log("american FINISH", "score=" + score, "penalty=" + state.penalty);
        HND.saveProgress(app.id, unit.id, "american", score);
        const stage = root.parentElement;
        setTimeout(function () {
            HND.showScoreForm(
                stage, app.id, unit.name, userName, score, state.errorsByQ,
                function onExit() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                },
                function onReplay() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/american";
                }
            );
        }, 900);
        if (onComplete) onComplete(score);
    }

    // Keyboard nav per Form_KeyUp (lines 460-493).
    function keyHandler(e) {
        if (state.completed) {
            document.removeEventListener("keydown", keyHandler);
            return;
        }
        if (!state.gameEnabled) return;
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            setFocus((state.hetzhPos + 3) % 4);
        } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            setFocus((state.hetzhPos + 1) % 4);
        } else if (e.key === "Enter" || e.key === " ") {
            checkAnswer();
        }
    }
    document.addEventListener("keydown", keyHandler);

    initQuestion();
};
