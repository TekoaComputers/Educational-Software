// audio_format.js — runtime .wav → .mp3 rewriter with a console toggle.
//
// Default: every URL ending in `.wav` is rewritten to `.mp3` before the
// browser loads it. Use the console to switch back:
//
//     setAudioFormat('wav')     // load originals
//     setAudioFormat('mp3')     // load mp3 versions (default)
//     audioFormat()             // current
//
// Choice persists in localStorage; reload the page to apply.
(function () {
    "use strict";

    function currentFormat() {
        try { return localStorage.getItem("audioFormat") === "wav" ? "wav" : "mp3"; }
        catch (e) { return "mp3"; }
    }

    function rewrite(url) {
        if (typeof url !== "string") return url;
        // Match `.wav` followed by end-of-string, ?query, or #fragment.
        return url.replace(/\.wav(?=$|[?#])/i, ".mp3");
    }

    if (currentFormat() === "mp3") {
        // Patch the Audio constructor.
        var OrigAudio = window.Audio;
        if (OrigAudio) {
            window.Audio = function (src) {
                return new OrigAudio(src ? rewrite(src) : src);
            };
            window.Audio.prototype = OrigAudio.prototype;
        }

        // Patch the HTMLMediaElement.src setter so `audio.src = '…/x.wav'`
        // also gets rewritten. Same for <source src>.
        try {
            var mediaProto = HTMLMediaElement.prototype;
            var mediaDescr = Object.getOwnPropertyDescriptor(mediaProto, "src");
            if (mediaDescr && mediaDescr.set) {
                Object.defineProperty(mediaProto, "src", {
                    get: function () { return mediaDescr.get.call(this); },
                    set: function (v) { mediaDescr.set.call(this, rewrite(v)); },
                    configurable: true,
                });
            }
            var srcProto = HTMLSourceElement.prototype;
            var srcDescr = Object.getOwnPropertyDescriptor(srcProto, "src");
            if (srcDescr && srcDescr.set) {
                Object.defineProperty(srcProto, "src", {
                    get: function () { return srcDescr.get.call(this); },
                    set: function (v) { srcDescr.set.call(this, rewrite(v)); },
                    configurable: true,
                });
            }
        } catch (e) {}

        // Patch fetch (used by Web Audio API loaders).
        if (window.fetch) {
            var origFetch = window.fetch.bind(window);
            window.fetch = function (input, init) {
                if (typeof input === "string") input = rewrite(input);
                else if (input && typeof input.url === "string" && /\.wav(?=$|[?#])/i.test(input.url)) {
                    input = new Request(rewrite(input.url), input);
                }
                return origFetch(input, init);
            };
        }

        // Patch XMLHttpRequest.open as a safety net.
        if (window.XMLHttpRequest && XMLHttpRequest.prototype.open) {
            var origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
                arguments[1] = typeof url === "string" ? rewrite(url) : url;
                return origOpen.apply(this, arguments);
            };
        }
    }

    // Console helpers — exposed regardless of format so users can toggle.
    window.audioFormat = function () { return currentFormat(); };
    window.setAudioFormat = function (fmt) {
        if (fmt !== "wav" && fmt !== "mp3") {
            console.warn("[audio_format] expected 'wav' or 'mp3', got:", fmt);
            return;
        }
        try {
            if (fmt === "mp3") localStorage.removeItem("audioFormat");
            else               localStorage.setItem("audioFormat", "wav");
        } catch (e) {}
        console.log("[audio_format] set to '" + fmt + "' — reload to apply.");
    };
})();
