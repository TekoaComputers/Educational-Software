// Generic .frm walker for Mikraot. Mikraot has its own scaffold (START
// instead of Sst, MILON sub-engine, etc.) so we don't share Kesem_site's
// app-keyed renderer. Per-screen handlers in js/screens/<name>.js attach
// images and click behavior; this file only places controls.
//
// Coordinate system: control Left/Top/Width/Height are VB6 twips. The
// original runs at 96 DPI (Screen.TwipsPerPixelX = 15) so px = twips/15
// for forms without ScaleMode=Pixel. Forms with ScaleMode=3 carry their
// own ScaleWidth/Height (design pixels at 120-DPI authoring); the .frm
// parser already captured both in layout.design. MK.scaleFor (below)
// fans out:
//   - ScaleMode=None forms → scale (1, 1)  (twips/15 = actual px)
//   - ScaleMode=3 forms    → scale to fit 640×480 from the design canvas
(function () {
    const MK = (window.MK = window.MK || {});

    // Debug log — captured by main_site_assets/feedback.js too, so users
    // get a trail when they share a feedback issue.
    MK.log = function () {
        const args = ["[MK]"].concat(Array.prototype.slice.call(arguments));
        try { console.log.apply(console, args); } catch (e) {}
    };
    MK.warn = function () {
        const args = ["[MK]"].concat(Array.prototype.slice.call(arguments));
        try { console.warn.apply(console, args); } catch (e) {}
    };

    MK.TWIPS_PER_PX = 15;
    MK.STAGE_W = 640;
    MK.STAGE_H = 480;

    function twipsToPx(t) { return Math.round(t / MK.TWIPS_PER_PX); }

    // Place a control at its twips/15 (96-DPI runtime) position. We
    // IGNORE the `px` field from parse_frm — it was computed using each
    // form's own ScaleWidth ratio, which for ScaleMode=Pixel forms is
    // twips/12 (the 120-DPI authoring ratio). At runtime ALL VB6 Mikraot
    // forms render via the 96-DPI screen mode (ScrRes.ChangeScreenSettings
    // 640, 480 + DpiFix.bas's twips/15 short-circuit), so twips/15 is
    // the correct conversion. The `px` field is only kept for analysis;
    // the renderer must do the math itself. Matches CLAUDE.md's
    // "Coordinate system gotcha" note.
    MK.posStyle = function (ctrl, scale) {
        const s = scale || { x: 1, y: 1 };
        const p = ctrl.props || {};
        return {
            left:   twipsToPx(p.Left   || 0) * s.x + "px",
            top:    twipsToPx(p.Top    || 0) * s.y + "px",
            width:  twipsToPx(p.Width  || 0) * s.x + "px",
            height: twipsToPx(p.Height || 0) * s.y + "px",
        };
    };

    MK.el = function (tag, attrs, children) {
        const node = document.createElement(tag);
        if (attrs) for (const k in attrs) {
            const v = attrs[k];
            if (v == null) continue;
            if (k === "class") node.className = v;
            else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
            else if (k === "dataset") Object.assign(node.dataset, v);
            else if (k.startsWith("on") && typeof v === "function") {
                node.addEventListener(k.slice(2).toLowerCase(), v);
            } else {
                node.setAttribute(k, v);
            }
        }
        if (children) for (const c of children) {
            if (c == null) continue;
            node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        }
        return node;
    };

    // VB6 .frm declares controls earlier-first = drawn ON TOP. CSS DOM
    // stacks later = on top. Reverse the children list so original Z
    // order is preserved. See CLAUDE.md "Z-order is inverted."
    MK.iterateInZOrder = function (children, fn) {
        const list = (children || []).slice().reverse();
        list.forEach(fn);
    };

    // Find a control by name (and optional Index) in a layout subtree.
    MK.findCtrl = function (root, name, index) {
        if (!root) return null;
        const stack = [root];
        while (stack.length) {
            const n = stack.pop();
            if (n.name === name && (index == null || (n.props || {}).Index === index)) {
                return n;
            }
            for (const c of (n.children || [])) stack.push(c);
        }
        return null;
    };

    MK.fitStage = function (stage) {
        const w = window.innerWidth, h = window.innerHeight;
        const sw = parseInt(stage.dataset.stageW || MK.STAGE_W, 10);
        const sh = parseInt(stage.dataset.stageH || MK.STAGE_H, 10);
        const s = Math.min(w / sw, h / sh);
        stage.style.transform = "scale(" + s + ")";
    };

    // Global render token — bumped every time any screen calls
    // makeStage. Async chains (audio sequences, animation cycles) that
    // captured the token at start can check `MK.stale(myToken)` after
    // each await; if a new screen has rendered, they bail out so their
    // tail MK.play / setState calls don't fire from a screen that no
    // longer exists. Mirrors the source's Unload-form-cancels-pending-
    // sounds behavior (VB6's sndPlaySound stops on form Unload).
    let _renderToken = 0;
    MK.currentToken = function () { return _renderToken; };
    MK.stale = function (t) { return t !== _renderToken; };
    // Click handlers that initiate a new audio sequence should call this
    // FIRST, so any pending async chain from the previous-screen's
    // `activateIntroAudio` (still in a sleep / await) sees stale=true
    // before its tail MK.play fires from a screen the user has left.
    MK.bumpToken = function () { _renderToken += 1; };

    // Optional w/h to render this screen at a non-default canvas size.
    // The MILON popup is 317×377, KIVUN is 640×480 like the main forms.
    MK.makeStage = function (root, w, h) {
        _renderToken += 1;
        // Stop any audio still playing from the previous screen. Its
        // async chain's awaits resolve via the pause event, then their
        // `MK.stale(myToken)` check returns true → they bail before
        // firing any tail MK.play that would step on the new screen's
        // intro audio. Without this, coin/newchim from a previous
        // onCorrect can interrupt the next screen's BB007/KFP1 cue.
        if (typeof MK.cancelAudio === "function") MK.cancelAudio();
        const stage = document.createElement("div");
        stage.className = "stage";
        const sw = w || MK.STAGE_W, sh = h || MK.STAGE_H;
        stage.style.width  = sw + "px";
        stage.style.height = sh + "px";
        stage.dataset.stageW = sw;
        stage.dataset.stageH = sh;
        root.replaceChildren(stage);
        MK.fitStage(stage);
        MK.log("stage", sw + "x" + sh, "token=" + _renderToken);
        return stage;
    };

    // Per-form scale. Always 1:1 — controls are positioned at their
    // parsed `px` coords (twips/15 for ScaleMode=None forms, design-
    // pixel for ScaleMode=Pixel forms). Each screen renders at the
    // form's NATIVE design canvas; CSS transform on .stage fits the
    // whole canvas to the viewport. The BG image (if any) is stretched
    // via `background-size: 100% 100%` since the original VB6 form
    // scaled its Picture to the form's coord system the same way.
    MK.scaleFor = function (layout, stageW, stageH) {
        return { x: 1, y: 1 };
    };
    // Pick a stage size for a form.
    //   * Small popups (ClientWidth/15 < 500): use the form's own dims.
    //     That keeps misger (218×198), milon (317×377), sofer (376×376),
    //     tozaot small windows true to their authored modal sizes.
    //   * Full-screen forms (ClientWidth/15 ≥ 500): use 640×480 (the
    //     ChangeScreenSettings runtime), expanded only if a control
    //     overflows (e.g. GAMES1 btnReturn ends at x=649). Controls
    //     are positioned at raw twips/15 — see CLAUDE.md "Coordinate
    //     system gotcha" — so the BG image (also authored for the
    //     96-DPI 640×480 view) lines up with the hotspots.
    MK.stageSizeFor = function (layout) {
        const cw = (layout.props && layout.props.ClientWidth)  || 0;
        const ch = (layout.props && layout.props.ClientHeight) || 0;
        const formW = cw / 15, formH = ch / 15;
        // Walk children with proper nesting so we get the real bounding
        // box (a Frame's children are positioned relative to it).
        let maxR = 0, maxB = 0;
        function walk(c, offX, offY) {
            const p = c.props || {};
            const x = offX + (p.Left || 0) / 15;
            const y = offY + (p.Top  || 0) / 15;
            const w = (p.Width  || 0) / 15;
            const h = (p.Height || 0) / 15;
            if (x + w > maxR) maxR = x + w;
            if (y + h > maxB) maxB = y + h;
            (c.children || []).forEach(function (ch) { walk(ch, x, y); });
        }
        (layout.children || []).forEach(function (c) { walk(c, 0, 0); });
        if (formW > 0 && formW < 500) {
            return { w: Math.ceil(Math.max(formW, maxR)), h: Math.ceil(Math.max(formH, maxB)) };
        }
        return { w: Math.max(640, Math.ceil(maxR)), h: Math.max(480, Math.ceil(maxB)) };
    };

    window.addEventListener("resize", function () {
        const stage = document.querySelector("#app .stage");
        if (stage) MK.fitStage(stage);
    });

    // Generic form-renderer: walks `layout` in Z-order (reversed) and
    // applies per-control bindings. `bindings[ctrlName_index]` or
    // `bindings[ctrlName]` may declare:
    //   img:       url, applied as background-image
    //   onclick:   click handler
    //   text:      textContent for VB.Label
    //   visible:   force show (true) / hide (false)
    //   bg:        backgroundColor
    //   color:     foreground (for labels)
    //   fontSize:  px font size for labels
    //   build:     function(node, ctrl, scale) — custom override
    // Returns a refs map { ctrlName_index: node } for screen handlers
    // to manipulate after initial render.
    MK.renderForm = function (stage, layout, scale, bindings) {
        const refs = {};
        bindings = bindings || {};
        function walk(parent, children) {
            const reversed = (children || []).slice().reverse();
            reversed.forEach(function (ctrl) {
                const idx = ctrl.props && ctrl.props.Index;
                const key = idx != null ? ctrl.name + "_" + idx : ctrl.name;
                const bind = bindings[key] || bindings[ctrl.name] || {};
                if (bind.skip) return;
                if (bind.build) {
                    const node = bind.build(ctrl, scale, parent);
                    if (node) refs[key] = node;
                    return;
                }
                const tag = ctrl.type === "VB.Label" ? "div" :
                            ctrl.type === "VB.Shape" ? "div" :
                            (ctrl.props && ctrl.props.Index != null && (
                                ctrl.type === "VB.PictureBox" ||
                                ctrl.type === "Threed.SSCommand" ||
                                ctrl.type === "VB.CommandButton" ||
                                ctrl.type === "Threed.SSPanel"
                            )) ? "button" :
                            (ctrl.type === "VB.PictureBox" || ctrl.type === "VB.CommandButton" ||
                             ctrl.type === "Threed.SSCommand") ? "button" : "div";
                if (ctrl.type === "VB.Timer" || ctrl.type === "MCI.MMControl") return;
                const node = MK.el(tag, { class: "ctrl", style: MK.posStyle(ctrl, scale) });
                if (bind.img) node.style.backgroundImage = "url('assets/" + bind.img + "')";
                if (bind.bg)  node.style.backgroundColor = bind.bg;
                if (bind.color) node.style.color = bind.color;
                if (bind.fontSize) node.style.fontSize = bind.fontSize + "px";
                if (bind.fontFamily) node.style.fontFamily = bind.fontFamily;
                if (bind.text != null) node.textContent = bind.text;
                else if (ctrl.props && ctrl.props.Caption) node.textContent = ctrl.props.Caption;
                if (bind.title) node.title = bind.title;
                if (bind.onclick) node.addEventListener("click", bind.onclick);
                if (bind.visible === false) node.style.display = "none";
                if (ctrl.type === "VB.Label") {
                    node.classList.remove("ctrl");
                    node.classList.add("lbl");
                    node.style.position = "absolute";
                    Object.assign(node.style, MK.posStyle(ctrl, scale));
                    const h = (ctrl.px ? ctrl.px.h : 20) * scale.y;
                    node.style.lineHeight = Math.max(14, h) + "px";
                    node.style.textAlign  = bind.textAlign || "center";
                    if (!bind.fontSize) node.style.fontSize = Math.max(10, h * 0.7) + "px";
                    node.style.direction = "rtl";
                }
                if (ctrl.type === "VB.Shape") {
                    node.style.pointerEvents = "none";
                    node.style.border = "2px solid " + (bind.shape || "rgba(0,0,0,0)");
                    node.style.borderRadius = "4px";
                }
                if (bind.style) Object.assign(node.style, bind.style);
                parent.appendChild(node);
                refs[key] = node;
                if (ctrl.children && ctrl.children.length) {
                    walk(node, ctrl.children);
                }
            });
        }
        walk(stage, layout.children);
        return refs;
    };
})();
