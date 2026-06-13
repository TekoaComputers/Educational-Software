// SOFER.FRM (VB_Name="sofer") — score board shown after a maslul ends
// or as a "maslul completed" review. Reads Tozaot.Masl(Misp_Masl, 0..12)
// to determine what to display: the per-step coin count from each game
// (indices 0..11 = NomerMasl codes) plus index 12 = "completed" flag.
//
// Two display modes (per Form_Load):
//   (a) Tozaot.Masl(Misp_Masl, 12) = 1 — maslul fully completed:
//       Shows Panel3D1 caption = Shir(GameNomer-1) + the song's icons,
//       picKolba shows coin BMPs (mat<n>.bmp where n is coin count),
//       lblTozaot summary "אספת X מטבעות מתוך Y".
//   (b) In-progress — Halon(0..4) coins visible per step taken.
//
// Web port: read localStorage Tozaot shim (set up in kivun.js), render
// summary + per-step coins.
(function () {
    const MK = window.MK;
    // SOFER.FRM ClientWidth/15 = 376 (small dialog). Form_Activate sets
    // Me.Width = ScaleX(640, ...) only when Tozaot.Masl(Misp_Masl, 12)=1
    // (= summary mode for a completed maslul). MK.stageSizeFor returns
    // the form's own dims since it's <500 wide.
    const TOZAOT_KEY = "mikraot:tozaot";

    function loadTozaot() {
        try { return JSON.parse(localStorage.getItem(TOZAOT_KEY) || "{}"); }
        catch (e) { return {}; }
    }
    function saveTozaot(t) {
        try { localStorage.setItem(TOZAOT_KEY, JSON.stringify(t)); } catch (e) {}
    }

    MK.renderSofer = function (root, ctx) {
        const gameNomer = +(ctx.params.gameNomer || ctx.parts && ctx.parts[1] || "1");
        const mispMasl  = +(ctx.params.maslIdx   || ctx.parts && ctx.parts[2] || "0");
        const layout = window.MK_LAYOUT.sofer;
        const sz     = MK.stageSizeFor(layout);
        const scale  = MK.scaleFor(layout);
        const stage  = MK.makeStage(root, sz.w, sz.h);
        stage.style.background = "rgb(40, 80, 120)";

        const t = loadTozaot();
        const songData = (t[gameNomer] || {})[mispMasl] || {};
        const completed = songData.done === 1;
        // Steps with coins.
        const steps = [];
        let sum = 0, max = 0;
        for (let i = 0; i < 12; i++) {
            const coins = +(songData[i] || 0);
            if (coins > 0) steps.push({ i: i, coins: coins });
            sum += coins;
            const slot = i < 3 ? 0 : i < 5 ? 9 : 10;
            if (coins > 0) max += slot;
        }
        // Hebrew title from kivun's SHIR[].
        const SHIR = ["שרה ראתה תחנה","שרה לחשה ","?למה צחקה דנה","סבא קנה מתנה","גל נפל",
                      "?מה בגינה","בית ואוירון","סודר חדש לגל","החיט העליז","עגלה עם סוסים"];

        // Per SOFER.FRM Form_Load: when completed, MaxMon increment is
        //   step 0..2 → 0 (read modes — no coin reward)
        //   step 3..4 → 9 (text/picture Q&A — max 3×3 coins)
        //   step >4   → 10 (MILON sub-games — max 5×2 coins)
        // Recompute max with these proper weights.
        let max2 = 0;
        for (let i = 0; i < 12; i++) {
            const coins = +(songData[i] || 0);
            if (coins === 0) continue;
            max2 += i < 3 ? 0 : i < 5 ? 9 : 10;
        }

        // Source .frm has 4 Picture1 + 4 picKolba slots in a row at
        // x ∈ {440,320,200,80}, y=72. Picture1 holds the step-icon
        // (MS<n>.bmp, top portion h=27), picKolba holds the coin
        // (mat<n>.bmp, full h=160). InstalKolb populates them based
        // on KolKolb (number of completed steps). For our port we
        // bind the first N slots (left-to-right at the .frm positions)
        // to the actual completed steps; unused slots stay hidden.
        const bindings = {
            btnExit:   { img: "menu/stop.png", title: "יציאה", onclick: function () {
                MK.play("mik_siha/aastop.wav");
                window.location.href = "../index.html";
            }},
            btnReturn: { img: "menu/back.png", title: "חזרה", onclick: function () {
                location.hash = "#/maslul/" + gameNomer;
            }},
            btnReset: { text: "איפוס", bg: "#c0c0c0", color: "#000",
                onclick: function () {
                    if (confirm("?למחוק את התוצאות")) {
                        if (t[gameNomer]) t[gameNomer][mispMasl] = {};
                        saveTozaot(t);
                        location.hash = "#/maslul/" + gameNomer;
                    }
                }},
            // SOFER.FRM modiin_Click 1:1: ShmVideo = "Video\<n>.avi";
            // Unload sofer. Per-song .avi videos aren't transcoded —
            // fall back to PROBA so the user at least sees cred.avi.
            modiin: { img: "menu/kupd2.png", onclick: function () {
                MK.log("sofer modiin → would play Video/" + gameNomer + ".avi; falling back to PROBA");
                location.hash = "#/";
            }},
            Panel3D1: { text: completed ? (SHIR[gameNomer - 1] || "") : "",
                bg: "rgb(0,128,255)", color: "#fff", visible: completed },
            lblTozaot: {
                text: completed ? (" אספת " + sum + " מטבעות מתוך " + max2) : "",
                color: "#ffff00", fontSize: 16, fontFamily: "David, serif",
            },
            // Shape1 outline box — frame around the score row.
            Shape1: { bg: "transparent", visible: completed, style: {
                border: "2px solid #888", borderRadius: "4px",
                pointerEvents: "none",
            }},
        };
        // 4 picKolba slots: from left in source, x ∈ {440, 320, 200, 80}.
        // .frm Index 0 is the rightmost; in completed mode we fill from
        // Index 0 → steps[0] (= first completed step).
        for (let i = 0; i < 4; i++) {
            const step = completed && steps[i] ? steps[i] : null;
            bindings["picKolba_" + i] = step ? {
                img: "menu/mat" + step.coins + ".png",
                style: { backgroundSize: "contain", backgroundRepeat: "no-repeat",
                         backgroundPosition: "center" },
            } : { visible: false };
            bindings["Picture1_" + i] = step ? {
                img: "menu/ms" + step.i + ".png",
                style: { backgroundSize: "contain", backgroundRepeat: "no-repeat",
                         backgroundPosition: "center" },
            } : { visible: false };
        }
        // Halon coins (in-progress mode) — hide in completed mode.
        for (let i = 0; i < 5; i++) {
            bindings["Halon_" + i] = { visible: false };
        }
        MK.renderForm(stage, layout, scale, bindings);

        // Tozaot.Dat IO toolbar — not in the original .frm; an extension
        // for the web port that lets a user import an existing Mikraot
        // save file or export their browser progress as a 780-byte
        // Tozaot.Dat. Pinned to the bottom-right so it doesn't collide
        // with the .frm's hand-positioned controls.
        const bar = MK.el("div", { style: {
            position: "absolute", left: "8px", bottom: "8px",
            display: "flex", gap: "6px", direction: "rtl",
        }});
        function mkToolBtn(label, onclick) {
            const b = MK.el("button", { style: {
                background: "#fffae0", color: "#000",
                border: "2px outset #d4d0c8",
                fontSize: "11px", fontFamily: "David, serif",
                padding: "4px 8px", cursor: "pointer",
            }}, [label]);
            b.addEventListener("click", onclick);
            return b;
        }
        bar.appendChild(mkToolBtn("יצוא Tozaot.Dat", function () {
            if (MK.downloadTozaotDat) MK.downloadTozaotDat();
        }));
        bar.appendChild(mkToolBtn("יבוא Tozaot.Dat", function () {
            if (MK.uploadTozaotDat) {
                MK.uploadTozaotDat();
                // Re-render after a moment so imported state shows up.
                setTimeout(function () {
                    location.hash = "#/sofer/" + gameNomer + "/" + mispMasl;
                }, 500);
            }
        }));
        stage.appendChild(bar);
    };
})();
