// AGDARA.FRM (VB_Name="Agdara") — maslul-editor settings page. 12
// checkboxes select which NomerMasl steps (codes 0..11) make up the
// current maslul (1/2/3 picked via NomerMasl global). Saves a custom
// .MSL line on Shmira.
//
// The original lets the user toggle each NomerMasl step on/off in their
// chosen maslul, then writes out a comma-separated step list to
// MASLUL/<song>.msl. For Phase 6 we render the form 1:1 and let the
// user toggle — persist to localStorage so changes survive reload.
(function () {
    const MK = window.MK;
    // AGDARA.FRM ClientWidth/15 = 614 — stageSizeFor returns ≥640 so
    // the 12-cell grid aligns with controls placed at twips/15.

    // Default checkbox values per maslul (from btnShihzor_Click — the
    // "restore defaults" button):
    //   maslul 1: indices 2,4,5,7 = on; rest off
    //   maslul 2: 1,3,6,10 = on
    //   maslul 3: 0,8,9,11 = on
    const DEFAULTS = {
        "1": [0,0,1,0,1,1,0,1,0,0,0,0],
        "2": [0,1,0,1,0,0,1,0,0,0,1,0],
        "3": [1,0,0,0,0,0,0,0,1,1,0,1],
    };
    // NomerMasl code → Hebrew label (paired with the maslul walker).
    const STEP_LABELS = ["הברות","מילים","משפטים","שאלות לטקסט","שאלות לתמונה",
        "במה זה מתחיל","איפה זה כתוב","מה התמונה","מה הטעות","מה נישמה",
        "משחק הברות","משחק מילים"];
    const STORE_KEY = "mikraot:agdara";

    function loadSettings() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
        catch (e) { return {}; }
    }
    function saveSettings(s) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
    }

    MK.renderAgdara = function (root, ctx) {
        const maslIdx = +(ctx.params.maslIdx || "1");
        const layout = window.MK_LAYOUT.agdara;
        const sz     = MK.stageSizeFor(layout);
        const scale  = MK.scaleFor(layout);
        const stage  = MK.makeStage(root, sz.w, sz.h);
        stage.style.background = "#003060";

        const settings = loadSettings();
        const values = (settings[maslIdx] || DEFAULTS[String(maslIdx)] || new Array(12).fill(0)).slice();
        const checkRefs = [];

        // Bindings:
        //   - btnExit/Return/Shihzor wired
        //   - Each Picture1(0..11) shows its extracted step icon
        //   - Each Check1(0..11) becomes a real <input checkbox> overlaid
        //     at the .frm position (so the user toggles in place)
        //   - Frame3/Frame4/Frame5/Panel3D1/lblKotarot rendered with
        //     captions where present
        const bindings = {
            btnExit:    { img: "menu/stop.png", onclick: function () { window.location.href = "../index.html"; }},
            btnReturn:  { img: "menu/back.png", onclick: function () {
                settings[maslIdx] = values;
                saveSettings(settings);
                location.hash = "#/maslul";
            }},
            btnShihzor: { text: "שיחזור", bg: "#c0c0c0", color: "#000", onclick: function () {
                const d = DEFAULTS[String(maslIdx)];
                if (d) {
                    d.forEach(function (v, i) { values[i] = v; if (checkRefs[i]) checkRefs[i].checked = !!v; });
                }
            }},
            Panel3D1: { text: "הגדרת מסלול " + maslIdx, bg: "rgb(0,128,255)", color: "#fff" },
            lblKotarot: { text: "שלבי המסלול", color: "#fff", fontSize: 14 },
        };
        // Picture1(0..11) — icons extracted from AGDARA.FRX. The .frm
        // Index maps directly to NomerMasl step code.
        for (let i = 0; i < 12; i++) {
            bindings["Picture1_" + i] = { img: "agdara_icons/step_" + i + ".png", title: STEP_LABELS[i] };
        }
        // Check1 → real checkbox + label centered in the slot.
        for (let i = 0; i < 12; i++) {
            bindings["Check1_" + i] = {
                build: (function (idx) {
                    return function (ctrl, sc, parent) {
                        const wrap = MK.el("label", { class: "ctrl", style: MK.posStyle(ctrl, sc) });
                        wrap.style.background = "transparent";
                        wrap.style.color = "#fff";
                        wrap.style.display = "flex";
                        wrap.style.alignItems = "center";
                        wrap.style.justifyContent = "center";
                        wrap.style.cursor = "pointer";
                        const cb = MK.el("input", { type: "checkbox" });
                        cb.style.transform = "scale(1.6)";
                        cb.checked = !!values[idx];
                        cb.addEventListener("change", function () {
                            values[idx] = cb.checked ? 1 : 0;
                        });
                        wrap.appendChild(cb);
                        stage.appendChild(wrap);
                        checkRefs[idx] = cb;
                        return wrap;
                    };
                })(i)
            };
        }
        MK.renderForm(stage, layout, scale, bindings);

        // Tozaot.Dat IO toolbar (web-port extension — not in the .frm).
        // Pinned bottom-right of the settings stage so it doesn't
        // collide with the 12-cell grid.
        const bar = MK.el("div", { style: {
            position: "absolute", left: "8px", bottom: "8px",
            display: "flex", gap: "6px", direction: "rtl", zIndex: "5",
        }});
        function mkBar(label, onclick) {
            const b = MK.el("button", { style: {
                background: "#fffae0", color: "#000",
                border: "2px outset #d4d0c8",
                fontSize: "11px", fontFamily: "David, serif",
                padding: "4px 8px", cursor: "pointer",
            }}, [label]);
            b.addEventListener("click", onclick);
            return b;
        }
        bar.appendChild(mkBar("יצוא Tozaot.Dat", function () { MK.downloadTozaotDat && MK.downloadTozaotDat(); }));
        bar.appendChild(mkBar("יבוא Tozaot.Dat", function () {
            if (!MK.uploadTozaotDat) return;
            MK.uploadTozaotDat();
            setTimeout(function () { location.hash = "#/agdara/" + maslIdx; }, 500);
        }));
        stage.appendChild(bar);
    };
})();
