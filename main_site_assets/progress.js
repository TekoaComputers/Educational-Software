/* tekoa progress tracker
 * =====================================================================
 * Cross-app progress + score tracking for every Tekoa Computers subsite.
 * Activity-grain "visited" + per-activity score; battery-style indicators
 * on the root catalog read from here; the breakdown UI in /progress.html
 * also reads from here.
 *
 * Storage:
 *   localStorage["tekoa:progress"] holds the whole tree as JSON. The
 *   shape is intentionally permissive — each app namespaces its own
 *   activity ids however it wants (e.g. Kesem uses "<rama>/<maslul>/<stage>",
 *   hemed_nivim uses "<unit>/<game>", makhela uses "<screen>").
 *
 *   {
 *     v: 1,
 *     apps: {
 *       "KolKoreA": {
 *         total: 24,
 *         activities: {
 *           "1/3/2": { visited: true, score: { g: 7, y: 2, r: 0 } }
 *         },
 *         lastUpdated: 1718360123
 *       },
 *       "makhela": { ... activities-only, no scores ... }
 *     },
 *     user: { sub, name, email, syncedAt }   // null when signed out
 *   }
 *
 * Cloud sync (optional):
 *   Google Identity Services → Drive AppData folder → single file
 *   "tekoa-progress.json". AppData is hidden from the user's Drive UI
 *   and only this app can read/write it. No backend needed.
 *
 *   To enable, replace TEKOA_GIS_CLIENT_ID below with your own OAuth 2.0
 *   client id (https://console.cloud.google.com/apis/credentials), then
 *   allowlist this site's origin (http(s)://… and file://). Until that
 *   id is set, the sign-in button stays disabled and everything still
 *   works locally.
 *
 * Public API (window.Tekoa.Progress):
 *   markVisited(app, id)         → mark activity as seen
 *   setScore(app, id, score)     → store an arbitrary JSON score blob
 *   setTotal(app, total)         → fixed activity count for % math
 *   getApp(app)                  → { total, activities, lastUpdated }
 *   getAll()                     → { app → { ... } }
 *   getPercent(app)              → 0..100 (visited / total, integer)
 *   reset(app?)                  → wipe one app or all apps
 *   getUser() / signIn() / signOut() / sync()
 */
(function () {
    "use strict";

    const STORAGE_KEY     = "tekoa:progress";
    const SCHEMA_VERSION  = 1;
    const CLOUD_FILENAME  = "tekoa-progress.json";
    const SYNC_DEBOUNCE   = 2000;

    // Replace with your OAuth 2.0 Web client id. Leave the placeholder
    // string in place to keep Drive sync disabled (everything still
    // works locally via localStorage).
    const TEKOA_GIS_CLIENT_ID = "761319726271-42brdoara9saf5r1u7h2jh4sne8t59ek.apps.googleusercontent.com";
    const SCOPE_APPDATA   = "https://www.googleapis.com/auth/drive.appdata";

    // ----- storage --------------------------------------------------------

    function emptyTree() {
        return { v: SCHEMA_VERSION, apps: {}, user: null };
    }
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return emptyTree();
            const d = JSON.parse(raw);
            if (!d || typeof d !== "object" || d.v !== SCHEMA_VERSION) return emptyTree();
            if (!d.apps) d.apps = {};
            return d;
        } catch (e) {
            return emptyTree();
        }
    }
    function save(d) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
        } catch (e) {
            console.warn("[tekoa-progress] localStorage write failed:", e);
        }
        scheduleCloudSync();
        emitChange();
    }
    function ensureApp(d, app) {
        if (!d.apps[app]) d.apps[app] = { total: 0, activities: {}, lastUpdated: 0 };
        return d.apps[app];
    }
    function nowSec() { return Math.floor(Date.now() / 1000); }

    // ----- public API -----------------------------------------------------

    function markVisited(app, id) {
        if (!app || !id) return;
        const d = load();
        const a = ensureApp(d, app);
        const slot = a.activities[id] || {};
        slot.visited = true;
        if (!slot.firstVisit) slot.firstVisit = nowSec();
        slot.lastVisit = nowSec();
        a.activities[id] = slot;
        a.lastUpdated = nowSec();
        save(d);
    }
    function setScore(app, id, score) {
        if (!app || !id) return;
        const d = load();
        const a = ensureApp(d, app);
        const slot = a.activities[id] || {};
        slot.visited = true;
        slot.score = score;
        if (!slot.firstVisit) slot.firstVisit = nowSec();
        slot.lastVisit = nowSec();
        a.activities[id] = slot;
        a.lastUpdated = nowSec();
        save(d);
    }
    function setTotal(app, total) {
        if (!app) return;
        total = parseInt(total, 10) || 0;
        const d = load();
        const a = ensureApp(d, app);
        if (a.total === total) return;     // no-op + skip sync
        a.total = total;
        a.lastUpdated = nowSec();
        save(d);
    }
    function getApp(app) {
        const d = load();
        return d.apps[app] || { total: 0, activities: {}, lastUpdated: 0 };
    }
    function getAll() {
        return load().apps;
    }
    function getPercent(app) {
        const a = getApp(app);
        if (!a.total) return 0;
        let visited = 0;
        for (const k in a.activities) if (a.activities[k].visited) visited++;
        return Math.max(0, Math.min(100, Math.round(visited / a.total * 100)));
    }
    function reset(app) {
        const d = load();
        if (app) delete d.apps[app];
        else d.apps = {};
        save(d);
    }

    // ----- change emitter (storage event-compatible) ----------------------

    function emitChange() {
        try {
            window.dispatchEvent(new CustomEvent("tekoa-progress-change"));
        } catch (e) {}
    }

    // ----- Google Identity / Drive AppData -------------------------------

    // Cache the access token across page navigations so the auto-sync
    // after each write doesn't try to pop a re-consent window from a
    // non-gesture context (browsers block that). The token is short-
    // lived (~60min) and same-origin only.
    const TOKEN_STORE_KEY = "tekoa:gis-token";
    function loadCachedToken() {
        try {
            const raw = localStorage.getItem(TOKEN_STORE_KEY);
            if (!raw) return null;
            const j = JSON.parse(raw);
            if (j && j.token && typeof j.expiresAt === "number"
                    && Date.now() < j.expiresAt) {
                return j;
            }
        } catch (e) {}
        return null;
    }
    function saveCachedToken(token, expiresAt) {
        try { localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify({ token, expiresAt })); } catch (e) {}
    }
    function clearCachedToken() {
        try { localStorage.removeItem(TOKEN_STORE_KEY); } catch (e) {}
    }

    let _tokenClient = null;
    let _accessToken = null;
    let _tokenExpiresAt = 0;
    let _syncTimer = null;
    let _syncing = false;
    const _idReady = TEKOA_GIS_CLIENT_ID && !TEKOA_GIS_CLIENT_ID.startsWith("REPLACE_");
    // Rehydrate the in-memory token from the per-page cache.
    (function rehydrateToken() {
        const c = loadCachedToken();
        if (c) { _accessToken = c.token; _tokenExpiresAt = c.expiresAt; }
    })();

    function isCloudEnabled() { return _idReady; }
    function getUser() { return load().user; }

    function setUser(user) {
        const d = load();
        d.user = user;
        // Skip the cloud-sync hop inside setUser itself; the caller will
        // trigger a pull/push as part of the sign-in flow.
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (e) {}
        emitChange();
    }

    function loadGisScript() {
        if (window.google && window.google.accounts) return Promise.resolve();
        if (window.__tekoaGisLoading) return window.__tekoaGisLoading;
        window.__tekoaGisLoading = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://accounts.google.com/gsi/client";
            s.async = true; s.defer = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Failed to load GIS"));
            document.head.appendChild(s);
        });
        return window.__tekoaGisLoading;
    }

    async function signIn() {
        if (!_idReady) throw new Error("Google sign-in not configured. Set TEKOA_GIS_CLIENT_ID in progress.js.");
        await loadGisScript();
        const accessToken = await new Promise((resolve, reject) => {
            _tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: TEKOA_GIS_CLIENT_ID,
                scope: SCOPE_APPDATA + " openid email profile",
                prompt: "",
                callback: (resp) => {
                    if (resp.error) reject(resp);
                    else resolve(resp.access_token);
                },
            });
            _tokenClient.requestAccessToken({ prompt: "consent" });
        });
        _accessToken = accessToken;
        _tokenExpiresAt = Date.now() + 50 * 60 * 1000;   // GIS tokens last ~60min
        saveCachedToken(_accessToken, _tokenExpiresAt);

        // Pull profile via UserInfo for the email/name.
        let profile = {};
        try {
            const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: "Bearer " + accessToken },
            });
            if (r.ok) profile = await r.json();
        } catch (e) {}
        setUser({ sub: profile.sub || "", email: profile.email || "", name: profile.name || "" });
        // Pull cloud copy and merge with local on first sign-in.
        await sync();
        return getUser();
    }

    function signOut() {
        _accessToken = null;
        _tokenExpiresAt = 0;
        clearCachedToken();
        setUser(null);
    }

    // Returns a usable access token if one is currently cached and not
    // expired, otherwise null. Importantly: NEVER triggers a popup. GIS's
    // implicit flow has no refresh token, so the only way to get a new
    // token is a user-gesture sign-in click. Trying to silent-refresh
    // outside a gesture context just opens a popup the browser blocks
    // (`Failed to open popup window`) and looks broken to the user.
    // When the token expires, sync silently skips until the user
    // clicks the sign-in pill again.
    function ensureToken() {
        if (_accessToken && Date.now() < _tokenExpiresAt) return _accessToken;
        const c = loadCachedToken();
        if (c) { _accessToken = c.token; _tokenExpiresAt = c.expiresAt; return _accessToken; }
        return null;
    }

    async function findCloudFile(token) {
        const u = "https://www.googleapis.com/drive/v3/files"
            + "?spaces=appDataFolder"
            + "&q=" + encodeURIComponent("name = '" + CLOUD_FILENAME + "'")
            + "&fields=files(id,name,modifiedTime)";
        const r = await fetch(u, { headers: { Authorization: "Bearer " + token } });
        if (!r.ok) throw new Error("Drive list failed: " + r.status);
        const j = await r.json();
        return (j.files && j.files[0]) || null;
    }

    async function readCloudFile(token, fileId) {
        const r = await fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media", {
            headers: { Authorization: "Bearer " + token },
        });
        if (!r.ok) throw new Error("Drive read failed: " + r.status);
        return r.json();
    }

    async function writeCloudFile(token, existingId, payload) {
        // Two-call sequence (avoids multipart, which fails CORS preflight
        // on Google's upload endpoint when the request shape is anything
        // other than what Drive expects exactly):
        //   1. If no existing file, POST /drive/v3/files with metadata to
        //      create an empty file in appDataFolder.
        //   2. PATCH /upload/drive/v3/files/{id}?uploadType=media with the
        //      JSON content (Content-Type: application/json).
        let fileId = existingId;
        if (!fileId) {
            const createResp = await fetch("https://www.googleapis.com/drive/v3/files", {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + token,
                    "Content-Type": "application/json; charset=UTF-8",
                },
                body: JSON.stringify({
                    name: CLOUD_FILENAME,
                    parents: ["appDataFolder"],
                }),
            });
            if (!createResp.ok) throw new Error("Drive create failed: " + createResp.status);
            const j = await createResp.json();
            fileId = j.id;
        }
        const r = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media",
            {
                method: "PATCH",
                headers: {
                    Authorization: "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            }
        );
        if (!r.ok) throw new Error("Drive write failed: " + r.status);
        return r.json();
    }

    // Two-way merge — keep the most-recently-updated copy of each app.
    function mergeTrees(local, remote) {
        const out = { v: SCHEMA_VERSION, apps: {}, user: local.user };
        const appIds = new Set([
            ...Object.keys(local.apps || {}),
            ...Object.keys(remote.apps || {}),
        ]);
        for (const app of appIds) {
            const L = (local.apps  || {})[app];
            const R = (remote.apps || {})[app];
            if (!L) { out.apps[app] = R; continue; }
            if (!R) { out.apps[app] = L; continue; }
            // Pick whichever app blob is newer; merge activities at finer
            // grain so a write on one device doesn't lose a write made
            // on the other within the sync window.
            const merged = {
                total: (R.lastUpdated || 0) > (L.lastUpdated || 0) ? R.total : L.total,
                activities: {},
                lastUpdated: Math.max(L.lastUpdated || 0, R.lastUpdated || 0),
            };
            const ids = new Set([
                ...Object.keys(L.activities || {}),
                ...Object.keys(R.activities || {}),
            ]);
            for (const id of ids) {
                const la = (L.activities || {})[id];
                const ra = (R.activities || {})[id];
                if (!la) merged.activities[id] = ra;
                else if (!ra) merged.activities[id] = la;
                else merged.activities[id] = (ra.lastVisit || 0) > (la.lastVisit || 0) ? ra : la;
            }
            out.apps[app] = merged;
        }
        return out;
    }

    async function sync() {
        if (!_idReady) return;
        if (!getUser()) return;
        if (_syncing) return;
        _syncing = true;
        try {
            const token = await ensureToken();
            if (!token) return;
            const existing = await findCloudFile(token);
            let remote = null;
            if (existing) {
                try { remote = await readCloudFile(token, existing.id); }
                catch (e) { console.warn("[tekoa-progress] cloud read failed:", e); }
            }
            const local = load();
            const merged = remote && remote.v === SCHEMA_VERSION
                ? mergeTrees(local, remote)
                : local;
            // Persist merged copy locally first (so a failed upload still
            // gives us a consistent local view).
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (e) {}
            const u = merged.user || {};
            u.syncedAt = nowSec();
            merged.user = u;
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (e) {}
            try {
                await writeCloudFile(token, existing && existing.id, merged);
            } catch (e) {
                console.warn("[tekoa-progress] cloud write failed:", e);
            }
            emitChange();
        } finally {
            _syncing = false;
        }
    }

    function scheduleCloudSync() {
        if (!_idReady || !getUser()) return;
        if (_syncTimer) clearTimeout(_syncTimer);
        _syncTimer = setTimeout(sync, SYNC_DEBOUNCE);
    }

    // Best-effort flush when the tab is closing so the last write
    // doesn't sit only in localStorage.
    window.addEventListener("beforeunload", function () {
        if (_syncTimer) {
            clearTimeout(_syncTimer);
            // navigator.sendBeacon doesn't take Authorization headers;
            // Drive AppData has no anonymous path. Best we can do is
            // kick off a fetch and let it race the unload.
            sync();
        }
    });

    // React to changes made by other tabs.
    window.addEventListener("storage", function (e) {
        if (e.key === STORAGE_KEY) emitChange();
    });

    // ----- exports --------------------------------------------------------

    window.Tekoa = window.Tekoa || {};
    window.Tekoa.Progress = {
        markVisited, setScore, setTotal,
        getApp, getAll, getPercent,
        reset,
        getUser, signIn, signOut, sync, isCloudEnabled,
        STORAGE_KEY, SCHEMA_VERSION,
    };
})();
