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
        let shihzorBtn = null;
        // AGDARA.FRM `Shinui` — Dim-default False, set True by
        // Check1_Click / Picture1_Click / btnShihzor_Click. Gates the
        // "save changes?" confirm in btnReturn_Click.
        let changed = false;

        // AGDARA.FRM bdika() 1:1 — compare current Check1 values against
        // the maslul's defaults. Returns 1 if match (no need to restore),
        // 0 if differ. Used to gate the "שיחזור" (restore-defaults)
        // button's Enabled state.
        function bdika() {
            const def = DEFAULTS[String(maslIdx)];
            if (!def) return 1;
            for (let i = 0; i < 12; i++) {
                if ((values[i] ? 1 : 0) !== (def[i] ? 1 : 0)) return 0;
            }
            return 1;
        }
        function refreshShihzor() {
            if (!shihzorBtn) return;
            shihzorBtn.disabled = (bdika() === 1);
            shihzorBtn.style.opacity = shihzorBtn.disabled ? "0.5" : "1";
        }

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
                // AGDARA.FRM btnReturn_Click 1:1 (line 831):
                //   If Shinui=True: MsgBox " לשמור את השינוים " (Yes/No/Cancel
                //     = 35); Yes (6) → Shmira; If Response<>2 (=Cancel)
                //     Unload Agdara.
                //   AGDARA's Label2 caption "מסלול מוגבל ל-4 פעילויות"
                //   is informational; the original doesn't enforce a count
                //   constraint at save time, so we don't either.
                if (changed) {
                    const ans = confirm("?לשמור את השינוים");
                    if (ans) {
                        settings[maslIdx] = values;
                        saveSettings(settings);
                    }
                }
                location.hash = "#/maslul";
            }},
            btnShihzor: { build: function (ctrl, sc, parent) {
                const b = MK.el("button", { class: "ctrl", style: MK.posStyle(ctrl, sc) },
                    ["שיחזור"]);
                b.style.background = "#c0c0c0";
                b.style.color = "#000";
                b.style.fontFamily = "David, serif";
                b.style.fontSize = "16px";
                b.addEventListener("click", function () {
                    const d = DEFAULTS[String(maslIdx)];
                    if (!d) return;
                    d.forEach(function (v, i) {
                        values[i] = v;
                        if (checkRefs[i]) checkRefs[i].checked = !!v;
                    });
                    changed = true;
                    refreshShihzor();
                });
                stage.appendChild(b);
                shihzorBtn = b;
                return b;
            }},
            Panel3D1: { text: "הגדרת מסלול " + maslIdx, bg: "rgb(0,128,255)", color: "#fff" },
            lblKotarot: { text: "שלבי המסלול", color: "#fff", fontSize: 14 },
        };
        // Picture1(0..11) — icons extracted from AGDARA.FRX. The .frm
        // Index maps directly to NomerMasl step code. Clicking the icon
        // toggles the matching Check1 (1:1 with Picture1_Click in source).
        for (let i = 0; i < 12; i++) {
            bindings["Picture1_" + i] = {
                build: (function (idx) {
                    return function (ctrl, sc, parent) {
                        const node = MK.el("button", { class: "ctrl", style: MK.posStyle(ctrl, sc), title: STEP_LABELS[idx] });
                        node.style.backgroundImage = "url('assets/agdara_icons/step_" + idx + ".png')";
                        node.style.backgroundSize = "contain";
                        node.style.backgroundRepeat = "no-repeat";
                        node.style.backgroundPosition = "center";
                        node.style.backgroundColor = "transparent";
                        node.style.cursor = "pointer";
                        node.addEventListener("click", function () {
                            values[idx] = values[idx] ? 0 : 1;
                            if (checkRefs[idx]) checkRefs[idx].checked = !!values[idx];
                            changed = true;
                            refreshShihzor();
                        });
                        stage.appendChild(node);
                        return node;
                    };
                })(i),
            };
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
                            changed = true;
                            refreshShihzor();
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
        refreshShihzor();   // initial state based on Form_Load bdika().

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
