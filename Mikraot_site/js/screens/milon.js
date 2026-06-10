// MILON.FRM (VB_Name = "milon") — dictionary popup launcher.
//
// Opened from START.btnMln_Click (`tirgul = 6; Milon.Show 1`) — a small
// modal-style form that lists 7 dictionary sub-games. Each button
// kicks off a different game form:
//
//   btn1(0) → Mishak=4, SpisokMasl(0)=5;  game1.Show 1  ("במה זה מתחיל")
//   btn1(1) → Mishak=2, SpisokMasl(0)=9;  game1.Show 1  ("מה נישמה")
//   btn2()  → Mishak=1, SpisokMasl(0)=6;  game1.Show 1  ("איפה זה כתוב")
//   btn3()  →           SpisokMasl(0)=7;  game5.Show 1  ("מה התמונה")
//   btn4()  →           SpisokMasl(0)=8;  Game2.Show 1  ("מה הטעות")
//   btn5()  →           SpisokMasl(0)=10; Slog.Show 1   (syllable game)
//   btn6()  →           SpisokMasl(0)=11; gam_3.Show 1  (word game)
//   btnReturn → Unload milon                            → back to caller
//
// Form_Load only sets `SelectedFile = Dirs$ & "TEM\" & GameNomer & ".TEM"`
// (the dictionary's "tom" data file). No bg picture loaded — the form's
// own BackColor (olive &H00808000) shows through, Frame1 has system-
// button-face BackColor (light gray).
//
// Layout: 317×377 design canvas (twips/15, no ScaleMode on this form).
//   Frame1 at (8,48) 297×321 holding 7 SSCommand picture-buttons
//   btnReturn at (128, 8) — top center of the popup
//
// Button graphics extracted from MILON.FRX into assets/milon_btn/ —
// each ~122×25 Hebrew-text button graphic; btnReturn 41×30 back arrow.
(function () {
    const MK = window.MK;

    function bgImg(rel) { return "url('assets/" + rel + "')"; }

    MK.renderMilon = function (root, ctx) {
        const layout = window.MK_LAYOUT.milon;
        const sz     = MK.stageSizeFor(layout);
        const scale  = MK.scaleFor(layout);
        const stage  = MK.makeStage(root, sz.w, sz.h);
        // Form BackColor=&H00808000 → VB OLE_COLOR 00BBGGRR → rgb(0,128,128) teal.
        stage.style.backgroundColor = "rgb(0, 128, 128)";

        // Render the form recursively (Frame1 has 7 nested buttons).
        function walkChildren(parent, children) {
            const reversed = (children || []).slice().reverse();
            reversed.forEach(function (ctrl) {
                if (ctrl.name === "Frame1") {
                    const frame = MK.el("div", { class: "ctrl no-click", style: MK.posStyle(ctrl, scale) });
                    // Frame1 BackColor=&H80000005 (button-face system color)
                    frame.style.backgroundColor = "#c0c0c0";
                    frame.style.border = "2px outset #d4d0c8";
                    stage.appendChild(frame);
                    walkChildren(frame, ctrl.children);
                    return;
                }
                if (ctrl.name === "btn1") {
                    mkMilonBtn(parent, ctrl, "milon_btn/btn1_" + ctrl.props.Index + ".png", function () {
                        // btn1(0): Mishak=4, SpisokMasl(0)=5 → game1
                        // btn1(1): Mishak=2, SpisokMasl(0)=9 → game1
                        const mishak = ctrl.props.Index === 0 ? 4 : 2;
                        const spisok = ctrl.props.Index === 0 ? 5 : 9;
                        openGame1(mishak, spisok);
                    });
                    return;
                }
                if (ctrl.name === "btn2") return mkMilonBtn(parent, ctrl, "milon_btn/btn2.png", function () { openGame1(1, 6); });
                if (ctrl.name === "btn3") return mkMilonBtn(parent, ctrl, "milon_btn/btn3.png", function () { openGame("game5",  7); });
                if (ctrl.name === "btn4") return mkMilonBtn(parent, ctrl, "milon_btn/btn4.png", function () { openGame("game2",  8); });
                if (ctrl.name === "btn5") return mkMilonBtn(parent, ctrl, "milon_btn/btn5.png", function () { openGame("slog", 10); });
                if (ctrl.name === "btn6") return mkMilonBtn(parent, ctrl, "milon_btn/btn6.png", function () { openGame("gam3", 11); });
                if (ctrl.name === "btnReturn") return mkMilonBtn(parent, ctrl, "milon_btn/btnReturn.png", function () {
                    // Original: Unload milon → returns to caller. From
                    // START it goes back to START (with btnReturn/btnExit
                    // re-shown — caller does that). We just go back in
                    // history one hash level.
                    location.hash = "#/start";
                });
            });
        }

        function mkMilonBtn(parent, ctrl, img, onclick) {
            const node = MK.el("button", { class: "ctrl", style: MK.posStyle(ctrl, scale) });
            node.style.backgroundImage = bgImg(img);
            node.style.backgroundColor = "transparent";
            // SSCommand buttons render their picture without stretching;
            // place at top-left, full-bleed within the box (matches the
            // VB6 Threed.SSCommand look — these picture sizes match the
            // button slot sizes after AutoSize behavior).
            node.style.backgroundSize = "100% 100%";
            node.addEventListener("click", onclick);
            parent.appendChild(node);
            return node;
        }

        // GameNomer + NomerMasl=-1 (free play) per MILON.FRM Form_Load
        // semantic: SelectedFile uses GameNomer as the song id. We thread
        // the current GameNomer from sessionStorage so user enters the
        // dictionary games for the song they're currently on.
        const gameNomer = +(sessionStorage.getItem("mikraot:gameNomer") || "1");
        MK.log("milon popup", "gameNomer=" + gameNomer);

        function openGame1(mishak, spisok) {
            // Original sets Mishak + SpisokMasl(0)=spisok then game1.Show 1.
            // The Mishak value selects between word/letter answer modes.
            // Free-play from popup ⇒ no maslul chain; use nomerMasl=spisok
            // so per-step scoring still has a code to bucket under.
            MK.log("milon → game1", "mishak=" + mishak, "spisok=" + spisok, "gameNomer=" + gameNomer);
            location.hash = "#/game1/" + gameNomer + "/0?mishak=" + mishak + "&nomerMasl=" + spisok;
        }
        function openGame(name, spisok) {
            const route = ({game5:"game5", game2:"game2", slog:"slog", gam3:"gam3"})[name];
            MK.log("milon → " + name, "spisok=" + spisok, "gameNomer=" + gameNomer);
            location.hash = "#/" + route + "/" + gameNomer + "/0?nomerMasl=" + spisok;
        }

        walkChildren(stage, layout.children);
    };
})();
