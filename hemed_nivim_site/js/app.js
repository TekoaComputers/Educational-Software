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
        stg.appendChild(editLes);
    }

    // ============== Screen: Unit list (parchment scroll) ==============
    // Original ReLoadForm: group units by UnitSubject (filtered by user's
    // UserRama), show subject header rows in navy 24pt, then unit names
    // numbered ".N" in green 20pt. ScoreList sits to the left in sync,
    // blank for headers, "Str(score)" for units.
    function showUnitList() {
        HND.log("screen", "unit-list", "app=" + appId, "units=" + allUnits.length);
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
    }
    // Single score per unit row (average of available per-game bests) —
    // mirrors the original calcAllScore output ("Str(AllScores(unitId))").
    function bestScoreFor(unit) {
        const games = ["match", "american", "connect", "hakira", "apple", "hatamaplus", "haklada"];
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

        // 9 kora signs hanging on the tree.
        KORA_SLOTS.forEach(function (slot, i) {
            const sign = document.createElement("button");
            sign.className = "ctrl game-sign k" + i;
            // Index 0 has different geometry per .frm.
            if (i === 0) {
                sign.style.left = "408px"; sign.style.width = "252px";
            } else {
                sign.style.left = "368px"; sign.style.width = "334px";
            }
            sign.style.top = (96 + 54 * i) + "px";
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
                moveGoatTo(96 + 54 * i);
            });
            sign.addEventListener("mouseleave", function () {
                preview.classList.remove("visible");
            });
            sign.addEventListener("click", function () {
                HND.log("click", "game-menu pick", "slot=" + i, "game=" + slot.game,
                        "mode=" + (slot.title || "default"),
                        "unit=" + unit.id, "best=" + (p ? p.best + "%" : "—"));
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
    }

    // ============== Routing ==============
    function route() {
        const hash = location.hash || "";
        // Longest alternative first so `unit/5/match` doesn't get truncated to `unit/5`.
        const m = hash.match(/^#\/([A-Za-z]+)(?:\/(unit\/\d+\/\w+|unit\/\d+|units))?/);
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
        if (rest === "units") { showUnitList(); return; }
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
