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
        const stage   = MK.makeStage(root, sz.w, sz.h);
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

        // ---- handlers (1:1 from KIVUN.FRM) ---------------------------

        async function btnShir_Click(idx) {
            // KIVUN.FRM btnShir_Click(Index) 1:1:
            //   Paam_Rishon = False
            //   GN = Index+1; sf = "games\<GN>_2.spi"
            //   If no .spi file → Exit Sub
            //   Hide previous song's lblShm; show new song's lblShm
            //   GameNomer = Index+1; SFN$ = sf
            //   Bdikat_Masl       (show 3 maslul buttons + hofshi)
            //   sndPlaySound("...L1.wav", 0)   ' SND_SYNC blocks
            //   Sleep 1000
            //   If povtor → sndPlaySound("I2.wav", 1)  ' async
            const gn = idx + 1;
            const stages = window.MK_STAGES[String(gn)];
            if (!stages || !stages["2"]) {
                MK.log("btnShir skip: no _2.spi for song", gn);
                return;
            }
            sessionStorage.setItem("mikraot:gameNomer", String(gn));
            sessionStorage.setItem("mikraot:paam_rishon", "0");
            // Navigate first so the maslul-picker UI re-renders with the
            // chosen song's lblShm visible; then play the song's title
            // and the "now pick a maslul" prompt afterwards. (The original
            // does the picture/maslul UI updates BEFORE the blocking
            // L1 play — same effective ordering.)
            location.hash = "#/maslul/" + gn;
            await MK.playSync("wav/" + gn + "_1/" + gn + "l1.wav");
            await MK.sleep(1000);
            if (sessionStorage.getItem("mikraot:povtor") === "1") {
                MK.play("mik_siha/i2.wav");
                sessionStorage.removeItem("mikraot:povtor");
            }
        }
        function btnMsl1_Click(idx) {
            // Pick maslul `idx` (0..2). Play I3/I4/I5 maslul intro, then
            // if already completed → sofer, else start the Kivun walker.
            MK.play("mik_siha/i" + (idx + 3) + ".wav");
            if (gameNomer === 0) return;
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
        function btnHofshi_Click() {
            // Free-play: NomerMasl=-1, clear all Tozaot.Masl(*,12),
            // play Mik_Siha/n2.wav, then start.Show 1 (= START.FRM).
            MK.play("mik_siha/n2.wav").catch(function () {});
            const t = loadTozaot();
            if (t[gameNomer]) {
                [0,1,2].forEach(function (i) {
                    if (t[gameNomer][i]) t[gameNomer][i].done = 0;
                });
                saveTozaot(t);
            }
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
            // Dispatch per KIVUN.FRM Kivun(Ind) Select Case NomerMasl:
            //   0 → Form1 tirgul=1 Stroka  → games\<n>_1.spi (lines)
            //   1 → Form1 tirgul=2 Slovo   → games\<n>_2.spi (words)
            //   2 → Form1 tirgul=3 Slog    → games\<n>_3.spi (syllables)
            //   3 → Form1 tirgul=4 VoprTx  → games\<n>_2.spi (text Q&A on words)
            //   4 → Form1 tirgul=5 VoprTm  → games\<n>_1.spi (picture Q&A)
            //   5..11 → MILON sub-games
            //
            // The .spi variant per tirgul is set by GAMES1.FRM Make_Games:
            //   index <= 3 → K_S = "<n>_<index>"
            //   index = 4  → "<n>_2"
            //   index = 5  → "<n>_1"
            const variantForTirgul = function (t) {
                return t === 1 ? 1 : t === 2 ? 2 : t === 3 ? 3 : t === 4 ? 2 : 1;
            };
            const baseHash = "/" + gameNomer + "/" + maslIdx + "?nomerMasl=" + code;
            if (code >= 0 && code <= 4) {
                const tirgul = [1, 2, 3, 4, 5][code];
                const v = variantForTirgul(tirgul);
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
            const node = MK.el("button", { class: "ctrl", style: style });
            node.style.backgroundImage = bgImg("anim/pic_fea_0.png");
            let i = 0;
            node.addEventListener("click", function () {
                MK.play("mik_siha/x2.wav").catch(function () {});
                const tick = function () {
                    if (i >= 6) { i = 0; node.style.backgroundImage = bgImg("anim/pic_fea_0.png"); return; }
                    node.style.backgroundImage = bgImg("anim/pic_fea_" + i + ".png");
                    i += 1; setTimeout(tick, 100);
                };
                tick();
            });
            stage.appendChild(node);
        }
        function mkModiin(style) {
            const node = MK.el("div", { class: "ctrl no-click", style: style });
            // SipurMumlaz() returns 0 when ALL songs completed.
            // kupd1 = "done", kupd2 = "in progress" per Form_Activate.
            const allDone = checkAllDone();
            node.style.backgroundImage = bgImg(allDone ? "menu/kupd1.png" : "menu/kupd2.png");
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
                    MK.play("wav/" + sipm + "_1/" + sipm + "l1.wav");
                } else {
                    await MK.playSync("mik_siha/ii1.wav");
                }
            } else {
                if (refs.lblShm[gameNomer - 1]) {
                    refs.lblShm[gameNomer - 1].textContent = SHIR[gameNomer - 1];
                    refs.lblShm[gameNomer - 1].style.visibility = "visible";
                }
                const nm = +(sessionStorage.getItem("mikraot:nomerMasl") || -1);
                if (nm < 0) await MK.playSync("mik_siha/i8.wav");
            }
        }
    };
})();
