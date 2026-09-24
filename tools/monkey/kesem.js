// Shared Kesem-suite driver. Every Kesem app (Brahot, Hagim, Yeled, Shabat,
// Dvash, KolKore*, English*, …) shares the same Sst → Games*.frm → nikod
// flow, so one data-driven walker covers them all. An app driver is:
//
//   module.exports = { run: ctx => require('../kesem').runApp(ctx, 'Brahot', { /* overrides */ }) };
//
// What runApp does (see DEFAULTS for the knobs):
//   * every rama tab (Icon_s / config.maxRama) × every path (btnIcon) × every
//     stage: enters it, plays it CORRECTLY from live state (window.__kesemSession)
//     — game1 click target hotspot, game2 matching cover, game3 inspect every
//     hotspot then "next", game4 cycle arrows → pick → place, game5 pick the
//     right piece — and asserts the stage advances;
//   * path end: Video_End (if any) → nikod score board. The expected score is
//     computed independently from the clicks the driver made (all-correct ⇒
//     100 / "מצוין") and compared against the board AND localStorage;
//     completion must light the lamp and set kesem.<App>.completed;
//   * some paths get deliberate WRONG answers (1, 2, 3 wrongs → yellow/yellow/red
//     buckets, wrongCount must increment), some stages get a ctx.monkey() chaos
//     burst (must not crash or stick; board must stay self-consistent);
//   * side screens: rama tab burst-switching, btnSeret videos, mashal parables,
//     lamp → saved-score replay, mid-game picexi misger (no / next-stage / yes →
//     partial board), mahak reset, exit confirm (no, and finally yes).
//
// Media is sped up (playbackRate, default ×16) so audio-`ended`-driven chains
// run fast without changing control flow. --quick plays only the first
// `quickSlots` paths per rama; a normal run plays every path of every rama.
'use strict';

const DEFAULTS = {
  rate: 16,              // HTMLMediaElement playbackRate (Chromium max 16)
  ramas: null,           // [1,2,…]; default 1..config.maxRama (tabs the user can reach)
  slots: null,           // (rama, slots) => indices to play; default all with stages
  quickSlots: 2,         // --quick: paths per rama
  entry: null,           // async k => get from initialScreen to sst (Dvash: frmSel)
  exitSel: '.frm-ctrl--CmdExit',   // Sst control that raises the exit misger
  seretSel: '.frm-ctrl--btnSeret', // Sst video buttons (exitSel is excluded)
  wrongEvery: 3,         // every Nth played path gets wrong answers (0 = never)
  chaosEvery: 5,         // every Nth played path gets a chaos burst (0 = never)
  chaosClicks: 25,
  sideScreens: true,
  lampCheck: true,       // after every rama switch, lit lamps must match that rama's completions
  extra: null,           // async k => app-specific side screens (after the main loop)
  patch: null,           // k => void: override Kesem methods for app-specific Sst
                         // layouts (selectRama, enterPath, lampIndex, visiblePaths)
  finalExit: true,       // end by confirming exit → must land on the launcher
  videoWatchMs: 1200,    // how long to let a video play before closing (quick / seret)
  stuckMs: 30000,        // no progress for this long ⇒ "stuck"
};

// ---------------------------------------------------------------- page side
// Installed with evaluateOnNewDocument so it survives navigations.
function pageInit(rate) {
  // Speed every media element up; keep it muted.
  const R = rate;
  const bump = m => { try { m.muted = true; m.defaultPlaybackRate = R; m.playbackRate = R; } catch (e) {} };
  const _play = HTMLMediaElement.prototype.play;
  // Track every element that plays (in the DOM or not) so overlapping audio
  // (two voices at once — #63) can be detected.
  const tracked = new Set();
  window.__kmOverlaps = [];
  const onPlaying = () => {
    const live = [...tracked].filter(m => !m.paused && !m.ended && m.tagName !== 'VIDEO');
    if (live.length > 1) window.__kmOverlaps.push(live.map(m => (m.currentSrc || m.src || '').replace(location.origin, '')));
  };
  HTMLMediaElement.prototype.play = function () {
    bump(this);
    if (!tracked.has(this)) { tracked.add(this); this.addEventListener('playing', onPlaying); }
    return _play.apply(this, arguments);
  };
  document.addEventListener('play', e => { if (e.target && e.target.playbackRate !== R) bump(e.target); }, true);
  document.addEventListener('loadedmetadata', e => { if (e.target instanceof HTMLMediaElement) bump(e.target); }, true);

  const km = window.__km = {};
  km.overlay = () =>
    document.querySelector('.video-overlay') ? 'video' :
    document.querySelector('.nikod-overlay') ? 'nikod' :
    document.querySelector('.misger-overlay') ? 'misger' : null;
  km.snap = () => {
    const s = window.__kesemSession;
    const ov = km.overlay();
    if (!s) return { ov, noSession: true, hash: location.hash };
    const a = s._audio;
    const st = s.activeStage;
    const sc = s._stageScore || {};
    return {
      screen: s.currentScreen, rama: s.rama, path: s.currentPath, stageIdx: s.currentStageIdx,
      gn: st ? st.gameNumber : null, razNom: st ? st.razNom : null, pic: st ? st.pic : null,
      nHot: st && st.hotspots ? st.hotspots.length : 0, maxTurn: s.maxTurn,
      target: s.targetHotspot, Gg_N: s.Gg_N, Pr_N: s.Pr_N, Pobeda: s.Pobeda, Tek_N: s.Tek_N,
      helek: s.helek, wrong: s.wrongCount, inspect: s.inspectCount,
      score: { green: sc.green || 0, yellow: sc.yellow || 0, red: sc.red || 0 },
      busy: !!(s.inputLocked || s._audioPlaying || (a && a.src && !a.paused && !a.ended)),
      ov,
    };
  };
  // Progress key: changes whenever the game moved on (next question, phase,
  // stage, screen or overlay).
  km.key = () => {
    const x = km.snap();
    return [x.screen, x.stageIdx, x.razNom, x.target, x.Pobeda, x.helek, x.Tek_N, x.ov].join('|');
  };
  const visible = el => {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  km.visible = (sel, i) => visible(document.querySelectorAll(sel)[i || 0]);
  // A clickable point on element sel[i]: the centre if it is top-most there,
  // otherwise the first point of a 7×7 grid that hits it. hit=false ⇒ the
  // element is fully covered (a real user could not click it).
  km.point = (sel, i) => {
    const el = typeof sel === 'string' ? document.querySelectorAll(sel)[i || 0] : sel;
    if (!visible(el)) return null;
    const r = el.getBoundingClientRect();
    const ok = (x, y) => { const h = document.elementFromPoint(x, y); return h && (h === el || el.contains(h)); };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight && ok(cx, cy)) return { x: cx, y: cy, hit: true };
    for (let a = 1; a < 8; a++) for (let b = 1; b < 8; b++) {
      const x = r.left + r.width * a / 8, y = r.top + r.height * b / 8;
      if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && ok(x, y)) return { x, y, hit: true };
    }
    return { x: cx, y: cy, hit: false };
  };
  // Client coords of hotspot rect (image px) of the active stage.
  km.hotRectClient = (idx) => {
    const s = window.__kesemSession;
    const pic1 = s.stage.querySelector('.frm-ctrl--Picture1');
    const img = s.stageImg;
    const rec = s.activeStage.hotspots[idx - 1];
    if (!pic1 || !img || !img.naturalWidth || !rec) return null;
    const pr = pic1.getBoundingClientRect();
    const k = pr.width / (pic1.offsetWidth || 1);
    const sc = Math.min(pic1.clientWidth / img.naturalWidth, pic1.clientHeight / img.naturalHeight);
    const ox = (pic1.clientWidth - img.naturalWidth * sc) / 2, oy = (pic1.clientHeight - img.naturalHeight * sc) / 2;
    return { x: pr.left + (ox + rec.x * sc) * k, y: pr.top + (oy + rec.y * sc) * k, w: rec.w * sc * k, h: rec.h * sc * k };
  };
  // A background point on Picture1's image that is outside every hotspot
  // rect and hit-tests to the picture itself (⇒ a "wrong" click).
  km.bgPoint = () => {
    const s = window.__kesemSession;
    const pic1 = s && s.stage.querySelector('.frm-ctrl--Picture1');
    const img = s && s.stageImg;
    if (!pic1 || !img || !img.naturalWidth) return null;
    const hs = (s.activeStage.hotspots || []).map((_, i) => km.hotRectClient(i + 1)).filter(Boolean);
    const ir = img.getBoundingClientRect();
    const sc = Math.min(ir.width / img.naturalWidth, ir.height / img.naturalHeight);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    const x0 = ir.left + (ir.width - dw) / 2, y0 = ir.top + (ir.height - dh) / 2;
    const pts = [];
    for (let a = 1; a < 16; a++) for (let b = 1; b < 16; b++) pts.push([x0 + dw * a / 16, y0 + dh * b / 16]);
    // Second pass: anywhere on Picture1 (letterbox bands count as background too).
    const pr = pic1.getBoundingClientRect();
    for (let a = 1; a < 24; a++) for (let b = 1; b < 24; b++) pts.push([pr.left + pr.width * a / 24, pr.top + pr.height * b / 24]);
    for (const [x, y] of pts) {
      if (hs.some(r => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2)) continue;
      const h = document.elementFromPoint(x, y);
      if (h === pic1 || h === img) return { x, y };
    }
    return null;
  };
  km.nikod = () => {
    const ov = document.querySelector('.nikod-overlay');
    if (!ov) return null;
    const cv = ov.querySelector('canvas');
    const p1 = cv && cv.parentElement;
    const divs = p1 ? [...p1.children].filter(e => e.tagName === 'DIV') : [];
    const t = divs.map(d => d.textContent.trim());
    const koter = [...ov.querySelectorAll('div')].find(d => d.style.top === '80px' && d.style.left === '60px');
    return { ltott: t[0], catov: t[1], toch: t.slice(-5).map(Number), title: koter ? koter.textContent : null };
  };
  km.ls = (app) => {
    const j = k => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return { __bad: String(e) }; } };
    return { completed: j('kesem.' + app + '.completed'), scores: j('kesem.' + app + '.scores') };
  };
  km.srcs = (sel) => [...document.querySelectorAll(sel)].map(el => {
    const cs = getComputedStyle(el);
    const im = el.querySelector('img');
    return (cs.display === 'none' ? 'hidden:' : '') + (im ? im.getAttribute('src') : '') + '|' + cs.backgroundImage;
  });
}

// ------------------------------------------------------------------ helpers
const VERDICTS = [[55, 'תרגיל וחזרה'], [65, 'כמעט שם'], [85, 'טוב'], [95, 'טוב מאוד'], [Infinity, 'מצוין']];
function expectedBoard(stages) {
  let g = 0, y = 0, r = 0, a = 0;
  for (const s of stages) if (s) { g += s.green; y += s.yellow; r += s.red; a += s.total; }
  const mispar = a ? Math.floor(((g * 5 + y * 2 + r) * 20) / a) : 0;
  const verdict = VERDICTS.find(([lim]) => mispar < lim)[1];
  return { mispar, verdict, toch: [a, g, y, r, Math.max(0, a - g - y - r)] };
}
const bucketOf = w => (w === 0 ? 'green' : w < 3 ? 'yellow' : 'red');

class Kesem {
  constructor(ctx, app, opt) {
    this.ctx = ctx; this.app = app; this.o = opt;
    this.played = 0;          // paths played (drives wrong/chaos schedule)
    this.coverage = [];       // per path summary lines
  }
  eval(fn, ...a) { return this.ctx.eval(fn, ...a); }
  /** Report audio that played on top of other audio since the last call. */
  async flushOverlaps() {
    const o = await this.eval(() => { const x = window.__kmOverlaps || []; window.__kmOverlaps = []; return x; }).catch(() => []);
    for (const srcs of o) this.ctx.finding('warn', 'overlapping audio', srcs.join(' + '));
  }

  /** Snapshot + recent trace, for failure details (report.json keeps it all). */
  async diag() {
    const s = await this.snap().catch(() => null);
    const n = this.ctx.traceLen();
    return JSON.stringify(s) + '\n' + this.ctx.traceSince(Math.max(0, n - 14)).join('\n');
  }
  cover(line) { this.coverage.push(line); this.ctx.finding('info', 'path played', line); }
  snap() { return this.eval(() => window.__km.snap()); }
  key() { return this.eval(() => window.__km.key()); }
  cfg() { return this.eval(() => { const s = window.__kesemSession; return s && { maxRama: s.config.maxRama, pin: s.config.activityRamaPin || null, initial: s.config.initialScreen }; }); }

  /** Click element sel[i] like a user would (hit-tested). */
  async tap(sel, i = 0, wait = 250, { quiet = false } = {}) {
    const p = await this.eval((s, j) => window.__km.point(s, j), sel, i);
    if (!p) { if (!quiet) this.ctx.finding('error', 'missing control', `not visible: ${sel}[${i}]`); return false; }
    if (!p.hit) {
      if (!quiet) this.ctx.finding('warn', 'control covered', `${sel}[${i}] is not top-most anywhere — clicked via JS`);
      await this.eval((s, j) => document.querySelectorAll(s)[j].click(), sel, i);
      await this.ctx.sleep(wait);
      return true;
    }
    await this.ctx.click(p.x, p.y, wait);
    return true;
  }
  async waitIdle(ms = 20000) {
    return this.ctx.waitFor(() => { const s = window.__km.snap(); return !s.busy; }, ms);
  }
  async waitKeyChange(before, ms) {
    return this.ctx.waitFor(k => window.__km.key() !== k, ms || this.o.stuckMs, before);
  }
  async waitScreen(name, ms = 8000) {
    return this.ctx.waitFor(n => { const s = window.__kesemSession; return s && s.currentScreen === n; }, ms, name);
  }

  /** Handle a video overlay: assert it plays, then close / let it end. */
  async video(label, { watch = null } = {}) {
    const ok = await this.ctx.waitFor(() => { const v = document.querySelector('.video-overlay video'); return v && (v.readyState >= 2 || v.error); }, 8000);
    const st = await this.eval(() => {
      const ov = document.querySelector('.video-overlay');
      if (!ov) return { gone: true };
      const v = ov.querySelector('video');
      return { src: v ? v.currentSrc || v.src : null, err: v ? !!v.error : true, rs: v ? v.readyState : 0,
               dur: v ? v.duration : 0, missingMsg: /הסרטון לא זמין/.test(ov.innerText) };
    });
    if (st.gone) return;
    const rel = String(st.src || '').replace(this.ctx.base, '');
    this.ctx.check(ok && !st.err && !st.missingMsg, 'video does not play', `${label}: ${rel} (readyState=${st.rs})`);
    await this.ctx.shot(`video-${label}`);
    const w = watch == null ? (this.ctx.quick ? this.o.videoWatchMs : null) : watch;
    if (w == null && st.dur && isFinite(st.dur) && st.dur / this.o.rate < 45) {
      // Full run: let it finish; auto-dismiss on `ended` must fire.
      const ended = await this.ctx.waitFor(() => !document.querySelector('.video-overlay'), (st.dur / this.o.rate) * 1000 + 8000);
      this.ctx.check(ended, 'video did not auto-close on end', `${label}: ${rel}`);
      if (ended) return;
    } else {
      await this.ctx.sleep(w || this.o.videoWatchMs);
    }
    if (await this.eval(() => !!document.querySelector('.video-overlay'))) {
      await this.tap('.video-overlay button[aria-label="close"]', 0, 400);
      const gone = await this.ctx.waitFor(() => !document.querySelector('.video-overlay'), 3000);
      this.ctx.check(gone, 'video close button does not close', label);
    }
  }

  async misgerAnswer(yes) {
    const sel = yes ? '.misger-overlay button[title="אישור"]' : '.misger-overlay button[title="ביטול"]';
    await this.tap(sel, 0, 500);
  }

  // ------------------------------------------------------------------ sst
  async toSst() {
    const cfg = await this.cfg();
    if (this.o.entry) await this.o.entry(this);
    else if (cfg && cfg.initial !== 'sst') this.ctx.finding('warn', 'no entry hook', `initialScreen=${cfg.initial}`);
    const ok = await this.waitScreen('sst');
    this.ctx.check(ok, 'Sst not reached', JSON.stringify(await this.snap()));
    return ok;
  }

  async selectRama(r) {
    const has = await this.eval(i => window.__km.visible('.frm-ctrl--Icon_s', 0) &&
      [...document.querySelectorAll('.frm-ctrl--Icon_s')].some(e => +e.dataset.index === i), r - 1);
    if (has) {
      const i = await this.eval(ix => [...document.querySelectorAll('.frm-ctrl--Icon_s')].findIndex(e => +e.dataset.index === ix), r - 1);
      await this.tap('.frm-ctrl--Icon_s', i, 500);
    }
    const s = await this.snap();
    if (s.rama !== r) {
      if (has) this.ctx.finding('error', 'rama tab did not switch', `clicked Icon_s[${r - 1}], rama=${s.rama}`);
      return false;
    }
    if (this.o.lampCheck) await this.checkLamps(r);
    return true;
  }

  /** btnLamp data-index that shows path i's score (KolKoreB: star pane). */
  lampIndex(i) { return i; }

  /** Path indices whose start control is visible on the current Sst. */
  visiblePaths() {
    return this.eval(() => [...document.querySelectorAll('.frm-ctrl--btnIcon')].filter(e => getComputedStyle(e).display !== 'none').map(e => +e.dataset.index));
  }

  /** Click whatever starts path i on the current rama; false if no control. */
  async enterPath(i) {
    const btnIdx = await this.eval(ix => [...document.querySelectorAll('.frm-ctrl--btnIcon')].findIndex(e => +e.dataset.index === ix), i);
    if (btnIdx < 0) return false;
    await this.tap('.frm-ctrl--btnIcon', btnIdx, 400);
    return true;
  }

  /** Lit lamps on Sst must be exactly the current rama's completed paths. */
  async checkLamps(r) {
    if (this.app === 'KolKoreB') return;   // lamps there track the selected btnIcon (cHos), not slot i
    const bad = await this.eval(app => {
      const s = window.__kesemSession;
      const done = window.__km.ls(app).completed[String(s.rama)] || {};
      return [...document.querySelectorAll('.frm-ctrl--btnLamp')].map(el => {
        const im = el.querySelector('img');
        const lit = getComputedStyle(el).display !== 'none' && !!im && /lamp2/i.test(im.getAttribute('src') || '');
        return { i: +el.dataset.index, lit, done: !!done[el.dataset.index] };
      }).filter(x => x.lit !== x.done);
    }, this.app);
    this.ctx.check(!bad.length, 'lamps do not match rama completions',
      `rama ${r}: ${bad.map(b => `lamp ${b.i} ${b.lit ? 'lit' : 'dark'} but path ${b.done ? 'completed' : 'not completed'}`).join('; ')}`);
  }

  async lampState(i) {
    return this.eval((ix, app, slot) => {
      const el = [...document.querySelectorAll('.frm-ctrl--btnLamp')].find(e => +e.dataset.index === ix);
      const s = window.__kesemSession;
      const done = !!((window.__km.ls(app).completed[String(s.rama)] || {})[String(slot)]);
      if (!el) return { exists: false, done };
      const im = el.querySelector('img');
      return { exists: true, done, shown: getComputedStyle(el).display !== 'none', src: im ? im.getAttribute('src') : '' };
    }, this.lampIndex(i), this.app, i);
  }

  // ----------------------------------------------------------------- play
  /**
   * Play the path currently loaded (screen already a game or its intro video). Returns
   * { expected: [per-stage tally|null], board, chaos }.
   */
  async playPath(tag, { wrongs = false, chaos = false } = {}) {
    const ctx = this.ctx;
    const exp = [];            // per stageIdx: {green,yellow,red,total} | null (game3) | 'chaos'
    let lastStage = null;
    // Wrong-answer path: the first question of every scored stage gets
    // 1, 2, 3, 1, … deliberate wrongs (→ yellow, yellow, red buckets), so
    // every game type's wrong handling is exercised.
    const wrongCycle = [1, 2, 3];
    let wrongN = 0;
    const wrongDue = new Set();
    let chaosDone = !chaos;
    let guard = 0;
    let stageCount = 0;
    const slotLen = await this.eval(() => { const s = window.__kesemSession; const sl = (s.paths.ramas[String(s.config.activityRamaPin || s.rama)] || {}).slots || []; const x = sl[s.currentPath]; return x && x.stages ? x.stages.length : 0; });
    while (guard++ < 400) {
      const s = await this.snap();
      if (s.ov === 'video') { await this.video(`${tag}-s${s.stageIdx}`); continue; }
      if (s.ov === 'nikod') break;
      if (s.ov === 'misger') { ctx.finding('error', 'unexpected misger', tag); await this.misgerAnswer(false); continue; }
      if (!s.screen || !/^game/.test(s.screen)) {
        // Path ended without a score board, or never started.
        await ctx.sleep(600);
        const s2 = await this.snap();
        if (s2.ov) continue;
        if (!/^game/.test(s2.screen || '')) { ctx.finding('error', 'path left game without nikod', `${tag}: screen=${s2.screen}`); await ctx.shot('no-nikod'); return null; }
        continue;
      }
      const sid = `${s.stageIdx}:${s.razNom}`;
      if (sid !== lastStage) {
        lastStage = sid;
        stageCount++;
        await this.flushOverlaps();
        ctx.step(`${tag}/stage${s.stageIdx + 1}-game${s.gn}`);
        const expectScreen = this.o.screenFor ? this.o.screenFor(s.gn) : (s.gn === 6 ? 'game3' : 'game' + s.gn);
        ctx.check(s.screen === expectScreen, 'wrong game screen', `${tag} stage ${s.stageIdx + 1}: gameNumber ${s.gn} shown on ${s.screen}`);
        await this.waitStageReady(s);
        await ctx.checkImages();
        await ctx.shot(`${tag}-st${s.stageIdx + 1}-g${s.gn}`);
        // Start from the live tally: 0 on a normal entry, but a chaos burst on
        // the previous stage may already have answered questions here.
        const sc0 = s.score || {};
        exp[s.stageIdx] = (s.gn === 3 || s.gn === 6) ? null : { green: sc0.green || 0, yellow: sc0.yellow || 0, red: sc0.red || 0, total: s.maxTurn };
        if (wrongs && exp[s.stageIdx] && s.nHot) wrongDue.add(s.stageIdx);
        if (!chaosDone && stageCount >= 2 || (!chaosDone && slotLen === 1)) {
          chaosDone = true;
          await this.chaos(tag, s);
          exp[s.stageIdx] = 'chaos';
          continue;
        }
      }
      const cur = exp[s.stageIdx];
      const plannedWrongs = (cur && cur !== 'chaos' && wrongDue.has(s.stageIdx)) ? wrongCycle[wrongN % 3] : 0;
      const r = await this.playTurn(tag, s, plannedWrongs);
      if (r && r.bucket && plannedWrongs) { wrongDue.delete(s.stageIdx); wrongN++; }
      if (r && cur && cur !== 'chaos' && r.bucket) cur[r.bucket]++;
      if (r && r.stuck) { await this.bailOut(tag); return null; }
    }
    // Board
    ctx.step(`${tag}/nikod`);
    const shown = await ctx.waitFor(() => !!document.querySelector('.nikod-overlay'), 10000);
    if (!shown) { ctx.finding('error', 'no nikod after path', tag); return null; }
    await ctx.sleep(1700);                       // Timg count-up (40 × 30 ms)
    const board = await this.eval(() => window.__km.nikod());
    await ctx.checkImages();
    await ctx.shot(`${tag}-nikod`);
    ctx.check(stageCount === slotLen || exp.length === slotLen, 'not every stage was visited', `${tag}: visited ${stageCount}/${slotLen}`);
    return { expected: exp, board, slotLen };
  }

  async waitStageReady(s) {
    const sel = {
      1: '.stage-hotspot', 2: '.stage-cover', 3: '.stage-hotspot', 4: '.frm-ctrl--Picture2', 5: '.stage-game5-choice',
    }[s.gn === 6 ? 3 : s.gn];
    if (!s.nHot || !sel) return;
    const ok = await this.ctx.waitFor(q => !!document.querySelector(q), 8000, sel);
    this.ctx.check(ok, 'stage controls never painted', `stage ${s.stageIdx + 1} game${s.gn} (${s.pic}): no ${sel}`);
  }

  /** Deliberate wrong click for the current question. Returns true if counted. */
  async wrongClick(s, n) {
    const ctx = this.ctx;
    await this.waitIdle();
    const before = (await this.snap()).wrong;
    let did = false;
    if (s.gn === 5) {
      const i = await this.eval(() => { const s = window.__kesemSession; const ch = [...s.stage.querySelectorAll('.frm-ctrl--Picture2')].filter(e => getComputedStyle(e).display !== 'none'); const k = ch.findIndex((_, j) => j !== s.Pr_N - 1); return k; });
      if (i >= 0) { await this.tap('.frm-ctrl--Picture2', i, 300); did = true; }
    } else if (s.gn === 4 && n === 0 && s.maxTurn > 1) {
      // wrong piece pick: cycle once away from Pr_N, click Picture2.
      const x = await this.snap();
      if (x.helek === 1) {
        if (x.Gg_N === x.Pr_N) await this.tap('.frm-ctrl--btnArw', 0, 200);
        await this.tap('.frm-ctrl--Picture2', 0, 300); did = true;
      }
    }
    if (!did) {
      if (s.gn === 4 && (await this.snap()).helek === 1) await this.pickGame4();
      const p = await this.eval(() => window.__km.bgPoint());
      if (p) await ctx.click(p.x, p.y, 300);
      else if (s.gn === 2) {
        // Tiled picture with no free background: a non-target cover is a wrong answer too.
        const i = await this.eval(() => { const s = window.__kesemSession; return [...document.querySelectorAll('.stage-cover')].findIndex(c => +c.dataset.idx !== s.Gg_N); });
        if (i < 0) { ctx.finding('info', 'no wrong target available', `stage ${s.razNom}`); return false; }
        await this.tap('.stage-cover', i, 300);
      } else { ctx.finding('info', 'no background point for wrong click', `stage ${s.razNom}`); return false; }
    }
    const after = (await this.snap()).wrong;
    ctx.check(after === before + 1, 'wrong answer not counted', `stage ${s.razNom} game${s.gn}: wrongCount ${before} → ${after}`);
    return after === before + 1;
  }

  async pickGame4() {
    const s = await this.snap();
    let n = 0;
    while ((await this.snap()).Gg_N !== s.Pr_N && n++ < 12) await this.tap('.frm-ctrl--btnArw', 0, 150);
    await this.waitIdle();
    await this.tap('.frm-ctrl--Picture2', 0, 300);
    const ok = await this.ctx.waitFor(() => window.__km.snap().helek === 2 && !!document.querySelector('.stage-hotspot'), 15000);
    if (!ok) this.ctx.finding('error', 'game4 correct piece not accepted', `Pr_N=${s.Pr_N}\n${await this.diag()}`);
    return ok;
  }

  /** Play one question (or the whole inspect stage for game 3). */
  async playTurn(tag, s, wrongs) {
    const ctx = this.ctx;
    await this.waitIdle();
    // The loop's snapshot may predate the end of the previous answer's audio
    // chain (which can advance the stage) — re-check before acting on it.
    const now = await this.snap();
    if (now.stageIdx !== s.stageIdx || now.razNom !== s.razNom || now.screen !== s.screen || now.ov) return {};
    const gn = s.gn === 6 ? 3 : s.gn;
    let made = 0;
    if (gn !== 3 && s.nHot) for (let i = 0; i < wrongs; i++) if (await this.wrongClick(s, i)) made++;
    if (made) { await this.waitIdle(); await ctx.shot(`${tag}-wrong${made}`); }
    let before = await this.key();
    const pre = await this.snap();
    if (!s.nHot && gn !== 5) {
      await this.tap('.frm-ctrl--Picture1', 0, 400);
    } else if (gn === 1) {
      await this.tap(`.stage-hotspot[data-idx="${pre.target}"]`, 0, 200);
    } else if (gn === 2) {
      await this.tap(`.stage-cover[data-idx="${pre.Gg_N}"]`, 0, 200);
    } else if (gn === 4) {
      if (pre.helek === 1 && !(await this.pickGame4())) return { stuck: true };
      await this.waitIdle();
      const p2 = await this.snap();
      before = await this.key();
      await this.tap(`.stage-hotspot[data-idx="${p2.Pr_N}"]`, 0, 200);
    } else if (gn === 5) {
      const ok = await ctx.waitFor(() => !!document.querySelector('.stage-game5-choice'), 5000);
      if (!ok) { ctx.finding('error', 'game5 has no choices', s.razNom); return { stuck: true }; }
      await this.tap('.frm-ctrl--Picture2', pre.Pr_N - 1, 200);
    } else if (gn === 3) {
      return this.playInspect(tag, s);
    }
    const wBefore = pre.wrong;
    const scBefore = pre.score;
    const moved = await this.waitKeyChange(before);
    if (!moved) {
      ctx.finding('error', 'stuck', `${tag} stage ${s.stageIdx + 1} game${gn}: no progress after correct click\n${await this.diag()}`);
      await ctx.shot('stuck');
      return { stuck: true };
    }
    if (!s.nHot) return {};
    const bucket = bucketOf(wBefore);
    // The per-stage tally must have gained exactly this bucket — unless the
    // stage already ended (then _stageScore is reset by the next stage).
    const post = await this.snap();
    if (post.stageIdx === pre.stageIdx && post.razNom === pre.razNom && post.screen === pre.screen && !post.ov) {
      const d = ['green', 'yellow', 'red'].map(b => post.score[b] - scBefore[b]);
      const want = ['green', 'yellow', 'red'].map(b => (b === bucket ? 1 : 0));
      ctx.check(d.join() === want.join(), 'answer scored in wrong bucket', `${tag} stage ${s.stageIdx + 1} game${gn}: ${wBefore} wrongs → expected ${bucket}, tally delta g/y/r=${d.join('/')}`);
    }
    return { bucket };
  }

  async playInspect(tag, s) {
    const ctx = this.ctx;
    // A chaos burst can leave the hak panel open (Picture22 over a hidden
    // Spic1) — close it like a user would before inspecting.
    if (await this.eval(() => window.__km.visible('.frm-ctrl--Picture22'))) {
      await this.waitIdle();
      await this.tap('.frm-ctrl--wa[data-index="4"]', 0, 500);
    }
    // #63: several hotspots clicked in quick succession must not talk over
    // each other (checked by the overlapping-audio tracker).
    await this.waitIdle();
    // A chaos burst that spilled into this stage may have left the hak
    // panel (Picture22) open over the hotspots — close it like a user would.
    if (await this.eval(() => window.__km.visible('.frm-ctrl--Picture22'))) {
      await this.tap('.frm-ctrl--wa[data-index="4"]', 0, 400);
      await this.waitIdle();
    }
    for (let i = 1; i <= Math.min(3, s.nHot); i++) {
      const p = await this.eval(q => window.__km.point(q), `.stage-hotspot[data-idx="${i}"]`);
      if (p && p.hit) await ctx.click(p.x, p.y, 40);
    }
    await this.waitIdle();
    await this.flushOverlaps();
    for (let i = 1; i <= s.nHot; i++) {
      await this.waitIdle();
      const before = (await this.snap()).inspect;
      const p = await this.eval(q => window.__km.point(q), `.stage-hotspot[data-idx="${i}"]`);
      if (p && !p.hit) ctx.finding('info', 'game3 hotspot fully covered by later hotspots', `${s.razNom} #${i} (unreachable by a user; .RAS data)`);
      await this.tap(`.stage-hotspot[data-idx="${i}"]`, 0, 250, { quiet: true });
      const after = (await this.snap()).inspect;
      if (i <= 8) ctx.check(after === Math.min(before + 1, 8), 'inspect click not registered', `${tag} stage ${s.stageIdx + 1} hotspot ${i}: inspectCount ${before} → ${after}`);
    }
    await this.waitIdle();
    if (!this._hakDone && await this.eval(() => window.__km.visible('.frm-ctrl--act1[data-index="1"]'))) {
      this._hakDone = true;
      await this.hak(tag);
    }
    const lit = await this.eval(() => [...document.querySelectorAll('.frm-ctrl--lblToz')].filter(t => getComputedStyle(t).display !== 'none' && /caftblu/.test((t.querySelector('img') || {}).src || '')).length);
    ctx.check(lit === Math.min(s.nHot, 9, s.maxTurn), 'game3 indicator count', `${tag}: ${lit} blue tiles for ${s.nHot} hotspots`);
    const before = await this.key();
    // Rapid triple-click on "next" (#61: fast clicks skipped levels) — must
    // advance exactly one stage.
    const p = await this.eval(() => window.__km.point('.frm-ctrl--act1[data-index="0"]'));
    if (!p) { ctx.finding('error', 'missing control', 'game3 act1[0] (next)'); return { stuck: true }; }
    for (let c = 0; c < 3; c++) await ctx.click(p.x, p.y, 40);
    const moved = await this.waitKeyChange(before, 10000);
    if (!moved) { ctx.finding('error', 'stuck', `${tag} game3 "next" (act1[0]) did nothing`); return { stuck: true }; }
    await ctx.sleep(300);
    const after = await this.snap();
    if (!after.ov && /^game/.test(after.screen || '') && after.stageIdx !== s.stageIdx + 1)
      ctx.finding('error', 'rapid "next" skipped a stage', `${tag}: game3 stage ${s.stageIdx + 1} → stage ${after.stageIdx + 1} after 3 fast clicks\n${await this.diag()}`);
    return {};
  }

  /** Games3 act1(1) hak panel: open, record + stop + play back, next item, close. */
  async hak(tag) {
    const ctx = this.ctx;
    const vis = sel => this.eval(q => window.__km.visible(q), sel);
    await this.tap('.frm-ctrl--act1[data-index="1"]', 0, 500);
    if (!ctx.check(await vis('.frm-ctrl--Picture22'), 'hak panel does not open', tag)) return;
    await ctx.checkImages();
    await ctx.shot(`${tag}-hak`);
    await this.tap('.frm-ctrl--wa[data-index="1"]', 0, 900);      // record start
    const rec = await this.eval(() => { const r = window.__kesemSession._kkbRec; return r && r.mr ? r.mr.state : 'none'; });
    ctx.check(rec === 'recording', 'hak record does not start', `${tag}: MediaRecorder state ${rec}\n${await this.diag()}`);
    await this.tap('.frm-ctrl--wa[data-index="1"]', 0, 700);      // stop
    const wa2 = await this.eval(() => { const e = document.querySelector('.frm-ctrl--wa[data-index="2"]'); return e && { dis: e.disabled === true || e.dataset.disabled === '1' || getComputedStyle(e).pointerEvents === 'none', url: !!(window.__kesemSession._kkbRec || {}).url }; });
    ctx.check(wa2 && wa2.url, 'hak recording not captured', `${tag}: ${JSON.stringify(wa2)}`);
    await this.tap('.frm-ctrl--wa[data-index="2"]', 0, 600, { quiet: true });   // play recording
    await this.tap('.frm-ctrl--dif[data-index="1"]', 0, 400, { quiet: true });  // next item
    await this.waitIdle();
    await ctx.shot(`${tag}-hak-rec`);
    await this.tap('.frm-ctrl--wa[data-index="4"]', 0, 500);      // close
    ctx.check(!(await vis('.frm-ctrl--Picture22')) && await vis('.frm-ctrl--Spic1'), 'hak panel does not close', tag);
    await this.waitIdle();
  }

  /** Random clicks inside the game screen; must not crash or stick. */
  async chaos(tag, s) {
    const ctx = this.ctx;
    ctx.step(`${tag}/chaos-stage${s.stageIdx + 1}`);
    // Stay in the level: no picexi / exit X / game3 "next".
    await ctx.monkey({
      n: this.o.chaosClicks, within: '.frm-stage', wait: 200,
      avoid: '.frm-ctrl--picexi,.frm-ctrl--act1[data-index="4"]' + (s.gn === 3 ? ',.frm-ctrl--act1[data-index="0"]' : ''),
      stopWhen: () => !!document.querySelector('.nikod-overlay,.video-overlay,.misger-overlay'),
    });
    if (await this.eval(() => !!document.querySelector('.misger-overlay'))) await this.misgerAnswer(false);
    await this.waitIdle();
    await ctx.assertAlive(`${tag} after chaos`, 1500);
    await ctx.shot(`${tag}-chaos`);
  }

  /** Leave a broken path: picexi → yes → close any board. */
  async bailOut(tag) {
    const ctx = this.ctx;
    await this.eval(() => { const v = document.querySelector('.video-overlay button[aria-label="close"]'); if (v) v.click(); });
    if (await this.eval(() => window.__km.visible('.frm-ctrl--picexi'))) {
      await this.tap('.frm-ctrl--picexi', 0, 500);
      await this.misgerAnswer(true);
    }
    await ctx.sleep(500);
    await this.eval(() => { const b = document.querySelector('.nikod-overlay button[title="חזרה אל המסלולים"]'); if (b) b.click(); });
    await this.waitScreen('sst', 4000);
  }

  async closeNikod() {
    await this.tap('.nikod-overlay button[title="חזרה אל המסלולים"]', 0, 500);
    return this.ctx.waitFor(() => !document.querySelector('.nikod-overlay'), 3000);
  }

  /** Compare a board to the expected tally; returns expected board. */
  checkBoard(tag, res, lsStages) {
    const ctx = this.ctx;
    const { expected, board } = res;
    const hasChaos = expected.some(e => e === 'chaos');
    // Chaos stages: take the app's own saved stage score (consistency only).
    const stages = expected.map((e, i) => (e === 'chaos' ? (lsStages && lsStages[i]) || null : e));
    const want = expectedBoard(stages);
    // Saved per-stage scores must match what we played.
    if (lsStages) {
      expected.forEach((e, i) => {
        const got = lsStages[i];
        if (e === 'chaos') {
          // Random clicks may answer any way, but never more questions than the stage has.
          const g = lsStages[i];
          if (g) ctx.check((g.green || 0) + (g.yellow || 0) + (g.red || 0) <= (g.total || 0), 'stage scored more answers than questions',
            `${tag} stage ${i + 1} (chaos): ${JSON.stringify(g)}`);
          return;
        }
        if (e === null) { ctx.check(!got, 'game3 stage stored a score', `${tag} stage ${i + 1}: ${JSON.stringify(got)}`); return; }
        if (!e) return;
        const g = got || {};
        ctx.check(g.green === e.green && g.yellow === e.yellow && g.red === e.red && g.total === e.total,
          'saved stage score mismatch', `${tag} stage ${i + 1}: expected ${JSON.stringify(e)} got ${JSON.stringify(got)}`);
      });
    }
    if (!board) return want;
    ctx.check(!(+board.ltott > 100), 'nikod score above 100%', `${tag}: board shows ${board.ltott}%${hasChaos ? ' (chaos path)' : ''}`);
    ctx.check(String(want.mispar) === board.ltott, 'wrong score on nikod', `${tag}: expected ${want.mispar}% got ${board.ltott}${hasChaos ? ' (chaos path)' : ''}`);
    ctx.check(want.verdict === board.catov, 'wrong verdict on nikod', `${tag}: expected ${want.verdict} got ${board.catov}`);
    ctx.check(want.toch.join() === board.toch.join(), 'wrong counters on nikod', `${tag}: expected total/g/y/r/none ${want.toch.join('/')} got ${board.toch.join('/')}`);
    return want;
  }

  /** Enter path i on the current rama, play it, verify board + completion. */
  async runPath(r, i, name, { wrongs, chaos }) {
    const ctx = this.ctx;
    const tag = `r${r}p${i + 1}`;
    ctx.step(`${tag}/enter`);
    if (!(await this.enterPath(i))) { ctx.finding('error', 'no btnIcon for path', `${tag} (${name})`); return; }
    const started = await ctx.waitFor(() => { const s = window.__km.snap(); return s.ov === 'video' || /^game/.test(s.screen || ''); }, 8000);
    if (!started) { ctx.finding('error', 'path did not start', `${tag} (${name}) screen=${(await this.snap()).screen}`); await ctx.shot(`${tag}-nostart`); return; }
    const res = await this.playPath(tag, { wrongs, chaos });
    if (!res) { this.cover(`${tag} ${name}: ABORTED`); return; }
    const ls = await this.eval(a => window.__km.ls(a), this.app);
    const lsStages = ((ls.scores[String(r)] || {})[String(i)] || {}).stages;
    ctx.check(!!(ls.completed[String(r)] || {})[String(i)], 'completion not recorded', `${tag}: kesem.${this.app}.completed[${r}][${i}] missing`);
    const want = this.checkBoard(tag, res, lsStages);
    const pathName = await this.eval(ix => { const s = window.__kesemSession; const sl = (s.paths.ramas[String(s.config.activityRamaPin || s.rama)] || {}).slots || []; const x = sl[ix]; return x && x.header ? x.header.pathName : null; }, i);
    if (res.board && pathName) ctx.check(res.board.title === pathName, 'nikod shows wrong path title', `${tag}: "${res.board.title}" but the .MAS path name is "${pathName}"`);
    if (!wrongs && !chaos) ctx.check(want.mispar === 100 && res.board && res.board.ltott === '100', 'all-correct path is not top score', `${tag}: board ${res.board && res.board.ltott}`);
    this.cover(`${tag} ${name}: ${res.slotLen} stages [${res.expected.map(e => (e === null ? 'g3' : e === 'chaos' ? 'chaos' : `${e.green}/${e.yellow}/${e.red}`)).join(' ')}] → ${res.board && res.board.ltott}%${wrongs ? ' (wrongs)' : ''}${chaos ? ' (chaos)' : ''}`);
    ctx.step(`${tag}/after`);
    const closed = await this.closeNikod();
    ctx.check(closed, 'nikod does not close', tag);
    const back = await this.waitScreen('sst', 5000);
    ctx.check(back, 'did not return to Sst after nikod', tag);
    // Lamp lit
    const lamp = await this.lampState(i);
    if (lamp.exists) ctx.check(lamp.shown && /lamp2/i.test(lamp.src), 'lamp not lit after completion', `${tag}: ${JSON.stringify(lamp)}`);
    ctx.check((await this.snap()).rama === r, 'rama changed after path', `${tag}: rama now ${(await this.snap()).rama}`);
    // Lamp → saved board replay must show the same numbers.
    if (lamp.exists && lamp.shown && this.o.sideScreens && (i === 0 || !ctx.quick)) {
      const li = await this.eval(ix => [...document.querySelectorAll('.frm-ctrl--btnLamp')].findIndex(e => +e.dataset.index === ix), this.lampIndex(i));
      await this.tap('.frm-ctrl--btnLamp', li, 400);
      const ok = await ctx.waitFor(() => !!document.querySelector('.nikod-overlay'), 4000);
      if (ctx.check(ok, 'lamp click shows no score board', tag)) {
        await ctx.sleep(1700);
        const b2 = await this.eval(() => window.__km.nikod());
        ctx.check(b2 && res.board && b2.ltott === res.board.ltott && b2.toch.join() === res.board.toch.join(),
          'lamp replay board differs', `${tag}: end ${res.board && res.board.ltott}% ${res.board && res.board.toch.join('/')} vs replay ${b2 && b2.ltott}% ${b2 && b2.toch.join('/')}`);
        await this.closeNikod();
      }
    }
  }

  // --------------------------------------------------------- side screens
  async ramaBurst(maxRama) {
    const ctx = this.ctx;
    const n = await this.eval(() => document.querySelectorAll('.frm-ctrl--Icon_s').length);
    if (n < 2 || !(await this.eval(() => window.__km.visible('.frm-ctrl--Icon_s', 0)))) return;
    ctx.step('sst/rama-burst');
    const ref = {};
    for (let r = 1; r <= maxRama; r++) {
      await this.selectRama(r);
      await ctx.sleep(700);
      ref[r] = await this.eval(() => window.__km.srcs('.frm-ctrl--btnIcon, .frm-ctrl--Icon_s, .frm-bg, .frm-ctrl--btnLamp'));
    }
    // Fast switching (#57/#61): 12 tab clicks ~80 ms apart.
    let last = 1;
    for (let k = 0; k < 12; k++) {
      last = 1 + Math.floor(ctx.rand() * maxRama);
      const i = await this.eval(ix => [...document.querySelectorAll('.frm-ctrl--Icon_s')].findIndex(e => +e.dataset.index === ix), last - 1);
      const p = await this.eval((j) => window.__km.point('.frm-ctrl--Icon_s', j), i);
      if (p) await ctx.click(p.x, p.y, 80);
    }
    await ctx.sleep(1500);
    const s = await this.snap();
    const got = await this.eval(() => window.__km.srcs('.frm-ctrl--btnIcon, .frm-ctrl--Icon_s, .frm-bg, .frm-ctrl--btnLamp'));
    const bad = got.map((g, j) => (g !== ref[s.rama][j] ? j : -1)).filter(j => j >= 0);
    ctx.check(s.rama === last, 'rama after fast switching', `last clicked ${last}, state.rama=${s.rama}`);
    ctx.check(!bad.length, 'sst images wrong after fast rama switching', `rama ${s.rama}: ${bad.length} controls differ from a slow switch, e.g. ${bad.slice(0, 3).map(j => `${got[j]} vs ${ref[s.rama][j]}`).join(' ; ')}`);
    await ctx.checkImages();
    await ctx.shot('rama-burst');
  }

  async seret() {
    const ctx = this.ctx;
    const n = await this.eval((sel, ex) => [...document.querySelectorAll(sel)].filter(e => !e.matches(ex)).length, this.o.seretSel, this.o.exitSel);
    for (let i = 0; i < n; i++) {
      ctx.step(`sst/seret${i}`);
      const idx = await this.eval((sel, ex, k) => { const all = [...document.querySelectorAll(sel)]; const el = all.filter(e => !e.matches(ex))[k]; return all.indexOf(el); }, this.o.seretSel, this.o.exitSel, i);
      if (!(await this.eval((sel, j) => window.__km.visible(sel, j), this.o.seretSel, idx))) continue;
      await this.tap(this.o.seretSel, idx, 600);
      if (await this.eval(() => !!document.querySelector('.video-overlay'))) await this.video(`seret${i}`, { watch: this.o.videoWatchMs });
      else ctx.finding('info', 'btnSeret opened no video', `${this.o.seretSel}[${idx}]`);
      ctx.check((await this.snap()).screen === 'sst', 'not on Sst after seret video', '');
    }
  }

  async mashal() {
    const ctx = this.ctx;
    if (!(await this.eval(() => window.__km.visible('.frm-ctrl--CmdMashal')))) return;
    ctx.step('mashal');
    const rama = (await this.snap()).rama;
    await this.tap('.frm-ctrl--CmdMashal', 0, 0);
    await ctx.shot('mashal-0ms');                 // #58: locked tiles must never flash unlocked
    const early = await this.eval(() => [...document.querySelectorAll('.frm-ctrl--Mashal')].map(t => [+t.dataset.index, (t.querySelector('img') || {}).src || '', getComputedStyle(t).cursor]));
    const ok = await this.waitScreen('mashal', 4000);
    if (!ctx.check(ok, 'mashal screen did not open', '')) return;
    await ctx.sleep(800);
    await ctx.checkImages();
    await ctx.shot('mashal');
    const ls = await this.eval(a => window.__km.ls(a), this.app);
    const done = ls.completed[String(rama)] || {};
    const tiles = await this.eval(() => [...document.querySelectorAll('.frm-ctrl--Mashal')].map(t => ({ i: +t.dataset.index, src: (t.querySelector('img') || {}).src || '', cursor: getComputedStyle(t).cursor })));
    for (const t of tiles) {
      const unlocked = !!done[String(t.i)];
      ctx.check(unlocked ? /anim\d/.test(t.src) : /ani_\d/.test(t.src), 'mashal tile lock state wrong', `tile ${t.i}: completed=${unlocked} img=${t.src.split('/').pop()}`);
    }
    for (const [i, src] of early) {
      if (!done[String(i)] && /anim\d/.test(src)) ctx.finding('error', 'mashal: locked tile briefly shown unlocked', `tile ${i} rendered ${src.split('/').pop()} before wireMashalScreen`);
    }
    // Locked tile click → nothing; unlocked → video.
    const locked = tiles.find(t => !done[String(t.i)]);
    if (locked) {
      const li = tiles.indexOf(locked);
      await this.tap('.frm-ctrl--Mashal', li, 600);
      ctx.check(!(await this.eval(() => !!document.querySelector('.video-overlay'))), 'locked mashal tile plays a video', `tile ${locked.i}`);
      await this.eval(() => { const v = document.querySelector('.video-overlay button[aria-label="close"]'); if (v) v.click(); });
    }
    const open = tiles.filter(t => done[String(t.i)]);
    for (const t of (ctx.quick ? open.slice(0, 1) : open)) {
      await this.tap('.frm-ctrl--Mashal', tiles.indexOf(t), 600);
      const v = await this.eval(() => !!document.querySelector('.video-overlay'));
      const shipped = await this.eval(n => { const vf = window.__kesemSession.videoFiles; return !vf || vf.has(n); }, `mashal/MASH${t.i + 1}.mp4`);
      if (!shipped) { ctx.finding('warn', 'mashal video not shipped', `${this.app} mashal/MASH${t.i + 1}.mp4 missing from assets — unlocked tile does nothing`); continue; }
      if (ctx.check(v, 'unlocked mashal tile plays no video', `tile ${t.i}`)) await this.video(`mashal${t.i + 1}`, { watch: 800 });
    }
    await this.tap('.frm-ctrl--CmdExit', 0, 500);
    ctx.check(await this.waitScreen('sst', 3000), 'mashal exit does not return to Sst', '');
  }

  async exitNo() {
    const ctx = this.ctx;
    ctx.step('sst/exit-no');
    if (!(await this.eval(s => window.__km.visible(s), this.o.exitSel))) { ctx.finding('warn', 'no exit control on Sst', this.o.exitSel); return; }
    await this.tap(this.o.exitSel, 0, 500);
    const m = await this.eval(() => !!document.querySelector('.misger-overlay'));
    if (!ctx.check(m, 'exit shows no confirm', this.o.exitSel)) return;
    await ctx.checkImages();
    await ctx.shot('exit-confirm');
    await this.misgerAnswer(false);
    ctx.check(!(await this.eval(() => !!document.querySelector('.misger-overlay'))), 'exit confirm "no" does not close', '');
    ctx.check((await this.snap()).screen === 'sst', 'exit "no" left Sst', '');
  }

  /** Mid-game picexi: no → stays; next-stage arrow → jumps; yes → partial board. */
  async picexiScenario(r, i) {
    const ctx = this.ctx;
    const tag = `r${r}p${i + 1}-picexi`;
    ctx.step(tag);
    await this.enterPath(i);
    await ctx.waitFor(() => { const s = window.__km.snap(); return s.ov === 'video' || /^game/.test(s.screen || ''); }, 8000);
    if ((await this.snap()).ov === 'video') await this.video(`${tag}-intro`, { watch: 300 });
    let s = await this.snap();
    if (!/^game/.test(s.screen || '')) { ctx.finding('error', 'picexi scenario: path did not start', tag); return; }
    await this.waitStageReady(s);
    // Answer one question correctly (non-inspect stage) so the board has data.
    let answered = null;
    if (s.gn !== 3 && s.gn !== 6 && s.nHot) { const r1 = await this.playTurn(tag, s, 0); if (r1 && r1.bucket) answered = { stageIdx: s.stageIdx, total: s.maxTurn }; }
    await this.waitIdle();
    s = await this.snap();
    // picexi → no
    await this.tap('.frm-ctrl--picexi', 0, 500);
    if (!ctx.check(await this.eval(() => !!document.querySelector('.misger-overlay')), 'picexi shows no confirm', tag)) return;
    await ctx.shot(`${tag}-misger`);
    await this.misgerAnswer(false);
    const s2 = await this.snap();
    ctx.check(s2.screen === s.screen && s2.stageIdx === s.stageIdx && !s2.ov, 'picexi "no" did not keep the stage', `${JSON.stringify(s2)}`);
    // picexi → next-stage arrow (misgerb) → must land on stage+1
    const slotLen = await this.eval(() => { const s = window.__kesemSession; const sl = (s.paths.ramas[String(s.config.activityRamaPin || s.rama)] || {}).slots || []; return (sl[s.currentPath].stages || []).length; });
    if (slotLen > 1 && s2.stageIdx + 1 < slotLen) {
      await this.tap('.frm-ctrl--picexi', 0, 500);
      await this.tap('.misger-overlay img[title="שלב הבא"]', 0, 800);
      const s3 = await this.snap();
      ctx.check(s3.stageIdx === s2.stageIdx + 1 && /^game/.test(s3.screen || ''), 'misger next-stage did not advance', `from ${s2.stageIdx} → ${s3.stageIdx} (${s3.screen})`);
      await this.waitIdle();
    }
    // picexi → yes → partial board (only if something was saved).
    await this.tap('.frm-ctrl--picexi', 0, 500);
    await this.misgerAnswer(true);
    const nik = await ctx.waitFor(() => !!document.querySelector('.nikod-overlay'), 3000);
    if (nik) {
      await ctx.sleep(1700);
      const b = await this.eval(() => window.__km.nikod());
      await ctx.shot(`${tag}-partial-nikod`);
      if (answered) {
        const ps = await this.eval(() => (window.__kesemSession.pathScore || []).map(x => x && { green: x.green, yellow: x.yellow, red: x.red, total: x.total }));
        const want = expectedBoard(ps);
        ctx.check(b && b.toch.join() === want.toch.join() && b.ltott === String(want.mispar), 'partial board inconsistent', `${tag}: pathScore→${want.toch.join('/')} ${want.mispar}% board ${b && b.toch.join('/')} ${b && b.ltott}%`);
        ctx.check(b && b.toch[1] >= 1 && b.toch[4] >= answered.total - 1, 'partial board lost the answered question', `${tag}: ${b && b.toch.join('/')}`);
      }
      await this.closeNikod();
    }
    ctx.check(await this.waitScreen('sst', 4000), 'picexi yes did not return to Sst', tag);
    const lamp = await this.lampState(i);
    ctx.check(!lamp.done || this._completed.has(`${r}/${i}`), 'aborted path marked completed', tag);
  }

  async reset() {
    const ctx = this.ctx;
    if (!(await this.eval(() => window.__km.visible('.frm-ctrl--mahak')))) { ctx.finding('info', 'mahak (reset) not visible after completions', ''); return; }
    ctx.step('sst/mahak-reset');
    await this.tap('.frm-ctrl--mahak', 0, 600);      // window.confirm auto-accepted by the harness
    const ls = await this.eval(a => window.__km.ls(a), this.app);
    ctx.check(!Object.keys(ls.completed).length, 'reset did not clear completion', JSON.stringify(ls.completed).slice(0, 120));
    const lamp = await this.lampState(0);
    ctx.check(!lamp.exists || !/lamp2/i.test(lamp.src) || !lamp.shown, 'lamp still lit after reset', JSON.stringify(lamp));
    await ctx.shot('after-reset');
  }

  async exitYes() {
    const ctx = this.ctx;
    ctx.step('sst/exit-yes');
    if (!(await this.eval(s => window.__km.visible(s), this.o.exitSel))) return;
    await this.tap(this.o.exitSel, 0, 500);
    await this.misgerAnswer(true);
    const ok = await ctx.waitFor(() => !/Kesem_site/.test(location.pathname), 8000);
    ctx.check(ok, 'exit "yes" does not leave the app', await this.eval(() => location.href));
    await ctx.sleep(500);
    await ctx.shot('after-exit');
  }
}

async function runApp(ctx, app, overrides = {}) {
  const o = Object.assign({}, DEFAULTS, overrides);
  const k = new Kesem(ctx, app, o);
  k._completed = new Set();
  if (o.patch) o.patch(k);
  await ctx.page.evaluateOnNewDocument(pageInit, o.rate);
  ctx.step('boot');
  await ctx.goto(`Kesem_site/index.html#/${app}`, 1200);
  const booted = await ctx.waitFor(() => !!window.__kesemSession, 8000);
  if (!ctx.check(booted, 'app did not boot', app)) { await ctx.shot('boot'); return k; }
  await ctx.checkImages();
  await ctx.shot('boot');
  if (!(await k.toSst())) return k;
  await ctx.checkImages();
  await ctx.shot('sst');
  const cfg = await k.cfg();
  const ramas = o.ramas || Array.from({ length: cfg.maxRama || 1 }, (_, i) => i + 1);

  if (o.sideScreens) {
    await k.exitNo();
    await k.seret();
    await k.ramaBurst(cfg.maxRama || 1);
  }

  for (const r of ramas) {
    ctx.step(`r${r}/sst`);
    if (!(await k.selectRama(r))) continue;
    await ctx.sleep(400);
    await ctx.checkImages();
    await ctx.shot(`sst-rama${r}`);
    const slots = await k.eval(() => { const s = window.__kesemSession; const sl = (s.paths.ramas[String(s.config.activityRamaPin || s.rama)] || {}).slots || []; return sl.map(x => ({ name: x.name || x.masFile, n: (x.stages || []).length })); });
    const nIcons = await k.visiblePaths();
    let idx = o.slots ? o.slots(r, slots) : slots.map((_, i) => i).filter(i => slots[i].n > 0);
    for (const i of slots.map((_, j) => j)) if (!slots[i].n && nIcons.includes(i)) ctx.finding('info', 'path has no stages', `r${r}p${i + 1} ${slots[i].name}`);
    idx = idx.filter(i => { if (!nIcons.includes(i)) { ctx.finding('warn', 'path without visible btnIcon', `r${r}p${i + 1}`); return false; } return true; });
    if (ctx.quick) idx = idx.slice(0, o.quickSlots);
    for (const i of idx) {
      k.played++;
      const wrongs = !!o.wrongEvery && k.played % o.wrongEvery === 2 % o.wrongEvery;
      const chaos = !!o.chaosEvery && k.played % o.chaosEvery === 4 % o.chaosEvery;
      await k.runPath(r, i, slots[i].name, { wrongs, chaos });
      k._completed.add(`${r}/${i}`);
      if (!(await k.waitScreen('sst', 3000))) { await k.bailOut(`r${r}p${i + 1}`); }
      if ((await k.snap()).rama !== r) await k.selectRama(r);
    }
    if (o.sideScreens) {
      await k.mashal();
      if (r === ramas[0] && idx.length) {
        // Prefer a path that opens on a scored stage so the partial board has an answer.
        const firstGn = await k.eval(() => { const s = window.__kesemSession; const sl = (s.paths.ramas[String(s.config.activityRamaPin || s.rama)] || {}).slots || []; return sl.map(x => (x.stages && x.stages[0] ? x.stages[0].gameNumber : 0)); });
        await k.picexiScenario(r, idx.find(i => firstGn[i] !== 3 && firstGn[i] !== 6) ?? idx[0]);
      }
    }
  }
  if (o.extra) { ctx.step('extra'); await o.extra(k); }
  if (o.sideScreens) {
    await k.selectRama(ramas[0]);
    await k.reset();
  }
  if (o.finalExit) await k.exitYes();
  return k;
}

module.exports = { runApp, Kesem, DEFAULTS, expectedBoard };
