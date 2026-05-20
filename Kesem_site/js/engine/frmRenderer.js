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
    if (name === "btnLamp")   return `maslul:${idx + 1}`;
    if (name === "btnIcon")   return `maslul:${idx + 1}`;
    if (name === "btnHofshi") return "hofshi";
    if (name === "btnSeret") {
        if (appId === "Yeled" && idx === 2) return "exit";
        return idx != null ? `seret:${idx}` : "seret";
    }
    if (name === "CmdMashal") return "mashal";
    if (name === "CmdExit")   return "exit";
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
    if (bg.indexOf("{rama}") === -1) return bg;
    // Clamp rama for BG lookup so apps with fewer BG images don't 404.
    // (Brahot only ships brahot1/2.png even though btnHofshi sets rama=4.)
    let effective = rama;
    if (config && config.bgRamaMax && effective > config.bgRamaMax) {
        effective = config.bgRamaMax;
    }
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

function imageFor(ctrl, screenConf) {
    const imgs = screenConf && screenConf.images;
    if (!imgs) return null;
    const entry = imgs[ctrl.name];
    if (!entry) return null;
    if (typeof entry === "string") return entry;
    const idx = ctrl.props.Index;
    if (Array.isArray(entry) && idx != null) return entry[idx] || null;
    if (typeof entry === "object" && idx != null) return entry[idx] || null;
    return null;
}

function buildSubtree(ctrl, scale, state, screenConf) {
    const action = actionFor(ctrl, state.config.id);
    const isHotspot = action != null;
    const isTip = ctrl.name === "lbtip";
    const hasKids = isContainer(ctrl);
    const imgSrc = imageFor(ctrl, screenConf);
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

    // Honor design-time Visible=False. lbtip controls have their own opacity
    // handling above so we skip them here.
    if (startsHidden && !isTip) {
        node.style.display = "none";
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
        // BG fills the stage exactly (config'd designSize matches BG natural).
        const bg = el("img", { class: "frm-bg", src: bgSrc, alt: "" });
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
    if (state.bg) {
        state.bg.src = backgroundUrl(
            state.config.screens[state.currentScreen], rama, state.config);
    }
    applyTooltips(state);
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
