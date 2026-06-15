// Tozaot.Dat binary read/write — the original Mikraot stores progress
// in a 78-byte-per-song random-access file (`Type Tozaot_Rec` =
// `Masl(2, 12) As Integer` = 13 Integers per maslul × 3 maslulim = 78).
//
// File layout: 10 songs × 78 bytes = 780 bytes total.
//   For song N at offset (N-1)*78:
//     For maslul M in 0..2 (3 rows):
//       For step S in 0..12 (13 cols):
//         2 bytes (LE signed int): coin count for that step
//                                  (S=12 is the "completed" flag, 0/1)
//
// We persist progress in localStorage[mikraot:tozaot] as nested JSON
// for ease of use. These helpers convert between the two for export
// (download a .Dat the user can drop into a fresh install) and import
// (read an existing .Dat from a real Mikraot save).
(function () {
    const MK = (window.MK = window.MK || {});
    const KEY = "mikraot:tozaot";
    const SONGS  = 10;
    const MASLS  =  3;
    const STEPS  = 13;
    const REC    = MASLS * STEPS * 2;   // 78 bytes/song

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
        catch (e) { return {}; }
    }
    function save(t) {
        try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {}
    }

    // Convert localStorage state → 780-byte ArrayBuffer matching the
    // original on-disk Tozaot.Dat. Step indices 0..11 carry coin counts
    // (0..2 typically); step 12 carries the completion flag (0/1).
    MK.exportTozaotDat = function () {
        const t = load();
        const buf = new ArrayBuffer(SONGS * REC);
        const dv = new DataView(buf);
        for (let song = 1; song <= SONGS; song++) {
            const songData = t[song] || {};
            for (let masl = 0; masl < MASLS; masl++) {
                const maslData = songData[masl] || {};
                for (let step = 0; step < STEPS; step++) {
                    const off = (song - 1) * REC + (masl * STEPS + step) * 2;
                    let v = 0;
                    if (step === 12) v = (maslData.done === 1) ? 1 : 0;
                    else             v = +(maslData[step] || 0);
                    // Clamp to signed 16-bit range.
                    if (v < -32768) v = -32768;
                    if (v >  32767) v =  32767;
                    dv.setInt16(off, v, true /* little-endian */);
                }
            }
        }
        return buf;
    };

    // Trigger a download of the current state as Tozaot.Dat.
    MK.downloadTozaotDat = function () {
        const buf  = MK.exportTozaotDat();
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = "Tozaot.Dat";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        MK.log("tozaot exported", buf.byteLength + " bytes");
    };

    // Parse a 780-byte buffer back into the localStorage shape.
    MK.importTozaotDat = function (buf) {
        if (!buf || buf.byteLength < SONGS * REC) {
            MK.warn && MK.warn("tozaot import: short buffer", buf && buf.byteLength);
            return false;
        }
        const dv = new DataView(buf);
        const t = {};
        for (let song = 1; song <= SONGS; song++) {
            t[song] = {};
            for (let masl = 0; masl < MASLS; masl++) {
                const m = {};
                for (let step = 0; step < STEPS; step++) {
                    const off = (song - 1) * REC + (masl * STEPS + step) * 2;
                    const v = dv.getInt16(off, true);
                    if (step === 12) {
                        if (v) m.done = 1;
                    } else if (v) {
                        m[step] = v;
                    }
                }
                if (Object.keys(m).length) t[song][masl] = m;
            }
            if (!Object.keys(t[song]).length) delete t[song];
        }
        save(t);
        MK.log("tozaot imported", buf.byteLength + " bytes",
               Object.keys(t).length + " songs with progress");
        return true;
    };

    // Bridge to Tekoa.Progress (catalog battery + breakdown). The
    // Mikraot screens write to localStorage["mikraot:tozaot"] from
    // ~10 different call sites; rather than touch each, we sync the
    // whole tree into Tekoa.Progress on a short poll.
    //
    // Activity = "<song>/<masl>/<step>". Score = the coin count for
    // that step (0..2). "done" flag → step 12 with value 1.
    // Total = 10 songs × 3 maslulim × 13 steps = 390.
    MK.MIKRAOT_TOTAL = SONGS * MASLS * STEPS;
    let _lastTozaotHash = "";
    MK.syncTekoaProgress = function () {
        const P = window.Tekoa && window.Tekoa.Progress;
        if (!P) return;
        const raw = localStorage.getItem(KEY) || "{}";
        if (raw === _lastTozaotHash) return;
        _lastTozaotHash = raw;
        const t = JSON.parse(raw);
        for (let song = 1; song <= SONGS; song++) {
            const s = t[song] || {};
            for (let masl = 0; masl < MASLS; masl++) {
                const m = s[masl] || {};
                for (let step = 0; step < STEPS; step++) {
                    const v = step === 12 ? (m.done ? 1 : 0) : (+m[step] || 0);
                    if (v > 0) {
                        const id = song + "/" + masl + "/" + step;
                        P.setScore("Mikraot", id, v);
                    }
                }
            }
        }
        P.setTotal("Mikraot", MK.MIKRAOT_TOTAL);
    };
    // Initial sync on load + light polling for new writes from the
    // various screen modules (they bypass tozaot_io's save()).
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(MK.syncTekoaProgress, 200);
    } else {
        document.addEventListener("DOMContentLoaded", MK.syncTekoaProgress);
    }
    setInterval(MK.syncTekoaProgress, 3000);

    // Browser-level upload: pop a file picker and load Tozaot.Dat.
    MK.uploadTozaotDat = function () {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".Dat,.dat,application/octet-stream";
        inp.addEventListener("change", function () {
            const f = inp.files && inp.files[0];
            if (!f) return;
            f.arrayBuffer().then(MK.importTozaotDat);
        });
        inp.click();
    };
})();
