// PROBA.FRM — entry video screen. Sub Main()'s first .Show, before the
// user reaches the maslul (KIVUN.FRM) picker or any game.
//
// Form layout (1:1 from PROBA.FRM, twips/15 = 96 DPI runtime after
// FixDpi + ScrRes.ChangeScreenSettings 640,480 in GLOBAL.BAS Sub Main):
//
//   Form Proba (Maximized, runtime 640×480)
//     Picture: menu/dugma7.bmp (Form_Load)
//     ├ btnKnisa     CommandButton, px(240,-5) 161×41  start.bmp  ("enter")
//     │              Top=-75 twips → -5 px (sits slightly above top edge)
//     ├ MMControl1   MCI widget, invisible  (replaced by HTML5 <video>)
//     ├ Picture1     PictureBox, px(160,112) 321×241, AutoSize=-1
//     │              When video opens, sizes to 320×240 natural dims.
//     ├ btnStart(1)  PictureBox, px(32,112)   65×49   pause icon
//     │              State: mafsik1 idle | mafsik2 active(pressed)
//     ├ btnStart(0)  PictureBox, px(544,120) 65×49   play icon
//     │              State: kat1   idle | kat2    active(pressed)
//     └ btnExit      PictureBox, px(0,0)     49×41   stop.bmp
//
// Flow (1:1 from PROBA.FRM event handlers):
//
//   Form_Load:    Picture=dugma7, btnKnisa.Picture=start, btnExit.Picture=stop
//   Form_Activate: GameNomer=0; btnStart_Click(0)  → autoplay video
//
//   btnStart_Click(0)  ← user clicks play OR Form_Activate triggers it
//     btnStart(0).Picture = kat2   ; btnStart(0).Enabled = False (active state)
//     btnStart(1).Picture = mafsik1; btnStart(1).Enabled = True
//     play_a = True
//     open_video Picture1.hWnd, MMControl1, ShmVideo
//     btnStop_Click   ← starts playback because play_a is True
//
//   btnStart_Click(1)  ← user clicks pause
//     btnStart(0).Picture = kat1   ; btnStart(0).Enabled = True  (idle)
//     btnStart(1).Picture = mafsik2; btnStart(1).Enabled = False (active state)
//     Stop_Video MMControl1
//     play_a = False
//
//   btnStop_Click  ← internal helper, NOT bound to a UI control
//     If play_a Then play_a=False; Play_Video; Timer1.Enabled=True
//     Else           Stop_Video;    play_a=True
//
//   Timer1_Timer (200 ms while playing):
//     If MMControl1.Mode = 525 (MCI_MODE_STOP, i.e. ended):
//        If TekFilm >= 10 → Close_Video; btnKnisa_Click; Exit Sub
//        Else cycle to next film / play Mik_Siha\kolnoa.wav (Azaga path)
//        Else → btnKnisa_Click
//     End If
//
//   btnKnisa_Click:
//     Hourglass cursor; Timer1.Enabled=False; MMControl1.Command="Close";
//     Do: maslul.Show 1  Loop Until Afsaka=False
//     btnStart_Click(0)   ← restart video after returning from maslul
//
//   btnExit_Click: Ezia (exit confirmation)
//
// HTML5 port: <video> replaces MCI. The "Timer1 watches MCI_MODE_STOP"
// loop maps to the <video>'s `ended` event. play_a stays as a state
// variable to keep the toggle semantics identical.
(function () {
    const MK = window.MK;

    function bgImg(rel) { return "url('assets/" + rel + "')"; }

    MK.renderProba = function (root, ctx) {
        const layout  = window.MK_LAYOUT.proba;
        const sz      = MK.stageSizeFor(layout);
        const scale   = MK.scaleFor(layout);
        const stageEl = MK.makeStage(root, sz.w, sz.h);
        stageEl.style.backgroundImage = bgImg("menu/dugma7.png");
        stageEl.style.backgroundSize = "100% 100%";

        const refs = {};   // control name(+index) → DOM node
        const state = {
            play_a: false,
            timer1: null,
            video:  null,
        };

        // Walk in original Z-order (.frm earlier-first = on top; reverse
        // for DOM so later children stack on top).
        MK.iterateInZOrder(layout.children, function (ctrl) {
            const style = MK.posStyle(ctrl, scale);
            const key = ctrl.name + (ctrl.props.Index != null ? "_" + ctrl.props.Index : "");
            switch (ctrl.name) {
                case "btnExit":    return refs[key] = mkBtn(style, "menu/stop.png", btnExit_Click, "יציאה");
                case "btnKnisa":
                    // CommandButton Style=1 (Graphical) with Picture: VB6
                    // draws the picture CENTERED inside the button slot
                    // with BackColor showing around. The .frm sets
                    // BackColor=&H00FFC0C0 → VB OLE_COLOR 00BBGGRR →
                    // rgb(192,192,255) (a light lavender). Native start
                    // image is 138×30; button slot 161×41 from the .frm.
                    // We override width/height here (smaller than .frm —
                    // user-tuned in ui_editor) so this survives any
                    // re-parse of PROBA.FRM into proba.json.
                    return refs[key] = mkBtn(style, "menu/start.png", btnKnisa_Click, "כניסה", {
                        width:  "144px",
                        height: "36px",
                        backgroundColor: "rgb(192, 192, 255)",
                        backgroundPosition: "center center",
                        backgroundSize: "auto",
                    });
                case "btnStart":   return refs[key] = mkStartBtn(ctrl, style);
                case "Picture1":   return refs[key] = mkVideoBox(style);
                case "MMControl1": return;   // not visible, no DOM
                case "Timer1":     return;   // child of Picture1, no DOM
            }
        });

        // Initial picture state set by Form_Load (before Form_Activate
        // toggles them to the playing state):
        //   btnStart(0).Picture default = kat1 (idle play, enabled)
        //   btnStart(1).Picture default = mafsik1 idle, but Enabled=False
        // The .frm starts btnStart(1) with Enabled=False (TabIndex=3 stays
        // disabled until btnStart_Click(0) flips it).
        if (refs.btnStart_0) setBtnImage(refs.btnStart_0, "menu/kat1.png", true);
        if (refs.btnStart_1) setBtnImage(refs.btnStart_1, "menu/mafsik1.png", false);

        // PROBA.FRM Form_Activate sets GameNomer=0 then btnStart_Click(0).
        // Browsers gate autoplay-with-sound on user interaction; we got
        // a click on the launcher tile to get here, so this is usually
        // honored. If sound is muted, the user can click the play btn.
        //
        // Azaga mode: KIVUN.modiin_Click (line ~1275) sets `Azaga=True;
        // TekFilm=1; ShmVideo="Video\1.avi"` and Unloads maslul, which
        // returns to PROBA and re-Activates it. Form_Activate calls
        // btnStart_Click(0) which opens ShmVideo. We mirror by reading
        // sessionStorage flags written by kivun.js's modiin handler.
        const azaga = sessionStorage.getItem("mikraot:azaga") === "1";
        if (azaga) {
            state.azaga = true;
            state.tekFilm = +(sessionStorage.getItem("mikraot:tekFilm") || "1");
            state.shmVideo = sessionStorage.getItem("mikraot:shmVideo") || "video/cred.mp4";
        }
        // Read ArrAzaga from Tozaot (Inst_Misp in KIVUN): ArrAzaga(k)=1
        // iff any maslul on song k+1 is .done. Used by the Timer1_Timer
        // fallback to decide whether to play the next AVI or just the
        // wav fallback.
        state.arrAzaga = [];
        try {
            const t = JSON.parse(localStorage.getItem("mikraot:tozaot") || "{}");
            for (let k = 0; k < 10; k++) {
                const songData = t[k + 1] || {};
                state.arrAzaga[k] = [0,1,2].some(function (i) {
                    return ((songData[i] || {}).done) === 1;
                }) ? 1 : 0;
            }
        } catch (e) { for (let k = 0; k < 10; k++) state.arrAzaga[k] = 0; }

        // Defer one tick so the DOM has settled.
        setTimeout(function () { btnStart_Click(0); }, 0);

        // ---- handlers (1:1 with PROBA.FRM Subs) -----------------------

        function btnStart_Click(idx) {
            if (idx === 0) {
                setBtnImage(refs.btnStart_0, "menu/kat2.png",    false);  // active
                setBtnImage(refs.btnStart_1, "menu/mafsik1.png", true);   // idle, enabled
                state.play_a = true;
                // ShmVideo defaults to cred.mp4 (the intro). In Azaga
                // mode KIVUN sets it to "Video\<n>.avi" — we honor it
                // via sessionStorage above.
                open_video(refs.Picture1, state.shmVideo || "video/cred.mp4");
                btnStop_Click();
            } else if (idx === 1) {
                setBtnImage(refs.btnStart_0, "menu/kat1.png",    true);   // idle, enabled
                setBtnImage(refs.btnStart_1, "menu/mafsik2.png", false);  // active
                Stop_Video();
                state.play_a = false;
            }
        }
        function btnStop_Click() {
            if (state.play_a) {
                state.play_a = false;
                Play_Video();
                Timer1_Enabled(true);
            } else {
                Stop_Video();
                state.play_a = true;
            }
        }
        function btnKnisa_Click() {
            document.body.style.cursor = "wait";
            Timer1_Enabled(false);
            Close_Video();
            // PROBA.btnKnisa_Click 1:1: Close + Loop maslul.Show. We
            // also clear the Azaga session flags so the next visit to
            // PROBA (e.g. via direct URL) reverts to the cred intro.
            sessionStorage.removeItem("mikraot:azaga");
            sessionStorage.removeItem("mikraot:tekFilm");
            sessionStorage.removeItem("mikraot:shmVideo");
            document.body.style.cursor = "";
            location.hash = "#/maslul";
        }
        function btnExit_Click() {
            // GLOBAL.BAS Ezia plays Mik_Siha/aastop.wav then asks for
            // exit confirmation. In browser-land we can just nav back.
            MK.play("mik_siha/aastop.wav").catch(function () {});
            window.location.href = "../index.html";
        }
        async function Timer1_Tick() {
            // PROBA.FRM Timer1_Timer 1:1:
            //   If MMControl1.Mode = 525 (MCI_MODE_STOP — video ended):
            //     If TekFilm >= 10 → Close + btnKnisa_Click + Exit.
            //     TFilm = TekFilm + 1
            //     If Azaga=True AND ArrAzaga(TekFilm)=1:
            //       ShmVideo = "Video\<TFilm>.avi"; TekFilm++; restart playback.
            //     Else:
            //       If Azaga=True: PlayZad("Mik_Siha\kolnoa.wav")
            //                       + PlayZad("wav\<TFilm>_1\<TFilm>L1.wav")
            //       btnKnisa_Click
            // We hook <video>.ended directly instead of polling at 200ms.
            if (!state.azaga) { btnKnisa_Click(); return; }
            if (state.tekFilm >= 10) { Close_Video(); btnKnisa_Click(); return; }
            const tFilm = state.tekFilm + 1;
            Timer1_Enabled(false);
            if (state.arrAzaga[state.tekFilm] === 1) {
                // Next song's celebration video is available — load + play.
                state.shmVideo = "video/" + tFilm + ".mp4";
                state.tekFilm = tFilm;
                sessionStorage.setItem("mikraot:tekFilm", String(tFilm));
                sessionStorage.setItem("mikraot:shmVideo", state.shmVideo);
                Close_Video();
                btnStart_Click(0);
            } else {
                // Fallback path: announce + play the song's L1 audio,
                // then exit Azaga. With per-song .avi files un-transcoded
                // this is the path most Azaga ticks take.
                await MK.playSync("mik_siha/kolnoa.wav");
                await MK.playSync("wav/" + tFilm + "_1/" + tFilm + "l1.wav");
                btnKnisa_Click();
            }
        }

        // ---- MCI shim (HTML5 <video>) ---------------------------------

        function open_video(box, src) {
            const v = box.querySelector("video");
            v.src = "assets/" + src;
            // open_video also called UpdateInterval reset and Length read
            // in the original VIDEO.BAS; <video> handles that internally.
            state.video = v;
            state.video.muted = false;  // every open resets mute state
            v.onended = Timer1_Tick;
        }
        function Play_Video() {
            if (!state.video) return;
            const p = state.video.play();
            if (p && p.catch) p.catch(function () {
                // Autoplay-with-sound was blocked by the browser. The
                // original VB6 never hit this — Win32 has no autoplay
                // policy. Fall back to muted autoplay so the visuals at
                // least play; user can click the play button (which is
                // a real user gesture) to restart with sound.
                state.video.muted = true;
                state.video.play().catch(function () {});
            });
        }
        function Stop_Video() {
            if (state.video) state.video.pause();
        }
        function Close_Video() {
            if (state.video) {
                state.video.pause();
                state.video.removeAttribute("src");
                state.video.load();
                state.video.onended = null;
                state.video = null;
            }
        }
        function Timer1_Enabled(on) {
            // We use the video's `ended` event instead of polling, so
            // this is mostly a no-op marker. Disabling the timer in the
            // original prevents repeated firing if the video stays in
            // MCI_MODE_STOP for >1 tick.
            if (!on && state.video) state.video.onended = null;
        }

        // ---- helpers --------------------------------------------------

        function mkBtn(style, img, onclick, title, extra) {
            const node = MK.el("button", { class: "ctrl", style: style, title: title });
            node.style.backgroundImage = bgImg(img);
            if (extra) Object.assign(node.style, extra);
            node.addEventListener("click", onclick);
            stageEl.appendChild(node);
            return node;
        }
        function mkStartBtn(ctrl, style) {
            // btnStart is a 2-element control array. Index 0 = play
            // (right), Index 1 = pause (left). Click → btnStart_Click(idx).
            //
            // AutoSize=-1 on the PictureBox means at runtime the control
            // resizes to the picture's natural dims (45×34 for kat*/mafsik*
            // BMPs). The design Width/Height (975×735 twips = 65×49 px)
            // is only an authoring placeholder. Match that runtime
            // behavior so the icon isn't stretched into the larger box.
            const override = Object.assign({}, style, { width: "45px", height: "34px" });
            const node = MK.el("button", { class: "ctrl", style: override });
            const idx = ctrl.props.Index;
            node.title = idx === 0 ? "הפעלה" : "השהיה";
            node.addEventListener("click", function () { btnStart_Click(idx); });
            stageEl.appendChild(node);
            return node;
        }
        function setBtnImage(node, img, enabled) {
            if (!node) return;
            node.style.backgroundImage = bgImg(img);
            node.disabled = !enabled;
            node.style.cursor = enabled ? "pointer" : "default";
            node.style.opacity = enabled ? "1" : "1";  // VB6 didn't dim
        }
        function mkVideoBox(style) {
            // VB6 Picture1 with AutoSize=-1 sizes itself to the video's
            // natural dims (320×240 for cred.avi). The control was placed
            // at twips(2400,1680) = px(160,112) — the form's design left
            // the right edge of Picture1 at x=481 which is just inside
            // the 480-wide form (actually pretty close — original was
            // 640-wide so x+w=480 < 640). We render at native 320×240.
            const wrap = MK.el("div", { class: "ctrl no-click", style: style });
            wrap.style.background = "#E0E0E0";  // matches Picture1.BackColor
            wrap.style.overflow = "hidden";
            const v = MK.el("video", {
                style: {
                    position: "absolute", left: "0", top: "0",
                    width: "320px", height: "240px",
                    background: "#000",
                },
                playsinline: "",
                preload: "auto",
            });
            wrap.appendChild(v);
            stageEl.appendChild(wrap);
            return wrap;
        }
    };
})();
