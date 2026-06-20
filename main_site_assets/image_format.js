// image_format.js — runtime .png → .webp rewriter with a console toggle.
//
// Default: every URL ending in `.png` is rewritten to `.webp` before the
// browser loads it. Use the console to switch back:
//
//     setImageFormat('png')      // load original PNGs
//     setImageFormat('webp')     // load webp (default)
//     imageFormat()              // current
//
// Choice persists in localStorage; reload the page to apply.
//
// Coverage:
//   • new Image() constructor
//   • HTMLImageElement.src / srcset setters
//   • HTMLSourceElement.src / srcset setters
//   • fetch / XMLHttpRequest.open
//   • inline <img>, <source>, <link rel="preload" as="image"> caught via
//     MutationObserver at insertion time, before the browser fires the
//     resource request.
//
// Not covered:
//   • CSS background-image URLs in stylesheets — the browser resolves
//     those without a JS hook. A small number of UI elements (notably
//     hemed_nivim_site's button states) remain on PNG until/unless the
//     CSS files themselves are regenerated.
(function () {
    "use strict";

    var PNG_RX = /\.png(?=$|[?#])/i;

    function currentFormat() {
        try { return localStorage.getItem("imageFormat") === "png" ? "png" : "webp"; }
        catch (e) { return "webp"; }
    }

    function rewrite(url) {
        if (typeof url !== "string") return url;
        return url.replace(PNG_RX, ".webp");
    }

    function rewriteSrcset(value) {
        if (typeof value !== "string") return value;
        // srcset is "url 1x, url 2x" etc. Rewrite each url token.
        return value.split(",").map(function (entry) {
            var parts = entry.trim().split(/\s+/);
            if (parts.length) parts[0] = rewrite(parts[0]);
            return parts.join(" ");
        }).join(", ");
    }

    if (currentFormat() === "webp") {
        // 1) `new Image(w, h)` then `.src = …` — handled by the setter
        //    patch below. But `new Image(w, h, src)` doesn't exist; the
        //    relevant DOM is `document.createElement("img")` whose src
        //    setter is also covered.

        // 2) Property setter on HTMLImageElement.src / srcset.
        try {
            var imgProto = HTMLImageElement.prototype;
            var imgSrcDescr = Object.getOwnPropertyDescriptor(imgProto, "src");
            if (imgSrcDescr && imgSrcDescr.set) {
                Object.defineProperty(imgProto, "src", {
                    get: function () { return imgSrcDescr.get.call(this); },
                    set: function (v) { imgSrcDescr.set.call(this, rewrite(v)); },
                    configurable: true,
                });
            }
            var imgSrcsetDescr = Object.getOwnPropertyDescriptor(imgProto, "srcset");
            if (imgSrcsetDescr && imgSrcsetDescr.set) {
                Object.defineProperty(imgProto, "srcset", {
                    get: function () { return imgSrcsetDescr.get.call(this); },
                    set: function (v) { imgSrcsetDescr.set.call(this, rewriteSrcset(v)); },
                    configurable: true,
                });
            }
        } catch (e) {}

        // 3) HTMLSourceElement (used inside <picture>).
        try {
            var srcProto = HTMLSourceElement.prototype;
            var srcDescr = Object.getOwnPropertyDescriptor(srcProto, "src");
            if (srcDescr && srcDescr.set) {
                Object.defineProperty(srcProto, "src", {
                    get: function () { return srcDescr.get.call(this); },
                    set: function (v) { srcDescr.set.call(this, rewrite(v)); },
                    configurable: true,
                });
            }
            var srcsetDescr = Object.getOwnPropertyDescriptor(srcProto, "srcset");
            if (srcsetDescr && srcsetDescr.set) {
                Object.defineProperty(srcProto, "srcset", {
                    get: function () { return srcsetDescr.get.call(this); },
                    set: function (v) { srcsetDescr.set.call(this, rewriteSrcset(v)); },
                    configurable: true,
                });
            }
        } catch (e) {}

        // 4) fetch + XMLHttpRequest fallback.
        if (window.fetch) {
            var origFetch = window.fetch.bind(window);
            window.fetch = function (input, init) {
                if (typeof input === "string") input = rewrite(input);
                else if (input && typeof input.url === "string" && PNG_RX.test(input.url)) {
                    input = new Request(rewrite(input.url), input);
                }
                return origFetch(input, init);
            };
        }
        if (window.XMLHttpRequest && XMLHttpRequest.prototype.open) {
            var origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
                arguments[1] = typeof url === "string" ? rewrite(url) : url;
                return origOpen.apply(this, arguments);
            };
        }

        // 5) Inline <img> / <source> / <link rel=preload> in the parsed
        //    HTML. The property-setter patches above only catch JS-driven
        //    assignments — the HTML parser sets attributes directly. We
        //    use a MutationObserver registered before <body> is parsed so
        //    every newly-inserted node is rewritten before its resource
        //    request actually fires.
        function rewriteInlineAttrs(el) {
            if (!el || el.nodeType !== 1) return;
            var tag = el.tagName;
            if (tag === "IMG" || tag === "SOURCE") {
                var attrSrc = el.getAttribute && el.getAttribute("src");
                if (attrSrc && PNG_RX.test(attrSrc)) {
                    el.setAttribute("src", rewrite(attrSrc));
                }
                var attrSrcset = el.getAttribute && el.getAttribute("srcset");
                if (attrSrcset && PNG_RX.test(attrSrcset)) {
                    el.setAttribute("srcset", rewriteSrcset(attrSrcset));
                }
            } else if (tag === "LINK") {
                var rel = (el.getAttribute("rel") || "").toLowerCase();
                if (rel === "preload" || rel === "prefetch") {
                    var href = el.getAttribute("href");
                    if (href && PNG_RX.test(href)) {
                        el.setAttribute("href", rewrite(href));
                    }
                }
            }
        }
        try {
            var obs = new MutationObserver(function (records) {
                for (var i = 0; i < records.length; i++) {
                    var added = records[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        var n = added[j];
                        rewriteInlineAttrs(n);
                        if (n.querySelectorAll) {
                            var found = n.querySelectorAll("img, source, link");
                            for (var k = 0; k < found.length; k++) rewriteInlineAttrs(found[k]);
                        }
                    }
                }
            });
            obs.observe(document.documentElement, { childList: true, subtree: true });
        } catch (e) {}

        // 6) Anything already in the DOM by the time we run (rare since
        //    we're in <head>, but defensive).
        try {
            var existing = document.querySelectorAll("img, source, link");
            for (var ix = 0; ix < existing.length; ix++) rewriteInlineAttrs(existing[ix]);
        } catch (e) {}
    }

    // Console helpers — exposed regardless of format so users can toggle.
    window.imageFormat = function () { return currentFormat(); };
    window.setImageFormat = function (fmt) {
        if (fmt !== "png" && fmt !== "webp") {
            console.warn("[image_format] expected 'png' or 'webp', got:", fmt);
            return;
        }
        try {
            if (fmt === "webp") localStorage.removeItem("imageFormat");
            else                localStorage.setItem("imageFormat", "png");
        } catch (e) {}
        console.log("[image_format] set to '" + fmt + "' — reload to apply.");
    };
})();
