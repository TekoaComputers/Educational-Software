// Faithful renderer for parsed VB6 .frm layouts.
// - Walks the full control tree (handles nested controls inside PictureBox
//   / Frame containers — Dvash Sst, for example, nests its lamps + exit
//   inside Picture1).
// - Uses each screen's background image natural size as the design canvas
//   when available, so the BG isn't distorted by aspect-ratio mismatch.
// - Scales the stage to fit the viewport while preserving aspect ratio.

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (v != null) node.setAttribute(k, v);
    }
    for (const c of children) {
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
}

// Map a parsed control to its semantic action. `appId` is passed so we can
// honor per-app quirks — e.g., Yeled has NO CmdExit; its btnSeret(Index=2)
// fires Ezia (the exit routine) per Yeled/Sst.frm btnSeret_Click.
function actionFor(ctrl, appId) {
    const name = ctrl.name;
    const idx = ctrl.props.Index;
    // btnIcon = start the activity (Sst.btnIcon_Click → PutGFile + StartGames).
    // btnLamp = show the score board for a previously-played activity
    //   (Sst.btnLamp_Click → PutGFile + getscorefile + niko). Separate actions.
    // KolKoreB Sst.btnLamp_Click: getscorefile(i) where i = 0 or 1 — looks
    // up the score for slot cHos+i*7 (not for the lamp's own index). Route
    // through a KolKoreB-specific action so handleAction can resolve the
    // real slot via state.kkb_cHos.
    if (appId === "KolKoreB" && name === "btnLamp") return `kkb:score:${idx}`;
    if (name === "btnLamp")   return `score:${idx + 1}`;
    // KolKoreB's Sst.btnIcon_Click does NOT start the game — it's a PREVIEW
    // step: paints the current selection (temC sprite), restores the
    // previous (tem sprite), and loads the first-stage picture into both
    // star(0) (slot cHos) and star(1) (slot cHos+7). The actual play
    // trigger is star_Click, which calls PutGFile + StartGames. Mirror
    // that two-step UI here (1:1 with KolKoreB/Sst.frm:990-1010).
    if (appId === "KolKoreB" && name === "btnIcon") return `kkb:pick:${idx}`;
    if (appId === "KolKoreB" && name === "star")    return `kkb:start:${idx}`;
    // KolKoreB mini button (top-right, position 590,0) — Sst.frm mini_Click
    // sets Sst.Visible = False / Hsst.Visible = True. Hsst is the Hidy
    // minimize stub; on the web port we have no minimize, so log + no-op
    // (same treatment as KolKoreC/D btnexi(0/1) for the Hidy form).
    if (appId === "KolKoreB" && name === "mini")    return "kkb:mini";
    if (name === "btnIcon")   return `maslul:${idx + 1}`;
    // Games3 hak inspect overlay (Picture22): wa[0..4] = audio/record buttons,
    // dif[0/1] = prev/next hotspot navigation. wa[5] is a decorative warning
    // indicator with no click handler in the original.
    if (name === "wa")         return `wa:${idx}`;
    if (name === "dif")        return `dif:${idx}`;
    if (name === "btnHofshi") return "hofshi";
    if (name === "btnSeret") {
        if (appId === "Yeled" && idx === 2) return "exit";
        return idx != null ? `seret:${idx}` : "seret";
    }
    if (name === "CmdMashal") return "mashal";
    if (name === "CmdExit" || name === "BtnExit") return "exit";
    if (name === "Icon_s")    return `rama:${idx + 1}`;
    if (name === "CmdDvash")  return "open:main";
    if (name === "CmdCat")    return "open:catalog";
    if (name === "Icons")     return `catalog:${idx}`;
    // picexi is the back-arrow used on every Games*.frm and other game forms.
    if (name === "picexi")    return "back";
    // act1 are control buttons on game forms — VB6 control array, indices
    // are non-contiguous (0=replay/startgame, 1=audio, 4=exit). We pass
    // through the raw index so the handler can dispatch correctly.
    if (name === "act1")      return `act1:${idx}`;
    // Shirim / Shirim&Meshalim song-book navigation (BookIndex/OpenPage on
    // Sst.frm). SelectZ tabs sit on top of BookIndex.Picture; the high
    // indices (Shirim: 10/11/12, S&M: 20/22/12) are Exit/Help/Credit.
    // Treat any SelectZ as a generic `book:select:N` and let the bundle
    // map per-app special indices, since the boundaries differ.
    if (name === "SelectZ")   return `book:select:${idx}`;
    if (name === "ShowName" || name === "ShowMasNum") return `book:start:${idx}`;
    if (name === "ShowNikod")  return `book:score:${idx}`;
    if (name === "ExitPage")   return "book:close";
    // Ivrit Sst.frm: activ(0..6) on Picture2 (song picker) and bac on
    // Picture1 (activity grid). activ_Click dispatches per-index in the
    // original; bac_Click toggles Picture1.Visible / picture2.Visible.
    if (name === "activ")      return `activ:${idx}`;
    if (name === "bac")        return "ivrit:back";
    if (name === "cmdexit")    return "exit";
    // Ivrit Sst.frm Credit_Click: loads CreditPic.Picture = credit.jpg,
    // CreditPic.Visible = True (full-screen credit banner). CreditPic_Click
    // hides it again. Both are Ivrit-only — no other app has these controls.
    if (appId === "Ivrit" && name === "Credit")    return "credit:show";
    if (appId === "Ivrit" && name === "CreditPic") return "credit:hide";
    // Heshbon Sst.hyju_Click → Ezia. hyju is a small "power off" Label
    // tucked at the top-right of the form. Its tooltip is "כיבוי" (shutdown).
    if (name === "hyju")       return "exit";
    // Heshbon Sst.Picture2_Click → start.Visible=True / Sst.Visible=False —
    // launches the Lmath ladybug-math mini-game (Lmath/start.frm). Scope to
    // Heshbon since Dvash/Ivrit also have a generic Picture2 control with
    // unrelated semantics.
    if (name === "Picture2" && appId === "Heshbon") return "lmath:start";
    // Sst.mahak_Click → MsgBox confirm → ResetKlali (wipe scores) → Lampas.
    // Visible only when Lampas finds at least one saved activity.
    if (name === "mahak")      return "reset";
    // Heshbon Sst.avi_Click: plays \avi\_<rama><idx+1>.avi. One label per
    // path tile (5 of them); idx maps to btnIcon idx.
    if (name === "avi")        return `avi:${idx}`;
    // btnexi behavior is per-app:
    //   KolKoreB Sst.btnexi_Click: Ezia (exit) unconditionally — only
    //     btnexi(0) exists in the .frm and it's the small "X" at top-right
    //     (xsst.bmp). Earlier the port misrouted this through the KolKoreC/D
    //     Hidy stub and the button silently did nothing (issue #23).
    //   KolKoreC/D Sst.btnexi_Click: If Index = 2 Then Ezia — only btnexi(2)
    //     exits; btnexi(0/1) flip to the Hidy minimize form (no-op on web).
    if (name === "btnexi") {
        if (appId === "KolKoreB") return "exit";
        if (idx === 2) return "exit";
        return `btnexi:${idx}`;
    }
    // Kesem editor — control names that only exist on its Main / Chgames /
    // Gzira / Maslul / Expo forms. Gate on appId so the generic names
    // (`menu`, `del`, `choice`) don't accidentally fire on other apps.
    if (appId === "Kesem") {
        // Main.frm menu(0..4) — index-coded mode buttons:
        //   0 = ChGames (play/test current page with chosen game-type)
        //   1 = Gzira (hotspot rect editor)
        //   2 = Gr_Edit (paint — out of scope on web; logs and no-ops)
        //   3 = Print  4 = New picture
        if (name === "menu")    return `kesem:menu:${idx}`;
        // Main.frm del(0..3) — picture-row actions on the album list:
        //   0 = ?  1 = rename  2 = accept  3 = delete  (Main.frm del_Click)
        if (name === "del")     return `kesem:del:${idx}`;
        if (name === "choice")  return "kesem:choice";
        if (name === "ImpOle")  return "kesem:import";
        if (name === "endof")   return "kesem:back";
        if (name === "exit")    return "exit";
        if (name === "lbHelp")  return "kesem:help";
        if (name === "Up_DN")   return `kesem:nav:${idx}`;
        // Main.frm Picture1 (inside Spic1) is the large picture-preview
        // area — clicking it opens ChGames in the original (per Main.frm
        // Picture1_Change handler chain).
        // Chgames.frm controls — game-type picker. ChG(0..4) per the
        // .frm Form_Load Tag values & ChG_Click select Game_Number 3,1,2,4,5.
        // butt_list(2)=OK commits; Ed_But(0..2) edit/rename/delete cutout.
        if (name === "ChG")       return `kesem:chg:${idx}`;
        if (name === "Ed_But")    return `kesem:edb:${idx}`;
        if (name === "butt_list") return `kesem:blist:${idx}`;
        // Note: Chgames.Label1_Click → Butt_list_Click 3 (back to menu)
        // is wired manually in wireKesemChgames so it doesn't promote
        // EVERY Label1 across editor screens (Maslul/Gzira also have a
        // Label1) into a hotspot.
        // Gzira.frm buttons:
        //   CmdShow="גלה הכל" — restore all hidden Label1s (Form_Unload).
        //   btnED(0)=Wav1 / btnED(1)=Wav2 — record prompt / affirmation audio.
        if (name === "CmdShow")   return "kesem:gzira:show-all";
        if (name === "btnED")     return `kesem:gzira:wav:${idx}`;
        // Maslul.frm controls:
        //   Option1(0..6) — game-type radio per Option1_Click (Gnu = 3/1/2/4/5/22/66).
        //   Command3 = "אישור" (Commit → List2_DblClick equivalent).
        //   btnBitul = "ביטול שורה" (Remove from List3).
        //   btnReturn = save & exit. video(0/1)/btnSeret(0/1)/btnDelFilm(0/1)
        //   = intro / outro video pickers + clear.
        //   expo1(0/1) = open Expo / Impo.
        if (name === "Option1")    return `kesem:maslul:opt:${idx}`;
        if (name === "Command3")   return "kesem:maslul:commit";
        // Start_ma.frm controls — Command2(0..5) per Command2_Click:
        //   0=Edit  1=New  2=Delete  3=Rename  4=(unused)  5=Return
        // Label4(0..5) and ChBox(0..5) are the 6 favorite slots.
        if (name === "Command2")   return `kesem:smaslul:cmd:${idx}`;
        if (name === "Label4")     return `kesem:smaslul:fav:${idx}`;
        if (name === "ChBox")      return `kesem:smaslul:fav:${idx}`;
        // Expo.frm — publish/export controls.
        //   Command1 = "הוסף" (add selected RAS to export set)
        //   Command3 = "נקה נבחר" (clear selected)
        //   nikoy = "נקה הכל" (clear all)
        //   transmit = "צור תיקיית העברה" (write the export bundle)
        if (name === "Command1")   return "kesem:expo:add";
        if (name === "Command3")   return "kesem:expo:clear-sel";
        if (name === "nikoy")      return "kesem:expo:clear-all";
        if (name === "transmit")   return "kesem:expo:transmit";
        if (name === "btnBitul")   return "kesem:maslul:bitul";
        if (name === "btnReturn")  return "kesem:maslul:return";
        if (name === "btnDelFilm") return `kesem:maslul:delfilm:${idx}`;
        if (name === "video")      return `kesem:maslul:video:${idx}`;
        if (name === "btnSeret")   return `kesem:maslul:seret:${idx}`;
        if (name === "expo1")      return `kesem:maslul:expo:${idx}`;
    }
    return null;
}

function isContainer(ctrl) {
    // VB6 PictureBox / Frame can host child controls. We render them as
    // positioned divs so their children inherit absolute positioning.
    return ctrl.children && ctrl.children.length > 0;
}

function backgroundUrl(screenConf, rama, config) {
    const bg = screenConf.background;
    if (!bg) return null;
    // Clamp rama for BG lookup so apps with fewer BG images don't 404.
    // (Brahot only ships brahot1/2.png even though btnHofshi sets rama=4.)
    let effective = rama;
    if (config && config.bgRamaMax && effective > config.bgRamaMax) {
        effective = config.bgRamaMax;
    }
    // Object form lets apps map ramas to arbitrary filenames when the
    // per-rama BG names don't fit the `{rama}` template (e.g. KolKoreB
    // pairs rama1 → kol2.png and rama2 → kol1.png).
    if (typeof bg === "object") return bg[String(effective)] || bg[effective] || null;
    if (bg.indexOf("{rama}") === -1) return bg;
    return bg.replace("{rama}", String(effective));
}

// Convert a control's twip Left/Top/Width/Height into design pixels using the
// form's twip→pixel ratio (which is derived from the design canvas size).
function twipsToPx(twip, twipsExtent, pxExtent) {
    return (twip * pxExtent) / twipsExtent;
}

function posStyle(ctrl, scale) {
    const p = ctrl.props;
    return {
        position: "absolute",
        left: `${(p.Left ?? 0) * scale.x}px`,
        top: `${(p.Top ?? 0) * scale.y}px`,
        width: `${(p.Width ?? 0) * scale.x}px`,
        height: `${(p.Height ?? 0) * scale.y}px`,
    };
}

// Look up an image asset for this control from the screen-level `images` map.
// Returns null when there's no image bound.
// Look up the act1 button image for the current screen. Apps can declare
// either a flat `act1Images: { 0: {...}, 1: {...} }` (legacy) or a per-game
// map `act1Images: { default: {...}, game3: {...} }`.
function lookupAct1Image(state, idx) {
    const cfg = state.config.act1Images;
    if (!cfg) return null;
    const screen = state.currentScreen;
    if (cfg[screen] && cfg[screen][idx]) return cfg[screen][idx];
    if (cfg.default && cfg.default[idx]) return cfg.default[idx];
    if (cfg[idx]) return cfg[idx];   // flat-map back-compat
    return null;
}

function imageFor(ctrl, screenConf, state) {
    return lookupConfImage(ctrl, screenConf, "images", state);
}

// Apply the same {rama} substitution backgroundUrl uses, so per-rama image
// sets (e.g. EnglishA `tem_<i><rama>.png`) can be declared with a single
// template string per entry. Honors bgRamaMax for apps that ship fewer
// images than ramas (clamp instead of 404).
function applyRamaSub(s, state) {
    if (typeof s !== "string" || s.indexOf("{rama}") === -1) return s;
    let effective = state.rama;
    const cfg = state.config;
    if (cfg && cfg.bgRamaMax && effective > cfg.bgRamaMax) {
        effective = cfg.bgRamaMax;
    }
    return s.replace(/\{rama\}/g, String(effective));
}

// VB6 third-party PictureBox (Dvash.CmdPlus) has Picture, MovePic, MaskPicture.
// We model them as three parallel config maps:
//   screens.<id>.images       — idle Picture
//   screens.<id>.imagesHover  — hover MovePic
//   screens.<id>.masks        — MaskPicture (luminance mask: white=keep, black=cut)
function lookupConfImage(ctrl, screenConf, key, state) {
    const tbl = screenConf && screenConf[key];
    if (!tbl) return null;
    const entry = tbl[ctrl.name];
    if (!entry) return null;
    if (typeof entry === "string") return applyRamaSub(entry, state);
    const idx = ctrl.props.Index;
    if (Array.isArray(entry) && idx != null) return applyRamaSub(entry[idx] || null, state);
    if (typeof entry === "object" && idx != null) return applyRamaSub(entry[idx] || null, state);
    return null;
}

function buildSubtree(ctrl, scale, state, screenConf) {
    const action = actionFor(ctrl, state.config.id);
    const isHotspot = action != null;
    const isTip = ctrl.name === "lbtip";
    const hasKids = isContainer(ctrl);
    const imgSrc = imageFor(ctrl, screenConf, state);
    // Respect the original .frm Visible property. VB6 `Visible = 0 'False`
    // means the control is hidden at design time. Game logic later may toggle
    // it on (e.g. Games2 Picture2 only appears when Choice_Pic populates it).
    const visibleProp = ctrl.props.Visible;
    const startsHidden = visibleProp === 0 || visibleProp === false;

    const className =
        "frm-ctrl" +
        (isHotspot ? " frm-hotspot" : "") +
        (isTip ? " frm-tip" : "") +
        (hasKids ? " frm-container" : "") +
        (imgSrc ? " frm-has-image" : "") +
        ` frm-ctrl--${ctrl.name}`;

    const node = el(isHotspot ? "button" : "div", {
        class: className,
        dataset: {
            name: ctrl.name,
            index: ctrl.props.Index != null ? String(ctrl.props.Index) : "",
            action: action || "",
        },
        style: posStyle(ctrl, scale),
        type: isHotspot ? "button" : null,
    });

    if (action) {
        node.addEventListener("click", () => {
            // Single instrumentation point for every VB6 control click — gives
            // a unique, copy-pasteable trace line per click so we can pinpoint
            // bug reports. Format:
            //   [kesem] CLICK <screen> <ctrlName>[<idx>] action=<action>
            const idxTag = ctrl.props.Index != null ? "[" + ctrl.props.Index + "]" : "";
            console.log("[kesem] CLICK", state.currentScreen,
                        ctrl.name + idxTag, "action=" + action);
            onHotspot(state, action, ctrl);
        });
        // Tooltip system disabled — the original lbtip controls are positioned
        // at fixed spots in the form layout (NOT near the hover target). Showing
        // them on hover made tips appear in unexpected places. Re-enable per
        // hovered control later when per-control tooltip mapping is wired.
    }
    if (isTip) {
        const idx = ctrl.props.Index ?? state.lbtips.size;
        state.lbtips.set(idx, node);
        node.style.opacity = "0";
        node.style.pointerEvents = "none";
    }

    // VB6 lightweight Labels (`VB.Label`) without a Click handler don't
    // intercept mouse events from controls beneath — they're drawn directly
    // on the form and the hit-test passes through. Our default-rendered
    // <div> blocks clicks via z-order, which is why a leftover placeholder
    // like English Sst.frm's `Label1` (at design coords overlapping BtnExit)
    // ate clicks meant for the exit button. Make non-interactive Labels
    // click-through. Tooltips are handled above and stay click-through too.
    if (ctrl.type === "VB.Label" && !isHotspot && !isTip) {
        node.style.pointerEvents = "none";
    }

    // Honor design-time Visible=False. lbtip controls have their own opacity
    // handling above so we skip them here.
    if (startsHidden && !isTip) {
        node.style.display = "none";
    }

    // VB6 ToolTipText (set in the .frm header) maps directly to the
    // browser's native title attribute — hover over a control to see
    // its tooltip. The original ALSO supports dynamic tooltips via
    // lbtip + MouseMove handlers; per-app wireup can override `title`
    // later for that pattern.
    if (ctrl.props.ToolTipText) {
        node.title = ctrl.props.ToolTipText;
    }

    if (imgSrc) {
        // VB6 PictureBox draws Picture at natural size at (0,0). When
        // AutoSize=-1 (True), the box resizes to the image's natural dims
        // when LoadPicture runs at runtime. Mirror that here: load the image,
        // and if AutoSize is set, snap the control's box to the image dims.
        const img = el("img", { class: "frm-img", src: imgSrc, alt: "" });
        node.appendChild(img);
        if (ctrl.props.AutoSize === -1 || ctrl.props.AutoSize === true) {
            const applyNatural = function () {
                if (!img.naturalWidth || !img.naturalHeight) return;
                node.style.width  = img.naturalWidth  + "px";
                node.style.height = img.naturalHeight + "px";
            };
            if (img.complete) applyNatural();
            else img.addEventListener("load", applyNatural);
        }

        // Dvash.CmdPlus (and similar third-party controls) used MovePic to
        // swap the Picture on hover and MaskPicture for transparency. We
        // model these via screens.<id>.imagesHover and screens.<id>.masks.
        const hoverSrc = lookupConfImage(ctrl, screenConf, "imagesHover", state);
        if (hoverSrc) {
            node.addEventListener("mouseenter", function () { img.src = hoverSrc; });
            node.addEventListener("mouseleave", function () { img.src = imgSrc; });
        }
        const maskSrc = lookupConfImage(ctrl, screenConf, "masks", state);
        if (maskSrc) {
            // White pixels in the mask remain opaque, black pixels become
            // transparent — same convention CmdPlus.MaskPicture used.
            const maskUrl = "url('" + maskSrc + "')";
            img.style.maskImage = maskUrl;
            img.style.maskMode = "luminance";
            img.style.maskSize = "100% 100%";
            img.style.maskRepeat = "no-repeat";
            img.style.webkitMaskImage = maskUrl;
            img.style.webkitMaskSize = "100% 100%";
            img.style.webkitMaskRepeat = "no-repeat";
        }
    }

    // act1 buttons on game forms. Sprite + dispatch differ per game type:
    //   game1/2/4 → sanb1/sana1/x1, act1(0)=replay-question, act1(1)=replay-instruction
    //   game3 → nex1/hak1/sev1/sana1/x1, act1(0)=NEXT-STAGE, etc.
    if (ctrl.name === "act1") {
        const a1 = lookupAct1Image(state, ctrl.props.Index);
        if (a1 && a1.idle) {
            const img = el("img", { class: "frm-img act1-img", src: a1.idle, alt: "" });
            node.appendChild(img);
            if (a1.hover) {
                node.addEventListener("mouseenter", function () { img.src = a1.hover; });
                node.addEventListener("mouseleave", function () { img.src = a1.idle; });
            }
        }
    }

    if (hasKids) {
        for (const child of ctrl.children) {
            node.appendChild(buildSubtree(child, scale, state, screenConf));
        }
    }

    return node;
}

function applyTooltips(state) {
    const r = state.rama;
    const tips = state.tafrosh?.ramas?.[String(r)] || state.tafrosh?.ramas?.["0"] || [];
    const get = (i) => (tips[i] || "").trim();
    setTip(state, 0, get(4));
    const base = r === 1 ? 11 : 17;
    const lampOrder = [12, 11, 10, 15, 14, 13];
    for (let i = 0; i < 6; i++) setTip(state, lampOrder[i], get(base + i));
    setTip(state, 1, get(6));
    setTip(state, 2, get(4));
    setTip(state, 3, get(0));
    setTip(state, 4, get(9));
    setTip(state, 5, get(10));
}

function setTip(state, idx, text) {
    if (!text) return;
    const el = state.lbtips.get(idx);
    if (el) el.textContent = text;
}

// The forms in this project were designed at 96 DPI (15 twips per pixel).
// Confirmed by Brahot/Hagim/Yeled/Dvash DpiFix.bas: FixDpi exits when
// Screen.TwipsPerPixelX == 15, so the authored coords match a 15-twips/px
// runtime. We use this constant for all coordinate conversions.
const TWIPS_PER_PX = 15;

function nativeStageSize(layout) {
    // Form's native display size at 96 DPI.
    const cw = layout.design.client_w_twips || 11628;
    const ch = layout.design.client_h_twips || 8568;
    return {
        width: Math.round(cw / TWIPS_PER_PX),
        height: Math.round(ch / TWIPS_PER_PX),
    };
}

function renderScreen(state) {
    const screenId = state.currentScreen;
    const screenConf = state.config.screens[screenId];
    const layout = state.layouts[screenId];
    if (!layout) { console.error("Missing layout for screen", screenId); return; }

    state.stage.innerHTML = "";
    state.lbtips = new Map();

    // Stage = the BG image's visible canvas size as declared in the screen
    // config. This matches what the original CD-era VB6 form actually showed
    // on a 640x480 screen after maximize-clip. Controls computed at twips/15
    // (96 DPI native) land at their correct positions inside this region;
    // anything that would have been off-screen on the original gets clipped
    // by the stage's overflow:hidden.
    const stageSize = screenConf.designSize
        ? { width: screenConf.designSize[0], height: screenConf.designSize[1] }
        : nativeStageSize(layout);
    state.designSize = stageSize;
    state.stage.style.width  = `${stageSize.width}px`;
    state.stage.style.height = `${stageSize.height}px`;

    const bgSrc = backgroundUrl(screenConf, state.rama, state.config);
    if (bgSrc) {
        // Default: BG fills the stage exactly (config'd designSize matches
        // BG natural). Some apps (KolKoreC/D) instead use a small banner
        // strip drawn at top-left over a solid BackColor — declare
        // `bgMode: "native"` in the screen config to honor that layout.
        const bgClass = screenConf.bgMode === "native" ? "frm-bg frm-bg--native" : "frm-bg";
        const bg = el("img", { class: bgClass, src: bgSrc, alt: "" });
        state.stage.appendChild(bg);
        state.bg = bg;
    } else {
        state.bg = null;
    }

    // Constant 96 DPI conversion for every control on every form.
    const scale = { x: 1 / TWIPS_PER_PX, y: 1 / TWIPS_PER_PX };
    for (const ctrl of layout.children) {
        state.stage.appendChild(buildSubtree(ctrl, scale, state, screenConf));
    }

    applyTooltips(state);
    fitStage(state.wrap, stageSize.width, stageSize.height);
}

function onHotspot(state, action, ctrl) {
    if (action.startsWith("rama:")) {
        const r = parseInt(action.split(":")[1], 10);
        setRama(state, r);
        return;
    }
    if (action === "hofshi") {
        // Original btnHofshi_Click: rama = "4" — free-play mode.
        setRama(state, 4);
        return;
    }
    state.onAction(action, ctrl);
}

function fitStage(wrap, dw, dh) {
    const stage = wrap.querySelector(".frm-stage");
    if (!stage) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
        requestAnimationFrame(() => fitStage(wrap, dw, dh));
        return;
    }
    // Fill viewport while preserving aspect ratio — no cap.
    const scale = Math.min(rect.width / dw, rect.height / dh);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function setRama(state, rama) {
    state.rama = rama;
    const screenConf = state.config.screens[state.currentScreen];
    if (state.bg) {
        state.bg.src = backgroundUrl(screenConf, rama, state.config);
    }
    refreshRamaImages(state, screenConf);
    applyTooltips(state);
    // Per-app post-rama hook — lets the bundle re-run rama-conditional
    // layout fixes (EnglishC hides btnIcon 4/9, KolKoreA hides 5..11, etc.)
    // on every rama switch instead of only at the initial screen mount.
    if (typeof state.onRamaChange === "function") state.onRamaChange(state);
}

// Re-resolve every per-control image that uses the {rama} template against
// the new rama and patch the rendered <img>. Without this, apps whose
// btnIcon picture changes per rama (EnglishA/B/C, Heshbon, KolKoreA/C/D)
// keep showing the prior rama's thumbnails until the screen is re-mounted.
// Mirrors the original Sst.Icon_s_Click loop:
//     For i = 0 To N: btnIcon(i).Picture = LoadPicture(... & rama & ...)
function refreshRamaImages(state, screenConf) {
    const imgs = screenConf && screenConf.images;
    if (!imgs) return;
    Object.keys(imgs).forEach(function (name) {
        const entry = imgs[name];
        const ctrls = state.stage.querySelectorAll(`.frm-ctrl--${name}`);
        ctrls.forEach(function (el) {
            const idx = parseInt(el.dataset.index, 10);
            let raw = null;
            if (typeof entry === "string") raw = entry;
            else if (Array.isArray(entry) && !isNaN(idx)) raw = entry[idx];
            else if (typeof entry === "object" && !isNaN(idx)) raw = entry[idx];
            if (raw == null) return;
            const resolved = applyRamaSub(raw, state);
            if (typeof resolved !== "string" || resolved.indexOf("{rama}") !== -1) return;
            const img = el.querySelector("img.frm-img");
            if (img && img.src !== resolved && !img.src.endsWith(resolved)) {
                img.src = resolved;
            }
        });
    });
}

function showTipFor(state) {
    const tip = state.lbtips.get(0);
    if (!tip || !tip.textContent) return;
    tip.style.opacity = "1";
}

function hideTip(state) {
    const tip = state.lbtips.get(0);
    if (tip) tip.style.opacity = "0";
}

export function setScreen(state, screenId) {
    if (!state.config.screens[screenId]) {
        console.warn(`Unknown screen: ${screenId}`);
        return;
    }
    state.currentScreen = screenId;
    state.designSize = null;
    renderScreen(state);
    if (state._onScreenChange) state._onScreenChange(screenId);
}

export function renderApp(config, layouts, root, onAction, opts = {}) {
    root.innerHTML = "";
    const wrap = el("div", { class: "frm-wrap" });
    const stage = el("div", { class: "frm-stage" + (opts.debug ? " frm-stage--debug" : "") });
    wrap.appendChild(stage);
    root.appendChild(wrap);

    const state = {
        config,
        layouts,
        onAction,
        tafrosh: opts.tafrosh,
        paths: opts.paths,
        audioFiles: opts.audioFiles,
        videoFiles: opts.videoFiles,
        rama: opts.rama ?? config.defaultRama ?? 1,
        currentScreen: opts.screen ?? config.initialScreen,
        currentPath: null,
        currentStageIdx: 0,
        lbtips: new Map(),
        wrap,
        stage,
        bg: null,
        designSize: null,
    };

    renderScreen(state);

    const onResize = () => {
        if (state.designSize) fitStage(state.wrap, state.designSize.width, state.designSize.height);
    };
    window.addEventListener("resize", onResize, { passive: true });
    state._resize = onResize;
    return state;
}
