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
    const americanPreload = (function preloadAmericanSprites() {
        const names = ["back", "frame", "framefocus", "text", "textfocus", "sound", "sound_on"];
        for (let i = 1; i <= 5; i++) names.push("hetzright1_" + i);
        for (let i = 1; i <= 8; i++) names.push("hetzright2_" + i);
        names.push("hetzright0_1");
        const p1 = HND.preloadFrames(app.id, "GameAmerican", names);
        // Shared flower + goat sprites from GameHaklada. Orig
        // GameAmerican.frm:348-358 loads GoatPic(0..6) from
        // PicPath\gamehaklada\goat<i>_* — same assets as Haklada.
        const sharedNames = [];
        for (let i = 0; i <= 9; i++) sharedNames.push("flower1_" + i);
        for (let i = 0; i <= 9; i++) sharedNames.push("flower2_" + i);
        for (let i = 0; i <= 9; i++) sharedNames.push("flower3_" + i);
        for (let i = 0; i <= 3; i++) sharedNames.push("flower4_" + i);
        for (let s = 0; s < HND.GOAT_FRAMES.length; s++)
            for (let f = 0; f < HND.GOAT_FRAMES[s]; f++)
                sharedNames.push("goat" + s + "_" + f);
        const p2 = HND.preloadFrames(app.id, "GameHaklada", sharedNames);
        return Promise.all([p1, p2]);
    })();
    HND.fadeInOnReady(root, americanPreload);

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

    // Per-unit calibration. American has 3 modes (slots 2/3/4 → cal
    // blocks 5/6/7). gameCalibrationFromSlot auto-picks the right
    // block based on which mode the user selected from the game menu.
    const cal = HND.gameCalibrationFromSlot(unit, app.id,
                  modeSlot === 2 ? 5 : modeSlot === 3 ? 6 : 7);
    const askCol  = cal.askCol;
    const ansCol  = cal.ansCol;
    // American honors WhatToAskSound / WhatToAnswerSound for AUDIO
    // (orig CurrentSoundPlay:454 — `SetWaveName WhatToAskSound`). The
    // teacher can show one side as text and PLAY a different side.
    // Null means qDisabled — caller skips playback.
    const askSide = cal.askSoundSide;

    // Layout selection (orig getHotSpot:191-271 — 3 distinct grids):
    //   text-text (both <3): default vertical rows
    //   text-pic  (WhatToAnswer=qPicture): 4 picture cards across
    //   pic-text  (WhatToAsk=qPicture): rows indented + small Q image
    let layout;
    if (cal.whatToAnswer === 3)      layout = "text-pic";
    else if (cal.whatToAsk === 3)    layout = "pic-text";
    else                              layout = "text-text";
    HND.log("american layout", layout, "askMode=" + cal.whatToAsk,
            "ansMode=" + cal.whatToAnswer);
    const FLOWER_SPACE = 65;
    // Orig PlayGame: QCount = min(items, QLimit, 33).
    const QCOUNT = Math.min(cal.qLimit > 0 ? cal.qLimit : items.length, 33);
    // Orig PlayGame:298-301 — `If QCount < 4 Then Unload Me / Exit Sub`.
    // 4 options per question requires at least 4 items in the pool.
    if (QCOUNT < 4) {
        root.innerHTML = '<div class="error">צריך לפחות 4 פריטים למשחק אמריקאי.</div>';
        if (onComplete) onComplete(0);
        return;
    }
    const rawIdxs = items.map(function (_, i) { return i; });
    const idOrder = (cal.ifRandom ? HND._shuffle(rawIdxs) : rawIdxs).slice(0, QCOUNT);
    // FlowerKind dedup (orig PlayGame:513-517).
    const flowerKinds = [];
    for (let i = 0; i < QCOUNT; i++) {
        let k = Math.floor(Math.random() * 3);
        if (i > 0 && k === flowerKinds[i - 1]) k = Math.floor(Math.random() * 3);
        flowerKinds.push(k);
    }

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
    // Layout class drives all per-mode positioning (CSS handles the
    // 3 .am-layout-* rules — see style.css).
    root.classList.add("am-layout-" + layout);
    root.appendChild(flowerLayer);
    root.appendChild(header);
    if (helpBanner) root.appendChild(help);
    root.appendChild(qFrame);
    root.appendChild(sound);
    root.appendChild(penaltyBox);
    root.appendChild(optionsLayer);
    // Mark picture-vs-text on Q frame so CSS can swap the frame sprite.
    if (cal.whatToAsk === 3) qFrame.classList.add("am-q-pic");
    else                     qFrame.classList.add("am-q-text-mode");

    // Goat — shared TimerGoat-style controller (js/goat.js). Orig
    // Per-slot bloom controllers (orig FlowerStatus array) — so goat.js
    // can finalize ANY prior flower on row-crosses (TimerGoat:780-797).
    const blooms = new Array(QCOUNT);
    function finalizeBloomAt(idx) {
        const b = blooms[idx];
        if (b && b.finish) b.finish();
    }

    // GameAmerican.frm Form_Load:376-378 sets GoatX=900, GoatY=407
    // (= flowerY(0)-55 since the bottom row sits at 462). The walking
    // mechanics + flower-bloom sync are identical to Haklada — only
    // the starting Y differs.
    const goatCtl = HND.createGoat({
        root: root,
        appId: app.id,
        flowerX: flowerX, flowerY: flowerY, QCOUNT: QCOUNT,
        className: "am-goat",
        bloomFinalizer: finalizeBloomAt,
    });

    // Header — UnitName · UserName (RGB(20,40,200) per Form_Paint).
    let userName = "";
    try { userName = localStorage.getItem("hnd." + app.id + ".user") || ""; } catch (e) {}
    header.textContent = unit.name + (userName ? "  ·  " + userName : "");

    // Pre-render the 33 flower slots along the snaking path.
    // Original PaintFlower (GameAmerican.frm:503): MaskB GetFlowerX, GetFlowerY
    // paints with the picture's TOP-LEFT at (X, Y) — no centering offset.
    for (let i = 0; i < QCOUNT; i++) {
        const fl = HND._el("div", {
            class: "ctrl am-flower seed kind-" + flowerKinds[i],
            style: "left:" + flowerX(i) + "px; top:" + flowerY(i) + "px;",
            "data-slot": i,
        });
        flowerLayer.appendChild(fl);
    }

    // CmdSound visibility gate (orig PlayGame:365-369 + Form_Paint:769):
    // shown only when CurrentUnit.ShowWave AND WhatToAskSound < qDisabled (4).
    // resolveCalibration sets cal.askSide = null when WhatToAskSound = 4.
    const flags = (unit && unit.flags) || [];
    const showWave = flags[2] !== false;
    const sideHasAudio = (askSide === "right" || askSide === "left" || askSide === "hint");
    if (!showWave || !sideHasAudio) sound.style.display = "none";

    function playQWave() {
        // Orig CurrentSoundPlay:455 — `If WhatToAskSound < 3 Then PlayWave`.
        // cal.askSide is null when WhatToAskSound = 4 (qDisabled).
        if (!askSide) return;
        const idx = idOrder[state.current];
        if (idx != null) HND.playWave(HND.unitWavePath(app.id, unit.id, idx, askSide));
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
        // Pick 3 distractors from the SHUFFLED IdOrder pool (orig
        // InitQuestion:148 — `HotSpotsId(i) = IdOrder(Int(Rnd*(QCount+1)))`),
        // de-duped, plus the correct answer, then shuffled.
        const distractors = [];
        const taken = { [idx]: 1 };
        const tryOrder = HND._shuffle(idOrder.slice());
        for (let i = 0; i < tryOrder.length && distractors.length < 3; i++) {
            const candidate = tryOrder[i];
            if (!taken[candidate]) { distractors.push(candidate); taken[candidate] = 1; }
        }
        // Fall back to the whole items pool if QCOUNT is so small we
        // can't fill 3 distractors from IdOrder (rare edge case).
        if (distractors.length < 3) {
            const rest = HND._shuffle(items.map(function (_, i) { return i; }))
                            .filter(function (i) { return !taken[i]; });
            while (distractors.length < 3 && rest.length) {
                distractors.push(rest.shift());
            }
        }
        state.hotSpotsId = HND._shuffle(distractors.concat([idx]));
        state.hetzhPos = 0;
        state.currErrors = 0;
        HND.log("american question",
                "q=" + (state.current + 1) + "/" + QCOUNT,
                "origIdx=" + idx, "ask=" + (correct[askCol] || "").slice(0, 40));
        // Q rendering depends on the layout and slot mode:
        //   - layout pic-text  : Q is a per-item picture box
        //   - MODE_BY_SOUND    : Q text hidden (🔊 placeholder)
        //   - MODE_BY_PIC      : picture-like frame, text inside
        //   - default text     : plain text in plank frame
        if (layout === "pic-text") {
            renderPictureInto(qFrame, qText, idx, correct[askCol] || "");
        } else if (MODE_BY_SOUND) {
            qText.textContent = "🔊";
            qText.style.backgroundImage = "";
            qFrame.classList.add("am-q-frame-sound");
            qFrame.classList.remove("am-q-frame-pic", "am-q-revealed");
        } else if (MODE_BY_PIC) {
            qText.textContent = correct[askCol] || "";
            qText.style.backgroundImage = "";
            qFrame.classList.add("am-q-frame-pic");
            qFrame.classList.remove("am-q-frame-sound");
        } else {
            qText.textContent = correct[askCol] || "";
            qText.style.backgroundImage = "";
            qFrame.classList.remove("am-q-frame-sound", "am-q-frame-pic");
        }
        renderOptions();
        state.gameEnabled = true;
        playQWave();
    }

    // Per-item picture helper. Loads `data/<App>/unit_<id>/pic/<idx>.png`
    // into a frame; falls back to the text label if the asset is missing
    // (orig InitQuestion:162 — `If Exist(...) Then LoadPicture ...`).
    // dataRoot path mirrors HND.unitWavePath's wave/ layout.
    function pictureUrl(origIdx) {
        const dataRoot = (HND.APPS[app.id] || {}).dataRoot || "data/" + app.id;
        return dataRoot + "/unit_" + unit.id + "/pic/" + origIdx + ".png";
    }
    function renderPictureInto(frameEl, textEl, origIdx, fallbackText) {
        const url = pictureUrl(origIdx);
        // Test-load the image; only attach if it actually decodes.
        const probe = new Image();
        probe.onload = function () {
            textEl.textContent = "";
            textEl.style.backgroundImage = "url('" + url + "')";
            textEl.style.backgroundSize  = "100% 100%";
            textEl.style.backgroundRepeat = "no-repeat";
            textEl.classList.add("am-pic-loaded");
        };
        probe.onerror = function () {
            textEl.textContent = fallbackText;
            textEl.style.backgroundImage = "";
            textEl.classList.remove("am-pic-loaded");
        };
        probe.src = url;
        // Show fallback text immediately while probe loads.
        textEl.textContent = fallbackText;
    }

    // Build the 4 option rows once, then mutate focus state in place so we
    // don't tear down the DOM (and the click target) on every mouseenter.
    let optionNodes = [];
    let hetzNode = null;
    function renderOptions() {
        optionsLayer.innerHTML = "";
        optionNodes = [];
        state.hotSpotsId.forEach(function (hotId, i) {
            const opt = HND._el("div", {
                class: "ctrl am-option",
                style: "--opt-i:" + i + ";",     // CSS uses var() for position
                "data-opt-i": i,
                onclick: function () { onPickOption(i); },
                onmouseenter: function () {
                    if (!state.gameEnabled) return;
                    setFocus(i);
                },
            });
            const inner = HND._el("span", { class: "am-option-text" });
            opt.appendChild(inner);
            if (layout === "text-pic") {
                // Option is a picture card (orig InitQuestion:160-168).
                renderPictureInto(opt, inner, hotId, items[hotId][ansCol] || "");
                opt.classList.add("am-option-pic");
            } else {
                inner.textContent = items[hotId][ansCol] || "";
            }
            optionsLayer.appendChild(opt);
            optionNodes.push(opt);
        });
        // Single hetz arrow that moves between option rows (or above in text-pic).
        hetzNode = HND._el("div", {
            class: "ctrl am-hetz" + (layout === "text-pic" ? " am-hetz-down" : ""),
        });
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
            // Hetz position derived per layout via CSS var, set here so
            // CSS calc() in `.am-hetz` rules can interpolate.
            hetzNode.style.setProperty("--opt-i", state.hetzhPos);
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
        // Synonym-aware correctness (orig CheckAnswer:564-580). Picked
        // item is "right" if EITHER:
        //   - same item ID                      (`IdOrder(Current) = HotSpotsId(HetzhPos)`)
        //   - same WhatToAnswer text            (CompareByte branch line 572)
        //   - same WhatToAsk text               (CompareByte branch line 577)
        // — handles synonym pairs in the same unit (e.g. two items with
        // the same Hebrew answer for different translations).
        const exp = items[idx];
        const got = items[picked];
        const sameAnsText = !!(exp[ansCol] && got[ansCol] && exp[ansCol] === got[ansCol]);
        const sameAskText = !!(exp[askCol] && got[askCol] && exp[askCol] === got[askCol]);
        const correct = (picked === idx) || sameAnsText || sameAskText;

        // If picked a SYNONYM (different ID, same text) — swap it into
        // the current slot so it doesn't get asked again (orig:585-596).
        if (correct && picked !== idx) {
            for (let i = state.current + 1; i < idOrder.length; i++) {
                if (idOrder[i] === picked) {
                    idOrder[i] = idx;
                    idOrder[state.current] = picked;
                    break;
                }
            }
        }
        if (correct) {
            HND.log("american CORRECT",
                    "q=" + (state.current + 1), "errors=" + state.currErrors,
                    "synonym=" + (picked !== idx));
            state.gameEnabled = false;
            // Reveal the Q text now in by-sound mode (orig CheckAnswer:
            // 599-610 redraws Q on correct when QuestionAsBonus=True).
            if (MODE_BY_SOUND) {
                qText.textContent = items[idx][askCol] || "";
                qFrame.classList.add("am-q-revealed");
            }
            // Hetz CORRECT cycle (HetzhStatus=1 → HetzRight1_1..5).
            const opt = optionNodes[state.hetzhPos];
            if (opt) opt.classList.add("done");
            if (hetzNode) {
                hetzNode.classList.remove("on", "wrong");
                void hetzNode.offsetWidth;
                hetzNode.classList.add("correct", "done");
            }
            // Match orig error-bucket → goat status / flower target
            // (GameAmerican.frm:993-1006): 0 err → status 1 (jump) +
            // FlowerFrameTo=9; 1-2 err → status 2 + 5; 3+ err →
            // status 5 + 3 with FlowerKind=3 (withered flower4 sprites).
            const cat = state.currErrors === 0 ? 0 :
                        state.currErrors <= 2 ? 1 : 2;
            state.errorsByQ.push(cat);
            const bloom = growFlower(state.current, cat);
            const targetIdx = Math.min(state.current + 1, QCOUNT - 1);
            blooms[targetIdx] = bloom;
            const goatStatus = cat === 0 ? 1 : cat === 1 ? 2 : 5;
            // Orig sequencing (TimerGoat case 55 fires AFTER answer
            // wave finishes — defer goat walk + good[N] until then).
            const goodN = 1 + Math.floor(Math.random() * 3);
            const onAudioDone = function () {
                goatCtl.setStatus(goatStatus, targetIdx, bloom);
                HND.playWave(
                    "assets/" + app.id + "/sounds/good" + goodN + ".wav",
                    function () {
                        state.current++;
                        if (state.current >= QCOUNT) finishGame();
                        else initQuestion();
                    }
                );
            };
            // Orig CheckAnswer:637-639 — the CombineQA chain uses
            // WhatToAskSound / WhatToAnswerSound, not the text sides.
            const audioCal = Object.assign({}, cal, {
                askSide: cal.askSoundSide,
                ansSide: cal.ansSoundSide,
            });
            // praiseMax=0 — American interleaves goat-walk and good[N] inside
            // onAudioDone (goat walks BEFORE praise per orig case-55 chain).
            HND.playCombineFromCal(app.id, unit.id, idx, audioCal, onAudioDone,
                                   { praiseMax: 0 });
        } else {
            HND.log("american WRONG",
                    "q=" + (state.current + 1), "pickedIdx=" + picked, "errors=" + (state.currErrors + 1));
            state.currErrors++;
            state.penalty = Math.min(60, state.penalty + 20 / QCOUNT);
            penaltyBox.textContent = String(Math.floor(state.penalty));
            // Orig GameAmerican.frm:662-664 — ra.wav + GoatStatus=4.
            HND.playWave("assets/" + app.id + "/sounds/ra.wav");
            goatCtl.setStatus(4);
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
            // Orig CheckAnswer:683-693 — saves OldHetzhPos before reveal;
            // on `CurrErrors = 3` (the exact threshold tick) restores it so
            // arrow-key nav resumes from the user's last guess. For >3 the
            // orig leaves focus on the correct slot.
            if (state.currErrors > 2) {
                const correctSlot = state.hotSpotsId.indexOf(idx);
                if (correctSlot >= 0) {
                    const oldPos = state.hetzhPos;
                    const restorePos = state.currErrors === 3;
                    setFocus(correctSlot);
                    const correctOpt = optionNodes[correctSlot];
                    if (correctOpt) {
                        correctOpt.classList.add("reveal");
                        setTimeout(function () {
                            correctOpt && correctOpt.classList.remove("reveal");
                            if (restorePos) setFocus(oldPos);
                        }, 600);
                    }
                }
            }
        }
    }

    // Bloom controller — returns { step, finish } so the goat tick can
    // advance the flower frame-by-frame as the goat walks past it
    // (orig TimerGoat:852-860 increments FlowerStatus[Current-1] each
    // frame > 4). Mirrors haklada.js growFlower exactly.
    const SPRITE_BASE = "assets/" + app.id + "/pictures/GameHaklada/";
    function growFlower(slotIdx, cat) {
        const seed = flowerLayer.querySelector('[data-slot="' + slotIdx + '"]');
        if (!seed) return { step: function () {}, finish: function () {} };
        seed.classList.remove("seed");
        const wilt = (cat === 2);
        const target = cat === 0 ? 9 : cat === 1 ? 5 : 3;
        const kindNum = wilt ? 4 : (flowerKinds[slotIdx] + 1);
        const lastFrame = wilt ? 3 : 9;
        const finalIdx  = Math.min(target, lastFrame);
        if (wilt) {
            ["kind-0", "kind-1", "kind-2"].forEach(function (k) {
                seed.classList.remove(k);
            });
            seed.classList.add("kind-3");
        }
        function setFrame(f) {
            seed.style.backgroundImage =
                "url('" + SPRITE_BASE + "flower" + kindNum + "_" + f + ".png')";
            seed.style.opacity = "1";
        }
        setFrame(0);
        let cur = 0;
        return {
            step: function () {
                if (cur >= target) return;
                cur += 1;
                setFrame(Math.min(cur, lastFrame));
            },
            finish: function () { cur = target; setFrame(finalIdx); },
        };
    }

    function finishGame() {
        if (state.completed) return;
        state.completed = true;
        const score = Math.max(0, 100 - Math.floor(state.penalty));
        HND.log("american FINISH", "score=" + score, "penalty=" + state.penalty);
        HND.saveProgress(app.id, unit.id, HND.currentSlotKey(app.id, "american"), score, state.errorsByQ);
        // Orig TimerGoat:870-878 — Current>QCount triggers GoatStatus=6
        // (win-loop) and plays Win.WAV. Goat dances at its last-walked
        // position (the just-completed flower); raise z-index so it
        // stays visible above our same-stage ScoreForm overlay.
        goatCtl.element.style.zIndex = "60";
        goatCtl.setStatus(6);
        const stage = root.parentElement;
        const showScores = function () {
            HND.showScoreForm(
                stage, app.id, unit.name, userName, score, state.errorsByQ,
                function onExit() {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                },
                function onReplay() {
                    HND.restartGame(app.id, unit.id, "american");
                }
            );
        };
        let shown = false;
        const showOnce = function () { if (!shown) { shown = true; showScores(); } };
        HND.playWave("assets/" + app.id + "/sounds/win.wav", showOnce);
        setTimeout(showOnce, 4000);
        if (onComplete) onComplete(score);
    }

    // Calibration instructions overlay + per-mode help wave (orig
    // Form_Paint:786-790 auto-fires CmdHelp_Click). KindOfGame maps to
    // game5/6/7.wav: 5=by-text (default), 6=by-picture, 7=by-sound.
    // Only game5.wav is shipped in the port's shared assets — 6/7 fall
    // back to game5 if missing (same orig fallback chain CmdHelp:409).
    function showHelpOverlay() {
        const text = (cal.instructionsFliped && window.HND_QASwitched)
                   ? cal.instructionsFliped : cal.instructions;
        if (text && text !== "0") {
            help.textContent = text;
            help.style.display = "block";
        }
        const hide = function () { help.style.display = "none"; };
        const kindOfGame = MODE_BY_SOUND ? 2 : MODE_BY_PIC ? 1 : 0;
        // Orig CmdHelp_Click:408-412 — if GameQASwitched, plays
        // gameXFliped.wav instead. We try Fliped variant first when
        // QASwitched flag is on; falls through to plain gameX.wav.
        const suffix = (window.HND_QASwitched ? "Fliped" : "") + ".wav";
        const wavName = "game" + (5 + kindOfGame) + suffix;
        const primary = "assets/" + app.id + "/sounds/" + wavName;
        const fallback = "assets/" + app.id + "/sounds/game5.wav";
        const playOnce = function (url, onEnd) {
            HND.playWave(url, onEnd);
            // If url 404s, _missingWaves cache will reflect that on next
            // play — try fallback after a short pause.
            setTimeout(function () {
                if (HND._missingWaves && HND._missingWaves[url] && url !== fallback) {
                    HND.playWave(fallback, hide);
                }
            }, 500);
        };
        if (primary === fallback) HND.playWave(primary, hide);
        else                       playOnce(primary, hide);
        setTimeout(hide, 8000);   // hard cap if wave never ends
    }

    // Hook the outer app.js help icon so F1 / click replays our
    // instruction overlay (orig F1=CmdHelp_Click in Form_KeyUp:466).
    // Also hook the exit icon to drive the orig CmdExit_Click two-step:
    // first click reveals a mid-game replay button; second exit confirms.
    let replayBtn = null;
    function showReplayButton() {
        if (replayBtn) return;
        replayBtn = HND._el("button", {
            class: "ctrl am-replay",
            title: "התחל מחדש",
        });
        replayBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            // Orig CmdRePlay_Click:440-443 → Unload Me + PlayGame again.
            // Re-route to same URL; app.js will rebuild the screen.
            HND.restartGame(app.id, unit.id, "american");
        });
        root.appendChild(replayBtn);
    }
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
        const exitBtn = root.parentElement.querySelector(".exit-icon");
        if (exitBtn) {
            const cloneIt = exitBtn.cloneNode(true);
            exitBtn.parentNode.replaceChild(cloneIt, exitBtn);
            cloneIt.addEventListener("click", function (e) {
                // Clone wiped app.js's exit handler — re-implement orig
                // CmdExit_Click:388-397 two-step:
                //   1st click: surface CmdRePlay.
                //   2nd click (replay already visible): exit to menu.
                e.stopPropagation();
                if (!replayBtn) {
                    showReplayButton();
                } else {
                    location.hash = "#/" + app.id + "/unit/" + unit.id + "/games";
                }
            });
        }
    }

    // Teardown on game leave — orig Form_Unload kills all timers + sprites.
    // Browser equivalent: drop the keydown listener when our root is
    // removed from the DOM.
    let teardownObs = null;
    function teardown() {
        goatCtl.teardown();
        document.removeEventListener("keydown", keyHandler);
        if (teardownObs) teardownObs.disconnect();
    }
    if (root.parentElement && root.parentElement.parentElement) {
        teardownObs = new MutationObserver(function () {
            if (!root.isConnected) teardown();
        });
        teardownObs.observe(root.parentElement.parentElement,
                            { childList: true, subtree: true });
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

    // Show calibration instructions + play game5/6/7.wav on start.
    showHelpOverlay();
    // Orig Form_Paint:786 sets GoatStatus=1 once after firstPaint —
    // goat jumps in from off-screen toward flower 0.
    goatCtl.setStatus(1, 0);
    initQuestion();
};
