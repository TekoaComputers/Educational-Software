/*
 * Floating feedback widget — shared across the main catalog and every sub-app.
 *
 * What it does:
 *   1. Patches window.console.{log,info,warn,error,debug} on load so every
 *      message is also recorded into an in-memory ring buffer. Hooks
 *      window.onerror and unhandledrejection for stack traces.
 *   2. Renders a fixed bottom-left "משוב" pill that, on click:
 *        - Copies the full captured log (plus URL + UA + timestamp) to the
 *          clipboard. A small toast confirms the copy.
 *        - Opens a new GitHub issue at TekoaComputers/Educational-Software
 *          with title prefix + label + a short body template. The recent log
 *          tail is embedded so reporters can submit without pasting; the full
 *          log is on the clipboard if they want more detail.
 *
 * No email address appears in the page source. Load this script as early as
 * possible (top of <head>) so console output from app bundles is captured.
 */
(function () {
    'use strict';

    if (window.__tekoaFeedback) return; // double-load guard
    window.__tekoaFeedback = true;

    var REPO = 'TekoaComputers/Educational-Software';
    var MAX_ENTRIES = 500;
    var URL_MAX = 7500;          // GitHub URL soft limit; stay well under 8KB
    var TAIL_FOR_URL = 30;       // recent log lines embedded in issue body

    // Persist the ring buffer across page navigations (catalog → Kesem
    // app → catalog) so the user doesn't lose context when reporting an
    // issue mid-flow. Uses localStorage rather than sessionStorage so
    // the log survives across tab close/reopen and full-cache reloads.
    // Auto-trims to MAX_ENTRIES and resets when it grows older than
    // FEEDBACK_LOG_MAX_AGE_MS (defaults to 6h) so it doesn't grow
    // unbounded over weeks of use.
    // Manual reset from any page: localStorage.removeItem('tekoa:feedback-log').
    var STORE_KEY = 'tekoa:feedback-log';
    var MAX_AGE_MS = 6 * 60 * 60 * 1000;
    // Detect how the user got here:
    //   "reload"        — F5 / Ctrl+R → start fresh (user usually wants a clean slate)
    //   "navigate"      — clicked a link / typed URL → keep prior log
    //   "back_forward"  — browser back/forward → keep prior log
    // The Navigation Timing API gives us this cleanly. Fall back to the
    // legacy enum if needed.
    var IS_RELOAD = false;
    try {
        var navEntry = (performance.getEntriesByType('navigation') || [])[0];
        if (navEntry && navEntry.type) {
            IS_RELOAD = navEntry.type === 'reload';
        } else if (performance.navigation) {
            IS_RELOAD = performance.navigation.type === 1;
        }
    } catch (_) {}

    var buf;
    if (IS_RELOAD) {
        // Refresh — drop the prior log so the user starts clean.
        buf = [];
        try { localStorage.removeItem(STORE_KEY); } catch (_) {}
    } else {
        // Storage shape: { ts: <epoch ms>, lines: [...] }. Anything else
        // gets treated as empty so we never crash on bad data, but we
        // don't drop good data just because the timestamp slot is odd.
        try {
            var raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                var d = JSON.parse(raw);
                if (d && Array.isArray(d.lines)
                        && typeof d.ts === 'number'
                        && (Date.now() - d.ts) < MAX_AGE_MS) {
                    buf = d.lines;
                }
            }
        } catch (_) {}
    }
    if (!Array.isArray(buf)) buf = [];
    var startedAt = new Date().toISOString();
    if (buf.length) {
        buf.push('[' + startedAt.slice(11, 23) + '] NAV : --- ' + location.pathname + location.hash + ' ---');
    }
    function persist() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                ts: Date.now(),
                lines: buf,
            }));
        } catch (_) {}
    }
    // Manual clear hook from any page (a future "clear log" button can use it).
    window.__tekoaFeedbackClear = function () {
        buf.length = 0;
        try { localStorage.removeItem(STORE_KEY); } catch (_) {}
    };
    // Save eagerly even before the first push, so that immediately
    // navigating away (before any console activity) still seeds the
    // store with this page's nav marker.
    persist();

    function fmtArg(a) {
        try {
            if (a instanceof Error) return a.stack || a.message;
            if (a && typeof a === 'object') return JSON.stringify(a);
            return String(a);
        } catch (_) {
            return '[unstringifiable]';
        }
    }

    function push(level, args) {
        var stamp = new Date().toISOString().slice(11, 23);
        var msg;
        try {
            msg = Array.prototype.slice.call(args).map(fmtArg).join(' ');
        } catch (_) {
            msg = '[log format error]';
        }
        buf.push('[' + stamp + '] ' + level + ': ' + msg);
        if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES);
        persist();
    }

    ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
        var orig = console[level] ? console[level].bind(console) : function () {};
        console[level] = function () {
            push(level.toUpperCase(), arguments);
            try { orig.apply(console, arguments); } catch (_) {}
        };
    });

    window.addEventListener('error', function (e) {
        push('ERROR', ['Uncaught: ' + (e.message || '') +
            ' @ ' + (e.filename || '') + ':' + (e.lineno || '') + ':' + (e.colno || '')]);
    });
    window.addEventListener('unhandledrejection', function (e) {
        var r = e && e.reason;
        var msg = (r && (r.stack || r.message)) || String(r);
        push('ERROR', ['Unhandled rejection: ' + msg]);
    });

    function buildPayload() {
        var lines = buf.slice();
        var head =
            'URL: ' + location.href + '\n' +
            'UA:  ' + navigator.userAgent + '\n' +
            'Started: ' + startedAt + '\n' +
            'Captured: ' + lines.length + ' entries\n';
        var body = lines.length ? lines.join('\n') : '(no console output captured)';
        return head + '\n----- console log -----\n' + body;
    }

    function copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
        } catch (_) {}
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.setAttribute('readonly', '');
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve();
        } catch (_) {
            return Promise.reject();
        }
    }

    function buildIssueUrl(includeTail) {
        var tail = '';
        if (includeTail && buf.length) {
            var slice = buf.slice(-TAIL_FOR_URL).join('\n');
            if (slice.length > 3500) slice = slice.slice(-3500);
            tail = '```\n' + slice + '\n```\n';
        } else {
            tail = '(הלוג המלא הועתק ללוח — נא להדביק כאן)\n';
        }
        var body =
            '**איזו לומדה / נושא:**\n\n\n' +
            '**תיאור המשוב או הבעיה:**\n\n\n' +
            '**שלבים לשחזור:**\n\n\n' +
            '---\n' +
            '**מידע טכני** (נוסף אוטומטית)\n\n' +
            '- URL: ' + location.href + '\n' +
            '- דפדפן: ' + navigator.userAgent + '\n\n' +
            '**רישומי קונסול אחרונים:**\n' +
            tail;
        return 'https://github.com/' + REPO + '/issues/new' +
            '?labels=feedback' +
            '&title=' + encodeURIComponent('[משוב] ') +
            '&body=' + encodeURIComponent(body);
    }

    function injectStyles() {
        if (document.getElementById('feedback-fab-style')) return;
        var s = document.createElement('style');
        s.id = 'feedback-fab-style';
        s.textContent =
            '#feedback-fab{' +
                'position:fixed;bottom:0;right:.5rem;z-index:2147483600;' +
                'display:inline-flex;align-items:center;gap:0;' +
                'padding:.55rem .6rem;background:#154069;color:#fff;' +
                'border-radius:999px;text-decoration:none;cursor:pointer;' +
                'font:600 .9rem/1 "Arial Hebrew","Heebo","Segoe UI",Arial,sans-serif;' +
                'box-shadow:0 4px 14px rgba(21,64,105,.4);' +
                'transition:padding .2s ease,gap .2s ease,background .15s ease,box-shadow .15s ease;' +
            '}' +
            '#feedback-fab:hover,#feedback-fab:focus-visible{' +
                'padding:.55rem .95rem;gap:.45rem;background:#1d5a8a;' +
                'box-shadow:0 8px 20px rgba(21,64,105,.55);outline:none;' +
            '}' +
            '#feedback-fab svg{display:block;flex:0 0 auto}' +
            '#feedback-fab .feedback-label{' +
                'max-width:0;overflow:hidden;white-space:nowrap;opacity:0;' +
                'transition:max-width .25s ease,opacity .2s ease;' +
            '}' +
            '#feedback-fab:hover .feedback-label,' +
            '#feedback-fab:focus-visible .feedback-label{max-width:6rem;opacity:1}' +
            '#feedback-toast{' +
                'position:fixed;bottom:3.2rem;right:.5rem;z-index:2147483600;' +
                'background:#1d3a52;color:#fff;padding:.5rem .8rem;border-radius:8px;' +
                'font:500 .82rem/1.2 "Arial Hebrew","Heebo","Segoe UI",Arial,sans-serif;' +
                'box-shadow:0 4px 10px rgba(0,0,0,.25);' +
                'opacity:0;pointer-events:none;transition:opacity .25s ease,transform .25s ease;' +
                'transform:translateY(6px);max-width:18rem;' +
            '}' +
            '#feedback-toast.show{opacity:1;transform:translateY(0)}';
        document.head.appendChild(s);
    }

    function showToast(text) {
        var t = document.getElementById('feedback-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'feedback-toast';
            document.body.appendChild(t);
        }
        t.textContent = text;
        // force reflow so transition triggers reliably
        void t.offsetWidth;
        t.classList.add('show');
        clearTimeout(t._hideTimer);
        t._hideTimer = setTimeout(function () {
            t.classList.remove('show');
        }, 2200);
    }

    function buildFab() {
        if (document.getElementById('feedback-fab')) return;
        injectStyles();

        var a = document.createElement('a');
        a.id = 'feedback-fab';
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', 'שליחת משוב דרך GitHub Issues');
        a.href = buildIssueUrl(true);
        a.innerHTML =
            '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"' +
            ' fill="none" stroke="currentColor" stroke-width="2"' +
            ' stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7' +
              ' 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8' +
              ' 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
            '</svg>' +
            '<span class="feedback-label">משוב</span>';

        a.addEventListener('click', function (e) {
            // Build the URL SYNCHRONOUSLY first so the popup opens inside
            // the user-gesture window. The href was computed at fab build
            // time (line above) and goes stale as logs accumulate; if we
            // let the async clipboard work below run first, some browsers
            // strip the user gesture and the target=_blank popup gets
            // blocked — that's the "took multiple attempts" symptom in
            // issue #38.
            var url = buildIssueUrl(true);
            if (url.length > URL_MAX) url = buildIssueUrl(false);
            a.href = url;                 // keep accessible right-click "copy link" current
            e.preventDefault();
            window.open(url, '_blank', 'noopener');

            // Clipboard copy is async and may take time; safe to start
            // after the popup is on its way.
            var payload = buildPayload();
            copyToClipboard(payload).then(
                function () { showToast('הלוג הועתק ללוח (' + buf.length + ' שורות)'); },
                function () { showToast('לא הצלחתי להעתיק — נא להדביק ידנית מהקונסול'); }
            );
        });

        document.body.appendChild(a);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildFab);
    } else {
        buildFab();
    }
})();
