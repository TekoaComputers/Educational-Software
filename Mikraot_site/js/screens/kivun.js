// KIVUN.FRM (VB_Name = "maslul") — song + maslul picker. PROBA's
// btnKnisa opens this; selecting a song then a maslul kicks off the
// Kivun() walker that runs each NomerMasl step's game in sequence.
//
// Form layout (KIVUN.FRM design canvas: 953×689 from ScaleMode=Pixel):
//   Background: menu/mikr2.bmp  (640×480 image painted into the larger
//                                design canvas — original VB6 ran the
//                                form maximized to 640×480 too).
//   ├ PicFea       PictureBox  px(  0, 470)  91×111   bottom-left jester sprite
//   ├ modiin       PictureBox  px(670, 420) 118×191   coin score icon
//   │              kupd1.bmp = "all songs done", kupd2.bmp = "in progress"
//   ├ Timer1       (idle timer, unused at runtime — Interval=1 ms but Enabled=False)
//   ├ btnExit      px(  0,   0)  61×51       stop.bmp (top-left X)
//   ├ btnMsl1(0)   px(550, 420) 101×111      masl1.bmp idle / masl1b.bmp completed
//   ├ btnMsl1(1)   px(410, 420) 101×111      masl2.bmp / masl2b.bmp
//   ├ btnMsl1(2)   px(270, 420) 101×111      masl3.bmp / masl3b.bmp
//   ├ btnReturn    px(730,   0)  71×51       back.bmp (top-right back arrow)
//   ├ btnHofshi    px(130, 420) 111×191      hof1.bmp (free-play, bypass maslul)
//   ├ btnShir(0..9) Label  song-picker clickable areas in a 2×5 grid
//   │              Row 1 (idx 4..0): px(90,100), (220,100), (350,100),
//   │                                (480,100), (605,100), each ~100×90
//   │              Row 2 (idx 9..5): px(...260)...
//   ├ Label1(0..9) "1".."10" number captions overlaid on song buttons
//   ├ lblShm(0..9) Hebrew song names from Shir(idx) — shown on hover/select
//   └ lblAgdara(0..2)  "הגדרה" caption labels under each maslul btn
//
// Click flow (1:1 from KIVUN.FRM event handlers):
//
//   Form_Load:    BG=mikr2; btnExit/Return icons; PicFea=Anim cell 0;
//                 Inst_Misp populates Label1 colors (yellow=done, green=todo);
//                 if GameNomer != 0 → Bdikat_Masl (show maslul buttons)
//   Form_Activate: modiin pic from SipurMumlaz status; if all done +
//                  povtorMumlaz → play wav/done.wav; else play
//                  MIK_SIHA/I1.wav + first-uncompleted song's L1.wav
//
//   btnShir_Click(Index):
//     Skips if games/<n>_2.spi missing.
//     Hides any previously-shown lblShm.
//     Sets GameNomer=Index+1, SFN$=games/<n>_2.spi.
//     Calls Bdikat_Masl → show btnMsl1(0..2) + btnHofshi + lblAgdara
//     Plays wav/<n>_1/<n>L1.wav (song title intro), Sleep(1000)
//     If povtor: plays MIK_SIHA/I2.wav (prompt to pick a maslul)
//
//   btnMsl1_Click(Index):
//     Rishona=True; Misp_Masl%=Index
//     Hides lblShm(GameNomer-1) + all lblAgdara
//     Plays MIK_SIHA/I<Index+3>.wav (I3/I4/I5 — maslul intro)
//     If this maslul was already completed (Tozaot.Masl(Index,12)=1):
//        sofer.Show 1   (counter screen — Phase 5)
//        Either Unload maslul (Kino=True) OR refresh
//     Else:
//        Afsaka=False
//        Kivun(Index)  ← walks through the .MSL steps
//        If Afsaka=False: marks completed, sets ShmVideo=Video/<n>.avi,
//                         Unload maslul → returns to Proba which plays
//                         the per-song video.
//
//   btnHofshi_Click:
//     NomerMasl=-1; clears Tozaot.Masl(*,12); plays Mik_Siha/n2.wav
//     If GameNomer>0: start.Show 1  (= START.FRM with free-play song)
//
//   btnReturn_Click:
//     If GameNomer > 0: reset to "no song picked" — hide lblShm/btnMsl1/
//                       lblAgdara/btnHofshi, GameNomer=0, Paam_Rishon=True
//     Else: hourglass cursor; ShmVideo=Video/cred.avi; Unload maslul
//           (returns to PROBA which restarts the credit video)
//
//   btnExit_Click: Ezia (Mik_Siha/aastop.wav + exit confirmation)
//
//   btnShir_MouseMove(Index): hover preview — show lblShm(idx) caption
//
// State persistence: original uses Tozaot.Dat (binary random-access
// file via IO_Tozaot). Phase 4 stores progression in localStorage as
// a thin shim (key: mikraot:tozaot:<gameNomer> → {masl: {idx: {step: coins}}}).
(function () {
    const MK = window.MK;
    const MASLUL = window.MK_MASLUL;

    function bgImg(rel) { return "url('assets/" + rel + "')"; }

    // GLOBAL.BAS Shir(k) — returns the song title for k=0..9.
    const SHIR = [
        "שרה ראתה תחנה",   // k0
        "שרה לחשה ",         // k1
        "?למה צחקה דנה",   // k2 (begins with question mark in source)
        "סבא קנה מתנה",     // k3
        "גל נפל",            // k4
        "?מה בגינה",         // k5
        "בית ואוירון",       // k6
        "סודר חדש לגל",    // k7
        "החיט העליז",        // k8
        "עגלה עם סוסים",   // k9
    ];

    // GLOBAL.BAS Tozaot persistence shim. Stores per-song per-maslul step
    // scores + a completion flag at index 12 (matching the original
    // Tozaot.Masl(maslulIdx, 12) = 1 ⇒ completed).
    const TOZAOT_KEY = "mikraot:tozaot";
    function loadTozaot() {
        try { return JSON.parse(localStorage.getItem(TOZAOT_KEY) || "{}"); }
        catch (e) { return {}; }
    }
    function saveTozaot(t) {
        try { localStorage.setItem(TOZAOT_KEY, JSON.stringify(t)); } catch (e) {}
    }
    function maslulCompleted(gameNomer, maslIdx) {
        const t = loadTozaot();
        return (((t[gameNomer] || {})[maslIdx] || {}).done) === 1;
    }

    MK.renderKivun = function (root, ctx) {
        const layout  = window.MK_LAYOUT.kivun;
        const sz      = MK.stageSizeFor(layout);
        const scale   = MK.scaleFor(layout);
        // makeStage bumps the global render token — capture it so the
        // intro-audio chain can bail if a later screen renders. See
        // MK.stale() in renderer.js.
        const stage   = MK.makeStage(root, sz.w, sz.h);
        const myToken = MK.currentToken();
        // KIVUN.FRM design canvas is 953×689 (ScaleMode=Pixel, ScaleWidth=
        // 953). The BG mikr2.bmp shipped as 640×480 — VB6 stretched it to
        // the form's coord system at runtime. We stretch via CSS so that
        // every control's design-pixel hotspot lands on the right BG
        // content. Controls use the parse_frm `px` field directly (= twips
        // ÷ form's twips/px ratio, which is 12 here).
        stage.style.backgroundImage = bgImg("menu/mikr2.png");
        stage.style.backgroundSize = "100% 100%";

        // GameNomer carried through the URL ⇒ "song picked" state.
        // Path: #/maslul             → no song picked, only btnShir visible
        //       #/maslul/<n>         → song n picked, show maslul buttons
        const gameNomer = ctx.params.gameNomer ? +ctx.params.gameNomer : 0;
        const refs = { btnMsl1: [], btnShir: [], lblShm: [], lblAgdara: [], Label1: [] };

        MK.iterateInZOrder(layout.children, function (ctrl) {
            const style = MK.posStyle(ctrl, scale);
            const idx = ctrl.props.Index;
            switch (ctrl.name) {
                case "PicFea":    return mkPicFea(style);
                case "modiin":    return mkModiin(style);
                case "Timer1":    return;
                case "btnExit":   return mkBtn(style, "menu/stop.png", btnExit_Click, "יציאה");
                case "btnReturn": return mkBtn(style, "menu/back.png", btnReturn_Click, "חזרה");
                case "btnMsl1":   return mkMaslulBtn(ctrl, style, idx);
                case "btnHofshi": return mkHofshi(style);
                case "btnShir":   return mkShirBtn(ctrl, style, idx);
                case "Label1":    return mkNumLabel(ctrl, style, idx);
                case "lblShm":    return mkShmLabel(ctrl, style, idx);
                case "lblAgdara": return mkAgdaraLabel(ctrl, style, idx);
            }
        });

        // Form_Load + Form_Activate effects.
        applyInstMisp();          // populate Label1 ForeColor based on Tozaot done flags
        if (gameNomer > 0) {
            showMaslulUI(gameNomer);
        } else {
            hideMaslulUI();
        }
        setTimeout(activateIntroAudio, 100);

        // KIVUN.FRM has KeyPreview=-1 — form receives keypresses before
        // any focused control. Two shortcuts wired in source:
        //
        //   Form_KeyDown / btnShir_KeyDown — Shift = 6 (= Ctrl+Alt):
        //     Response = 3; Misgeret() confirm; if 6 (Yes) → ResetKlali
        //     (zero out Tozaot for ALL songs); reload form.
        //
        //   btnShir_KeyPress — keyascii = 48 ("0") + GameNomer > 0:
        //     ShmVideo = "Video\<GameNomer>.avi"; Unload maslul.
        //     Plays the per-song celebration video then returns to PROBA.
        //
        // We attach as document-level listeners and clean up on the
        // next hashchange (= screen unmount).
        const kivunKeyHandler = function (e) {
            // Shift+Ctrl+Alt held (VB Shift mask 6 = Ctrl 2 | Alt 4)
            if (e.ctrlKey && e.altKey) {
                e.preventDefault();
                if (confirm("?למחוק את התוצאות (כל השירים)")) {
                    try { localStorage.removeItem("mikraot:tozaot"); } catch (err) {}
                    location.hash = "#/maslul";
                    // Hard reload to redraw the song grid colors.
                    setTimeout(function () { location.reload(); }, 50);
                }
                return;
            }
            if (e.key === "0" && gameNomer > 0) {
                e.preventDefault();
                // ShmVideo = per-song .avi — we don't have these
                // transcoded (only CRED.AVI). Mirror "Unload maslul" by
                // hopping back to PROBA so the user sees the entry video.
                MK.log("kivun key '0' — exit to PROBA");
                location.hash = "#/";
            }
        };
        document.addEventListener("keydown", kivunKeyHandler);
        // Clean up on route change so we don't leak handlers across screens.
        const cleanup = function () {
            document.removeEventListener("keydown", kivunKeyHandler);
            window.removeEventListener("hashchange", cleanup);
        };
        window.addEventListener("hashchange", cleanup);

        // ---- handlers (1:1 from KIVUN.FRM) ---------------------------

        function btnShir_Click(idx) {
            // KIVUN.FRM btnShir_Click(Index) 1:1:
            //   Paam_Rishon = False
            //   GN = Index+1; sf = "games\<GN>_2.spi"
            //   If no .spi file → Exit Sub
            //   GameNomer = Index+1; SFN$ = sf; Bdikat_Masl
            //   sndPlaySound("<GN>L1.wav", 0)   ' SND_SYNC blocks ~3-5 sec
            //   Sleep 1000
            //   If povtor → sndPlaySound("I2.wav", 1)
            //
            // We can't block in a web click handler the way VB6 does, so
            // we set a flag and let the post-navigation re-render of the
            // "song-picked" view drive the audio sequence (otherwise the
            // new render's activateIntroAudio would interrupt our L1).
            const gn = idx + 1;
            const stages = window.MK_STAGES[String(gn)];
            if (!stages || !stages["2"]) {
                MK.log("btnShir skip: no _2.spi for song", gn);
                return;
            }
            sessionStorage.setItem("mikraot:gameNomer", String(gn));
            sessionStorage.setItem("mikraot:paam_rishon", "0");
            sessionStorage.setItem("mikraot:justPickedSong", String(gn));
            // Invalidate the current activateIntroAudio chain (mid-sleep
            // it would otherwise fire its tail I2 from a screen the
            // user has just left). The chain's `stale()` check after
            // its next await will return true and bail.
            MK.bumpToken();
            location.hash = "#/maslul/" + gn;
        }
        async function btnMsl1_Click(idx) {
            // Pick maslul `idx` (0..2). 1:1 with KIVUN.btnMsl1_Click:
            //   PlayZad(MIK_SIHA\I<idx+3>.wav)   ' SYNC blocks
            //   If completed (Tozaot.Masl(idx,12)=1) → sofer.Show
            //   Else → Kivun(idx) walker
            // PlayZad is SYNC so the navigation that follows starts
            // only after the I-cue finishes. Mirror with await.
            if (gameNomer === 0) return;
            // Same reason as btnShir_Click — cancel any in-flight
            // activateIntroAudio chain so its sleep-tail doesn't
            // interrupt our I-cue (the I2 vs I3 collision).
            MK.bumpToken();
            await MK.playSync("mik_siha/i" + (idx + 3) + ".wav");
            if (maslulCompleted(gameNomer, idx)) {
                location.hash = "#/sofer/" + gameNomer + "/" + idx;
                return;
            }
            // Start the maslul walker. Prefer AGDARA-overridden steps
            // (saved by user via lblAgdara_DblClick → #/agdara/<masl>)
            // when present; fall back to the canonical .MSL chain.
            let steps = (MASLUL[String(gameNomer)] || [])[idx];
            try {
                const ag = JSON.parse(localStorage.getItem("mikraot:agdara") || "{}");
                const override = ag[idx + 1];
                if (override && override.length === 12) {
                    const custom = [];
                    for (let i = 0; i < 12; i++) if (override[i]) custom.push(i);
                    if (custom.length > 0) steps = custom;
                }
            } catch (e) {}
            if (!steps || steps.length === 0) return;
            launchStep(steps, 0, idx);
        }
        async function btnHofshi_Click() {
            // 1:1 with KIVUN.btnHofshi_Click:
            //   NomerMasl=-1; clear Tozaot.Masl(*,12) for current song
            //   PlayZad("Mik_Siha\n2.wav")   ' SYNC blocks
            //   If GameNomer>0: start.Show 1
            const t = loadTozaot();
            if (t[gameNomer]) {
                [0,1,2].forEach(function (i) {
                    if (t[gameNomer][i]) t[gameNomer][i].done = 0;
                });
                saveTozaot(t);
            }
            MK.bumpToken();
            await MK.playSync("mik_siha/n2.wav");
            if (gameNomer > 0) location.hash = "#/start";
        }
        function btnReturn_Click() {
            if (gameNomer > 0) {
                // Reset to "no song picked" state.
                location.hash = "#/maslul";
            } else {
                // Back to PROBA — original sets hourglass + Unload.
                document.body.style.cursor = "wait";
                setTimeout(function () {
                    document.body.style.cursor = "";
                    location.hash = "#/";
                }, 100);
            }
        }
        function btnExit_Click() {
            MK.play("mik_siha/aastop.wav").catch(function () {});
            window.location.href = "../index.html";
        }

        function launchStep(steps, stepIdx, maslIdx) {
            // Store chain state so each step's game can advance the
            // walker when it completes. Mirrors KIVUN.FRM Kivun() loop:
            //   While NomerMasl >= 0 ... step = next from StrMsl chain.
            sessionStorage.setItem("mikraot:chain", JSON.stringify({
                song: gameNomer, masl: maslIdx, steps: steps, stepIdx: stepIdx,
            }));
            const code = steps[stepIdx];
            const variant = "2";   // SFN$=games/<n>_2.spi per Kivun()
            // Dispatch per KIVUN.FRM Kivun(Ind) Select Case NomerMasl —
            // KIVUN sets tirgul to one value before Form1.Show but Form_Load's
            // Timer1_Timer immediately fires btnSlog/Slovo/Stroka_Click based
            // on NomerMasl, and those handlers OVERWRITE tirgul to their own
            // value (btnSlog→3, btnSlovo→2, btnStroka→1). Effective mapping
            // (after Timer1 settles):
            //   0 → btnSlog_Click   → tirgul=3 Slog   → _3.spi (syllables)
            //   1 → btnSlovo_Click  → tirgul=2 Slovo  → _2.spi (words)
            //   2 → btnStroka_Click → tirgul=1 Stroka → _1.spi (lines)
            //   3 → Form_Load Q&A text  → tirgul=4 → _2.spi
            //   4 → Form_Load Q&A pic   → tirgul=5 → _1.spi
            //   5..11 → MILON sub-games
            const tirgulByCode  = [3, 2, 1, 4, 5];
            const variantByCode = [3, 2, 1, 2, 1];
            const baseHash = "/" + gameNomer + "/" + maslIdx + "?nomerMasl=" + code;
            if (code >= 0 && code <= 4) {
                const tirgul = tirgulByCode[code];
                const v = variantByCode[code];
                location.hash = "#/play/" + gameNomer + "/" + v + "?tirgul=" + tirgul + "&nomerMasl=" + code;
            } else if (code === 5) location.hash = "#/game1" + baseHash + "&mishak=4";
            else if (code === 6) location.hash = "#/game1" + baseHash + "&mishak=1";
            else if (code === 9) location.hash = "#/game1" + baseHash + "&mishak=2";
            else if (code === 7) location.hash = "#/game5" + baseHash;
            else if (code === 8) location.hash = "#/game2" + baseHash;
            else if (code === 10) location.hash = "#/slog" + baseHash;
            else if (code === 11) location.hash = "#/gam3" + baseHash;
        }

        // ---- mk helpers ---------------------------------------------

        function mkBtn(style, img, onclick, title) {
            const node = MK.el("button", { class: "ctrl", style: style, title: title });
            node.style.backgroundImage = bgImg(img);
            node.addEventListener("click", onclick);
            stage.appendChild(node);
            return node;
        }
        function mkPicFea(style) {
            // KIVUN.FRM PicFea_Click 1:1:
            //   If GameNomer > 0:
            //     sndPlaySound("I8.wav", 1)  +  12-cell anim  +  6-cell anim
            //   Else if leserugin = 0:
            //     sndPlaySound("I1.wav", 1)  +  12-cell × 2
            //     leserugin = 1
            //     sndPlaySound("<sipm>_1\<sipm>L1.wav", 1)
            //     hide all lblShm except sipm-1's
            //   Else (leserugin = 1):
            //     leserugin = 0
            //     sndPlaySound("I7.wav", 1)
            //   Tail: 6-cell + 12-cell anim
            const node = MK.el("button", { class: "ctrl", style: style });
            node.style.backgroundImage = bgImg("anim/pic_fea_0.png");
            const leserugin = { value: 0 };
            const animCycle = function (cells) {
                let j = 0;
                return new Promise(function (resolve) {
                    const tick = function () {
                        if (j >= cells) { node.style.backgroundImage = bgImg("anim/pic_fea_0.png"); resolve(); return; }
                        node.style.backgroundImage = bgImg("anim/pic_fea_" + j + ".png");
                        j += 1; setTimeout(tick, 200);
                    };
                    tick();
                });
            };
            node.addEventListener("click", async function () {
                if (gameNomer > 0) {
                    MK.play("mik_siha/i8.wav");
                    await animCycle(12);
                    await animCycle(6);
                } else if (leserugin.value === 0) {
                    MK.play("mik_siha/i1.wav");
                    await animCycle(12);
                    await animCycle(12);
                    leserugin.value = 1;
                    const sipm = sipurMumlaz();
                    if (sipm > 0) {
                        MK.play("wav/" + sipm + "_1/" + sipm + "l1.wav");
                        refs.lblShm.forEach(function (l) { if (l) l.style.visibility = "hidden"; });
                        if (refs.lblShm[sipm - 1]) {
                            refs.lblShm[sipm - 1].textContent = SHIR[sipm - 1];
                            refs.lblShm[sipm - 1].style.visibility = "visible";
                        }
                    }
                } else {
                    leserugin.value = 0;
                    MK.play("mik_siha/i7.wav");
                }
                await animCycle(6);
                await animCycle(12);
            });
            stage.appendChild(node);
        }
        function mkModiin(style) {
            // KIVUN.FRM modiin_Click 1:1:
            //   If ArrAzaga(0) = 1 (song 1 has at least one completed
            //     maslul): Azaga=True; TekFilm=1; ShmVideo="Video\1.avi";
            //     Unload maslul (= jump to celebration-video sequence).
            //   Else: PlayZad("MIK_SIHA\I9.wav") ("you haven't finished
            //     any song yet" prompt).
            const node = MK.el("button", { class: "ctrl", style: style, title: "מודיעין" });
            const allDone = checkAllDone();
            node.style.backgroundImage = bgImg(allDone ? "menu/kupd1.png" : "menu/kupd2.png");
            node.style.background = "transparent " + (allDone ? "url('assets/menu/kupd1.png')" : "url('assets/menu/kupd2.png')") + " no-repeat";
            node.addEventListener("click", function () {
                const t = loadTozaot();
                const song1 = t["1"] || {};
                const song1Done = [0,1,2].some(function (i) { return ((song1[i] || {}).done) === 1; });
                if (song1Done) {
                    // Azaga cycle — the per-song .avi celebration videos
                    // aren't transcoded. Hop to PROBA so the user at
                    // least sees the entry video (cred.avi).
                    MK.log("modiin: Azaga cycle starts (song 1 completed)");
                    location.hash = "#/";
                } else {
                    MK.play("mik_siha/i9.wav");
                }
            });
            stage.appendChild(node);
        }
        function mkMaslulBtn(ctrl, style, idx) {
            const node = MK.el("button", { class: "ctrl", style: style });
            node.style.display = "none";   // hidden until Bdikat_Masl
            node.addEventListener("click", function () { btnMsl1_Click(idx); });
            stage.appendChild(node);
            refs.btnMsl1[idx] = node;
        }
        function mkHofshi(style) {
            const node = MK.el("button", { class: "ctrl", style: style, title: "מסלול חופשי" });
            node.style.backgroundImage = bgImg("menu/hof1.png");
            node.style.display = "none";   // hidden until song picked
            node.addEventListener("click", btnHofshi_Click);
            stage.appendChild(node);
            refs.btnHofshi = node;
        }
        function mkShirBtn(ctrl, style, idx) {
            // Transparent clickable area on top of the BG song-block art.
            const node = MK.el("button", {
                class: "ctrl",
                style: Object.assign({}, style, {
                    background: "transparent",
                    border: "0",
                }),
                title: SHIR[idx] || "",
            });
            node.addEventListener("click", function () { btnShir_Click(idx); });
            node.addEventListener("mouseenter", function () {
                if (gameNomer !== 0) return;
                refs.lblShm.forEach(function (l, i) { if (l && i !== idx) l.style.visibility = "hidden"; });
                if (refs.lblShm[idx]) {
                    refs.lblShm[idx].textContent = SHIR[idx];
                    refs.lblShm[idx].style.visibility = "visible";
                }
            });
            stage.appendChild(node);
            refs.btnShir[idx] = node;
        }
        function mkNumLabel(ctrl, style, idx) {
            const node = MK.el("div", { class: "lbl", style: style });
            node.textContent = ctrl.props.Caption || String(idx + 1);
            // Inst_Misp ForeColor: yellow (0xFFFF / RGB(255,255,0))
            // when this song is completed (Tozaot.Masl(i,12)=1), else
            // green (0x80FF80 / RGB(128,255,128)). Set per applyInstMisp.
            node.style.fontSize = (28 * scale.x) + "px";
            node.style.fontWeight = "bold";
            node.style.color = "rgb(128, 255, 128)";
            node.style.fontFamily = "David, serif";
            node.style.textAlign = "center";
            node.style.lineHeight = (parseFloat(style.height) || 30) + "px";
            node.style.textShadow = "0 0 4px rgba(0,0,0,0.7)";
            stage.appendChild(node);
            refs.Label1[idx] = node;
        }
        function mkShmLabel(ctrl, style, idx) {
            const node = MK.el("div", { class: "lbl", style: style });
            node.style.fontSize = (16 * scale.x) + "px";
            node.style.color = "#ffff00";
            node.style.fontFamily = "David, serif";
            node.style.textAlign = "center";
            node.style.lineHeight = (parseFloat(style.height) || 21) + "px";
            node.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
            node.style.visibility = "hidden";
            stage.appendChild(node);
            refs.lblShm[idx] = node;
        }
        function mkAgdaraLabel(ctrl, style, idx) {
            const node = MK.el("div", { class: "lbl", style: style });
            // KIVUN.FRM lblAgdara_DblClick(Index): NomerMasl = Index + 1;
            // Agdara.Show 1 → opens settings for that maslul.
            node.textContent = "הגדרה";
            node.style.fontSize = (14 * scale.x) + "px";
            node.style.color = "#ffffff";
            node.style.fontFamily = "David, serif";
            node.style.textAlign = "center";
            node.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
            node.style.cursor = "pointer";
            node.style.display = "none";
            node.title = "לחיצה כפולה לעריכת מסלול";
            node.style.pointerEvents = "auto";
            node.addEventListener("dblclick", function () {
                location.hash = "#/agdara/" + (idx + 1);
            });
            stage.appendChild(node);
            refs.lblAgdara[idx] = node;
        }

        // ---- state helpers ------------------------------------------

        function applyInstMisp() {
            // KIVUN.FRM Inst_Misp: for each song k=0..9, examine
            // Tozaot.Masl(0..2, 12). If any maslul completed:
            //   Label1(k).ForeColor = &HFFFF&  (yellow)
            //   ArrAzaga(k) = 1
            // Else: ForeColor = &H80FF80 (green), ArrAzaga(k) = 0
            const t = loadTozaot();
            for (let k = 0; k < 10; k++) {
                const song = t[k + 1] || {};
                const done = [0, 1, 2].some(function (i) { return ((song[i] || {}).done) === 1; });
                if (refs.Label1[k]) {
                    refs.Label1[k].style.color = done ? "rgb(255, 255, 0)" : "rgb(128, 255, 128)";
                }
            }
        }
        function checkAllDone() {
            // SipurMumlaz() returns 0 when ArrAzaga[0..9] all = 1.
            const t = loadTozaot();
            for (let k = 0; k < 10; k++) {
                const song = t[k + 1] || {};
                const done = [0, 1, 2].some(function (i) { return ((song[i] || {}).done) === 1; });
                if (!done) return false;
            }
            return true;
        }
        function showMaslulUI(gn) {
            // Bdikat_Masl: show 3 maslul buttons (each = masl<i+1>b.bmp
            // if completed, masl<i+1>.bmp otherwise), hide lblAgdara on
            // completed slots, show btnHofshi.
            const t = loadTozaot();
            for (let i = 0; i < 3; i++) {
                const done = ((t[gn] || {})[i] || {}).done === 1;
                const img = "menu/masl" + (i + 1) + (done ? "b" : "") + ".png";
                if (refs.btnMsl1[i]) {
                    refs.btnMsl1[i].style.backgroundImage = bgImg(img);
                    refs.btnMsl1[i].style.display = "";
                }
                if (refs.lblAgdara[i]) refs.lblAgdara[i].style.display = done ? "none" : "";
            }
            if (refs.btnHofshi) refs.btnHofshi.style.display = "";
            // Show the selected song's name caption persistently.
            if (refs.lblShm[gn - 1]) {
                refs.lblShm[gn - 1].textContent = SHIR[gn - 1];
                refs.lblShm[gn - 1].style.visibility = "visible";
            }
        }
        function hideMaslulUI() {
            refs.btnMsl1.forEach(function (b) { if (b) b.style.display = "none"; });
            refs.lblAgdara.forEach(function (l) { if (l) l.style.display = "none"; });
            refs.lblShm.forEach(function (l) { if (l) l.style.visibility = "hidden"; });
            if (refs.btnHofshi) refs.btnHofshi.style.display = "none";
        }
        function sipurMumlaz() {
            // KIVUN.FRM SipurMumlaz(): walk songs 0..9, return the next
            // uncompleted song's 1-based index. 0 = all songs done.
            const t = loadTozaot();
            for (let k = 0; k < 10; k++) {
                const songData = t[k + 1] || {};
                const done = [0,1,2].some(function (i) { return ((songData[i] || {}).done) === 1; });
                if (!done) return k + 1;
            }
            return 0;
        }
        // Abort if a later render has superseded this one.
        function stale() { return MK.stale(myToken); }
        async function activateIntroAudio() {
            // Form_Activate 1:1, mirroring the original sync/async flag
            // pattern:
            //
            //   SipurMumlaz=0 && povtorMumlaz → wav/done.wav, return
            //   povtor = True
            //
            //   If GameNomer = 0:
            //     sipm = SipurMumlaz()  (next uncompleted song idx)
            //     If sipm > 0:
            //       PlayZad("MIK_SIHA\I1.wav")              ' SYNC blocks
            //       sndPlaySound("wav\<sipm>_1\<sipm>L1.wav", 1)  ' async
            //       show lblShm(sipm-1)
            //     Else:
            //       PlayZad("MIK_SIHA\II1.wav")             ' SYNC blocks
            //
            //   Else (GameNomer > 0):
            //     show lblShm(GameNomer-1)
            //     If NomerMasl < 0: PlayZad("MIK_SIHA\I8.wav")
            //
            // The SYNC blocks are why the next sound only starts after
            // the previous finishes — `await MK.playSync(…)` mirrors that.
            const sipm = sipurMumlaz();
            const povtorMumlaz = sessionStorage.getItem("mikraot:povtorMumlaz") === "1";
            if (sipm === 0 && povtorMumlaz) {
                await MK.playSync("wav/done.wav");
                if (stale()) return;
                sessionStorage.removeItem("mikraot:povtorMumlaz");
                return;
            }
            sessionStorage.setItem("mikraot:povtor", "1");
            if (gameNomer === 0) {
                if (sipm > 0) {
                    if (refs.lblShm[sipm - 1]) {
                        refs.lblShm[sipm - 1].textContent = SHIR[sipm - 1];
                        refs.lblShm[sipm - 1].style.visibility = "visible";
                    }
                    await MK.playSync("mik_siha/i1.wav");
                    if (stale()) return;
                    MK.play("wav/" + sipm + "_1/" + sipm + "l1.wav");
                } else {
                    await MK.playSync("mik_siha/ii1.wav");
                }
            } else {
                if (refs.lblShm[gameNomer - 1]) {
                    refs.lblShm[gameNomer - 1].textContent = SHIR[gameNomer - 1];
                    refs.lblShm[gameNomer - 1].style.visibility = "visible";
                }
                const just = sessionStorage.getItem("mikraot:justPickedSong");
                if (just && +just === gameNomer) {
                    sessionStorage.removeItem("mikraot:justPickedSong");
                    await MK.playSync("wav/" + gameNomer + "_1/" + gameNomer + "l1.wav");
                    if (stale()) return;
                    await MK.sleep(1000);
                    if (stale()) return;
                    if (sessionStorage.getItem("mikraot:povtor") === "1") {
                        MK.play("mik_siha/i2.wav");
                        sessionStorage.removeItem("mikraot:povtor");
                    }
                    return;
                }
                const nm = +(sessionStorage.getItem("mikraot:nomerMasl") || -1);
                if (nm < 0) await MK.playSync("mik_siha/i8.wav");
            }
        }
    };
})();
