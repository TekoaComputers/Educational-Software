// START.FRM (VB_Name="start") — main menu shown after maslul picks
// a song. 1:1 with Mikraot/START.FRM event handlers.
//
// Form_Load:
//   start.Picture       = menu/dugma5.bmp                         (book BG)
//   btnExit/Return.Picture = stop.bmp / back.bmp
//   btnLikro/VoprTx/VoprTm/Mln.Picture = ik1/ik2/ik3/ik4.bmp
//   If GameNomer = 0 Then GameNomer = 1
//   Panel3D1.Caption    = Shir(GameNomer - 1)                     (song title)
//   Get_Spisok(1, SFN$, File_S)
//   Picture1.Picture    = LoadPicture(Cur_Dir$ & BliZeva(LPicName)) (blank left page)
//   Picture2.Picture    = LoadPicture(Cur_Dir$ & BliZeva(RPicName)) (blank right page)
//   PicFea.Picture      = Anim.PicClip1.GraphicCell(0)
//   PicBur.Picture      = Anim.PicClip2.GraphicCell(0)
//   If NomerMasl < 0 Then Timer1.Enabled = True   (= play "x2.wav" once)
//
// Click flow (1:1):
//   btnLikro_Click  : NomerMasl=-1; tirgul=0; Form1.Show 1  → reading game
//   btnVoprTx_Click : tirgul=4; SpisokMasl(0)=3; Form1.Show 1 → text Q&A
//   btnVoprTm_Click : tirgul=5; SpisokMasl(0)=4; Form1.Show 1 → image Q&A
//   btnMln_Click    : btnReturn/Exit hidden; tirgul=6; Milon.Show 1; restore
//   btnReturn_Click : Unload start    → returns to PROBA's caller
//   btnExit_Click   : Ezia            → aastop.wav + exit
//
// PicFea_Click: feja-toggle. feja=1 → play x2.wav, do 12-cell cycle.
//              feja=0 → play kfp2.wav, do 6-cell cycle + 12-cell cycle.
// PicBur_Click: Pin-toggle. Pin=1 → kp1.wav. Pin=0 → kpq.wav. 6-cell cycle.
// Timer1_Timer (one-shot on Form_Load if NomerMasl<0):
//              play "Mik_Siha\x2.wav" then disable.
(function () {
    const MK = window.MK;

    // Shir() — song title array (GLOBAL.BAS Constants k0..k9).
    const SHIR = ["שרה ראתה תחנה","שרה לחשה ","?למה צחקה דנה","סבא קנה מתנה","גל נפל",
                  "?מה בגינה","בית ואוירון","סודר חדש לגל","החיט העליז","עגלה עם סוסים"];

    function bgImg(rel) { return "url('assets/" + rel + "')"; }
    function bmpToPng(rel) {
        if (!rel) return null;
        return rel.replace(/\\/g, "/").toLowerCase().replace(/\.bmp$/, ".png");
    }
    function bliZeva(name) {
        // GLOBAL.BAS BliZeva: strip ".bmp" then append "p.BMP". Used for
        // the "blank" page variant (e.g. AVAZA.BMP → AVAZAp.BMP).
        if (!name) return null;
        const m = name.match(/^(.*)\.[Bb][Mm][Pp]$/);
        return m ? m[1] + "p.BMP" : name;
    }
    function animatePic(node, label, cells, intervalMs) {
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

    MK.renderStart = function (root, ctx) {
        const layout = window.MK_LAYOUT.start;
        const sz     = MK.stageSizeFor(layout);
        const scale  = MK.scaleFor(layout);
        const stage  = MK.makeStage(root, sz.w, sz.h);
        stage.style.backgroundImage = bgImg("menu/dugma5.png");
        stage.style.backgroundSize = "100% 100%";

        // GameNomer carried through URL query (?game=N) or sessionStorage
        // (set by maslul.btnShir_Click). Default to 1.
        let gameNomer = +(ctx.params.game || sessionStorage.getItem("mikraot:gameNomer") || 1);
        if (!gameNomer) gameNomer = 1;
        const nomerMasl = +(ctx.params.nomerMasl != null ? ctx.params.nomerMasl : (sessionStorage.getItem("mikraot:nomerMasl") || -1));
        MK.log("start", "gameNomer=" + gameNomer, "nomerMasl=" + nomerMasl);

        // Stage 1 of song N — load left/right BMP names from MK_STAGES.
        // We use variant "2" (the Likro variant, per the .frm's commented
        // SFN line: "games\<n>_2.spi"). BliZeva strips the .bmp and appends
        // p.BMP to get the blank-page variant.
        const stageData = ((window.MK_STAGES[gameNomer] || {})["2"]) || null;
        const blankLeft  = stageData ? bmpToPng(bliZeva(stageData.left))  : null;
        const blankRight = stageData ? bmpToPng(bliZeva(stageData.right)) : null;

        const refs = {};

        // Map control-name → image file + click action.
        const wiring = {
            // btnExit_Click → Ezia: plays aastop.wav + exit confirm.
            btnExit:   { img: "menu/stop.png",  onclick: function () {
                MK.play("mik_siha/aastop.wav");
                window.location.href = "../index.html";
            }, title: "יציאה" },
            // btnReturn_Click → Unload start. Caller chain: PROBA→maslul→
            // start; back goes to maslul (the song picker).
            btnReturn: { img: "menu/back.png",  onclick: function () { location.hash = "#/maslul/" + gameNomer; }, title: "חזרה" },
            // btnLikro_Click: NomerMasl=-1, tirgul=0, Form1.Show.
            btnLikro:  { img: "menu/ik1.png",   onclick: function () {
                sessionStorage.setItem("mikraot:nomerMasl", "-1");
                ctx.go("#/play/" + gameNomer + "/2?tirgul=0");
            }, title: "לקרוא"  },
            // btnVoprTx_Click: tirgul=4. Make_Games(4) → _2.spi (words).
            btnVoprTx: { img: "menu/ik2.png",   onclick: function () {
                ctx.go("#/play/" + gameNomer + "/2?tirgul=4");
            }, title: "שאלות על הטקסט" },
            // btnVoprTm_Click: tirgul=5. Make_Games(5) → _1.spi (lines).
            btnVoprTm: { img: "menu/ik3.png",   onclick: function () {
                ctx.go("#/play/" + gameNomer + "/1?tirgul=5");
            }, title: "שאלות על התמונה" },
            // btnMln_Click: hide return/exit, tirgul=6, Milon.Show, restore.
            // The hide/restore is a modal flicker — we omit since milon
            // is its own route here.
            btnMln:    { img: "menu/ik4.png",   onclick: function () { ctx.go("#/milon"); }, title: "מילון" },
        };

        // Walk in Z-order (.frm first = on top → reverse for DOM).
        MK.iterateInZOrder(layout.children, function (ctrl) {
            const style = MK.posStyle(ctrl, scale);
            const wired = wiring[ctrl.name];
            if (wired) {
                const btn = MK.el("button", { class: "ctrl", style: style, title: wired.title });
                btn.style.backgroundImage = bgImg(wired.img);
                btn.addEventListener("click", wired.onclick);
                stage.appendChild(btn);
                refs[ctrl.name] = btn;
                return;
            }
            if (ctrl.name === "PicFea") {
                // PicFea_Click: feja-toggle.
                // feja starts at 0 (Dim default). Click → feja=1, play
                // kfp2.wav, animate 6 cells, then animate 12 cells.
                // Next click (feja=1) → feja=0, play x2.wav, animate 12 cells.
                let feja = 0;
                const node = MK.el("button", { class: "ctrl", style: style });
                node.style.backgroundImage = bgImg("anim/pic_fea_0.png");
                node.addEventListener("click", async function () {
                    if (feja === 1) {
                        MK.play("mik_siha/x2.wav");
                        feja = 0;
                        await animatePic(node, "pic_fea", 12, 80);
                    } else {
                        MK.play("mik_siha/kfp2.wav");
                        await animatePic(node, "pic_fea", 6, 80);
                        feja = 1;
                        await animatePic(node, "pic_fea", 12, 80);
                    }
                    node.style.backgroundImage = bgImg("anim/pic_fea_0.png");
                });
                stage.appendChild(node);
                refs.PicFea = node;
                return;
            }
            if (ctrl.name === "PicBur") {
                // PicBur_Click: Pin-toggle. Pin=1 → kp1.wav. Pin=0 → kpq.wav.
                // Both branches do a 6-cell animation cycle.
                let Pin = 0;
                const node = MK.el("button", { class: "ctrl", style: style });
                node.style.backgroundImage = bgImg("anim/pic_bur_0.png");
                node.addEventListener("click", async function () {
                    if (Pin === 1) {
                        MK.play("mik_siha/kp1.wav");
                        Pin = 0;
                    } else {
                        MK.play("mik_siha/kpq.wav");
                        Pin = 1;
                    }
                    await animatePic(node, "pic_bur", 6, 100);
                    node.style.backgroundImage = bgImg("anim/pic_bur_0.png");
                });
                stage.appendChild(node);
                refs.PicBur = node;
                return;
            }
            if (ctrl.name === "Panel3D1") {
                // Caption = Shir(GameNomer - 1). BackColor 16744576 →
                // VB 00BBGGRR → rgb(0, 128, 255). ForeColor white.
                const lbl = MK.el("div", { class: "lbl", style: style });
                lbl.style.fontSize = "20px";
                lbl.style.lineHeight = (parseInt(style.height) || 25) + "px";
                lbl.style.color = "#FFFFFF";
                lbl.style.background = "rgb(0, 128, 255)";
                lbl.style.textAlign = "center";
                lbl.style.fontFamily = "David, serif";
                lbl.textContent = SHIR[gameNomer - 1] || "";
                stage.appendChild(lbl);
                refs.Panel3D1 = lbl;
                return;
            }
            // Picture1/Picture2 — blank book pages. Load BliZeva(LPicName)
            // / (RPicName) which is the "p.BMP" suffix variant (the empty
            // page art that ships in assets/bmp).
            if (ctrl.name === "Picture1" || ctrl.name === "Picture2") {
                const node = MK.el("div", { class: "ctrl no-click", style: style });
                node.style.background = "transparent";
                node.style.overflow = "visible";
                const rel = ctrl.name === "Picture1" ? blankLeft : blankRight;
                if (rel) {
                    const img = MK.el("img", {
                        src: "assets/bmp/" + rel.replace(/^bmp\//, ""),
                        style: { position: "absolute", left: "0", top: "0", maxWidth: "none" },
                    });
                    node.appendChild(img);
                }
                stage.appendChild(node);
                refs[ctrl.name] = node;
                return;
            }
        });

        // Form_Load tail: if NomerMasl < 0 (free-play / Likro entry),
        // Timer1.Enabled = True → Timer1_Timer plays x2.wav once.
        // Played immediately (no setTimeout) so the user-activation
        // context from the click is preserved for the audio request.
        if (nomerMasl < 0 && refs.PicFea) {
            MK.play("mik_siha/x2.wav");
        }
    };
})();
