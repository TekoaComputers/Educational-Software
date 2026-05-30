// Hemed / Nivim — site shell. Renders a fixed 800×600 stage backed by
// the original VB6 hand-painted scenes (mainback.jpg, UnitList/back.jpg,
// GameMenu/back.jpg, etc.) with controls overlaid at .frm-derived pixel
// coordinates (twips/15). Hash routes:
//
//   #/<App>                       main screen
//   #/<App>/units                 unit list (parchment)
//   #/<App>/unit/<id>/games       game menu (hanging signs)
//   #/<App>/unit/<id>/<gameId>    run gameId
//
// Per-screen layouts are coded directly here (positioned divs) to mirror
// each form 1:1 — no generic card grid.
(function () {
    const root = document.getElementById("app");
    const el = HND._el;

    let appId = null;
    let allUnits = null;
    let currentUnit = null;
    let stage = null;

    function makeStage(bgPath) {
        root.innerHTML = "";
        stage = document.createElement("div");
        stage.className = "stage";
        if (bgPath) stage.style.backgroundImage = "url('" + bgPath + "')";
        root.appendChild(stage);
        fitStage();
        return stage;
    }
    function picPath(rel) {
        return "assets/" + (appId || "Hemed") + "/pictures/" + rel;
    }
    function dataPathForUnit(unitId) {
        return HND.APPS[appId].dataRoot + "/unit_" + unitId;
    }

    function fitStage() {
        if (!stage) return;
        const w = window.innerWidth, h = window.innerHeight;
        const s = Math.min(w / 800, h / 600);
        stage.style.transform = "scale(" + s + ")";
    }
    window.addEventListener("resize", fitStage);

    const HELP_TEXTS = {
        main:      'מסך ראשי:\n• הקלד שם תלמיד ובחר רמה.\n• לחץ על החץ הזהוב כדי להתחיל לתרגל.',
        units:     'רשימת יחידות:\n• לחץ על שורה כדי לבחור יחידה.\n• לחץ פעמיים או על "מעבר למשחקים" כדי להיכנס לתפריט המשחקים.',
        "game-menu": 'תפריט משחקים:\n• בחר משחק מתוך השלטים על העץ.\n• לחץ על כפתור היציאה כדי לחזור לרשימת היחידות.',
        match:      'משחק התאמה:\n• לחץ על ביטוי בצד אחד, ואז על הפתרון התואם בצד השני.\n• כל תשובה נכונה צובעת את הזוג בירוק.',
        american:   'משחק אמריקאי:\n• קרא את השאלה למעלה ובחר את התשובה הנכונה מתוך ארבע האפשרויות.',
        connect:    'משחק חיבור:\n• הביטוי המודגש מימין מחכה לפתרון.\n• לחץ על הפתרון הנכון משמאל.',
        hakira:     'חקירה — כרטיסים ללימוד:\n• השתמש בכפתורים כדי לעבור בין הכרטיסים.\n• כפתור ה"השמע" משמיע את הביטוי ואת הפתרון.',
        apple:      'משחק תפוחים:\n• הסדר את האותיות בחלק העליון על ידי הקשה על התפוחים.',
        hatamaplus: 'התאמה+:\n• כמו ההתאמה הרגילה, אך עם 12 פריטים ורמז מתחת לכל התאמה נכונה.',
        haklada:    'הקלטה:\n• לחץ על "הקלט" כדי להקליט את התשובה שלך.\n• האזן להקלטה והשווה אותה לתשובה המקורית.',
    };
    function addNavButtons(onExit, onHelp, helpKey) {
        const exit = document.createElement("button");
        exit.className = "ctrl cmd-icon exit-icon";
        exit.dataset.app = appId;
        exit.title = "יציאה";
        exit.addEventListener("click", onExit || function () {
            window.location.href = "../index.html";
        });
        stage.appendChild(exit);
        const help = document.createElement("button");
        help.className = "ctrl cmd-icon help-icon";
        help.title = "עזרה";
        help.addEventListener("click", onHelp || function () {
            const txt = HELP_TEXTS[helpKey] || 'אין עזרה זמינה למסך זה.';
            HND.log("click", "help", "screen=" + (helpKey || "?"));
            alert(txt);
        });
        stage.appendChild(help);
    }

    // ============== Screen: Main (mainback.jpg with leaf + sky) ==============
    // Hemed and Nivim use different MainForm.frm layouts.
    //   Hemed/MainForm.frm:   mainback.jpg + arrow entry button at (256,304).
    //     ComboUserSelect L=2880 T=3000 → 192,200    (user input)
    //     RamaList        L=2880 T=3960 → 192,264    (visible)
    //     CmdShowUnits    L=3840 T=4560 W=4215 H=855 → 256,304,281,57 (arrow)
    //     CmdEditStudents L=4920 T=5640 → 328,376
    //     CmdEditLessons  L=4680 T=6240 → 312,416
    //   Nivim/MainForm.frm:   mainback2.jpg, big click-label entry.
    //     ComboUserSelect L=2760 T=3930 → 184,262    (user input)
    //     RamaList        L=2880 T=5520 → 192,368    (Visible=False)
    //     CmdShowUnits    L=2760 T=5040 W=6615 H=1095 → 184,336,441,73 (label)
    //     CmdEditStudents L=0    T=8040 W=1215 H=975 → 0,536,81,65
    //     CmdEditLessons  L=5040 T=7920 → 336,528    (Visible=False)
    function showMain() {
        HND.log("screen", "main", "app=" + appId, "units=" + (allUnits ? allUnits.length : 0));
        const isNivim = (appId === "Nivim");
        const mainBg  = isNivim ? "Main/mainback2.png" : "Main/mainback.png";
        // Per MainForm.frm: Nivim's RamaList has Visible=False (rama
        // overlaps the entry-button region; the original auto-selects the
        // first rama). Hemed's RamaList is Visible=True.
        const layout  = isNivim ? {
            user:  { left: 184, top: 262, width: 249, height: 30 },
            rama:  { left: 192, top: 368, width: 249, height: 30, visible: false },
            entry: { left: 184, top: 336, width: 441, height: 73 },
            editStud: { left: 0,   top: 536, width: 81,  height: 65 },
            editLes:  { left: 336, top: 528, width: 169, height: 25, visible: false },
        } : {
            user:  { left: 192, top: 200, width: 249, height: 30 },
            rama:  { left: 192, top: 264, width: 249, height: 30, visible: true },
            entry: { left: 256, top: 304, width: 281, height: 57 },
            editStud: { left: 328, top: 376, width: 153, height: 25 },
            editLes:  { left: 312, top: 416, width: 169, height: 25 },
        };

        const stg = makeStage(picPath(mainBg));
        addNavButtons(null, null, "main");

        // User name input (ComboUserSelect in original).
        const user = document.createElement("input");
        user.type = "text";
        user.className = "ctrl field-input";
        Object.assign(user.style, {
            left:   layout.user.left   + "px",
            top:    layout.user.top    + "px",
            width:  layout.user.width  + "px",
            height: layout.user.height + "px",
        });
        user.placeholder = "שם התלמיד";
        try { user.value = localStorage.getItem("hnd." + appId + ".user") || ""; } catch (e) {}
        user.addEventListener("input", function () {
            try { localStorage.setItem("hnd." + appId + ".user", user.value); } catch (e) {}
        });
        stg.appendChild(user);

        // Rama selector (RamaList in original). Honors .frm Visible flag —
        // Nivim hides this, Hemed shows it. Even when hidden we still
        // populate + persist for the unit-list filter downstream.
        const rama = document.createElement("select");
        rama.className = "ctrl field-select";
        Object.assign(rama.style, {
            left:   layout.rama.left   + "px",
            top:    layout.rama.top    + "px",
            width:  layout.rama.width  + "px",
            height: layout.rama.height + "px",
            display: layout.rama.visible === false ? "none" : "",
        });
        const ramaLabels = {};
        allUnits.forEach(function (u) { if (u.ramaLabel) ramaLabels[u.ramaLabel] = true; });
        const ramaList = Object.keys(ramaLabels);
        ramaList.forEach(function (lbl) {
            const o = document.createElement("option");
            o.value = lbl; o.textContent = lbl;
            rama.appendChild(o);
        });
        // Restore last; else default to first available (matches
        // Nivim's `If UBound(...Text)=0 Then RamaList.Selected=0`).
        try { rama.value = localStorage.getItem("hnd." + appId + ".rama") || ""; } catch (e) {}
        if (!rama.value && ramaList.length) rama.value = ramaList[0];
        rama.addEventListener("change", function () {
            try { localStorage.setItem("hnd." + appId + ".rama", rama.value); } catch (e) {}
        });
        stg.appendChild(rama);

        // Entry button (CmdShowUnits — Hemed = arrow, Nivim = big label).
        const entry = document.createElement("button");
        entry.className = "ctrl entry-btn";
        Object.assign(entry.style, {
            left:   layout.entry.left   + "px",
            top:    layout.entry.top    + "px",
            width:  layout.entry.width  + "px",
            height: layout.entry.height + "px",
        });
        entry.title = "כניסה לתרגול";
        entry.addEventListener("click", function () {
            try { localStorage.setItem("hnd." + appId + ".rama", rama.value || ""); } catch (e) {}
            HND.log("click", "main entry", "user=" + (user.value || "?"), "rama=" + (rama.value || "?"));
            location.hash = "#/" + appId + "/units";
        });
        stg.appendChild(entry);

        // CmdEditStudents (transparent click target, hidden in original by default).
        const editStud = document.createElement("button");
        editStud.className = "ctrl sub-btn";
        Object.assign(editStud.style, {
            left:   layout.editStud.left   + "px",
            top:    layout.editStud.top    + "px",
            width:  layout.editStud.width  + "px",
            height: layout.editStud.height + "px",
        });
        editStud.title = "מנהל תלמידים";
        editStud.addEventListener("click", function () {
            HND.log("click", "main → students");
            location.hash = "#/" + appId + "/students";
        });
        stg.appendChild(editStud);

        // CmdEditLessons (Hemed shows it; Nivim hides it by default per .frm).
        const editLes = document.createElement("button");
        editLes.className = "ctrl sub-btn";
        Object.assign(editLes.style, {
            left:   layout.editLes.left   + "px",
            top:    layout.editLes.top    + "px",
            width:  layout.editLes.width  + "px",
            height: layout.editLes.height + "px",
            display: layout.editLes.visible === false ? "none" : "",
        });
        editLes.title = "עריכת שיעורים";
        editLes.addEventListener("click", function () {
            // Original MainForm.CmdEditLessons_Click:
            //   AllowEdit = True; CmdShowUnits_Click  (→ UnitListForm)
            // We mirror by routing to UnitListForm with ?edit, not directly
            // to UnitEditorForm. Picking a unit from the list opens the
            // editor for it (CmdEdit(1) in UnitListForm).
            HND.log("click", "main → units (edit mode)");
            location.hash = "#/" + appId + "/units?edit";
        });
        stg.appendChild(editLes);
    }

    // ============== Screen: Unit list (parchment scroll) ==============
    // Original ReLoadForm: group units by UnitSubject (filtered by user's
    // UserRama), show subject header rows in navy 24pt, then unit names
    // numbered ".N" in green 20pt. ScoreList sits to the left in sync,
    // blank for headers, "Str(score)" for units.
    function showUnitList(editMode) {
        HND.log("screen", "unit-list", "app=" + appId,
                "units=" + allUnits.length,
                "edit=" + (!!editMode));
        const stg = makeStage(picPath("UnitList/back.png"));
        addNavButtons(null, null, "units");

        const list = document.createElement("div");
        list.className = "ctrl unit-scroll";
        stg.appendChild(list);
        const scores = document.createElement("div");
        scores.className = "ctrl score-col";
        stg.appendChild(scores);
        // Keep scroll positions in sync (UnitList.Scroll drives both lists).
        list.addEventListener("scroll", function () { scores.scrollTop = list.scrollTop; });
        scores.addEventListener("scroll", function () { list.scrollTop  = scores.scrollTop; });

        // Filter by saved rama (from main screen).
        let ramaFilter = "";
        try { ramaFilter = localStorage.getItem("hnd." + appId + ".rama") || ""; } catch (e) {}
        const filtered = allUnits.filter(function (u) {
            return !ramaFilter || !u.ramaLabel || u.ramaLabel === ramaFilter;
        });

        // Group by category (subject), preserving first-seen order.
        const groups = [];
        const groupIdx = {};
        filtered.forEach(function (u) {
            const key = u.category || "";
            if (!(key in groupIdx)) { groupIdx[key] = groups.length; groups.push({ name: key, units: [] }); }
            groups[groupIdx[key]].units.push(u);
        });

        HND.log("unit-list filter", "rama=" + ramaFilter, "kept=" + filtered.length + "/" + allUnits.length,
                "groups=" + groups.length);

        groups.forEach(function (g) {
            if (g.name) {
                const hdr = document.createElement("div");
                hdr.className = "row header";
                hdr.textContent = g.name + "   ";
                list.appendChild(hdr);
                const blank = document.createElement("div");
                blank.className = "cell header";
                blank.textContent = "";
                scores.appendChild(blank);
            }
            g.units.forEach(function (u, i) {
                const row = document.createElement("div");
                row.className = "row unit";
                row.dataset.id = String(u.id);
                // RTL container: put the Hebrew name on the visual right
                // and the ".N" index on the visual left explicitly via
                // flex children, so the number always sits where the
                // original parchment list puts it (right of the name
                // visually = left of the row in logical/CSS order).
                const nameSpan = document.createElement("span");
                nameSpan.className = "row-name";
                nameSpan.textContent = u.name;
                const idxSpan = document.createElement("span");
                idxSpan.className = "row-idx";
                idxSpan.textContent = (i + 1) + ".";
                row.appendChild(idxSpan);
                row.appendChild(nameSpan);
                row.addEventListener("click", function () {
                    Array.from(list.children).forEach(function (c) { c.classList.remove("sel"); });
                    Array.from(scores.children).forEach(function (c) { c.classList.remove("sel"); });
                    row.classList.add("sel");
                    if (cell) cell.classList.add("sel");
                    currentUnit = u;
                    HND.log("click", "unit-list pick", "unit=" + u.id, "name=" + u.name,
                            "items=" + ((u.data && u.data.items) ? u.data.items.length : 0));
                });
                row.addEventListener("dblclick", function () {
                    HND.log("click", "unit-list dblclick → game-menu", "unit=" + u.id);
                    location.hash = "#/" + appId + "/unit/" + u.id + "/games";
                });
                list.appendChild(row);

                const cell = document.createElement("div");
                cell.className = "cell unit";
                cell.textContent = bestScoreFor(u);
                scores.appendChild(cell);
            });
        });

        // CmdGameMenu — entry to game menu for the currently-selected unit.
        const goBtn = document.createElement("button");
        goBtn.className = "ctrl game-menu-btn";
        goBtn.title = "מעבר לאזור המשחקים";
        goBtn.addEventListener("click", function () {
            if (!currentUnit) {
                const firstUnit = list.querySelector(".row.unit");
                if (firstUnit) firstUnit.click();
            }
            HND.log("click", "unit-list go-to-games",
                    "unit=" + (currentUnit ? currentUnit.id : "(none)"));
            if (currentUnit) location.hash = "#/" + appId + "/unit/" + currentUnit.id + "/games";
        });
        stg.appendChild(goBtn);

        // ===== Teacher edit-mode controls (AllowEdit=True in original) =====
        // 4 CmdEdit buttons on the left, all painted with smallscroll.png and
        // captioned dynamically by DrawString AllTips(151+Index) (original
        // UnitListForm.frm line 283). We replicate by overlaying text divs.
        //   CmdEdit(0): new unit       → UnitEditorForm.EditUnit -5
        //   CmdEdit(1): re-edit unit   → UnitEditorForm.EditUnit selected.id
        //   CmdEdit(2): change name    → prompt for new name
        //   CmdEdit(3): delete unit    → confirm + remove
        if (editMode) {
            const EDIT_LABELS = ["יחידה חדשה", "ערוך יחידה", "שנה שם יחידה", "מחק יחידה"];
            const EDIT_TOPS   = [168, 224, 280, 336];
            EDIT_LABELS.forEach(function (label, idx) {
                const btn = document.createElement("button");
                btn.className = "ctrl unit-edit-btn unit-edit-" + idx;
                btn.title = label;
                btn.style.top = EDIT_TOPS[idx] + "px";
                const cap = document.createElement("span");
                cap.className = "unit-edit-cap";
                cap.textContent = label;
                btn.appendChild(cap);
                btn.addEventListener("click", function () {
                    if (idx === 0) {                                 // new unit
                        const newId = HND.createNewUnit(appId);
                        HND.loadUnits(appId).then(function (u) {
                            allUnits = u;
                            location.hash = "#/" + appId + "/lessons/" + newId;
                        });
                    } else if (idx === 1) {                          // re-edit
                        if (!currentUnit) { alert("בחר יחידה תחילה."); return; }
                        location.hash = "#/" + appId + "/lessons/" + currentUnit.id;
                    } else if (idx === 2) {                          // change name
                        if (!currentUnit) { alert("בחר יחידה תחילה."); return; }
                        const next = (prompt("שם יחידה חדש:", currentUnit.name) || "").trim();
                        if (!next || next === currentUnit.name) return;
                        const ov = HND.loadUnitOverrides(appId);
                        ov[currentUnit.id] = Object.assign({}, ov[currentUnit.id] || {}, { name: next });
                        HND.saveUnitOverrides(appId, ov);
                        HND.loadUnits(appId).then(function (u) {
                            allUnits = u;
                            showUnitList(true);                      // re-render
                        });
                    } else if (idx === 3) {                          // delete
                        if (!currentUnit) { alert("בחר יחידה תחילה."); return; }
                        if (!confirm("למחוק את היחידה \"" + currentUnit.name + "\"?")) return;
                        if (currentUnit._isNew) {
                            HND.deleteNewUnit(appId, currentUnit.id);
                        } else {
                            alert("יחידות JSON אינן ניתנות למחיקה לצמיתות; ניתן להחזיר עריכה במקום.");
                            return;
                        }
                        HND.loadUnits(appId).then(function (u) {
                            allUnits = u;
                            currentUnit = null;
                            showUnitList(true);
                        });
                    }
                });
                stg.appendChild(btn);
            });
        }
    }
    // Single score per unit row (average of available per-game bests) —
    // mirrors the original calcAllScore output ("Str(AllScores(unitId))").
    // The 7 maslul-attached game IDs (in CmdPlus1 slot order 0..8 with
    // 3 American + 2 Haklada variants collapsing to single buckets):
    //   hakira / match / american / haklada / apple / connect.
    // Note: 'hatamaplus' is NOT in MaslulScores — it shares Match's slot.
    function bestScoreFor(unit) {
        const games = ["hakira", "match", "american", "haklada", "apple", "connect"];
        let sum = 0, n = 0;
        games.forEach(function (g) {
            const p = HND.loadProgress(appId, unit.id, g);
            if (p && typeof p.best === "number") { sum += p.best; n++; }
        });
        return n ? String(Math.round(sum / n)) : "";
    }

    // ============== Screen: Game menu (wooden signs on the tree) ==============
    // Original GameMenu.frm: 9 CmdPlus1 slots (indices 0..8) using kora<i>.bmp
    // signs — each sign has the game name pre-painted on it. windowPic on the
    // left swaps to window<i>.jpg on hover. Title bar at top shows
    // "UnitName | Subject | Rama | UserName" in pale blue with shadow.
    //   Index 0: smaller (L=6120 W=3780 → x=408 w=252)
    //   Index 1..8: standard (L=5520 W=5010 → x=368 w=334)
    //   All at T=1440+810*i → y=96+54*i, H=810 → 54px
    const KORA_SLOTS = [
        { game: "hakira" },                          // 0 — חקירה
        { game: "match" },                           // 1 — התאמה
        { game: "american", title: "לפי קול" },      // 2 — American by sound
        { game: "american", title: "לפי תמונה" },    // 3 — American by picture
        { game: "american", title: "לפי טקסט" },     // 4 — American by text
        { game: "haklada",  title: "הקלטה רגילה" },  // 5 — Haklada regular
        { game: "haklada",  title: "הכתבה" },        // 6 — Haklada dictation
        { game: "apple" },                           // 7 — משחק התפוח
        { game: "connect" },                         // 8 — משחק הבחירה
    ];
    // Slot index → calibration-block index in unit.cfg (CheckDisable in
    // GameMenu.frm — the original maps Case 0,1 / 2,3,4 / 5,6,7 onto
    // CmdPlus1 0,1 / 5,6,7 / 2,3,4). Slot 8 (Connect) is intentionally
    // unmapped (always visible per the original).
    const SLOT_TO_CAL_IDX = {
        0: 0,  // hakira
        1: 1,  // match
        2: 5,  // american-sound  (cal 5 → CmdPlus1 2)
        3: 6,  // american-pic    (cal 6 → CmdPlus1 3)
        4: 7,  // american-text   (cal 7 → CmdPlus1 4)
        5: 2,  // haklada regular (cal 2 → CmdPlus1 5)
        6: 3,  // haklada dictation (cal 3 → CmdPlus1 6)
        7: 4,  // apple           (cal 4 → CmdPlus1 7)
    };
    function isSlotDisabled(unit, slotIdx) {
        const calIdx = SLOT_TO_CAL_IDX[slotIdx];
        // ShowPic = unit.flags[1], ShowWave = unit.flags[2]
        const flags = unit.flags || [];
        const showPic  = flags[1] !== false;
        const showWave = flags[2] !== false;
        if (slotIdx === 3 && !showPic)  return true;     // American by picture
        if (slotIdx === 2 && !showWave) return true;     // American by sound
        if (slotIdx === 6 && !showWave) return true;     // Haklada dictation
        if (calIdx == null) return false;                // slot 8 (Connect)
        const cfg = unit.cfg || [];
        const disabledField = cfg[calIdx * 20 + 2];      // AllGamesCalibration(i).Disabled
        return String(disabledField || "").trim().toLowerCase() === "true";
    }
    function showGameMenu(unit) {
        currentUnit = unit;
        HND.log("screen", "game-menu", "unit=" + unit.id, "name=" + unit.name);
        const stg = makeStage(picPath("GameMenu/back.png"));
        addNavButtons(function () {
            HND.log("click", "game-menu exit → unit-list");
            location.hash = "#/" + appId + "/units";
        }, null, "game-menu");

        // Title bar — Form_Paint draws this in RGB(90,131,252) with a
        // pale-lavender shadow above (y=8/9), centered around x=400.
        let userName = "";
        try { userName = localStorage.getItem("hnd." + appId + ".user") || ""; } catch (e) {}
        let rama = "";
        try { rama = localStorage.getItem("hnd." + appId + ".rama") || ""; } catch (e) {}
        const titleParts = [unit.name, unit.category, rama, userName].filter(Boolean);
        const title = el("div", { class: "ctrl game-menu-title", text: titleParts.join(" · ") });
        stg.appendChild(title);

        // windowPic — preview parchment, hidden until a sign is hovered.
        const preview = el("div", { class: "ctrl game-menu-preview" });
        stg.appendChild(preview);

        // ShakePic — grass tufts at the bottom. setBack_Timer cycles through
        // shake0..shake3.jpg (~150ms/frame) while any sign is in motion.
        const shake = el("div", { class: "ctrl shake-pic" });
        stg.appendChild(shake);

        // GoatArow — 2-frame goat sprite (arrow1.png/arrow2.png) at x=712
        // that slides vertically to track the hovered sign's Top. FrameN=1
        // while moving, FrameN=0 when settled.
        const goat = el("div", { class: "ctrl goat" });
        goat.style.top = (96) + "px";       // align with slot 0 initially
        stg.appendChild(goat);
        let goatSettleTimer = null;
        function moveGoatTo(y) {
            goat.style.top = y + "px";
            goat.classList.add("moving");
            shake.classList.add("shaking");
            clearTimeout(goatSettleTimer);
            goatSettleTimer = setTimeout(function () {
                goat.classList.remove("moving");
                shake.classList.remove("shaking");
            }, 320);
        }

        // Visibility per CheckDisable + re-center the visible signs as a
        // group. Original: top = 96 + 54*(8-usedIcons)/2 + 54*N, where N
        // is the index into the visible-only sequence.
        const visibleSlots = KORA_SLOTS
            .map(function (_, i) { return i; })
            .filter(function (i) { return !isSlotDisabled(unit, i); });
        const usedIcons = visibleSlots.length;
        const yOffset   = (8 - usedIcons) / 2;     // half-empty space gets split top/bottom
        const slotTops  = {};
        visibleSlots.forEach(function (slotIdx, nthVisible) {
            slotTops[slotIdx] = 96 + 54 * yOffset + 54 * nthVisible;
        });
        HND.log("game-menu disable",
                "visible=" + visibleSlots.join(","),
                "hidden=" + KORA_SLOTS
                    .map(function (_, i) { return i; })
                    .filter(function (i) { return slotTops[i] == null; })
                    .join(","));

        // Track the goat's first visible slot for initial alignment.
        if (usedIcons > 0) goat.style.top = slotTops[visibleSlots[0]] + "px";

        // 9 kora signs hanging on the tree.
        KORA_SLOTS.forEach(function (slot, i) {
            if (slotTops[i] == null) return;       // disabled — skip render entirely
            const sign = document.createElement("button");
            sign.className = "ctrl game-sign k" + i;
            // Index 0 has different geometry per .frm.
            if (i === 0) {
                sign.style.left = "408px"; sign.style.width = "252px";
            } else {
                sign.style.left = "368px"; sign.style.width = "334px";
            }
            sign.style.top = slotTops[i] + "px";
            if (slot.title) sign.title = slot.title;

            const p = HND.loadProgress(appId, unit.id, slot.game);
            if (p) {
                // Original drawScore renders just the integer (no '%').
                const score = el("span", { class: "game-sign-score", text: String(p.best) });
                sign.appendChild(score);
            }
            // CmdPlus1_MouseOn → load window<i>.jpg into windowPic, show it;
            // and slide the goat to track this sign's Top.
            sign.addEventListener("mouseenter", function () {
                preview.style.backgroundImage =
                    "url('" + picPath("GameMenu/window" + i + ".png") + "')";
                preview.classList.add("visible");
                moveGoatTo(slotTops[i]);
            });
            sign.addEventListener("mouseleave", function () {
                preview.classList.remove("visible");
            });
            sign.addEventListener("click", function () {
                HND.log("click", "game-menu pick", "slot=" + i, "game=" + slot.game,
                        "mode=" + (slot.title || "default"),
                        "unit=" + unit.id, "best=" + (p ? p.best + "%" : "—"));
                // Stash the slot index for per-mode-aware runners (American
                // has 3 modes mapped to slots 2/3/4: by-sound / by-pic /
                // by-text). Each game reads sessionStorage on entry.
                try {
                    sessionStorage.setItem("hnd." + appId + ".lastSlot", String(i));
                    sessionStorage.setItem("hnd." + appId + ".lastMode", slot.title || "");
                } catch (e) {}
                location.hash = "#/" + appId + "/unit/" + unit.id + "/" + slot.game;
            });
            stg.appendChild(sign);
        });
    }

    // ============== Game runners (overlay on game-specific BG) ==============
    function showGame(unit, gameId) {
        currentUnit = unit;
        HND.log("screen", "game", "game=" + gameId, "unit=" + unit.id,
                "name=" + unit.name,
                "items=" + ((unit.data && unit.data.items) ? unit.data.items.length : 0));
        HND.stopWave();
        const bgMap = {
            match:      "GameHatama/back.png",
            american:   "GameAmerican/back.png",
            connect:    "Main/showform.png",   // GameConnect.frm uses showform.jpg
            hakira:     "GameHakira/back.png",
            apple:      "GameApple/back.png",
            hatamaplus: "GameHatama/back.png",
            haklada:    "GameHaklada/backtt.png",  // text-text dictation BG
        };
        const stg = makeStage(picPath(bgMap[gameId] || "Main/mainback.png"));
        // gameRoot first, then nav icons — icons must stay clickable above
        // the game's overlay layer.
        const gameRoot = document.createElement("div");
        gameRoot.className = "ctrl game-root";
        gameRoot.style.cssText = "left:0; top:0; right:0; bottom:0;";
        stg.appendChild(gameRoot);
        addNavButtons(function () {
            HND.log("click", "game exit → game-menu", "game=" + gameId);
            location.hash = "#/" + appId + "/unit/" + unit.id + "/games";
        }, null, gameId);

        const app = HND.APPS[appId];
        const starters = {
            match:      HND.startMatch,
            american:   HND.startAmerican,
            connect:    HND.startConnect,
            hakira:     HND.startHakira,
            apple:      HND.startApple,
            hatamaplus: HND.startHatamaPlus,
            haklada:    HND.startHaklada,
        };
        const fn = starters[gameId];
        if (fn) fn(gameRoot, app, unit);
        else gameRoot.innerHTML = '<div class="error">משחק לא ידוע</div>';

        // F-keys per the original Form_KeyUp handlers (every game.frm has
        // these): Esc exits to the GameMenu, F1 toggles a help overlay.
        // Cleaned up automatically when the route changes (showMain etc.
        // calls makeStage which removes our root).
        if (HND._fkeyHandler) {
            document.removeEventListener("keyup", HND._fkeyHandler);
        }
        HND._fkeyHandler = function (e) {
            if (e.key === "Escape" || e.code === "Escape") {
                HND.log("fkey", "Esc → game-menu exit", "game=" + gameId);
                location.hash = "#/" + appId + "/unit/" + unit.id + "/games";
            } else if (e.key === "F1" || e.code === "F1") {
                e.preventDefault();
                HND.log("fkey", "F1 → help", "game=" + gameId);
                toggleHelpOverlay(gameId, stg);
            }
        };
        document.addEventListener("keyup", HND._fkeyHandler);
    }

    // F1 help overlay — shows the calibration Instructions string for this
    // game (Form_Paint draws this on every game). Translates the original's
    // built-in F1=Help binding into a dismissible banner.
    function toggleHelpOverlay(gameId, stg) {
        const existing = stg.querySelector(".help-overlay");
        if (existing) { existing.remove(); return; }
        const help = document.createElement("div");
        help.className = "ctrl help-overlay";
        const calBlockBySlot = {
            hakira: 0, match: 1, american: 7, haklada: 2, apple: 4, connect: 8,
        };
        const calIdx = calBlockBySlot[gameId];
        const cfg = (currentUnit && currentUnit.cfg) || [];
        const text = (calIdx != null && cfg[calIdx * 20 + 4])
            ? String(cfg[calIdx * 20 + 4]).trim()
            : "מקש Esc — יציאה  ·  F1 — עזרה";
        help.textContent = text + "    (Esc ליציאה)";
        stg.appendChild(help);
        setTimeout(function () { help.remove(); }, 4500);
    }

    // ============== Screen: Student manager (StudentForm.frm) ==============
    // Faithful port of StudentForm.frm:
    //   Background: studentBack.jpg (800×600).
    //   ListUsers ListPlus  (235,104,305×417)  — multi-select student names
    //   ListScores ListPlus (176,104, 63×417)  — average score per student
    //   Shape1 border       (172,101,375×425)  — frames the two lists
    //   CmdEdit(0..3) right column at x=552:
    //       0 add (T=168) / 1 rename (T=216) / 2 reset (T=264) / 3 delete (T=312)
    //   CmdEdit(4..5) bottom: select-all (376,536) / deselect-all (264,536)
    //   CmdEdit(10) (632,8,89×46) — print toggle (hidden in our port)
    //   CmdExit/CmdHelp at (5,2) / (740,2) — standard 55×55 icons.
    // Multi-select mirrors the original (ListPlus ItemDataSelected); the
    // single-active student is tagged with ★.
    function showStudentManager() {
        HND.log("screen", "students", "app=" + appId);
        const stg = makeStage(picPath("Main/studentBack.jpg"));

        // CmdExit + CmdHelp at original .frm positions (5,2 / 740,2 / 55×55).
        const exit = el("button", {
            class: "ctrl studform-exit",
            title: "יציאה",
            onclick: function () { location.hash = "#/" + appId; },
        });
        const help = el("button", {
            class: "ctrl studform-help",
            title: "עזרה",
            onclick: function () {
                alert('מנהל תלמידים\n\n• הוסף — מוסיף תלמיד חדש.\n• שנה שם — משנה שם של תלמיד מסומן.\n• אפס ציונים — מנקה את כל הציונים של תלמיד מסומן.\n• מחק — מסיר תלמיד וכל הציונים שלו.\n• בחר/בטל הכל — סימון מרובה.\n• לחיצה כפולה על שם מסמנת אותו כתלמיד הפעיל.');
            },
        });
        stg.appendChild(exit);
        stg.appendChild(help);

        // CmdEdit(10) at (632, 8, 89×46) — CHANGE TEACHER PASSWORD.
        // Original CmdEdit_Click(10):  TeacherPass = Msg(AllTips(181), MsgInput)
        //                              ConfigFile(15) = TeacherPass
        //                              SaveTextFile ConfigFile, ...
        // In our port we persist to localStorage under "hnd.<app>.teacher_pass".
        const cmd10 = el("button", {
            class: "ctrl studform-cmd cmd10",
            title: "שנה סיסמת מורה",
            onclick: function () {
                const current = (function () {
                    try { return localStorage.getItem("hnd." + appId + ".teacher_pass") || ""; }
                    catch (e) { return ""; }
                })();
                const next = prompt("הקלד סיסמת מורה חדשה:", current);
                if (next == null) return;        // user cancelled
                try { localStorage.setItem("hnd." + appId + ".teacher_pass", next); } catch (e) {}
                HND.log("teacher_pass changed", appId);
                alert("הסיסמה נשמרה.");
            },
        });
        stg.appendChild(cmd10);

        // Shape1 border around the two lists.
        const frame = el("div", { class: "ctrl studform-frame" });
        stg.appendChild(frame);

        const scoresList = el("div", { class: "ctrl studform-scores-list" });
        const usersList  = el("div", { class: "ctrl studform-users-list" });
        stg.appendChild(scoresList);
        stg.appendChild(usersList);

        const activeNow = (function () {
            try { return localStorage.getItem("hnd." + appId + ".user") || ""; }
            catch (e) { return ""; }
        })();
        // Selection state: a Set of names currently checked (ListPlus
        // ItemDataSelected). The "active" student is tracked separately
        // via HND.setActiveStudent(); double-clicking a name promotes it.
        const sel = new Set(activeNow ? [activeNow] : []);

        function avgScore(name) {
            // Average best score across all unit/game keys for this user
            // (mirrors ListScores' calcAllScore output).
            const prefix = "hnd." + (name || "_") + "." + appId + ".";
            let sum = 0, n = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || k.indexOf(prefix) !== 0) continue;
                try {
                    const v = JSON.parse(localStorage.getItem(k) || "{}");
                    if (typeof v.best === "number") { sum += v.best; n++; }
                } catch (e) {}
            }
            return n ? Math.round(sum / n) : null;
        }

        function rerender() {
            usersList.innerHTML  = "";
            scoresList.innerHTML = "";
            const students = HND.listStudents(appId);
            if (!students.length) {
                usersList.appendChild(el("div", {
                    class: "studform-empty",
                    text: "עדיין אין תלמידים — לחץ \"הוסף\".",
                }));
                return;
            }
            students.forEach(function (name) {
                const isSel    = sel.has(name);
                const isActive = (name === activeNow);
                const row = el("div", {
                    class: "studform-row"
                           + (isSel    ? " sel"    : "")
                           + (isActive ? " active" : ""),
                    onclick: function () {
                        if (isSel) sel.delete(name); else sel.add(name);
                        rerender();
                    },
                    ondblclick: function () {
                        HND.setActiveStudent(appId, name);
                        HND.log("students activate", appId, name);
                        location.hash = "#/" + appId;
                    },
                });
                row.appendChild(el("span", {
                    class: "studform-check",
                    text: isSel ? "☑" : "☐",
                }));
                row.appendChild(el("span", {
                    class: "studform-name",
                    text: (isActive ? "★ " : "") + name,
                }));
                usersList.appendChild(row);

                const s = avgScore(name);
                const cell = el("div", {
                    class: "studform-score-cell" + (isSel ? " sel" : ""),
                    text: s == null ? "" : String(s),
                });
                scoresList.appendChild(cell);
            });
        }

        // CmdEdit(0..5) — original positions per the .frm. `title` is used
        // both as the tooltip and as the click-logger's printed label so
        // every button has a unique, descriptive ID in the console.
        function mkCmd(idx, x, y, w, h, title, handler) {
            const b = el("button", {
                class: "ctrl studform-cmd cmd" + idx,
                style: "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;",
                title: title,
                onclick: handler,
            });
            stg.appendChild(b);
        }
        mkCmd(0, 552, 168, 121, 46, "הוסף תלמיד", function () {           // studCmd0
            const name = (prompt("שם התלמיד החדש:") || "").trim();
            if (!name) return;
            const list = HND.listStudents(appId);
            if (list.indexOf(name) !== -1) { alert("שם זה כבר קיים."); return; }
            list.push(name);
            HND.saveStudents(appId, list);
            sel.add(name);
            rerender();
        });
        mkCmd(1, 552, 216, 121, 46, "שנה שם תלמיד", function () {         // studCmd1
            if (sel.size !== 1) {
                alert("יש לסמן תלמיד אחד בלבד לפעולת שינוי שם.");
                return;
            }
            const oldName = Array.from(sel)[0];
            const next = (prompt("שם חדש:", oldName) || "").trim();
            if (!next || next === oldName) return;
            if (HND.listStudents(appId).indexOf(next) !== -1) {
                alert("שם זה כבר תפוס."); return;
            }
            HND.renameStudent(appId, oldName, next);
            sel.delete(oldName); sel.add(next);
            rerender();
        });
        mkCmd(2, 552, 264, 121, 46, "אפס ציונים", function () {           // studCmd2
            if (!sel.size) { alert("יש לסמן תלמיד אחד או יותר."); return; }
            const names = Array.from(sel);
            if (!confirm("לאפס את כל הציונים של " + names.length + " תלמיד(ים)?")) return;
            let total = 0;
            names.forEach(function (n) { total += HND.resetStudentScores(appId, n); });
            alert("נמחקו " + total + " רשומות ציון.");
            rerender();
        });
        mkCmd(3, 552, 312, 121, 46, "מחק תלמיד", function () {            // studCmd3
            if (!sel.size) { alert("יש לסמן תלמיד אחד או יותר."); return; }
            const names = Array.from(sel);
            if (!confirm("למחוק את " + names.length + " תלמיד(ים) לתמיד? הציונים יימחקו עם השמות.")) return;
            names.forEach(function (n) { HND.deleteStudent(appId, n); });
            sel.clear();
            rerender();
        });
        mkCmd(4, 376, 536, 113, 41, "סמן הכל", function () {              // studCmd4
            HND.listStudents(appId).forEach(function (n) { sel.add(n); });
            rerender();
        });
        mkCmd(5, 264, 536, 113, 41, "בטל סימון", function () {            // studCmd5
            sel.clear();
            rerender();
        });
        // CmdEdit(6) at (608, 400, 121×46) — "Show print form" toggle. The
        // original switches the form into a print-preview mode (SelectedList +
        // ContainerPic + buttons 7/8/9). Printing isn't feasible in the
        // browser, so we stub with a notice but keep the button at its
        // .frm-faithful position.
        mkCmd(6, 608, 400, 121, 46, "הדפס ציונים", function () {          // studCmd6
            if (!sel.size) {
                alert("יש לסמן תלמיד אחד או יותר לפני הדפסה.");
                return;
            }
            alert("הדפסת דוחות זמינה במהדורת המחשב בלבד.\nניתן להעתיק שמות מהרשימה.");
        });

        rerender();
    }

    // ============== Screen: Calibration form (CalibrationForm.frm) ==============
    // Faithful port of CalibrationForm.frm. Layout (px, twips/15):
    //   Background: UnitEditor/Calibration.jpg (800×600).
    //   CmdExit (5,2,55×55) / CmdHelp (740,2,55×55) — top corners.
    //   GameList (424,98,257,281) — ListPlus of the 8/9 game names.
    //   CmdText (144,176,105×49) — toggle text-mode (CalibOrder.jpg).
    //   CmdWave (264,176,105×49) — toggle wave-mode (CalibOrder2.jpg).
    //   Combo rows:
    //     Row1 y=432:  SetWhatToAsk(600), SetWhatToAnswer(408),
    //                  SetWhatToHint(216), SetTextForPicture(24);
    //                  SetErrorForHint(24,81×34), SetScroll(120,81×34)
    //     Row2 y=512:  SetWhatToAnswerSound(24,177×34), SetWhatToAskSound(216,177×34),
    //                  SetCombineAQ(224 — overlap), SetWhatToType(408,177×34),
    //                  SetTimeLimit(408,81×34), SetSideToAsk(504,81×34),
    //                  SetQLimit(600,81×34), SetRandom(696,81×34).
    //   CmdAdvOptions (456,408,152×64) — opens advanced sub-options.
    // Game-specific control visibility is driven by calib.txt: each game
    // section declares which controls are relevant + their option lists.
    function showCalibrationForm(unitId, gameIdx) {
        HND.log("screen", "calibration", "app=" + appId,
                "unit=" + unitId, "game=" + (gameIdx || 0));
        const stg = makeStage(picPath("UnitEditor/Calibration.jpg"));

        const unit = allUnits.find(function (u) { return u.id === unitId; });
        if (!unit) { location.hash = "#/" + appId; return; }
        // Work on a clone of the cfg so changes are queued until Save.
        let workingCfg = (unit.cfg || []).slice();
        let selectedGame = (gameIdx != null && gameIdx >= 0) ? gameIdx : 0;
        let dirty = false;

        // ===== Top icons =====
        stg.appendChild(el("button", {
            class: "ctrl calib-exit", title: "יציאה",
            onclick: function () {
                if (dirty && !confirm("שינויי כיול לא נשמרו. לצאת בכל זאת?")) return;
                location.hash = "#/" + appId + "/lessons/" + unitId;
            },
        }));
        stg.appendChild(el("button", {
            class: "ctrl calib-help", title: "עזרה",
            onclick: function () {
                alert('כיול משחק\n\n• בחר משחק מהרשימה.\n• בחר ערכים מהתפריטים הנפתחים.\n• לחץ "שמור" כדי לשמור את השינויים בדפדפן.\n• השינויים חלים על היחידה הנוכחית בלבד.');
            },
        }));

        // ===== Save button at top-left (we add one — original saves on Exit) =====
        const saveBtn = el("button", {
            class: "ctrl calib-save", title: "שמור כיול",
            onclick: function () { saveCalib(); },
        });
        stg.appendChild(saveBtn);

        // ===== Description banner — original draws Content(i+2) at (400, 60)
        // in BLACK via DrawString vbCenter. ONLY the description; the game
        // name lives in the GameList rows. =====
        const descBar = el("div", { class: "ctrl calib-desc" });
        descBar.dataset.debugId = "calib:description-banner";
        stg.appendChild(descBar);

        // ===== Game list (424, 98, 257, 281) =====
        const gameList = el("div", { class: "ctrl calib-game-list" });
        stg.appendChild(gameList);

        // ===== Mode buttons (CmdText/CmdWave) — visual stub; original uses
        // these to switch between text and sound calibration views. Both
        // dropdown sets are visible together in our port. =====
        const cmdText = el("button", {
            class: "ctrl calib-cmd-text", title: "כיול טקסט",
            onclick: function () { stg.classList.remove("mode-wave"); stg.classList.add("mode-text"); },
        });
        const cmdWave = el("button", {
            class: "ctrl calib-cmd-wave", title: "כיול קול",
            onclick: function () { stg.classList.remove("mode-text"); stg.classList.add("mode-wave"); },
        });
        stg.appendChild(cmdText);
        stg.appendChild(cmdWave);

        // ===== Combo dropdowns — created on demand once the schema loads =====
        const comboLayer = el("div", { class: "ctrl calib-combo-layer" });
        stg.appendChild(comboLayer);

        // Original .frm positions per control. Each entry is { x, y, w, h, hidden }.
        // `hidden: true` flags controls that are Visible=False in the .frm —
        // they're only shown when AdvOptions is toggled on (we don't expose
        // that toggle yet, so they stay hidden, matching default behaviour).
        const CTL_POSITIONS = {
            SetWhatToAsk:           { x: 600, y: 432, w: 177, h: 34 },
            SetWhatToAnswer:        { x: 408, y: 432, w: 177, h: 34 },
            SetWhatToHint:          { x: 216, y: 432, w: 177, h: 34 },
            SetTextForPicture:      { x:  24, y: 432, w: 177, h: 34 },
            SetErrorForHint:        { x:  24, y: 432, w:  81, h: 34 },
            SetScroll:              { x: 120, y: 432, w:  81, h: 34 },
            SetWhatToAnswerSound:   { x:  24, y: 512, w: 177, h: 34 },
            SetWhatToAskSound:      { x: 216, y: 512, w: 177, h: 34 },
            SetCombineAQ:           { x: 224, y: 512, w: 161, h: 34 },
            SetTimeLimit:           { x: 408, y: 512, w:  81, h: 34 },
            SetSideToAsk:           { x: 504, y: 512, w:  81, h: 34 },
            SetQLimit:              { x: 600, y: 512, w:  81, h: 34 },
            SetRandom:              { x: 696, y: 512, w:  81, h: 34 },
            SetWhatToType:          { x: 408, y: 512, w: 177, h: 34 },
            SetCanSwitchQA:         { x: 264, y: 280, w: 105, h: 42, hidden: true },
            SetCanSwitchTextToFill: { x: 144, y: 280, w: 105, h: 42, hidden: true },
        };
        // ShowPic flag (unit.flags[1]) — original Form_Paint skips
        // SetTextForPicture entirely when ShowPic = False.
        const showPic = (unit.flags || [])[1] !== false;

        // Substitute label macros for "->", "<-", "<>" with the actual column
        // captions (the original CalibrationForm draws CurrentUnit.LabelRight
        // / LabelLeft / LabelHint in the dropdown items).
        const cols = (unit.data && unit.data.columns) || [];
        const macros = {
            "->": cols[2] || "?",   // right column (Hebrew)
            "<-": cols[1] || "?",   // left column (translation)
            "<>": cols[0] && cols[0] !== cols[1] && cols[0] !== cols[2] ? cols[0] : "?",
        };

        function renderForGame(schema) {
            const game = schema[selectedGame];
            if (!game) return;
            descBar.textContent = game.desc;

            // Rebuild game-list rows on every render so disabled-state colors
            // pick up cfg changes (Disabled flag affects color).
            gameList.innerHTML = "";
            schema.forEach(function (g, i) {
                const disabled = String(workingCfg[i * 20 + 2] || "").toLowerCase() === "true";
                const row = el("div", {
                    class: "calib-game-row" +
                           (i === selectedGame ? " sel" : "") +
                           (disabled ? " disabled" : ""),
                    text: g.name,
                    "data-debug-id": "calib:game-list:" + g.name,
                    onclick: function () {
                        selectedGame = i;
                        renderForGame(schema);
                    },
                });
                gameList.appendChild(row);
            });

            // Rebuild combos for this game's controls.
            comboLayer.innerHTML = "";
            game.controls.forEach(function (ctl) {
                const pos = CTL_POSITIONS[ctl.name];
                if (!pos) return;
                if (pos.hidden) return;   // .frm Visible=False — skip by default
                if (ctl.name === "SetTextForPicture" && !showPic) return;
                const wrap = el("div", {
                    class: "calib-combo-wrap",
                    style: "left:" + pos.x + "px; top:" + pos.y + "px;" +
                           "width:" + pos.w + "px;",
                });
                // Original Form_Paint splits ctl.label by FIRST SPACE:
                //   FirstLine = chars before first space (e.g., "מה")
                //   NextLine  = chars after first space (e.g., "לשאול")
                // Draws NextLine at y-35 (top), FirstLine at y-16 (bottom).
                // RGB(25, 70, 0) — dark green.
                const lbl = ctl.label || "";
                const sp  = lbl.indexOf(" ");
                const firstWord = sp === -1 ? lbl : lbl.slice(0, sp);
                const restWords = sp === -1 ? "" : lbl.slice(sp + 1);
                wrap.appendChild(el("div", {
                    class: "calib-combo-line-top", text: restWords,
                }));
                wrap.appendChild(el("div", {
                    class: "calib-combo-line-bot", text: firstWord,
                }));
                const sel = document.createElement("select");
                sel.className = "calib-combo";
                sel.dataset.debugId = "calib:" + ctl.name;
                sel.title = ctl.label;        // for the click logger
                ctl.options.forEach(function (opt) {
                    const o = document.createElement("option");
                    o.value = opt.value;
                    o.textContent = macros[opt.label] || opt.label;
                    sel.appendChild(o);
                });
                const fieldName = HND.CALIB_CTL_TO_FIELD[ctl.name];
                if (fieldName) {
                    const fakeUnit = { cfg: workingCfg };
                    const currentVal = HND.getCalibField(fakeUnit, selectedGame, fieldName);
                    if (currentVal != null) sel.value = currentVal;
                    sel.addEventListener("change", function () {
                        workingCfg = HND.setCalibField(fakeUnit, selectedGame, fieldName, sel.value);
                        dirty = true;
                        HND.log("calib change", ctl.name, "=" + sel.value);
                        if (fieldName === "Disabled") renderForGame(schema);
                    });
                }
                wrap.appendChild(sel);
                comboLayer.appendChild(wrap);
            });
        }

        function saveCalib() {
            const ov = HND.loadUnitOverrides(appId);
            ov[unitId] = Object.assign({}, ov[unitId] || {}, { cfg: workingCfg });
            HND.saveUnitOverrides(appId, ov);
            dirty = false;
            HND.loadUnits(appId).then(function (u) {
                allUnits = u;
                HND.log("calib saved", "unit=" + unitId);
                alert("הכיול נשמר.");
            });
        }

        HND.loadCalibSchema(appId).then(function (schema) {
            renderForGame(schema);
        }).catch(function (e) {
            stg.appendChild(el("div", { class: "ctrl calib-error",
                text: "שגיאה בטעינת קובץ הכיול: " + e.message }));
        });
    }

    // ============== Screen: Lesson editor (UnitEditorForm.frm) ==============
    // Faithful port of UnitEditorForm.frm. Layout (px, twips/15):
    //   Background:   UnitEditor/Back.jpg (800×600).
    //   Top bar:
    //     CmdExit         (5,2,55×55)     studCmd-style icons reused from main.
    //     CmdSave         (72,8,55×55)    Save_on.png / Save_off.png.
    //     TxtUnitName     (232,22,273×30) unit name input.
    //     CmdSetDefaults  (624,5,55×55)   per-game calibration entry (stubbed).
    //     CmdPrint        (680,5,55×48)   Print_on/off.png (stubbed).
    //     CmdHelp         (740,2,55×55)
    //     ComboRama       (120,74,169×26)  rama selector (hidden by default).
    //     TxtUnitSubject  (240,74,265×26)  subject text input.
    //   Data area:
    //     ScrollData      (664,120,25×400)  vertical scrollbar (skinned).
    //     DataFrame       (30,120,689×400)  the scroll viewport — clones one
    //                                       DataContainer per item, each row
    //                                       100px tall with WaveLeft/TextLeft/
    //                                       TextRight/TextHint/LinePic/LblNumber
    //                                       at .frm-relative positions.
    //   Right toolbar (x=752):
    //     CmdAddLine      (752,120,40×40)  add_on/off.png
    //     CmdDelLine      (752,160,40×40)  Del_on/off.png
    //     CmdMoveLine(0)  (752,224,40×40)  Up_On.png
    //     CmdMoveLine(1)  (752,264,40×40)  Down_On.png
    //   Bottom:
    //     ScrollTextWidth (30,519,689×25)  horizontal scrollbar (visual only).
    //     Save/revert/unit-picker we surface as our own studform-style chips.
    function showLessonEditor(unitIdFromRoute) {
        HND.log("screen", "lessons", "app=" + appId, "unit=" + (unitIdFromRoute || "(all)"));
        const stg = makeStage(picPath("UnitEditor/Back.jpg"));

        let currentEdit = null;     // { id, name, subject, cols, items, dirty }
        let rowOffset   = 0;        // top item visible in the data viewport
        const ROWS_VISIBLE = 4;     // ~100px each in DataFrame (400 tall total)

        // ===== Top bar =====
        const exit = el("button", {
            class: "ctrl ued-exit", title: "יציאה",
            onclick: function () {
                if (currentEdit && currentEdit.dirty &&
                    !confirm("יש שינויים שלא נשמרו. לצאת בכל זאת?")) return;
                location.hash = "#/" + appId;
            },
        });
        const save = el("button", {
            class: "ctrl ued-save", title: "שמור",
            onclick: function () { saveCurrent(); },
        });
        const setDefaults = el("button", {
            class: "ctrl ued-defaults", title: "כיול משחקים",
            onclick: function () {
                if (!currentEdit) { alert("טען יחידה תחילה."); return; }
                if (currentEdit.dirty &&
                    !confirm("יש שינויי תוכן שלא נשמרו. לעבור לכיול בכל זאת?")) return;
                location.hash = "#/" + appId + "/calibration/" + currentEdit.id;
            },
        });
        const printBtn = el("button", {
            class: "ctrl ued-print", title: "הדפסה",
            onclick: function () { alert("ההדפסה זמינה רק במהדורת המחשב."); },
        });
        const help = el("button", {
            class: "ctrl ued-help", title: "עזרה",
            onclick: function () {
                alert('עורך שיעורים\n\n• בחר יחידה מהרשימה הנפתחת.\n• ערוך טקסט בתאים (תרגום, מקור, רמז).\n• כפתורי + / × / ↑ / ↓ — הוסף, מחק, הזז שורות.\n• שמור — שומר את השינויים בדפדפן בלבד (localStorage). הקבצים בשרת אינם מתעדכנים.');
            },
        });
        const unitName  = el("input", {
            class: "ctrl ued-unitname",
            type: "text",
            placeholder: "שם היחידה",
            oninput: function () { if (currentEdit) { currentEdit.name = unitName.value; currentEdit.dirty = true; } },
        });
        const subjectInp = el("input", {
            class: "ctrl ued-subject",
            type: "text",
            placeholder: "נושא",
            oninput: function () { if (currentEdit) { currentEdit.subject = subjectInp.value; currentEdit.dirty = true; } },
        });
        // Native select for unit-pick (replaces the original ComboPlus
        // pulldown — the original .frm has no equivalent in UnitEditorForm,
        // since unit selection happens upstream in UnitListForm.
        // ✎ marks an existing JSON unit that has a saved overlay;
        // ✦ marks a brand-new (localStorage-only) unit).
        const unitPicker = el("select", { class: "ctrl ued-unit-picker" });
        unitPicker.addEventListener("change", function () {
            if (currentEdit && currentEdit.dirty &&
                !confirm("יש שינויים שלא נשמרו. לעבור בכל זאת?")) {
                unitPicker.value = String(currentEdit.id);
                return;
            }
            const id = parseInt(unitPicker.value, 10);
            if (!isNaN(id)) loadEditFor(id);
        });
        function fillUnitPicker() {
            unitPicker.innerHTML = "";
            allUnits.forEach(function (u) {
                const ov = HND.loadUnitOverrides(appId)[u.id];
                const opt = document.createElement("option");
                opt.value = String(u.id);
                const prefix = u._isNew ? "✦ " : (ov ? "✎ " : "");
                opt.textContent = prefix + u.name;
                unitPicker.appendChild(opt);
            });
            if (currentEdit) unitPicker.value = String(currentEdit.id);
        }

        stg.appendChild(exit);
        stg.appendChild(save);
        stg.appendChild(setDefaults);
        stg.appendChild(printBtn);
        stg.appendChild(help);
        stg.appendChild(unitName);
        stg.appendChild(subjectInp);
        stg.appendChild(unitPicker);

        // ===== Data viewport =====
        const dataFrame  = el("div", { class: "ctrl ued-data-frame" });
        const scrollData = el("div", { class: "ctrl ued-scroll-data" });
        const scrollThumb = el("div", { class: "ued-scroll-data-thumb" });
        scrollData.appendChild(scrollThumb);
        const scrollWidth  = el("div", { class: "ctrl ued-scroll-width" });
        stg.appendChild(dataFrame);
        stg.appendChild(scrollData);
        stg.appendChild(scrollWidth);

        // ===== Right toolbar =====
        function mkToolBtn(cls, x, y, title, handler) {
            const b = el("button", {
                class: "ctrl ued-tool " + cls,
                style: "left:" + x + "px;top:" + y + "px;",
                title: title,
                onclick: handler,
            });
            stg.appendChild(b);
            return b;
        }
        // CmdShowWave (752, 328, 40×40) — Visible=False by default in .frm.
        // Toggling it on reveals the per-row WaveLeft/WaveRight/WaveHint
        // recording buttons (also Visible=False in their .frm template).
        let showWave = false;
        const cmdShowWave = el("button", {
            class: "ctrl ued-show-wave",
            title: "הצג כפתורי הקלטה",
            onclick: function () {
                showWave = !showWave;
                cmdShowWave.classList.toggle("on", showWave);
                renderRows();
            },
        });
        stg.appendChild(cmdShowWave);

        mkToolBtn("ued-add",  752, 120, "הוסף שורה",  function () {
            if (!currentEdit) return;
            const blank = {};
            currentEdit.cols.forEach(function (c) { blank[c] = ""; });
            currentEdit.items.push(blank);
            currentEdit.dirty = true;
            rowOffset = Math.max(0, currentEdit.items.length - ROWS_VISIBLE);
            renderRows();
        });
        mkToolBtn("ued-del",  752, 160, "מחק שורה",  function () {
            if (!currentEdit) return;
            const r = currentEdit.selectedRow;
            if (r == null) { alert("בחר שורה תחילה (לחיצה על מספר השורה)."); return; }
            if (!confirm("למחוק את שורה " + (r + 1) + "?")) return;
            currentEdit.items.splice(r, 1);
            currentEdit.dirty = true;
            currentEdit.selectedRow = null;
            renderRows();
        });
        mkToolBtn("ued-up",   752, 224, "הזז למעלה", function () { moveLine(-1); });
        mkToolBtn("ued-down", 752, 264, "הזז למטה",  function () { moveLine(+1); });
        function moveLine(dir) {
            if (!currentEdit) return;
            const r = currentEdit.selectedRow;
            if (r == null) { alert("בחר שורה תחילה."); return; }
            const t = r + dir;
            if (t < 0 || t >= currentEdit.items.length) return;
            const tmp = currentEdit.items[r];
            currentEdit.items[r] = currentEdit.items[t];
            currentEdit.items[t] = tmp;
            currentEdit.selectedRow = t;
            currentEdit.dirty = true;
            renderRows();
        }
        // CmdAdv / CmdSetDefaults: pull up overlay-revert.
        // CmdAdv (742, 344, 55×55) — original CmdAdv_Click hides itself and
        // reveals the advanced toggles: CmdShowWave, CmdShowHint, CmdShowPic,
        // CmdCoteret, ComboRama, CmdDaf. We only surface CmdShowWave for now
        // (the others map to features we haven't implemented yet).
        const cmdAdv = el("button", {
            class: "ctrl ued-adv",
            title: "מצב מתקדם",
            onclick: function () {
                stg.classList.add("adv-on");
                cmdAdv.style.display = "none";    // CmdAdv.Visible = False
            },
        });
        stg.appendChild(cmdAdv);

        function loadEditFor(unitId) {
            const u = allUnits.find(function (x) { return x.id === unitId; });
            if (!u) return;
            const cols  = (u.data && u.data.columns) || [];
            const items = ((u.data && u.data.items)  || []).map(function (r) {
                return Object.assign({}, r);
            });
            currentEdit = {
                id: unitId, name: u.name, subject: u.category || "",
                cols: cols, items: items,
                dirty: false, selectedRow: null,
                _isNew: !!u._isNew,
            };
            rowOffset = 0;
            unitName.value   = currentEdit.name;
            subjectInp.value = currentEdit.subject;
            unitPicker.value = String(unitId);
            renderRows();
        }

        // Build one Wave button (WaveLeft / WaveRight / WaveHint per the
        // original .frm). Starts in the "no recording" state; if a blob is
        // already in IndexedDB, the button updates to the "exists" state.
        // Left-click  → record into <key>; right-click → playback.
        function addWaveButton(row, absIdx, side, x, y, caption) {
            const key = HND.recordingStore.keyFor(appId, currentEdit.id, absIdx, side);
            const btn = el("button", {
                class: "ctrl ued-wave wave-" + side.toLowerCase(),
                title: "הקלט " + (side === "Left" ? "תרגום" :
                                  side === "Right" ? "מקור" : "רמז"),
                style: "left:" + x + "px; top:" + y + "px;",
                "data-debug-id": "ued-wave:" + side + "#" + absIdx,
            });
            btn.classList.add("no-record");
            HND.recordingStore.has(key).then(function (exists) {
                btn.classList.remove("no-record");
                btn.classList.add(exists ? "has-record" : "no-record");
            }).catch(function () { /* leave default */ });
            btn.addEventListener("click", function (ev) {
                ev.stopPropagation();   // don't bubble to row select
                HND.recordWave(key, caption.slice(0, 60)).then(function (blob) {
                    if (blob) {
                        btn.classList.remove("no-record");
                        btn.classList.add("has-record");
                    }
                });
            });
            btn.addEventListener("contextmenu", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                HND.recordingStore.has(key).then(function (exists) {
                    if (!exists) {
                        alert("עדיין לא הוקלט קובץ עבור שורה זו.");
                        return;
                    }
                    HND.playRecording(key);
                });
            });
            row.appendChild(btn);
        }

        function renderRows() {
            dataFrame.innerHTML = "";
            if (!currentEdit) {
                dataFrame.appendChild(el("div", { class: "ued-empty",
                    text: "בחר יחידה מהרשימה." }));
                renderScrollThumb();
                return;
            }
            const cols  = currentEdit.cols;
            const hintCol = cols[0] && cols[0] !== cols[1] && cols[0] !== cols[2] ? cols[0] : null;
            const leftCol  = cols[1] || cols[0];
            const rightCol = cols[2] || cols[0];

            const slice = currentEdit.items.slice(rowOffset, rowOffset + ROWS_VISIBLE);
            slice.forEach(function (item, i) {
                const absIdx = rowOffset + i;
                const row = el("div", {
                    class: "ued-data-row" +
                           (currentEdit.selectedRow === absIdx ? " sel" : "") +
                           (showWave ? " wave-on" : ""),
                    style: "top:" + (i * 100) + "px;",
                    onclick: function (e) {
                        // Only update selection on row-chrome clicks. If the
                        // click landed in an <input>, let it focus + type
                        // without us re-rendering and stealing focus.
                        if (e.target.tagName === "INPUT") {
                            currentEdit.selectedRow = absIdx;
                            // Selection class update without DOM rebuild.
                            Array.from(dataFrame.querySelectorAll(".ued-data-row"))
                                .forEach(function (r, j) {
                                    r.classList.toggle("sel", rowOffset + j === absIdx);
                                });
                            return;
                        }
                        currentEdit.selectedRow = absIdx;
                        renderRows();
                    },
                });
                // LblNumber at right end (".N") — original draws this in
                // RGB(20,100,0); we match in CSS.
                row.appendChild(el("span", {
                    class: "ued-lbl-num", text: "." + (absIdx + 1),
                }));
                // TextLeft (40,8,145×33) — translation
                const tLeft = el("input", {
                    class: "ued-text-left", type: "text",
                    value: item[leftCol] || "",
                    oninput: function () {
                        item[leftCol] = tLeft.value;
                        currentEdit.dirty = true;
                    },
                });
                row.appendChild(tLeft);
                // TextRight (400,8,113×33) — Hebrew source
                const tRight = el("input", {
                    class: "ued-text-right", type: "text",
                    value: item[rightCol] || "",
                    oninput: function () {
                        item[rightCol] = tRight.value;
                        currentEdit.dirty = true;
                    },
                });
                row.appendChild(tRight);
                // TextHint (152,56,401×33) — hint (only if a hint column exists)
                if (hintCol) {
                    const tHint = el("input", {
                        class: "ued-text-hint", type: "text",
                        value: item[hintCol] || "",
                        placeholder: "רמז",
                        oninput: function () {
                            item[hintCol] = tHint.value;
                            currentEdit.dirty = true;
                        },
                    });
                    row.appendChild(tHint);
                }
                // Per-row recording buttons — shown only when CmdShowWave is on.
                // Each loads its current icon state asynchronously based on
                // whether a recording exists in IndexedDB:
                //   no recording  → Record_Off.jpg
                //   recording set → Record_off2.jpg
                // Left-click  → opens recording modal, saves blob to store.
                // Right-click → playback of existing recording (no-op if none).
                if (showWave) {
                    addWaveButton(row, absIdx, "Left",  8, 8, item[leftCol]  || "");
                    addWaveButton(row, absIdx, "Right", 368, 8, item[rightCol] || "");
                    if (hintCol) {
                        addWaveButton(row, absIdx, "Hint", 120, 56, item[hintCol] || "");
                    }
                }
                dataFrame.appendChild(row);
            });
            renderScrollThumb();
        }

        function renderScrollThumb() {
            if (!currentEdit || !currentEdit.items.length) {
                scrollThumb.style.display = "none";
                return;
            }
            scrollThumb.style.display = "";
            const total = currentEdit.items.length;
            const trackH = 400 - 30;     // leave room for top/bot pad
            const thumbH = Math.max(20, trackH * Math.min(ROWS_VISIBLE, total) / total);
            const room   = trackH - thumbH;
            const maxOff = Math.max(0, total - ROWS_VISIBLE);
            const yPos   = maxOff > 0 ? (rowOffset / maxOff) * room : 0;
            scrollThumb.style.height = thumbH + "px";
            scrollThumb.style.top    = (15 + yPos) + "px";
        }

        // Wheel on the data frame scrolls one row per notch.
        dataFrame.addEventListener("wheel", function (ev) {
            if (!currentEdit) return;
            ev.preventDefault();
            const dir = ev.deltaY > 0 ? 1 : -1;
            const maxOff = Math.max(0, currentEdit.items.length - ROWS_VISIBLE);
            rowOffset = Math.max(0, Math.min(maxOff, rowOffset + dir));
            renderRows();
        }, { passive: false });
        // Drag the scroll thumb to seek.
        let dragStart = null;
        scrollData.addEventListener("mousedown", function (ev) {
            if (!currentEdit) return;
            const rect = scrollData.getBoundingClientRect();
            const scaleY = rect.height / 400;
            const ty = (ev.clientY - rect.top) / scaleY - 15;
            const total = currentEdit.items.length;
            const maxOff = Math.max(0, total - ROWS_VISIBLE);
            const trackH = 400 - 30;
            const thumbH = Math.max(20, trackH * Math.min(ROWS_VISIBLE, total) / total);
            const room = trackH - thumbH;
            rowOffset = Math.max(0, Math.min(maxOff,
                Math.round((ty - thumbH / 2) / room * maxOff)));
            renderRows();
            dragStart = { startY: ev.clientY, startOff: rowOffset, scaleY: scaleY };
        });
        window.addEventListener("mousemove", function (ev) {
            if (!dragStart || !currentEdit) return;
            const total = currentEdit.items.length;
            const maxOff = Math.max(0, total - ROWS_VISIBLE);
            const trackH = 400 - 30;
            const thumbH = Math.max(20, trackH * Math.min(ROWS_VISIBLE, total) / total);
            const room = trackH - thumbH;
            const dy = (ev.clientY - dragStart.startY) / dragStart.scaleY;
            rowOffset = Math.max(0, Math.min(maxOff,
                dragStart.startOff + Math.round(dy / room * maxOff)));
            renderRows();
        });
        window.addEventListener("mouseup", function () { dragStart = null; });

        function saveCurrent() {
            if (!currentEdit) return;
            const ov = HND.loadUnitOverrides(appId);
            // Preserve existing metadata (most importantly `isNew` for
            // localStorage-only units — without it, the unit would vanish
            // from the picker after save because _applyUnitOverrides only
            // appends entries flagged isNew).
            const prev = ov[currentEdit.id] || {};
            ov[currentEdit.id] = Object.assign({}, prev, {
                items:   currentEdit.items,
                name:    currentEdit.name,
                subject: currentEdit.subject,
            });
            HND.saveUnitOverrides(appId, ov);
            currentEdit.dirty = false;
            HND.loadUnits(appId).then(function (u) {
                allUnits = u;
                fillUnitPicker();
                alert("נשמר.");
            });
        }

        fillUnitPicker();
        if (unitIdFromRoute) loadEditFor(unitIdFromRoute);
        else if (allUnits.length) loadEditFor(allUnits[0].id);
    }

    // ============== Routing ==============
    function route() {
        const hash = location.hash || "";
        // Longest alternative first so `unit/5/match` doesn't get truncated to `unit/5`.
        const m = hash.match(/^#\/([A-Za-z]+)(?:\/(unit\/\d+\/\w+|unit\/\d+|units\?edit|units|students|lessons(?:\/\d+)?|calibration\/\d+(?:\/\d+)?))?/);
        if (!m) {
            window.location.href = "../index.html";
            return;
        }
        const wantApp = m[1];
        if (!HND.APPS[wantApp]) {
            window.location.href = "../index.html";
            return;
        }
        if (wantApp !== appId || !allUnits) {
            appId = wantApp;
            HND.loadUnits(appId).then(function (units) {
                allUnits = units;
                continueRoute(m[2]);
            }).catch(function (e) {
                root.innerHTML = '<div class="error">שגיאה בטעינת נתונים: ' + escapeHtml(e.message) + "</div>";
            });
            return;
        }
        continueRoute(m[2]);
    }
    function continueRoute(rest) {
        if (!rest) { showMain(); return; }
        if (rest === "units")        { showUnitList(false); return; }
        if (rest === "units?edit")   { showUnitList(true);  return; }
        if (rest === "students")     { showStudentManager(); return; }
        if (rest.indexOf("lessons") === 0) {
            const lm = rest.match(/^lessons\/(\d+)$/);
            showLessonEditor(lm ? parseInt(lm[1], 10) : null);
            return;
        }
        if (rest.indexOf("calibration") === 0) {
            const cm = rest.match(/^calibration\/(\d+)(?:\/(\d+))?$/);
            if (cm) {
                showCalibrationForm(
                    parseInt(cm[1], 10),
                    cm[2] != null ? parseInt(cm[2], 10) : 0
                );
            }
            return;
        }
        const um = rest.match(/^unit\/(\d+)(?:\/(\w+))?/);
        if (!um) { showMain(); return; }
        const unitId = parseInt(um[1], 10);
        const unit = allUnits.find(function (u) { return u.id === unitId; });
        if (!unit) { showUnitList(); return; }
        const action = um[2];
        if (!action || action === "games") { showGameMenu(unit); return; }
        showGame(unit, action);
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    window.addEventListener("hashchange", route);
    route();
})();
