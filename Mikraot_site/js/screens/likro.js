// Form1 / GAMES1.FRM — main reading game (and the Q&A modes).
//
// Tirgul (mode) semantics, per START.FRM + GAMES1.FRM:
//   0 = Likro (default) — read mode entry, lines NOT clickable yet
//   1 = Stroka          — line mode, click line → play 1_L<n>.WAV
//   2 = Slovo           — word mode (word-level click; uses same Slovo array)
//   3 = Slog            — syllable mode (sub-word)
//   4 = VoprTx          — text questions (Q&A on the right/text page)
//   5 = VoprTm          — picture questions (Q&A on the left/picture page)
//
// Form_Load Z-flow (1:1):
//   1. background = menu/dugma5.bmp
//   2. Get_Spisok(1, ...) → record 1 holds LPicName/RPicName/Kol_t/Kol_P
//   3. DeTrace: Slovo(1..Kol_t) overlays on Picture2 (text page) with rect
//      + WAV per word. Pic_Zone(1..Kol_P) overlays on Picture1 (picture page).
//   4. Load Picture1 ← LPicName, Picture2 ← RPicName for Likro mode (NomerMasl=-1).
//   5. PicFea/PicBur ← cell 0 of Anim PicClip1/2.
//   6. Plays Mik_Siha/KFP1.wav as the opening sound (we map to wav/KFP1.wav
//      → not present in mik_siha, comes from per-stage WAV/ root).
//   7. btnReturn → HAZOR (back) for NomerMasl=-1, else HEMSHEH (continue).
//
// FrmVisibl(0) hides Halon (coins) and shows btnSlog/btnSlovo/btnStroka.
// FrmVisibl(1) reverses for Q&A modes (tirgul 4/5).
//
// Mode entry: btnStroka_Click sets tirgul=1, plays KNOC3.wav, on first
// entry plays FAll1.wav and animates PicFea cell 0..5. Then Slovo clicks
// play their .wav and (in original) floodfill-highlight the line; we use
// a CSS outline-flash instead.
(function () {
    const MK = window.MK;
    const STAGES = window.MK_STAGES;

    // Map of WAV filenames (relative to Cur_Dir, with backslashes) → our
    // lowercase forward-slash asset paths. The .spi data uses raw VB6
    // paths like "WAV\1_1\1_L2.WAV". Convert in one helper.
    function toAsset(p) {
        if (!p) return null;
        return p.replace(/\\/g, "/").toLowerCase();
    }
    function bgImg(rel) { return "url('assets/" + rel + "')"; }

    // Two book-page pictures live at fixed twips coords inside the form.
    // The .spi rects for Slovo/Pic_Zone are in PIXELS relative to those
    // pictures (because Picture1/Picture2 have ScaleMode=3=Pixel). We
    // already render those pictures at design-pixel size, so the .spi
    // rects translate 1:1 to CSS coords inside the picture div.

    function bmpToPng(rel) {
        if (!rel) return null;
        return toAsset(rel).replace(/\.bmp$/, ".png");
    }

    function animateSprite(node, label, cells, intervalMs) {
        let i = 0;
        return new Promise(function (resolve) {
            const tick = function () {
                if (i >= cells) { resolve(); return; }
                node.style.backgroundImage = bgImg("anim/" + label + "_" + i + ".png");
                i += 1;
                setTimeout(tick, intervalMs);
            };
            tick();
        });
    }

    function flashHighlight(node) {
        // Stand-in for VB6's ExtFloodFill (QBColor(14) yellow). Animate a
        // bright yellow border for ~600ms so the user can see which line
        // is being read.
        node.style.outline = "2px solid #FFFF00";
        node.style.boxShadow = "inset 0 0 0 9999px rgba(255, 255, 0, 0.25)";
        setTimeout(function () {
            node.style.outline = "";
            node.style.boxShadow = "";
        }, 600);
    }

    // Local helpers — `play` is fire-and-forget, `playAwait` blocks
    // until the audio ends (= VB6 sndPlaySound flag 0 / PlayZad).
    function play(rel)      { return MK.play(toAsset(rel)); }
    function playAwait(rel) { return MK.play(toAsset(rel), { await: true }); }

    MK.renderLikro = function (root, ctx) {
        const song = ctx.params.song || 1;
        const variant = ctx.params.variant || 1;
        const tirgulInit = ctx.params.tirgul != null ? +ctx.params.tirgul : 0;
        const stage = (STAGES[song] || {})[variant];
        MK.log("likro", "song=" + song, "variant=" + variant, "tirgul=" + tirgulInit,
               "kol_t=" + (stage && stage.kol_t), "kol_p=" + (stage && stage.kol_p),
               "left=" + (stage && stage.left), "right=" + (stage && stage.right));
        if (!stage) {
            MK.log("likro", "MISS stage", song, variant);
            MK.makeStage(root).textContent = "Stage " + song + "/" + variant + " לא נמצא";
            return;
        }

        const layout  = window.MK_LAYOUT.games1;
        const sz      = MK.stageSizeFor(layout);
        const scale   = MK.scaleFor(layout);
        const stageEl = MK.makeStage(root, sz.w, sz.h);
        stageEl.style.backgroundImage = bgImg("menu/dugma5.png");
        stageEl.style.backgroundSize = "100% 100%";

        // Mutable state. tirgul transitions inside the stage and gates
        // Slovo clicks (Slovo_Click: `If tirgul = 0 Then Exit Sub`).
        const state = {
            tirgul: tirgulInit,
            song: song,
            variant: variant,
            stage: stage,
            slovoNodes: [],
            zoneNodes: [],
            indexT: 1,
            makomP: 0,
            rishon: true,
            picFeaNode: null,
            picBurNode: null,
            btnSlogNode: null,
            btnSlovoNode: null,
            btnStrokaNode: null,
            btnShmaNodes: [],
            picture1Node: null,
            picture2Node: null,
        };

        // Render controls in original Z-order (.frm earlier-first = on top
        // in VB; reverse for DOM where later = on top).
        MK.iterateInZOrder(layout.children, function (ctrl) {
            const style = MK.posStyle(ctrl, scale);
            // style is captured per-control; nested handlers below also
            // call MK.posStyle(ctrl, scale) to keep scaling consistent.
            switch (ctrl.name) {
                // btnExit_Click → Ezia: Mik_Siha/aastop.wav + exit dialog → catalog.
                case "btnExit":   return mkBtn(ctrl, "menu/stop.png", function () {
                    MK.play("mik_siha/aastop.wav").catch(function () {});
                    window.location.href = "../index.html";
                }, "יציאה");
                // btnReturn_Click → Unload Form1 → returns to caller. In
                // free play (no maslul chain) → START. In a chain, the
                // original Form1 unloads back to maslul.Kivun() which
                // advances to the next step. We mirror that by checking
                // sessionStorage for an active chain.
                case "btnReturn": return mkBtn(ctrl, "menu/hazor.png", function () {
                    const chain = sessionStorage.getItem("mikraot:chain");
                    if (chain) {
                        // Need MK.renderForm + advanceChain from milon_games.js.
                        // Inline a minimal advance call.
                        if (typeof MK.advanceMaslulChain === "function") MK.advanceMaslulChain();
                        else location.hash = "#/maslul/" + (JSON.parse(chain).song || "1");
                    } else {
                        location.hash = "#/start";
                    }
                }, "חזרה");
                case "PicFea":    return mkSprite(ctrl, "pic_fea", 6, ["mik_siha/x2.wav", "mik_siha/kfp2.wav"], function (n) { state.picFeaNode = n; });
                case "PicBur":    return mkSprite(ctrl, "pic_bur", 6, ["mik_siha/kpq.wav", "mik_siha/kp1.wav"], function (n) { state.picBurNode = n; });
                case "Picture1":  return mkPicture1(ctrl, style);
                case "Picture2":  return mkPicture2(ctrl, style);
                case "Panel3D1":  return mkPanel(ctrl, style);
                case "Halon":     return mkHalon(ctrl, style);
                case "btnVopros": return mkVoprosBtn(ctrl, style);
                case "btnSlog":   return mkModeBtn(ctrl, "kl1", "kl11", function () { setMode(3); }, function (n) { state.btnSlogNode = n; });
                case "btnSlovo":  return mkModeBtn(ctrl, "kl2", "kl22", function () { setMode(2); }, function (n) { state.btnSlovoNode = n; });
                case "btnStroka": return mkModeBtn(ctrl, "kl3", "kl33", function () { setMode(1); }, function (n) { state.btnStrokaNode = n; });
                case "btnShma":   return mkShma(ctrl, style);
                case "PicCursor1": case "PicCursorMask1":
                case "PicCursor2": case "PicCursorMask2":
                case "Timer1": case "Timer2": case "Timer3":
                    return;
            }
        });

        // After all controls are placed, the visibility for tirgul=0 mode:
        //   FrmVisibl(0) → Halon hidden, btnSlog/Slovo/Stroka visible, btnShma hidden
        //   FrmVisibl(1) → reversed (Q&A modes)
        applyFrmVisibl(state.tirgul > 3 ? 1 : 0);

        // Form_Load: plays Mik_Siha\KFP1.wav. The .spi data uses WAV\ but
        // the opening sound is in mik_siha/. Real path: WAV/KFP1.wav in
        // the stage data root — but the original loads it from Cur_Dir
        // which is the app root. Try that location.
        if (state.tirgul < 4) {
            // GAMES1.FRM Form_Load: `sndPlaySound(Cur_Dir$ & "WAV\KFP1.wav", 1)`.
            // Lives in wav/ root (the runtime's Cur_Dir), NOT in mik_siha/.
            setTimeout(function () { MK.play("wav/kfp1.wav"); }, 250);
        } else if (state.tirgul === 4 || state.tirgul === 5) {
            // Q&A mode: kick off the question loop after Form_Load
            // completes so refs (btnVoprosNode, picFeaNode, etc.) exist.
            setTimeout(startQA, 250);
        }

        function mkBtn(ctrl, img, onclick, title) {
            const btn = MK.el("button", { class: "ctrl", style: MK.posStyle(ctrl, scale), title: title });
            btn.style.backgroundImage = bgImg(img);
            btn.addEventListener("click", onclick);
            stageEl.appendChild(btn);
            return btn;
        }
        function mkSprite(ctrl, label, cells, audios, set) {
            const node = MK.el("button", { class: "ctrl", style: MK.posStyle(ctrl, scale) });
            node.style.backgroundImage = bgImg("anim/" + label + "_0.png");
            node.addEventListener("click", function () {
                const a = audios[Math.floor(Math.random() * audios.length)];
                MK.play(a);
                animateSprite(node, label, cells, 100).then(function () {
                    node.style.backgroundImage = bgImg("anim/" + label + "_0.png");
                });
            });
            stageEl.appendChild(node);
            set(node);
            return node;
        }
        // VB6 PictureBox with AutoSize=False and no clipping draws the BMP
        // at the box's top-left corner at the BMP's natural pixel size;
        // content extending past the design Width/Height is visible
        // (not clipped). Slovo and Pic_Zone rects are in those BMP-native
        // pixel coords. So we render the picture as an <img> with
        // `overflow: visible` on its container — the box stays at design
        // dims for layout/Z, but the image sits inside at natural size,
        // and rect overlays are positioned absolutely against that image.
        function mkPictureContainer(ctrl, style, rel, overlays, onclickIdx) {
            const wrap = MK.el("div", { class: "ctrl no-click", style: style });
            wrap.style.overflow = "visible";
            stageEl.appendChild(wrap);
            const png = bmpToPng(rel);
            const img = MK.el("img", { src: png ? ("assets/bmp/" + png.replace(/^bmp\//, "")) : "" });
            img.style.position = "absolute";
            img.style.left = "0";
            img.style.top  = "0";
            img.style.maxWidth = "none";   // override any global img sizing
            wrap.appendChild(img);
            // Overlays sit on the same coordinate origin as the image (the
            // wrap's top-left), so the .spi rects map 1:1.
            const overlayNodes = overlays.map(function (rect, i) {
                const [x, y, w, h] = rect;
                const sn = MK.el("div", {
                    style: {
                        position: "absolute",
                        left: x + "px", top: y + "px",
                        width: w + "px", height: h + "px",
                        cursor: "pointer",
                        background: "transparent",
                        pointerEvents: "auto",
                    },
                });
                sn.addEventListener("click", function () { onclickIdx(i); });
                wrap.appendChild(sn);
                return sn;
            });
            return { wrap, img, overlayNodes };
        }
        function mkPicture1(ctrl, style) {
            const built = mkPictureContainer(ctrl, style, stage.left,
                stage.zones.map(function (z) { return z.rect; }),
                onPicZoneClick);
            state.picture1Node = built.wrap;
            state.zoneNodes = built.overlayNodes;
            stage.zones.forEach(function (z, i) {
                built.overlayNodes[i].title = z.q || "";
            });
        }
        function mkPicture2(ctrl, style) {
            const built = mkPictureContainer(ctrl, style, stage.right,
                stage.words.map(function (w) { return w.rect; }),
                onSlovoClick);
            state.picture2Node = built.wrap;
            state.slovoNodes = built.overlayNodes;
        }
        function mkPanel(ctrl, style) {
            const lbl = MK.el("div", { class: "lbl", style: style });
            lbl.style.lineHeight = parseInt(style.height) + "px";
            lbl.style.fontSize = "20px";
            lbl.style.color = "#FFFFFF";
            lbl.style.background = "rgb(0, 128, 255)";  // BackColor 16744576
            // Caption = Shir(GameNomer-1). Without a real GameNomer
            // model yet, label the panel with stage id.
            lbl.textContent = "מקראות — שיר " + song + " (וריאציה " + variant + ")";
            stageEl.appendChild(lbl);
        }
        function mkHalon(ctrl, style) {
            const node = MK.el("div", { class: "ctrl no-click", style: style });
            // Halon (= "window") shows matbea0/2/3 BMPs (empty/silver/gold
            // coin) — score indicators. There are 3, one per question
            // attempt. Default empty (matbea0).
            node.style.backgroundImage = bgImg("menu/matbea0.png");
            node.style.display = "none";  // Hidden in tirgul=0 (FrmVisibl 0).
            stageEl.appendChild(node);
            state.halonNodes = state.halonNodes || [];
            state.halonNodes[ctrl.props.Index] = node;
        }
        function mkVoprosBtn(ctrl, style) {
            const node = MK.el("div", { class: "ctrl no-click", style: style });
            node.style.background = "rgba(255, 255, 224, 0.92)";
            node.style.color = "#000";
            node.style.fontSize = "22px";
            node.style.lineHeight = (parseInt(style.height) - 4) + "px";
            node.style.textAlign = "center";
            node.style.display = "none";  // Only visible in Q&A modes.
            node.style.borderRadius = "8px";
            node.style.fontFamily = "David, serif";
            node.style.direction = "rtl";
            stageEl.appendChild(node);
            state.btnVoprosNode = node;
        }
        function mkModeBtn(ctrl, idleIcon, activeIcon, onclick, set) {
            const btn = MK.el("button", { class: "ctrl", style: MK.posStyle(ctrl, scale) });
            btn.dataset.idle = "menu/" + idleIcon + ".png";
            btn.dataset.active = "menu/" + activeIcon + ".png";
            btn.style.backgroundImage = bgImg(btn.dataset.idle);
            btn.addEventListener("click", onclick);
            stageEl.appendChild(btn);
            set(btn);
            return btn;
        }
        function mkShma(ctrl, style) {
            const btn = MK.el("button", { class: "ctrl", style: style });
            // Listen button — original has separate sprites for index 0/1
            // embedded in the .FRX. We use a unicode triangle as a stand-
            // in; can replace with extracted PNGs later.
            btn.style.background = "#ffd54a";
            btn.style.border = "2px solid #b07a00";
            btn.style.borderRadius = "50%";
            btn.style.color = "#000";
            btn.style.fontSize = "28px";
            btn.style.lineHeight = (parseInt(style.height) - 6) + "px";
            btn.textContent = ctrl.props.Index === 0 ? "▶" : "▶▶";
            btn.title = ctrl.props.Index === 0 ? "השמע הכל" : "השמע שורה הבאה";
            btn.style.display = "none";   // Hidden in tirgul=0.
            btn.addEventListener("click", function () { onShmaClick(ctrl.props.Index); });
            stageEl.appendChild(btn);
            state.btnShmaNodes[ctrl.props.Index] = btn;
        }

        function applyFrmVisibl(v) {
            // FrmVisibl in GAMES1.FRM:
            //   v=1 → Halon[0..2].Visible = True       (Q&A score coins)
            //   v=0 → Halon hidden AND (NomerMasl<0) → mode buttons visible
            const modeShow = v === 0;
            [state.btnSlogNode, state.btnSlovoNode, state.btnStrokaNode].forEach(function (n) {
                if (n) n.style.display = modeShow ? "" : "none";
            });
            (state.halonNodes || []).forEach(function (n) {
                if (n) n.style.display = (v === 1) ? "" : "none";
            });
            // btnVopros is shown explicitly for tirgul 4/5 in Form_Load
            // *after* FrmVisibl(1). In Phase 2 we surface it but leave the
            // question text empty (no scoring loop yet).
            if (state.btnVoprosNode) {
                state.btnVoprosNode.style.display = (state.tirgul === 4 || state.tirgul === 5) ? "" : "none";
            }
            // btnShma(0/1) only become visible after the user enters a
            // sub-mode by clicking btnStroka/Slog/Slovo. In Q&A modes the
            // original opens btnShma(1) right away (see Form_Load for
            // tirgul=5). We keep both hidden until setMode for now.
        }

        async function setMode(newTirgul) {
            // 1:1 with GAMES1.FRM btnSlog/Slovo/Stroka_Click:
            //   Mhika; swap mode-button pictures (idle/active)
            //   sndPlaySound("WAV\KNOC<n>.wav", 1)
            //   delay 1000
            //   If rishon: sndPlaySound("WAV\FAll1.wav", 1) + PicFea anim
            //   tirgul = newTirgul
            //   Make_Games tirgul   ← reloads SFN$=<n>_<tirgul>.spi + DeTrace
            //
            // For the web port we reload by navigating to the URL with
            // the matching variant: tirgul=1→_1, tirgul=2→_2, tirgul=3→_3.
            // Whole screen re-renders with the new .spi data.
            const idleAll = [state.btnSlogNode, state.btnSlovoNode, state.btnStrokaNode];
            idleAll.forEach(function (n) { if (n) n.style.backgroundImage = bgImg(n.dataset.idle); });
            const activeNode = newTirgul === 1 ? state.btnStrokaNode :
                               newTirgul === 2 ? state.btnSlovoNode :
                               newTirgul === 3 ? state.btnSlogNode : null;
            if (activeNode) activeNode.style.backgroundImage = bgImg(activeNode.dataset.active);
            const knocIdx = newTirgul === 1 ? 3 : newTirgul === 2 ? 2 : 1;
            MK.play("wav/knoc" + knocIdx + ".wav");
            await MK.sleep(1000);
            if (state.rishon && state.picFeaNode) {
                state.rishon = false;
                MK.play("wav/fall1.wav");
                await animateSprite(state.picFeaNode, "pic_fea", 6, 200);
            }
            // Navigate — variant matches tirgul (Make_Games behavior).
            const newVariant = newTirgul === 1 ? 1 : newTirgul === 2 ? 2 : 3;
            const nomerMasl = ctx.params.nomerMasl;
            const nmQ = nomerMasl != null ? "&nomerMasl=" + nomerMasl : "";
            location.hash = "#/play/" + song + "/" + newVariant + "?tirgul=" + newTirgul + nmQ;
        }

        // Q&A state (tirgul 4/5). Mirrors GAMES1.FRM module-level Dim's:
        //   N_V        current question index (1-based)
        //   otvet      count of correct answers in this round
        //   Taut       wrong attempts on current question
        //   Mis_Tsuva  1/2/3 — which wrong-feedback cue to play next
        //   Mahamaa    1..3 — which Tov1 (good answer) audio sequence
        //   Vprs[]     pool of valid question indices (q != "None")
        //   SahAkol    count of valid questions
        //   KolMonet   total coins this round
        state.qa = { N_V: 0, otvet: 0, Taut: 0, Mis_Tsuva: 1, Mahamaa: 1,
                     Vprs: [], SahAkol: 0, KolMonet: 0 };

        async function startQA() {
            // GAMES1.FRM Timer1_Timer for tirgul=4/5 plays the intro,
            // then sleeps 500ms, then enables Timer3 (cycles aa016/aa017
            // PicBur reactions), then plays the question audio.
            //
            // We mirror that with sequential awaits — the question
            // shouldn't start until the intro finishes.
            const isText = state.tirgul === 4;
            const list = isText ? stage.words : stage.zones;
            const valid = [];
            list.forEach(function (entry, i) {
                const q = isText ? null : (entry.q || "");
                if (isText) {
                    // .spi text Questions field not extracted into
                    // Slovo records by the Phase-2 parser — accept all.
                    valid.push(i + 1);
                } else {
                    if (q && q.replace(/^[?\s]+/, "").length > 0) valid.push(i + 1);
                }
            });
            state.qa.Vprs = valid.slice();
            state.qa.SahAkol = valid.length;
            state.qa.otvet = 0;
            state.qa.Taut = 0;
            state.qa.KolMonet = 0;
            // Block on the intro cue before showing the first question.
            await MK.playSync(isText ? "mik_siha/bb008.wav" : "mik_siha/bb007.wav");
            await MK.sleep(500);
            nextVopros();
        }
        function nextVopros() {
            if (state.qa.Vprs.length === 0) return finishQA();
            const choice = Math.floor(Math.random() * state.qa.Vprs.length);
            const idx = state.qa.Vprs[choice];
            state.qa.Vprs.splice(choice, 1);
            state.qa.N_V = idx;
            state.qa.Taut = 0;
            state.qa.Mis_Tsuva = 1;
            // Update btnVopros caption.
            const isText = state.tirgul === 4;
            const list = isText ? stage.words : stage.zones;
            const e = list[idx - 1];
            const q = isText
                ? (e.q || "")  // Slovo rows don't carry q in our parser
                : (e.q || "");
            if (state.btnVoprosNode) {
                state.btnVoprosNode.textContent = q || "? ";
                state.btnVoprosNode.style.display = "";
            }
            // Play the question's WavFileName_Questions(s)P audio.
            const qWav = isText ? (e.wavQ || null) : (e.wavQ || null);
            if (qWav) play(qWav);
        }
        function finishQA() {
            // After all questions exhausted OR 3 correct → SofSipur:
            //   OdPaam = (KolMonet < 5)
            //   sofer.Show 1
            if (state.qa.KolMonet < 5) sessionStorage.setItem("mikraot:odpaam", "1");
            // Save score to Tozaot for the current chain step.
            const chain = JSON.parse(sessionStorage.getItem("mikraot:chain") || "null");
            if (chain) {
                try {
                    const t = JSON.parse(localStorage.getItem("mikraot:tozaot") || "{}");
                    t[chain.song] = t[chain.song] || {};
                    t[chain.song][chain.masl] = t[chain.song][chain.masl] || {};
                    const code = chain.steps[chain.stepIdx];
                    t[chain.song][chain.masl][code] = state.qa.KolMonet;
                    localStorage.setItem("mikraot:tozaot", JSON.stringify(t));
                } catch (e) {}
                if (typeof MK.advanceMaslulChain === "function") {
                    setTimeout(MK.advanceMaslulChain, 600);
                    return;
                }
            }
            location.hash = "#/sofer/" + song + "/0";
        }
        function awardCoin(misp) {
            // Matbeot1: Taut=0→matbea4 (+3), 1→matbea3 (+2), 2→matbea2 (+1), >2→matbea0
            const t = state.qa.Taut;
            const img = t === 0 ? "menu/matbea4.png"
                      : t === 1 ? "menu/matbea3.png"
                      : t === 2 ? "menu/matbea2.png"
                                : "menu/matbea0.png";
            const value = t === 0 ? 3 : t === 1 ? 2 : t === 2 ? 1 : 0;
            const wav = t === 0 ? "mik_siha/coin.wav" : t <= 2 ? "mik_siha/coin1.wav" : null;
            if (state.halonNodes && state.halonNodes[misp]) {
                state.halonNodes[misp].style.backgroundImage = bgImg(img);
            }
            if (wav) MK.play(wav);
            state.qa.KolMonet += value;
        }
        async function onCorrect() {
            // 1:1 with GAMES1.FRM Slovo_Click (tirgul > 3, index = N_V):
            //   Matbeot1 otvet-1          ' coin (sync wav)
            //   Tov1 Form1, Mahamaa       ' PicFea anim cycle 0..5
            //   sndPlaySound(AWavFileName_Questions, 0)  ' answer wav SYNC
            //   btnVopros.Visible = False
            //   sndPlaySound("MIK_SIHA\NEWCHIM.wav", 1)  ' async
            //   delay 1500
            //   If (otvet < 3) And (otvet < SahAkol) → pick next vopros
            //   Else → SofSipur (sofer.Show + chain end)
            state.qa.otvet += 1;
            awardCoin(state.qa.otvet - 1);            // plays coin/coin1.wav (sync)
            animateSprite(state.picFeaNode, "pic_fea", 6, 100);
            const list = state.tirgul === 4 ? stage.words : stage.zones;
            const e = list[state.qa.N_V - 1];
            if (e && e.wavA) await playAwait(e.wavA);   // answer wav SYNC
            if (state.btnVoprosNode) state.btnVoprosNode.style.display = "none";
            MK.play("mik_siha/newchim.wav");           // async confirm
            await MK.sleep(1500);
            if (state.qa.otvet >= 3 || state.qa.Vprs.length === 0) {
                finishQA();
                return;
            }
            nextVopros();
        }
        async function onWrong() {
            // 1:1 with GAMES1.FRM Slovo_Click (tirgul > 3, index <> N_V):
            //   Taut += 1
            //   Select Case Mis_Tsuva
            //     Case 1: sndPlaySound("tautik1.wav", 0)  ' SYNC
            //             sndPlaySound(WavFileName_Questions, 0)  ' SYNC
            //             Mis_Tsuva = 2
            //     Case 2: sndPlaySound("tautik2.wav", 0)  ' SYNC
            //             sndPlaySound(WavFileName_Questions, 0)  ' SYNC
            //             Mis_Tsuva = 3
            //     Case 3: sndPlaySound("tautG1.wav", 0)   ' SYNC
            //             sndPlaySound(AWavFileName_Questions, 0)  ' SYNC
            //             Mis_Tsuva = 1
            //             PlayZad("Mik_Siha\newchim.wav")  ' SYNC blocks
            //             For i=1 To 3: Paint_Slovo N_V, 1; delay 500;
            //                            Paint_Slovo N_V, 0
            //
            //   If Taut > 2 → Kishal_3
            state.qa.Taut += 1;
            animateSprite(state.picBurNode, "pic_bur", 6, 100);
            const list = state.tirgul === 4 ? stage.words : stage.zones;
            const e = list[state.qa.N_V - 1];
            if (state.qa.Taut > 2) {
                // Kishal_3 + advance (reveal answer + count as missed).
                await MK.playSync("milon/RANIT/kish3.wav");
                if (e && e.wavN) await playAwait(e.wavN);
                state.qa.otvet += 1;
                if (state.halonNodes && state.halonNodes[state.qa.otvet - 1]) {
                    state.halonNodes[state.qa.otvet - 1].style.backgroundImage = bgImg("menu/matbea0.png");
                }
                if (state.qa.otvet >= 3 || state.qa.Vprs.length === 0) {
                    finishQA();
                    return;
                }
                nextVopros();
                return;
            }
            const mt = state.qa.Mis_Tsuva;
            const cue = mt === 1 ? "wav/tautik1.wav"
                      : mt === 2 ? "wav/tautik2.wav"
                                 : "wav/tautg1.wav";
            await MK.playSync(cue);
            // For Mis_Tsuva 1/2: replay the question. For 3: play the
            // answer + a confirm jingle + flash the correct word.
            if (mt === 3) {
                if (e && e.wavA) await playAwait(e.wavA);
                await MK.playSync("mik_siha/newchim.wav");
                state.qa.Mis_Tsuva = 1;
                // Three quick flashes of the correct Slovo.
                for (let k = 0; k < 3; k++) {
                    flashHighlight(state.slovoNodes[state.qa.N_V - 1]);
                    await MK.sleep(500);
                }
            } else {
                if (e && e.wavQ) await playAwait(e.wavQ);
                state.qa.Mis_Tsuva = mt + 1;
            }
        }

        function onSlovoClick(i) {
            // Slovo_Click 1:1 with GAMES1.FRM:
            //   tirgul=0 → Exit Sub
            //   tirgul<4 → play WavFileName(index); set Tizkor=tirgul
            //   tirgul>3 → if index = N_V → correct; else wrong (Taut++).
            if (state.tirgul === 0) return;
            if (state.tirgul < 4) {
                const w = stage.words[i];
                flashHighlight(state.slovoNodes[i]);
                play(w.wav);
                return;
            }
            // Q&A text mode (tirgul=4)
            if (state.tirgul !== 4) return;
            if ((i + 1) === state.qa.N_V) {
                flashHighlight(state.slovoNodes[i]);
                onCorrect();
            } else {
                onWrong();
            }
        }
        function onPicZoneClick(i) {
            // Pic_Zone_Click 1:1 with GAMES1.FRM:
            //   tirgul=1|3 → play WavFileNameP (read-aloud / syllable mode)
            //   tirgul=2   → show zone name + play SWavFilenameP
            //   tirgul=5   → Q&A picture mode (correctness check)
            const z = stage.zones[i];
            if (state.tirgul === 0) return;
            if (state.tirgul === 1 || state.tirgul === 3) { play(z.wav); return; }
            if (state.tirgul === 2) { play(z.sWav); return; }
            if (state.tirgul !== 5) return;
            if ((i + 1) === state.qa.N_V) {
                flashHighlight(state.zoneNodes[i]);
                onCorrect();
            } else {
                onWrong();
            }
        }
        function onShmaClick(idx) {
            // Index 1: read next line through ListenText. Index 0: cycle
            // through zones (Mhika + Shape2 highlight).
            if (idx === 1) {
                if (state.indexT > stage.words.length) state.indexT = 1;
                const i = state.indexT - 1;
                flashHighlight(state.slovoNodes[i]);
                playAwait(stage.words[i].wav);
                state.indexT += 1;
            } else {
                state.makomP = (state.makomP % stage.zones.length) + 1;
                const i = state.makomP - 1;
                flashHighlight(state.zoneNodes[i]);
                if (state.tirgul === 1 || state.tirgul === 3) {
                    play(stage.zones[i].wav);
                } else if (state.tirgul === 2) {
                    play(stage.zones[i].sWav);
                }
            }
        }
    };
})();
