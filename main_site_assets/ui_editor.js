// ui_editor.js — runtime UI tweaker. Dormant on every page load; opt-in
// from the browser console.
//
//     loadUiEditor()        attaches drag/resize handles to every visible
//                           positioned-absolute element on the current
//                           screen and shows the control panel.
//     copyUiEditorDiff()    copies a JSON diff of all moved/resized
//                           elements to the clipboard. Paste it back to
//                           me — I map selectors to source and apply.
//     unloadUiEditor()      removes handles + panel; baseline + changes
//                           are remembered until reload.
//     ui_editor.reset()     restores every changed element to baseline.
//     ui_editor.rescan()    re-attach handles after the app has rendered
//                           new screen content.
//
// Stays out of the way until called — no console output, no event
// listeners installed at load time. Loaded by every site's index.html
// next to feedback.js / trace.js so it's always ready when needed.
(function () {
    "use strict";

    var active   = false;
    var handles  = [];                // { el, dot, handles[corners] }
    var baseline = new WeakMap();     // el → {left, top, width, height} at first touch
    var changes  = new Map();         // selector → {from, to}
    var panel    = null;

    // ---------- Selector synthesis ----------
    function cssPath(el) {
        if (!el || el === document.body) return "body";
        if (el.id) return "#" + CSS.escape(el.id);
        var parts = [], cur = el;
        while (cur && cur.nodeType === 1 && cur !== document.body) {
            var s = cur.tagName.toLowerCase();
            if (cur.classList && cur.classList.length) {
                // Use up to first 3 classes — keeps selector specific
                // but not overly brittle to ephemeral classes.
                s += "." + Array.from(cur.classList).slice(0, 3).map(CSS.escape).join(".");
            }
            var p = cur.parentNode;
            if (p) {
                var same = Array.from(p.children).filter(function (c) { return c.tagName === cur.tagName; });
                if (same.length > 1) s += ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
            }
            parts.unshift(s);
            cur = cur.parentNode;
        }
        return parts.join(" > ");
    }

    // ---------- Discovery ----------
    function isEditable(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (el.closest && el.closest(".__ui_editor__")) return false;
        var cs = getComputedStyle(el);
        if (cs.position !== "absolute" && cs.position !== "fixed") return false;
        var r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return false;
        if (cs.visibility === "hidden" || cs.display === "none") return false;
        if (parseFloat(cs.opacity) === 0) return false;
        return true;
    }

    // ---------- Handle UI ----------
    function ensureBaseline(el) {
        if (baseline.has(el)) return;
        var r = el.getBoundingClientRect();
        var parent = el.offsetParent || document.body;
        var pr = parent.getBoundingClientRect();
        baseline.set(el, {
            left:   r.left - pr.left,
            top:    r.top  - pr.top,
            width:  r.width,
            height: r.height,
        });
    }

    function recordChange(el) {
        var b = baseline.get(el);
        if (!b) return;
        var r = el.getBoundingClientRect();
        var parent = el.offsetParent || document.body;
        var pr = parent.getBoundingClientRect();
        var cur = {
            left:   Math.round((r.left - pr.left) * 10) / 10,
            top:    Math.round((r.top  - pr.top ) * 10) / 10,
            width:  Math.round(r.width  * 10) / 10,
            height: Math.round(r.height * 10) / 10,
        };
        var bRound = {
            left:   Math.round(b.left   * 10) / 10,
            top:    Math.round(b.top    * 10) / 10,
            width:  Math.round(b.width  * 10) / 10,
            height: Math.round(b.height * 10) / 10,
        };
        if (cur.left === bRound.left && cur.top === bRound.top &&
            cur.width === bRound.width && cur.height === bRound.height) {
            changes.delete(cssPath(el));
            return;
        }
        changes.set(cssPath(el), {
            from: bRound,
            to:   cur,
            tag:  el.tagName.toLowerCase(),
            text: (el.innerText || "").trim().slice(0, 40),
        });
    }

    function attach(el) {
        ensureBaseline(el);
        var dot = document.createElement("div");
        dot.className = "__ui_editor__ __ui_handle__";
        dot.title = "Drag to move\nAlt+drag to resize (bottom-right)";
        document.body.appendChild(dot);

        var resizer = document.createElement("div");
        resizer.className = "__ui_editor__ __ui_resize__";
        resizer.title = "Drag to resize";
        document.body.appendChild(resizer);

        function syncPositions() {
            var r = el.getBoundingClientRect();
            dot.style.left = (r.left + window.scrollX) + "px";
            dot.style.top  = (r.top  + window.scrollY) + "px";
            resizer.style.left = (r.right + window.scrollX - 10) + "px";
            resizer.style.top  = (r.bottom + window.scrollY - 10) + "px";
        }
        syncPositions();

        // Drag-to-move (on the dot).
        var dragging = false, dragStart = null;
        dot.addEventListener("mousedown", function (e) {
            dragging = true;
            var r = el.getBoundingClientRect();
            var parent = el.offsetParent || document.body;
            var pr = parent.getBoundingClientRect();
            dragStart = {
                mouseX: e.clientX, mouseY: e.clientY,
                elLeft: r.left - pr.left, elTop: r.top - pr.top,
            };
            e.preventDefault(); e.stopPropagation();
        });
        // Drag-to-resize (on the resizer).
        var resizing = false, resizeStart = null;
        resizer.addEventListener("mousedown", function (e) {
            resizing = true;
            var r = el.getBoundingClientRect();
            resizeStart = { mouseX: e.clientX, mouseY: e.clientY, w: r.width, h: r.height };
            e.preventDefault(); e.stopPropagation();
        });

        function onMove(e) {
            if (dragging) {
                var dx = e.clientX - dragStart.mouseX;
                var dy = e.clientY - dragStart.mouseY;
                el.style.left = (dragStart.elLeft + dx) + "px";
                el.style.top  = (dragStart.elTop  + dy) + "px";
                syncPositions();
                recordChange(el);
            } else if (resizing) {
                var dx2 = e.clientX - resizeStart.mouseX;
                var dy2 = e.clientY - resizeStart.mouseY;
                el.style.width  = Math.max(8, resizeStart.w + dx2) + "px";
                el.style.height = Math.max(8, resizeStart.h + dy2) + "px";
                syncPositions();
                recordChange(el);
            }
        }
        function onUp() { dragging = false; resizing = false; }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);

        handles.push({ el: el, dot: dot, resizer: resizer,
                       cleanup: function () {
                           dot.remove(); resizer.remove();
                           document.removeEventListener("mousemove", onMove);
                           document.removeEventListener("mouseup", onUp);
                       } });
    }

    function scan() {
        var found = 0;
        document.querySelectorAll("*").forEach(function (el) {
            if (!isEditable(el)) return;
            // Skip if already has a handle.
            if (handles.some(function (h) { return h.el === el; })) return;
            attach(el);
            found++;
        });
        if (panel) updatePanelCount(found);
        return found;
    }

    // ---------- Panel ----------
    function buildPanel() {
        panel = document.createElement("div");
        panel.className = "__ui_editor__ __ui_panel__";
        panel.innerHTML = (
            "<div class='hdr'>UI editor — " +
            "<span class='count'>0</span> handles</div>" +
            "<button data-cmd='copy'>Copy diff</button>" +
            "<button data-cmd='rescan'>Rescan</button>" +
            "<button data-cmd='reset'>Reset</button>" +
            "<button data-cmd='close'>Close</button>" +
            "<div class='hint'>Drag the red dot to move, " +
            "the blue square to resize. " +
            "<code>copyUiEditorDiff()</code> also works.</div>"
        );
        document.body.appendChild(panel);
        panel.addEventListener("click", function (e) {
            var b = e.target.closest("button[data-cmd]");
            if (!b) return;
            var cmd = b.dataset.cmd;
            if (cmd === "copy")   window.copyUiEditorDiff();
            if (cmd === "rescan") window.ui_editor.rescan();
            if (cmd === "reset")  window.ui_editor.reset();
            if (cmd === "close")  window.unloadUiEditor();
        });
    }
    function updatePanelCount(n) {
        if (!panel) return;
        var c = panel.querySelector(".count");
        if (c) c.textContent = handles.length;
    }

    // ---------- Styles ----------
    var STYLE_ID = "__ui_editor_style__";
    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var s = document.createElement("style");
        s.id = STYLE_ID;
        s.textContent = (
            ".__ui_handle__{position:absolute;width:14px;height:14px;background:#ef4444;" +
            "border:2px solid #fff;border-radius:50%;cursor:move;z-index:2147483646;" +
            "box-shadow:0 0 0 1px #ef4444;}" +
            ".__ui_resize__{position:absolute;width:10px;height:10px;background:#2563eb;" +
            "border:1px solid #fff;cursor:nwse-resize;z-index:2147483646;}" +
            ".__ui_panel__{position:fixed;top:8px;right:8px;z-index:2147483647;" +
            "background:#1f2937;color:#e5e7eb;padding:10px 12px;border-radius:8px;" +
            "font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);" +
            "min-width:240px;direction:ltr;text-align:left;}" +
            ".__ui_panel__ .hdr{font-weight:600;color:#93c5fd;margin-bottom:6px;}" +
            ".__ui_panel__ .count{color:#fff;font-variant-numeric:tabular-nums;}" +
            ".__ui_panel__ button{margin:2px 4px 2px 0;padding:4px 10px;font:inherit;" +
            "background:#374151;color:#e5e7eb;border:0;border-radius:4px;cursor:pointer;}" +
            ".__ui_panel__ button:hover{background:#4b5563;}" +
            ".__ui_panel__ .hint{margin-top:8px;font-size:11px;color:#9ca3af;line-height:1.4;}" +
            ".__ui_panel__ code{background:#111827;padding:1px 5px;border-radius:3px;}"
        );
        document.head.appendChild(s);
    }

    // ---------- Public API ----------
    window.loadUiEditor = function () {
        if (active) { console.log("[ui_editor] already active"); return; }
        active = true;
        ensureStyles();
        if (!panel) buildPanel();
        else panel.style.display = "";
        var n = scan();
        console.log("[ui_editor] ON — " + n + " editable elements. " +
                    "copyUiEditorDiff() to export, unloadUiEditor() to stop.");
    };

    window.unloadUiEditor = function () {
        if (!active) return;
        active = false;
        handles.forEach(function (h) { h.cleanup(); });
        handles = [];
        if (panel) panel.style.display = "none";
        console.log("[ui_editor] OFF — " + changes.size + " changes retained " +
                    "(call loadUiEditor() to resume; reset() to discard).");
    };

    window.copyUiEditorDiff = function () {
        var arr = [];
        changes.forEach(function (v, k) { arr.push(Object.assign({ selector: k }, v)); });
        var meta = {
            url:      location.href,
            app:      (window.Tekoa && Tekoa.getApp && Tekoa.getApp()) || "?",
            screen:   (window.Tekoa && Tekoa.getScreen && Tekoa.getScreen()) || "?",
            viewport: { w: window.innerWidth, h: window.innerHeight },
            changes:  arr,
        };
        var json = JSON.stringify(meta, null, 2);
        function fallback() {
            console.log("[ui_editor] diff (copy manually):\n" + json);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json).then(function () {
                console.log("[ui_editor] diff copied to clipboard (" + arr.length + " changes).");
            }, fallback);
        } else {
            fallback();
        }
        return meta;
    };

    window.ui_editor = {
        rescan: function () {
            if (!active) return console.log("[ui_editor] not active; call loadUiEditor()");
            var n = scan();
            console.log("[ui_editor] rescanned — " + handles.length + " total handles (+" + n + ").");
        },
        reset: function () {
            // Walk every changed element and revert to its baseline.
            document.querySelectorAll("*").forEach(function (el) {
                if (!baseline.has(el)) return;
                var b = baseline.get(el);
                el.style.left   = b.left   + "px";
                el.style.top    = b.top    + "px";
                el.style.width  = b.width  + "px";
                el.style.height = b.height + "px";
            });
            changes.clear();
            console.log("[ui_editor] reset — all changes reverted.");
            // Resync handle positions.
            handles.forEach(function (h) {
                var r = h.el.getBoundingClientRect();
                h.dot.style.left = (r.left + window.scrollX) + "px";
                h.dot.style.top  = (r.top  + window.scrollY) + "px";
                h.resizer.style.left = (r.right + window.scrollX - 10) + "px";
                h.resizer.style.top  = (r.bottom + window.scrollY - 10) + "px";
            });
        },
        changes: function () {
            var arr = [];
            changes.forEach(function (v, k) { arr.push(Object.assign({ selector: k }, v)); });
            return arr;
        },
    };
})();
