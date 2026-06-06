// Lmath — Heshbon ladybug-counting mini-game.
// 1:1 port of Heshbon/Lmath/{start,Form1,Form2,Form3,Form4}.frm using the
// extracted Form1.frx sprites (bug0..7 = Picture1 ladybug walk frames; up0..13
// = shpup advance frames; targ0/1 = play/pause big button; shad0/1 = shadows).
//
// All positions are twips/15 from the original .frm — see comments inline.
// Designed canvas = 640×480 (Sst.frm Form_Load: ScrRes.ChangeScreenSettings).
//
// Public: window.LmathGame.launch(returnToCb)
// Debug:  console transcript prefixed [lmath] — see dbg() below.
//         Toggle verbosity with `window.LmathGame.verbose = true|false`.

(function () {
'use strict';

const ROOT = "assets/Heshbon/lmath";
const WAV  = ROOT + "/wav";

// === Debug ================================================================
// Every game-meaningful event funnels through dbg() so a console transcript
// reads cold: clicks, audio, asset loads, state transitions, timer ticks
// (in verbose mode). Copy-paste to bug reports = full reproducible trail.
const VERBOSE_DEFAULT = false;
function dbg() {
    const args = ["[lmath]"];
    for (let i = 0; i < arguments.length; i++) args.push(arguments[i]);
    if (typeof console !== "undefined" && console.log) console.log.apply(console, args);
}
function vdbg() {
    if (!window.LmathGame || !window.LmathGame.verbose) return;
    dbg.apply(null, arguments);
}

// === Design constants (twips÷15 from .frm) ================================
// Stage = ScrRes.ChangeScreenSettings (Sst.frm Form_Load) → 640×480.
const DW = 640, DH = 480;

// shp1 grid — 10 columns × 10 cells per col. shp1(col*10 + row).
// shp1(0)=col0,row0 (bottom-left). shp1(9)=col0,row9 (top-left).
// shp1(99)=col9,row9 (top-right). Cell 25×25 px (twips 375).
const MAX_STL    = 10;             // maxStl (Form2.lshorot.Caption)
// Column Left values are NOT uniformly spaced in the original .frm — gaps
// vary from 42 to 49 px. Hardcode each from the design twips, see comments.
const COL_X      = [
     67,   //  1005  shp1(0..9)    col 0
    110,   //  1650  shp1(10..19)  col 1
    155,   //  2325  shp1(20..29)  col 2
    204,   //  3060  shp1(30..39)  col 3
    253,   //  3795  shp1(40..49)  col 4
    300,   //  4500  shp1(50..59)  col 5
    348,   //  5220  shp1(60..69)  col 6
    393,   //  5895  shp1(70..79)  col 7
    435,   //  6525  shp1(80..89)  col 8
    483,   //  7245  shp1(90..99)  col 9
];
// Per-row Top values (twips÷15), row 0 (bottom-most) → row 9 (top-most).
// shp1(idx).Top: 4140, 3690, 3240, 2790, 2340, 1890, 1440, 990, 540, 90.
const CELL_TOPS  = [276, 246, 216, 186, 156, 126, 96, 66, 36, 6];
// fli11.bmp natural dims (live flower) and f0..f9.bmp (eaten flower).
const FLI_W = 26, FLI_H = 29;       // fli11.bmp
const F_W   = 35, F_H   = 25;       // f0..9.bmp

// Form1.cmda(0..8) — digit cards. 645×645 twips = 43×43 px, at y=422.
const CMDA_Y      = 422;           // Top=6330 → 422
const CMDA_X0     = 106;           // cmda(0).Left=1590 → 106
const CMDA_DX     = 42;            // (2220-1590)/15
const CMDA_SIZE   = 43;

// Form1.siv(0..4) — round indicators. 375×375 twips = 25×25 px, at y=443.
const SIV_Y       = 443;
const SIV_X0      = 511;           // siv(0).Left=7665 → 511
const SIV_DX      = 28;            // 420/15
const SIV_SIZE    = 25;

// Form1.Picture1(0..7) — 70×52 ladybug walking sprite (8 frames cycled by
// Timer2). Picture1(0).Left=900, Top=5610 → x=60, y=374. LOSE if Left>445.
const BUG_W      = 70, BUG_H = 52;
const BUG_X0     = 60;
const BUG_Y      = 374;
const BUG_LOSE_X = 445;            // Form1.Timer1_Timer: If Picture1.Left > 445 Then ... Form4.Show
const BUG_FRAMES = 8;              // Picture1 has 8 indices (0..7)
// Timer2.Interval=150 in .frm (frame-cycle rate).
const BUG_FRAME_MS = 150;

// Form1.shpup(0..13) — second ladybug, "advance" animation (14 frames). Sits
// 52px above Picture1 (Top=4830 → y=322). Starts at Left=525 → x=35 then
// MMControl1_Done snaps it to x=48. Per correct answer, upt_Timer cycles
// shpup(0..13) at 10ms while moving Left by (fromp/14) total fromp ≈ COL_DX.
const SHPUP_W      = 70, SHPUP_H = 52;
const SHPUP_X0     = 48;
const SHPUP_Y      = 322;
const SHPUP_FRAMES = 14;
const SHPUP_TICK_MS = 10;          // upt.Interval = 10

// Form1.targ(0/1) — 141×106 big play / pause overlay, right-side.
const TARG_X = 486;                // targ(0).Left=7275 → 485; targ(1).Left=7290 → 486
const TARG_Y = 312;                // Top=4680 → 312
const TARG_W = 141, TARG_H = 106;

// Form1.shad(0/1) — 87×25 shadow strip under targ.
const SHAD_X = 496, SHAD_Y = 384;
const SHAD_W = 87,  SHAD_H = 25;

// Form1.Label3 ("סיבוב") + sivov number — both designed with Visible=False
// and never set True in the original code, so we don't render them.

// Form1.help (bottom-left, invisible click hotspot with custom MouseIcon).
const HELP_X = 0, HELP_Y = 441, HELP_SIZE = 36;

// Form1.Label2 (top-right × exit). 615×570 twips = 41×38 at (600, 0).
const EXITX_X = 600, EXITX_Y = 0, EXITX_W = 41, EXITX_H = 38;

// Preset levels — start.frm Command2/3/4_Click verbatim.
//   Command2 (level 1):  tur=2, lshorot=10, pa2=1, pa1=5, lbls=5
//   Command3 (level 2):  tur=2, lshorot=10, pa2=1, pa1=8, lbls=7
//   Command4 (level 3):  tur=3, lshorot=10, pa2=1, pa1=9, lbls=10
const PRESETS = {
    1: { tur: 2, pa1: 5, pa2: 1, lbls: 5,  lshorot: 10 },
    2: { tur: 2, pa1: 8, pa2: 1, lbls: 7,  lshorot: 10 },
    3: { tur: 3, pa1: 9, pa2: 1, lbls: 10, lshorot: 10 },
};

// Form2 design-time UpDown.Value defaults — user-set custom mode.
const DEFAULT_PARAMS = { tur: 2, pa1: 2, pa2: 1, lbls: 5, lshorot: 10 };

// === Audio ================================================================
// One-shot Audio per channel so a new SFX cuts the previous. Channels:
//   fx    — feedback (good/wrong/blink)
//   voice — number announcements, start/win/lose narration
const audioCh = { fx: null, voice: null };
function playWav(channel, name, onEnded) {
    let a = audioCh[channel];
    if (a) { try { a.pause(); } catch (e) {} a.onended = null; }
    a = new Audio(WAV + "/" + name);
    audioCh[channel] = a;
    dbg("audio[" + channel + "] play:", name);
    if (onEnded) a.onended = function () { vdbg("audio[" + channel + "] ended:", name); onEnded(); };
    a.play().catch(function (err) {
        dbg("audio[" + channel + "] failed:", name, err && err.message);
        if (onEnded) onEnded();
    });
}
function stopAllAudio() {
    Object.keys(audioCh).forEach(function (k) {
        const a = audioCh[k];
        if (a) { try { a.pause(); } catch (e) {} audioCh[k] = null; }
    });
}

// === Stage shell ==========================================================
let stage = null, wrap = null, returnFn = null, keyHandler = null;

function buildShell() {
    // Tear down any prior shell WITHOUT firing returnFn — that callback is
    // reserved for the user-initiated exit (× button / ESC), not for our
    // own teardown when re-launching.
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    const root = document.getElementById("app-root");
    wrap = document.createElement("div");
    wrap.className = "lmath-wrap";
    stage = document.createElement("div");
    stage.className = "lmath-stage";
    wrap.appendChild(stage);
    root.appendChild(wrap);
    fitStage();
    if (!keyHandler) {
        keyHandler = onKey;
        window.addEventListener("keydown", keyHandler);
        window.addEventListener("resize", fitStage);
    }
    dbg("shell built");
}
function fitStage() {
    if (!wrap || !stage) return;
    const r = wrap.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { requestAnimationFrame(fitStage); return; }
    const s = Math.min(r.width / DW, r.height / DH);
    stage.style.transform = "translate(-50%, -50%) scale(" + s + ")";
}
function exit() {
    dbg("exit → returning to Sst");
    if (keyHandler) { window.removeEventListener("keydown", keyHandler); keyHandler = null; }
    window.removeEventListener("resize", fitStage);
    stopAllAudio();
    stopGameTimers();
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = stage = null;
    gameState = null;
    if (returnFn) { const fn = returnFn; returnFn = null; fn(); }
}

// Build a positioned element. Coords in design pixels (within 640×480).
function mk(tag, cls, x, y, w, h) {
    const e = document.createElement(tag);
    e.className = cls;
    e.style.position = "absolute";
    if (x != null) e.style.left   = x + "px";
    if (y != null) e.style.top    = y + "px";
    if (w != null) e.style.width  = w + "px";
    if (h != null) e.style.height = h + "px";
    return e;
}
function img(src, cls, x, y, w, h) {
    const i = mk("img", cls, x, y, w, h);
    i.src = src;
    i.draggable = false;
    return i;
}
function clearStage() { while (stage && stage.firstChild) stage.removeChild(stage.firstChild); }
function setBg(name) {
    if (!stage) return;
    stage.style.backgroundImage = "url(" + ROOT + "/" + name + ")";
    dbg("bg:", name);
}

// === Game state ===========================================================
let gameState = null;
let frameTimer = null;        // Timer2: cycles ladybug walking frames
let walkTimer  = null;        // Timer1: advances ladybug position 1px/tick
let blinkTimer = null;        // Timer3: blink correct cmda after 3 wrong

function stopGameTimers() {
    if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
    if (walkTimer)  { clearInterval(walkTimer);  walkTimer  = null; }
    if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
    if (shpupTimer) { clearInterval(shpupTimer); shpupTimer = null; }
    if (winSpawner) { clearInterval(winSpawner); winSpawner = null; }
}

function startGame(params) {
    stopAllAudio();
    stopGameTimers();
    dbg("startGame:", JSON.stringify(params));
    gameState = {
        params: params,
        sivov: 1,                 // current round (1..tur)
        NomStl: 0,                // next column to answer (0..MAX_STL-1)
        columns: [],              // flower count per column
        wrongCount: 0,            // taot — wrong presses on current column
        ladybugX: BUG_X0,
        bugFrame: 0,
        paused: true,             // st=0 in Form1 — true until player clicks targ
    };
    renderRound();
    // Form1.Form_Load: MMControl1.FileName = "\lmath\start.wav" → Open → play
    playWav("voice", "start.wav");
}

// === Form1 (renderRound) ==================================================
// Called from startGame (round 1 initial render) AND between rounds (after a
// round completes — see onDigit's round-end branch). For inter-round calls,
// must reset per-round state (NomStl, wrongCount, ladybugX, paused, frames).
function renderRound() {
    const st = gameState;
    // Per-round reset — Picture1.Left=60, NomStl=0, taot=0, paused/timers off.
    st.NomStl     = 0;
    st.wrongCount = 0;
    st.ladybugX   = BUG_X0;
    st.bugFrame   = 0;
    st.shpupX     = SHPUP_X0;
    st.shpupFrame = 0;
    st.paused     = true;            // st=0 in Form1 — wait for targ click
    clearStage();
    setBg("backk10.png");                       // Form1.Picture = backk10.jpg
    dbg("round " + st.sivov + "/" + st.params.tur + " — generating columns");

    // Generate flower counts per column — mirror Form1.Form_Load Do loop:
    //   mee = pa2-1; ad = pa1; kl = ad - mee
    //   v = Int(ad * Rnd); If v < mee Then v = mee + Int(kl * Rnd)
    //   For i = 0 To v: paint flower in cell i  ← paints v+1 flowers!
    //   So column count = v+1, range [pa2, pa1].
    const mee = st.params.pa2 - 1;
    const kl  = st.params.pa1 - mee;
    st.columns = [];
    for (let col = 0; col < MAX_STL; col++) {
        let v = Math.floor(Math.random() * st.params.pa1);
        if (v < mee) v = mee + Math.floor(Math.random() * kl);
        st.columns.push(v + 1);    // count = v+1 (loop paints i=0..v inclusive)
    }
    dbg("columns (flower counts):", st.columns.join(","));

    // Render live flowers (fli11.png, 26×29 BMP with BLACK as transparent —
    // matches original paintf: `If Not che = 0 Then SetPixel ...`).
    // Position = shp1(col,row).Left, .Top verbatim (matches TransBltNow).
    st.flowerEls = [];
    for (let col = 0; col < MAX_STL; col++) {
        const colEls = [];
        for (let row = 0; row < st.columns[col]; row++) {
            const f = img(ROOT + "/fli11.png", "lmath-flower",
                          COL_X[col], CELL_TOPS[row], FLI_W, FLI_H);
            stage.appendChild(f);
            colEls.push(f);
        }
        st.flowerEls.push(colEls);
    }

    // Digit buttons cmda(0..pa1-1) — use extracted n{i}.png / n{i}a.png assets.
    // n#.png = enabled state; n#a.png = pressed/disabled state. Original keeps
    // them disabled until Command1_Click, but UX-wise we let the player START
    // the round by pressing a digit (auto-fires onTargClick first, then the
    // digit press is processed against the just-started round).
    st.cmdaEls = [];
    for (let i = 0; i < st.params.pa1; i++) {
        const x = CMDA_X0 + i * CMDA_DX;
        const b = mk("button", "lmath-cmda", x, CMDA_Y, CMDA_SIZE, CMDA_SIZE);
        const digit = i + 1;
        b.dataset.digit = String(digit);
        b.style.backgroundImage  = "url(" + ROOT + "/n" + digit + ".png)";
        b.style.backgroundSize   = "100% 100%";
        b.disabled = false;      // clickable from the start (auto-starts round)
        b.addEventListener("click", function () {
            if (gameState && gameState.paused) {
                dbg("CLICK cmda[" + digit + "] while paused → auto-start round");
                onTargClick();
            }
            onDigit(digit);
        });
        stage.appendChild(b);
        st.cmdaEls.push(b);
    }

    // Round indicators siv(0..tur-1) — siv(current)=s3, prior=s2, future=s1.
    st.sivEls = [];
    for (let i = 0; i < st.params.tur; i++) {
        const x = SIV_X0 + i * SIV_DX;
        const e = img(ROOT + "/" + sivStateFor(i) + ".png", "lmath-siv",
                       x, SIV_Y, SIV_SIZE, SIV_SIZE);
        stage.appendChild(e);
        st.sivEls.push(e);
    }

    // Shadow under the play button (shad1 = "ready"; shad0 = "active").
    // shad(1) is visible initially per Form_Load: shad(1).Visible = True.
    const shad = img(ROOT + "/shad1.png", "lmath-shad",
                     SHAD_X, SHAD_Y, SHAD_W, SHAD_H);
    stage.appendChild(shad);
    st.shadEl = shad;

    // targ — big play/pause indicator. targ(1) initially visible (ready).
    // Click acts as Command1 (start round) on first press, then as
    // targ_Click (pause/resume toggle).
    const targEl = mk("button", "lmath-targ", TARG_X, TARG_Y, TARG_W, TARG_H);
    targEl.style.backgroundImage = "url(" + ROOT + "/targ1.png)";
    targEl.style.backgroundSize  = "100% 100%";
    targEl.title = "התחל / השהה";
    targEl.addEventListener("click", function () { onTargClick(); });
    stage.appendChild(targEl);
    st.targEl = targEl;

    // Label4 — "->      <-" arrows pointing inward at targ. Original .frm:
    // Left=6900 Top=4875 W=2790 H=465 → (460, 325, 186, 31). Aharoni 18pt bold.
    const arrows = mk("div", "lmath-arrows", 460, 325, 186, 31);
    arrows.textContent = "->      <-";
    stage.appendChild(arrows);
    st.arrowsEl = arrows;

    // Picture1 — main ladybug "threat". Single <img>, swap src per frame
    // (cleaner than 8 stacked images with display toggling). 8 frames cycle
    // by frameTimer at BUG_FRAME_MS; horizontal walk by walkTimer at
    // 1500/lbls ms. Static at frame 0 while paused.
    const bug = img(ROOT + "/bug0.png", "lmath-bug", BUG_X0, BUG_Y, BUG_W, BUG_H);
    stage.appendChild(bug);
    st.bugEl    = bug;
    st.ladybugX = BUG_X0;
    st.bugFrame = 0;

    // shpup — progress indicator (where the player has answered up to).
    // Visible from start at SHPUP_X0 (matches Form_Load — shpup design
    // Visible=True, no code hides it). Advances per correct answer via
    // upt_Timer (advanceShpup below).
    const up = img(ROOT + "/up0.png", "lmath-shpup", SHPUP_X0, SHPUP_Y, SHPUP_W, SHPUP_H);
    stage.appendChild(up);
    st.shpupEl    = up;
    st.shpupX     = SHPUP_X0;
    st.shpupFrame = 0;

    // Invisible hotspots — original Form1.Label2 (×) and help label have
    // BackStyle=0 (transparent), no Caption, only a custom MouseIcon. They
    // are click hotspots layered on top of the form background art.
    const xBtn = mk("button", "lmath-hotspot", EXITX_X, EXITX_Y, EXITX_W, EXITX_H);
    xBtn.title = "יציאה";
    xBtn.addEventListener("click", function () { dbg("CLICK exit-×"); exit(); });
    stage.appendChild(xBtn);

    const helpBtn = mk("button", "lmath-hotspot", HELP_X, HELP_Y, HELP_SIZE, HELP_SIZE);
    helpBtn.title = "עזרה";
    helpBtn.addEventListener("click", function () {
        dbg("CLICK help"); playWav("voice", "hiphlp.wav");
    });
    stage.appendChild(helpBtn);

    dbg("round rendered — paused, awaiting targ click");
}

function sivStateFor(i) {
    const st = gameState;
    if (i + 1 < st.sivov) return "s2";
    if (i + 1 === st.sivov) return "s3";
    return "s1";
}

// === Play / pause (Command1_Click then targ_Click in Form1) ===============
// First click = Command1_Click (start): hide Label4 arrows, swap to active
// pose (targ0/shad0), enable Timer1+Timer2+cmda. Later clicks = targ_Click
// pause/resume toggle (swap targ/shad poses + timers + cmda enabled state).
function onTargClick() {
    const st = gameState;
    if (!st) return;
    if (st.arrowsEl) st.arrowsEl.style.display = "none";   // Timer4 stops, Label4 hides
    if (st.paused) {
        dbg("CLICK targ → resume");
        st.paused = false;
        st.targEl.style.backgroundImage = "url(" + ROOT + "/targ0.png)";  // active pose
        if (st.shadEl) st.shadEl.src    = ROOT + "/shad0.png";
        st.cmdaEls.forEach(function (b) { b.disabled = false; });
        startGameTimers();
    } else {
        dbg("CLICK targ → pause");
        st.paused = true;
        st.targEl.style.backgroundImage = "url(" + ROOT + "/targ1.png)";  // ready pose
        if (st.shadEl) st.shadEl.src    = ROOT + "/shad1.png";
        st.cmdaEls.forEach(function (b) { b.disabled = true; });
        stopGameTimers();
    }
}
function startGameTimers() {
    const st = gameState;
    if (!st) return;
    // Timer1.Interval = Int(1500 / lbls)   — Form1.Form_Load
    const walkInt = Math.max(20, Math.round(1500 / st.params.lbls));
    if (walkTimer)  clearInterval(walkTimer);
    if (frameTimer) clearInterval(frameTimer);
    walkTimer  = setInterval(onWalkTick,  walkInt);
    frameTimer = setInterval(onFrameTick, BUG_FRAME_MS);
    vdbg("timers started — walk every " + walkInt + "ms, frame every " + BUG_FRAME_MS + "ms");
}

// Timer1_Timer port — lalk = 1, Picture1(0).Left += lalk; LOSE if Left > 445.
function onWalkTick() {
    const st = gameState;
    if (!st || st.paused) return;
    st.ladybugX += 1;
    st.bugEl.style.left = st.ladybugX + "px";
    vdbg("walk → x=" + st.ladybugX);
    if (st.ladybugX > BUG_LOSE_X) {
        dbg("ladybug Left=" + st.ladybugX + " > " + BUG_LOSE_X + " → LOSE (Form4)");
        stopGameTimers();
        goLose();
    }
}
// Timer2_Timer port — cycle Picture1(0..7) by swapping bug.src.
function onFrameTick() {
    const st = gameState;
    if (!st || st.paused) return;
    st.bugFrame = (st.bugFrame + 1) % BUG_FRAMES;
    st.bugEl.src = ROOT + "/bug" + st.bugFrame + ".png";
    vdbg("bug frame → " + st.bugFrame);
}

// upt_Timer port — animate shpup advance (14 frames over ~140ms) by COL_DX.
// Called when player gets a correct answer; shpup hops from its current x to
// the just-answered column's x position, cycling through the 14 sprite frames.
let shpupTimer = null;
function advanceShpup(fromCol, toCol) {
    const st = gameState;
    if (!st || !st.shpupEl) return;
    if (shpupTimer) { clearInterval(shpupTimer); shpupTimer = null; }
    st.shpupEl.style.visibility = "";
    const targetX = (toCol < MAX_STL) ? COL_X[toCol] - 10 : COL_X[MAX_STL - 1] + 40;
    const fromX   = st.shpupX;
    const step    = (targetX - fromX) / SHPUP_FRAMES;
    let counter = 0;
    shpupTimer = setInterval(function () {
        counter += 1;
        st.shpupX += step;
        st.shpupEl.style.left = st.shpupX + "px";
        st.shpupFrame = (counter - 1) % SHPUP_FRAMES;
        st.shpupEl.src = ROOT + "/up" + st.shpupFrame + ".png";
        if (counter >= SHPUP_FRAMES) {
            clearInterval(shpupTimer); shpupTimer = null;
            st.shpupX = targetX;
            st.shpupEl.style.left = targetX + "px";
            // Settle on frame 0 (resting pose).
            st.shpupEl.src = ROOT + "/up0.png";
            vdbg("shpup advance done → x=" + targetX);
        }
    }, SHPUP_TICK_MS);
    vdbg("shpup advancing col " + fromCol + " → " + toCol + " (x " + fromX.toFixed(1) + " → " + targetX + ")");
}

// === Digit press (cmda_Click in Form1) ====================================
function onDigit(digit) {
    const st = gameState;
    if (!st || st.paused) return;
    // io = 2; For i=0..8: cmda(i).Enabled = False — lock while evaluating.
    st.cmdaEls.forEach(function (b) { b.disabled = true; });

    const need = st.columns[st.NomStl];
    dbg("CLICK digit=" + digit + " need=" + need + " col=" + st.NomStl + " (round " + st.sivov + ")");

    if (digit === need) {
        st.wrongCount = 0;
        eatColumn(st.NomStl);
        playWav("fx", "good" + (1 + Math.floor(Math.random() * 3)) + ".wav");
        const prevCol = st.NomStl;
        st.NomStl += 1;
        // Picture1 (threat) keeps walking via Timer1 — DON'T advance it.
        // shpup (progress) hops to the just-answered column via upt_Timer.
        advanceShpup(prevCol, st.NomStl);
        dbg("correct → eat col " + prevCol + " (NomStl→" + st.NomStl + ")");

        if (st.NomStl >= MAX_STL) {
            stopGameTimers();
            // Round complete. If sivov == Form2.tur: WIN (Form3); else next round.
            if (st.sivov >= st.params.tur) {
                dbg("round " + st.sivov + " done → all " + st.params.tur + " done → WIN");
                goWin();
            } else {
                dbg("round " + st.sivov + " done → starts.wav → round " + (st.sivov + 1));
                st.sivov += 1;
                // Mirror MMControl1_Done chain: starts.wav, then auto-trigger
                // Command1_Click (Form1.MMControl1_Done at sof=55). Render the
                // fresh round first so the player sees it before auto-starting.
                renderRound();
                let autoStarted = false;
                const autoStart = function () {
                    if (autoStarted) return;
                    autoStarted = true;
                    // Only auto-resume if still paused (player might have
                    // clicked targ or a digit during starts.wav playback).
                    if (gameState && gameState.paused) onTargClick();
                };
                playWav("voice", "starts.wav", autoStart);
                // Fallback: auto-start after 2s even if audio fails to fire
                // ended (browser autoplay block, missing file, etc.).
                setTimeout(autoStart, 2000);
            }
            return;
        }
        // Re-enable buttons for next column.
        setTimeout(function () {
            if (gameState) gameState.cmdaEls.forEach(function (b) { b.disabled = false; });
        }, 250);
    } else {
        st.wrongCount += 1;
        dbg("wrong (" + st.wrongCount + ")");
        if (st.wrongCount === 1) {
            // First wrong: ra1.wav + PUSH Picture1 FORWARD (closer to LOSE) by
            // (lbls*3 + 200)/15 px. Original: Picture1.Left = Picture1.Left + push
            // ('+', not '-' — the threat advances on each mistake).
            playWav("fx", "ra1.wav");
            const push = (st.params.lbls * 3 + 200) / 15;
            st.ladybugX = st.ladybugX + push;
            st.bugEl.style.left = st.ladybugX + "px";
            dbg("push forward " + push.toFixed(1) + "px → x=" + st.ladybugX.toFixed(1));
            // If push crosses LOSE line, fire immediately for snappier feedback
            // (otherwise next walkTick would catch it after 1500/lbls ms).
            if (st.ladybugX > BUG_LOSE_X) {
                dbg("push crossed LOSE line → goLose");
                stopGameTimers();
                goLose();
                return;
            }
        } else if (st.wrongCount === 2) {
            // 2nd wrong: st.wav, then announce correct count via N.wav (Form1
            // MMControl1_Done at taot=2 plays `lmath\<v>.wav`).
            playWav("fx", "st.wav", function () {
                playWav("voice", need + ".wav");
            });
        } else {
            // 3rd wrong: st.wav + Timer3 blink correct cmda(need-1) for ~1.4s.
            playWav("fx", "st.wav");
            blinkCorrect(need);
        }
        setTimeout(function () {
            if (gameState) gameState.cmdaEls.forEach(function (b) { b.disabled = false; });
        }, 250);
    }
}

function eatColumn(col) {
    const st = gameState;
    const flowers = st.flowerEls[col] || [];
    // ONE p per column — cmda_Click: `p = Int(9 * Rnd)` once before the loop.
    // Loop then paints every flower in the column with that one f{p}.bmp.
    const p = Math.floor(Math.random() * 10);
    const src = ROOT + "/f" + p + ".png";
    flowers.forEach(function (f, row) {
        // Eaten-flower paint offset from original: paintf shp1(i).Left - 1,
        // shp1(i).Top + 6. Eaten sprite is 35×25 (wider, shorter than live).
        f.src = src;
        f.style.left   = (COL_X[col] - 1) + "px";
        f.style.top    = (CELL_TOPS[row] + 6) + "px";
        f.style.width  = F_W + "px";
        f.style.height = F_H + "px";
        f.classList.add("lmath-eaten");
    });
    vdbg("ate col " + col + " with f" + p);
}

// Form1.Timer3_Timer port — toggle cmda(v-1).Visible 7 times then settle on.
function blinkCorrect(digit) {
    const btn = (gameState.cmdaEls || [])[digit - 1];
    if (!btn) return;
    if (blinkTimer) clearInterval(blinkTimer);
    let n = 0;
    blinkTimer = setInterval(function () {
        btn.style.visibility = (btn.style.visibility === "hidden") ? "" : "hidden";
        n += 1;
        if (n > 6) {
            clearInterval(blinkTimer); blinkTimer = null;
            btn.style.visibility = "";
            dbg("blink correct=" + digit + " done");
        }
    }, 200);   // Form1.Timer3.Interval = 150 (we use 200 for visibility).
}

// === Win / Lose ===========================================================
// Form3 win screen: Picture = win.bmp + end.avi via MMControl1 + flat_Timer
// at 220ms picks a random (xb in [-10,610], yb in [-10,390]) where the form
// pixel is "dark" (GetPixel < 9000000), then paints fla(7..9) at that pos.
// Flowers accumulate; never disappear. After ~100 ticks (~22s) auto-exits.
// flatp_Timer paints a "follower" fla(0..5) near the last position.
//
// Our port: same scatter-and-accumulate behavior, but flowers FALL FROM
// ABOVE to their landing spot ("stick to ground" feel the user expects),
// then settle and stay. Each spawn is one fla(7/8/9) primary + a smaller
// fla(0/3/5/6) follower nearby — matching the dual-timer original.
let winSpawner = null;
function goWin() {
    stopAllAudio();
    stopGameTimers();
    if (winSpawner) { clearInterval(winSpawner); winSpawner = null; }
    clearStage();
    setBg("win.png");                    // Form3.Picture = win.bmp
    playWav("voice", "win.wav");
    dbg("WIN screen shown");

    const overlay = mk("div", "lmath-confetti", 0, 0, DW, DH);
    overlay.style.pointerEvents = "none";
    stage.appendChild(overlay);

    // Primary sprites (fla 7..9 — 34×35) used by flat_Timer.
    const PRIMARY = ["fla7", "fla8", "fla9"];
    // Follower sprites (fla 0,3,5,6 — 35×25) used by flatp_Timer.
    const FOLLOWER = ["fla0", "fla3", "fla5", "fla6"];
    let stopm = 0;

    function spawn(spriteName, w, h) {
        const x = Math.max(0, Math.min(DW - w, Math.random() * DW));
        // Land at a random y in the lower 2/3 of the canvas — flowers fall
        // and stick (matches user's memory of "fall + stick to ground").
        const landY = 50 + Math.random() * (DH - 100 - h);
        const startY = -h - 20;
        const fall = mk("div", "lmath-petal-wrap", x, startY, w, h);
        const im = img(ROOT + "/" + spriteName + ".png", "lmath-petal", 0, 0, w, h);
        fall.appendChild(im);
        overlay.appendChild(fall);
        // Random spin per petal: 2–4 full turns, half clockwise / half CCW so
        // they tumble naturally instead of all going one direction.
        const turns = 2 + Math.floor(Math.random() * 3);
        const sign  = Math.random() < 0.5 ? 1 : -1;
        const rot   = sign * turns * 360;
        fall.style.setProperty("--land-y", landY + "px");
        fall.style.setProperty("--rot",    rot + "deg");
        fall.style.animation = "lmath-petal-drop " +
            (1.2 + Math.random() * 0.8).toFixed(2) +
            "s cubic-bezier(.55,.06,.68,.19) forwards";
    }

    // Original timing: flat_Timer Interval=220ms, flatp_Timer ~50ms (follower
    // paint on same tick effectively). We spawn primary + follower per tick.
    winSpawner = setInterval(function () {
        stopm += 1;
        spawn(PRIMARY[Math.floor(Math.random() * PRIMARY.length)], 34, 35);
        spawn(FOLLOWER[Math.floor(Math.random() * FOLLOWER.length)], 35, 25);
        if (stopm > 100) {
            // Original auto-exits at stopm > 100 (calls cmdx_Click → back to
            // start.frm). We just stop spawning — let the player click.
            clearInterval(winSpawner); winSpawner = null;
            vdbg("win confetti spawn done — 100 ticks");
        }
    }, 220);

    addEndButtons("win");
}
function goLose() {
    stopAllAudio();
    stopGameTimers();
    clearStage();
    setBg("blose.png");                  // Form4.Picture = blose.jpg
    playWav("voice", "loose.wav");
    dbg("LOSE screen shown");
    addEndButtons("lose");
}
// Form3 (win) + Form4 (lose) both have cndgo (play again) + cmdx (exit)
// using caf2.bmp + caf1.bmp. Original twips:
//   Form3 (win)  cndgo=(4725,4800), cmdx=(2925,4800), W=1605, H=915
//   Form4 (lose) cndgo=(4275,5700), cmdx=(2475,5700), W=1605, H=915
// At twips÷15: Form3=(315,320 / 195,320), Form4=(285,380 / 165,380).
// BUT Form3 was authored with ScaleHeight=760 (designer at 120 DPI) while
// ClientHeight=9120 only maps to 608 px @ 96 DPI — the form is taller than
// it appears, so the design Top=4800 lands at 67% in a 480-clipped view,
// not at the visual "bottom" the artwork expects. Rescale Form3 Y by
// 480/760 from the design ScaleHeight context: 320 * 480 / 760 ≈ 202… no,
// the other direction: 4800 design-px ÷ (760/480) → push to bottom band.
// Practical fix: use the design-px-from-form-bottom offset (760-320-61=379),
// applied to 480: 480-379-61 = 40 from top, which is wrong too.
// What actually matches the artwork: shift buttons down ~80px so they land
// in the lower band where win.bmp draws its frame. Match Form4's y=380.
function addEndButtons(form /* "win" | "lose" */) {
    const params = gameState ? gameState.params : null;
    const layout = (form === "win")
        ? { goX: 315, goY: 380, xX: 195, xY: 380 }
        : { goX: 285, goY: 380, xX: 165, xY: 380 };

    const again = mk("button", "lmath-end", layout.goX, layout.goY, 107, 61);
    again.style.backgroundImage = "url(" + ROOT + "/caf2.png)";
    again.style.backgroundSize  = "100% 100%";
    again.title = "לשחק עוד פעם";
    again.addEventListener("click", function () {
        dbg("CLICK play-again"); if (params) startGame(params);
    });
    stage.appendChild(again);

    const out = mk("button", "lmath-end", layout.xX, layout.xY, 107, 61);
    out.style.backgroundImage = "url(" + ROOT + "/caf1.png)";
    out.style.backgroundSize  = "100% 100%";
    out.title = "לצאת";
    out.addEventListener("click", function () { dbg("CLICK end-exit"); openStart(); });
    stage.appendChild(out);
}

// === start.frm (level select) =============================================
function openStart() {
    stopAllAudio();
    stopGameTimers();
    gameState = null;
    if (!wrap) buildShell();
    clearStage();
    setBg("rac.png");                    // start.Picture = rac.jpg
    dbg("START screen shown");

    // 5 invisible hotspots overlaid on rac.png. Positions are twips/15 verbatim
    // from start.frm Begin VB.Label Command{2,3,4,6} and CommandButton Command1.
    function hot(label, x, y, w, h, onClick) {
        const b = mk("button", "lmath-hot", x, y, w, h);
        b.title = label;
        b.addEventListener("click", function () {
            dbg("CLICK start.hotspot:", label);
            onClick();
        });
        stage.appendChild(b);
        return b;
    }
    // Command2 (level 1, easy)        Left=4950 Top=1950 W=2115 H=1170
    hot("קל",      330, 130, 141, 78, function () { startGame(PRESETS[1]); });
    // Command3 (level 2, medium)      Left=4275 Top=3600 W=2115 H=1065
    hot("בינוני",  285, 240, 141, 71, function () { startGame(PRESETS[2]); });
    // Command4 (level 3, hard)        Left=3675 Top=5175 W=2220 H=1170
    hot("קשה",     245, 345, 148, 78, function () { startGame(PRESETS[3]); });
    // Command6 (custom settings)      Left=7875 Top=3900 W=1275 H=600
    hot("התאמה אישית",  525, 260, 85, 40, openSettings);
    // Command1 (exit, top-right ×)    Left=8850 Top=75 W=690 H=555
    const exitBtn = hot("יציאה",       590, 5,   46, 37, exit);
    exitBtn.classList.add("lmath-exit");
}

// === Form2 (custom settings) ==============================================
let customParams;
function openSettings() {
    customParams = Object.assign({}, DEFAULT_PARAMS);
    clearStage();
    setBg("ba2.png");                    // Form2.Picture = ba2.jpg
    dbg("SETTINGS screen shown — params:", JSON.stringify(customParams));

    // Sliders — Form2 UpDown design Min/Max + label captions.
    //   UpDown4: "מספר הסיבובים" (rounds)  Min=1 Max=4   at (152, 259)
    //   UpDown3: "עד"            (upper)   Min=2 Max=9   at (408, 328)
    //   UpDown5: "מ"             (lower)   Min=1 Max=8   at (408, 288)
    //   UpDown2: "מהירות"        (speed)   Min=5 Max=50  at (152, 352)
    addSlider("tur",  "מספר הסיבובים", 1,  4,  140, 259);
    addSlider("pa1",  "עד",             2,  9,  390, 328);
    addSlider("pa2",  "מ",              1,  8,  390, 288);
    addSlider("lbls", "מהירות",         5, 50,  140, 352);

    // cmdgo (התחל) — Left=5130 Top=1620 W=1575 H=855 → (342, 108, 105, 57)
    const start = mk("button", "lmath-settings-go", 342, 108, 105, 57);
    start.textContent = "התחל";
    start.addEventListener("click", function () {
        // Form2.Timer1: enforce pa2 < pa1 (lower < upper).
        if (customParams.pa2 >= customParams.pa1) customParams.pa2 = customParams.pa1 - 1;
        dbg("CLICK settings.start — params:", JSON.stringify(customParams));
        startGame(Object.assign({ lshorot: 10 }, customParams));
    });
    stage.appendChild(start);

    // Command1 (לצאת) — Left=3060 Top=1620 W=1575 H=855 → (204, 108, 105, 57)
    const back = mk("button", "lmath-settings-x", 204, 108, 105, 57);
    back.textContent = "לצאת";
    back.addEventListener("click", function () { dbg("CLICK settings.back"); openStart(); });
    stage.appendChild(back);

    // Label1 (top-right close, invisible hotspot) — Form2.frm: BackStyle=0,
    // no Caption, only MouseIcon. Pure click target. Left=9000 Top=0 → (600,0).
    const close = mk("button", "lmath-hotspot", 600, 0, 41, 38);
    close.title = "סגור";
    close.addEventListener("click", function () { dbg("CLICK settings.close"); openStart(); });
    stage.appendChild(close);
}
function addSlider(key, label, min, max, x, y) {
    const w = mk("div", "lmath-slider", x, y, 220, 38);
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const val = document.createElement("span");
    val.textContent = String(customParams[key]);
    const inp = document.createElement("input");
    inp.type = "range"; inp.min = String(min); inp.max = String(max);
    inp.value = String(customParams[key]);
    inp.addEventListener("input", function () {
        customParams[key] = parseInt(inp.value, 10);
        val.textContent = inp.value;
        vdbg("slider " + key + " → " + inp.value);
    });
    w.appendChild(val);  // RTL: value reads on the right after label
    w.appendChild(inp);
    w.appendChild(lbl);
    stage.appendChild(w);
}

// === Keyboard ============================================================
// Mirror Form1.Form_KeyDown:
//   ESC: Unload Me → start.Visible = True   (back to level select)
//   '0'..'9' (KeyCode 48..57): cmda_Click(i)  where i = (KeyCode - 49) or 9
//   start.frm Form_KeyDown additionally: T → Command5_Click (התחל)
function onKey(e) {
    if (!gameState) {
        // On start or settings screens: ESC exits to Sst.
        if (e.key === "Escape") { dbg("KEY ESC (no game)"); exit(); }
        return;
    }
    if (e.key === "Escape") {
        // Form1.Form_KeyDown: ESC → Unload Me; start.Visible = True
        // (back to level-select). NOT all the way back to Sst.
        dbg("KEY ESC (in game) → level select");
        openStart();
        return;
    }
    if (e.key === "Enter") {
        if (gameState.paused) { dbg("KEY ENTER → start"); onTargClick(); }
        return;
    }
    if (e.key >= "1" && e.key <= "9") {
        const d = parseInt(e.key, 10);
        if (d <= gameState.params.pa1) {
            if (gameState.paused) { onTargClick(); return; }
            onDigit(d);
        }
    }
}

// === Debug overlay ========================================================
// Toggle showing all hotspot/control boundaries with colored outlines + labels
// so layout misalignment is visible at a glance. Survives screen switches by
// adding a `lmath-debug-on` class to the stage.
function setDebugOverlay(on) {
    if (!stage) return;
    if (on) stage.classList.add("lmath-debug-on");
    else    stage.classList.remove("lmath-debug-on");
    dbg("debug overlay:", on ? "ON" : "OFF");
}

// === Public entry point ===================================================
window.LmathGame = {
    verbose: VERBOSE_DEFAULT,
    launch: function (returnTo) {
        dbg("launch — returnTo=" + (returnTo ? "set" : "null"));
        returnFn = returnTo;
        openStart();
    },
    // For console debugging — operators can call these to jump screens or
    // visualize the hotspot layout.
    _debug: {
        openStart:    openStart,
        openSettings: openSettings,
        startLevel:   function (n) { startGame(PRESETS[n]); },
        win:          function () { goWin(); },
        lose:         function () { goLose(); },
        state:        function () { return gameState; },
        overlay:      setDebugOverlay,        // .overlay(true|false)
    },
};

})();
