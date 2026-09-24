// Shared monkey driver for hemed_nivim_site — Hemed (חמ"ד) and Nivim
// (ניבים ופתגמים). Both apps share every screen and the seven sub-games,
// so apps/Hemed.js and apps/Nivim.js are one-liners over makeDriver().
//
// Per unit it opens the game menu, then for EVERY visible sign (hakira,
// match, american ×3 modes, haklada ×2 modes, apple, connect) plus the
// menu-less hatamaplus route it:
//   1. plays the game correctly to the end, injecting one known-wrong
//      answer and checking it is rejected (penalty/error goes up, the
//      question is not marked answered) — issue #35 is "answer displaying
//      as true even when false";
//   2. checks the right answers are the ones the DATA says are right
//      (oracle = units.js text, not the game's own state);
//   3. checks the end-of-game score (score form + saved progress) against
//      the formula for the injected mistakes;
//   4. runs a short random ctx.monkey() / key-mash chaos pass;
//   5. checks images, audio (media errors / rejected play()), stale
//      document key listeners, and stuck states.
//
// The games expose read-only state via window.__hndGame (HND._exposeTest
// in hemed_nivim_site/js/data.js).
//
// Audio is played at 16× (HTMLMediaElement.play patched per page) so the
// audio-chained game flow finishes in reasonable time; the media requests
// still go to the server, so 404s are still caught.

const SITE = 'hemed_nivim_site/index.html';

// Physical key code for each Hebrew letter on the Israeli layout — the
// games map e.code → Hebrew (the VB6 `Lang128` trick), so typing the
// physical key with an English layout must work too.
const HEB_CODE = {
  'ק': 'KeyE', 'ר': 'KeyR', 'א': 'KeyT', 'ט': 'KeyY', 'ו': 'KeyU', 'ן': 'KeyI', 'ם': 'KeyO', 'פ': 'KeyP',
  'ש': 'KeyA', 'ד': 'KeyS', 'ג': 'KeyD', 'כ': 'KeyF', 'ע': 'KeyG', 'י': 'KeyH', 'ח': 'KeyJ', 'ל': 'KeyK',
  'ך': 'KeyL', 'ף': 'Semicolon', 'ז': 'KeyZ', 'ס': 'KeyX', 'ב': 'KeyC', 'ה': 'KeyV', 'נ': 'KeyB', 'מ': 'KeyN',
  'צ': 'KeyM', 'ת': 'Comma', 'ץ': 'Period',
};
const VK = { Semicolon: 186, Comma: 188, Period: 190 };
function vkFor(code) {
  if (VK[code]) return VK[code];
  const m = /^Key([A-Z])$/.exec(code);
  return m ? m[1].charCodeAt(0) : 0;
}

const SLOT_NAMES = ['hakira', 'match', 'american-sound', 'american-pic', 'american-text',
  'haklada-reg', 'haklada-dict', 'apple', 'connect'];
const SLOT_KEYS = { 1: 'match', 2: 'american_sound', 3: 'american_pic', 4: 'american_text',
  5: 'haklada_reg', 6: 'haklada_dict', 7: 'apple', 8: 'connect' };

// Injected before any page script: speed audio up, log media errors and
// rejected play() promises into window.__hndAudio.
function audioHookScript() {
  const RATE = 16;
  window.__hndAudio = [];
  const P = HTMLMediaElement.prototype;
  const origPlay = P.play;
  P.play = function () {
    const el = this;
    if (!el.__hndHooked) {
      el.__hndHooked = true;
      el.addEventListener('error', () => window.__hndAudio.push({ ev: 'error', src: el.currentSrc || el.src, t: Date.now() }));
      el.addEventListener('ended', () => window.__hndAudio.push({ ev: 'ended', src: el.currentSrc || el.src, t: Date.now() }));
      el.addEventListener('loadedmetadata', () => { try { el.playbackRate = RATE; } catch (e) {} });
    }
    try { el.defaultPlaybackRate = RATE; el.playbackRate = RATE; } catch (e) {}
    window.__hndAudio.push({ ev: 'play', src: el.src, t: Date.now() });
    const p = origPlay.apply(el, arguments);
    if (p && p.catch) p.catch(err => window.__hndAudio.push({ ev: 'reject', name: err && err.name, src: el.src, t: Date.now() }));
    return p;
  };
}

function makeDriver(appId) {
  return {
    async run(ctx) {
      const d = new Driver(ctx, appId);
      await d.run();
    },
  };
}

class Driver {
  constructor(ctx, appId) {
    this.ctx = ctx;
    this.app = appId;
    this.page = ctx.page;
    this.user = 'בודק';
    this.audioCursor = 0;
    this.cdp = null;
    this.listenerBaseline = null;
  }

  // ---------- small helpers ----------
  sleep(ms) { return this.ctx.sleep(ms); }
  ev(fn, ...a) { return this.ctx.eval(fn, ...a); }
  g(fn, ...a) { return this.ev(fn, ...a); }

  async hash(h, wait = 600) {
    await this.ev(x => { location.hash = x; }, h);
    await this.sleep(wait);
  }

  // Audio events since the last call.
  async audioSince() {
    const all = await this.ev(() => window.__hndAudio || []);
    const out = all.slice(this.audioCursor);
    this.audioCursor = all.length;
    return out;
  }
  async flushAudio(label) {
    const evs = await this.audioSince();
    for (const e of evs) {
      if (e.ev === 'error') this.ctx.finding('warn', 'audio error', `${label}: ${rel(e.src)}`);
      if (e.ev === 'reject' && e.name !== 'AbortError') this.ctx.finding('warn', 'audio play() rejected', `${label}: ${e.name} ${rel(e.src)}`);
    }
    return evs;
  }

  // Click the centre of the element (real mouse). If something else is
  // on top at that point, report it and fall back to element.click().
  async clickEl(sel, { wait = 250, allowCovered = false } = {}) {
    const info = await this.ev(s => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const ok = !!hit && (hit === el || el.contains(hit));
      return { x, y, w: r.width, h: r.height, ok, hit: hit ? (hit.className || hit.tagName) + '' : null };
    }, sel);
    if (!info || !info.w) { this.ctx.finding('error', 'missing control', `not visible: ${sel}`); return false; }
    if (!info.ok) {
      if (!allowCovered) this.ctx.finding('warn', 'control covered', `${sel} is under ${String(info.hit).slice(0, 60)}`);
      await this.ev(s => document.querySelector(s).click(), sel);
      await this.sleep(wait);
      return true;
    }
    await this.ctx.click(info.x, info.y, wait);
    return true;
  }

  async waitGame(name, since, timeout = 15000) {
    const ok = await this.ctx.waitFor(a => window.__hndGame && window.__hndGame.game === a.name && window.__hndGame.startedAt >= a.since,
      timeout, { name, since });
    if (!ok) this.ctx.finding('error', 'game did not start', `${name} (hook never registered)`);
    return ok;
  }

  // Press a character as a real keyboard would. layout 'he' = Israeli
  // layout active (key = Hebrew char), 'en' = English layout (key = latin
  // letter on the same physical key). Returns false if the char has no key.
  async pressChar(ch, layout = 'he') {
    if (/^[a-zA-Z0-9]$/.test(ch)) { await this.page.keyboard.press(ch); return true; }
    const code = HEB_CODE[ch];
    if (!code) return false;
    if (layout === 'en') { await this.page.keyboard.press(code); return true; }
    const vk = vkFor(code);
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    return true;
  }

  async docKeyListeners() {
    try {
      const { result } = await this.cdp.send('Runtime.evaluate', { expression: 'document' });
      const { listeners } = await this.cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
      await this.cdp.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => {});
      const n = t => listeners.filter(l => l.type === t).length;
      return { keydown: n('keydown'), keyup: n('keyup') };
    } catch (e) { return null; }
  }

  // After leaving a game: back on the menu, no game key listeners may be
  // left attached to document (they keep reacting — Space/F1/F12 — to
  // input on later screens).
  async checkListeners(label) {
    const cur = await this.docKeyListeners();
    if (!cur) return;
    if (!this.listenerBaseline) { this.listenerBaseline = cur; return; }
    const b = this.listenerBaseline;
    if (cur.keydown > b.keydown || cur.keyup > b.keyup) {
      this.ctx.finding('error', 'leaked document key listener',
        `after ${label}: keydown ${b.keydown}→${cur.keydown}, keyup ${b.keyup}→${cur.keyup}`);
      this.listenerBaseline = cur;      // report each leak once
    }
  }

  // ---------- flow ----------
  async run() {
    const { ctx } = this;
    this.cdp = await this.page.target().createCDPSession();
    await this.page.evaluateOnNewDocument(audioHookScript);

    ctx.step('main');
    await ctx.goto(`${SITE}#/${this.app}`, 1200);
    await ctx.checkImages();
    await ctx.shot('main');
    // Entry without a name must be refused (alert) and keep us on main.
    await this.clickEl('.entry-btn');
    ctx.check(await this.ev(() => !/units/.test(location.hash)), 'entered unit list without a student name');
    await this.page.click('.field-input', { clickCount: 3 });
    await this.page.keyboard.type('monkey');
    await this.ev(u => { const i = document.querySelector('.field-input'); i.value = u; i.dispatchEvent(new Event('input')); }, this.user);
    await this.clickEl('.entry-btn', { wait: 900 });

    ctx.step('unit-list');
    ctx.check(await this.ev(() => /\/units$/.test(location.hash)), 'main entry did not open the unit list');
    await ctx.checkImages();
    await ctx.shot('unit-list');
    const rows = await this.ev(() => document.querySelectorAll('.row.unit').length);
    ctx.check(rows > 0, 'unit list is empty');
    // select first unit → "go to games" button
    if (rows) {
      await this.clickEl('.row.unit');
      await this.clickEl('.game-menu-btn', { wait: 900 });
      ctx.check(await this.ev(() => /\/unit\/\d+\/games$/.test(location.hash)), 'unit list → game menu failed');
    }

    let units = await this.ev(a => HND.loadUnits(a).then(us => us.map(u => ({
      id: u.id, name: u.name, flags: u.flags, items: (u.data && u.data.items || []).length,
      hasWaves: (u.data && u.data.items || []).some(it => it._waves && it._waves.length),
    }))), this.app);
    if (process.env.HND_UNITS) {
      const want = process.env.HND_UNITS.split(',').map(Number);
      units = units.filter(u => want.includes(u.id));
    }
    if (ctx.quick) units = units.slice(0, 2);
    const onlySlots = process.env.HND_SLOTS ? process.env.HND_SLOTS.split(',').map(Number) : null;

    for (const u of units) {
      ctx.step(`u${u.id}/menu`);
      await this.hash(`#/${this.app}/unit/${u.id}/games`, 900);
      await ctx.checkImages();
      await ctx.shot(`u${u.id}-menu`);
      await this.checkListeners(`u${u.id} menu`);
      const slots = await this.ev(() => [...document.querySelectorAll('.game-sign')].map(s => +/\bk(\d)\b/.exec(s.className)[1]));
      ctx.check(slots.length > 0, 'game menu has no signs', `unit ${u.id}`);
      for (const slot of slots) {
        if (onlySlots && !onlySlots.includes(slot)) continue;
        await this.playSlot(u, slot);
      }
      if (!onlySlots || onlySlots.includes(9)) await this.playHatamaPlus(u);
    }
    ctx.step('end');
    await this.flushAudio('end');
  }

  async openSlot(u, slot) {
    await this.hash(`#/${this.app}/unit/${u.id}/games`, 500);
    const t0 = await this.ev(() => Date.now());
    await this.clickEl(`.game-sign.k${slot}`, { wait: 400 });
    return t0;
  }

  async playSlot(u, slot) {
    const { ctx } = this;
    const name = SLOT_NAMES[slot];
    ctx.step(`u${u.id}/${name}`);
    await this.audioSince();
    const t0 = await this.openSlot(u, slot);
    const game = name.split('-')[0];
    if (!await this.waitGame(game, t0)) {
      // Games legitimately refuse tiny units (american needs ≥4 items).
      const err = await this.ev(() => { const e = document.querySelector('.game-root .error'); return e && e.textContent; });
      if (err) ctx.finding('info', 'game refused unit', `${name}: ${err}`);
      await ctx.shot(`u${u.id}-${name}-nostart`);
      return;
    }
    await this.sleep(400);
    await ctx.checkImages();
    await ctx.shot(`u${u.id}-${name}-start`);
    let res = null;
    try {
      if (game === 'match') res = await this.playMatch(u, SLOT_KEYS[slot]);
      else if (game === 'american') res = await this.playAmerican(u, SLOT_KEYS[slot]);
      else if (game === 'haklada') res = await this.playHaklada(u, SLOT_KEYS[slot]);
      else if (game === 'apple') res = await this.playApple(u, SLOT_KEYS[slot]);
      else if (game === 'connect') res = await this.playConnect(u, SLOT_KEYS[slot]);
      else if (game === 'hakira') res = await this.playHakira(u);
    } catch (e) {
      ctx.finding('error', 'driver error', `${name}: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`);
      await ctx.shot(`u${u.id}-${name}-driver-error`);
    }
    await this.flushAudio(name);
    // Exit to the menu via the score form (or Esc), then check listeners.
    await this.leaveGame(u);
    await this.checkListeners(name);
    if (res && res.menuBadge != null && SLOT_KEYS[slot]) {
      const badge = await this.ev(s => { const e = document.querySelector(`.game-sign.k${s} .game-sign-score`); return e && e.textContent; }, slot);
      ctx.check(badge === String(res.menuBadge), 'menu score badge wrong', `${name}: badge=${badge} expected=${res.menuBadge}`);
    }
    // Chaos pass on a fresh copy of the game.
    await this.chaos(u, slot, game);
  }

  async playHatamaPlus(u) {
    const { ctx } = this;
    ctx.step(`u${u.id}/hatamaplus`);
    // Not on the menu (GameHatamaPlus.frm is an empty stub) — reachable by
    // route only. Enter it right after another game so lastSlot is stale.
    await this.hash(`#/${this.app}/unit/${u.id}/games`, 400);
    const before = await this.ev((a, id) => {
      const out = {};
      for (const k of ['match', 'american_sound', 'american_text', 'connect', 'apple']) {
        const p = HND.loadProgress(a, id, k); out[k] = p ? p.plays : 0;
      }
      return out;
    }, this.app, u.id);
    const t0 = await this.ev(() => Date.now());
    await this.hash(`#/${this.app}/unit/${u.id}/hatamaplus`, 400);
    if (!await this.waitGame('match', t0)) return;
    await ctx.checkImages();
    const res = await this.playMatch(u, 'hatamaplus');
    if (res) {
      const after = await this.ev((a, id) => {
        const out = {};
        for (const k of ['match', 'american_sound', 'american_text', 'connect', 'apple']) {
          const p = HND.loadProgress(a, id, k); out[k] = p ? p.plays : 0;
        }
        return out;
      }, this.app, u.id);
      for (const k of Object.keys(before)) {
        ctx.check(after[k] === before[k], 'hatamaplus wrote another game\'s score', `key ${k}: plays ${before[k]}→${after[k]}`);
      }
    }
    await this.flushAudio('hatamaplus');
    await this.leaveGame(u);
    await this.checkListeners('hatamaplus');
  }

  async leaveGame(u) {
    const onMenu = () => this.ev(() => /\/games$/.test(location.hash));
    if (await onMenu()) return;
    if (await this.ev(() => !!document.querySelector('.score-exit'))) {
      await this.clickEl('.score-exit', { wait: 700 });
    }
    if (!await onMenu()) { await this.page.keyboard.press('Escape'); await this.sleep(700); }
    if (!await onMenu()) {
      this.ctx.finding('warn', 'could not leave game', 'Esc/score-exit did not return to the menu');
      await this.hash(`#/${this.app}/unit/${u.id}/games`, 600);
    }
  }

  // Score form: wait for the count-up to finish and compare to expected.
  async checkScoreForm(label, expected, key, qCount) {
    const { ctx } = this;
    const ok = await ctx.waitFor(() => !!document.querySelector('.score-form .score-number'), 12000);
    if (!ok) { ctx.finding('error', 'no score form', label); await ctx.shot(`${label}-noscore`); return null; }
    await ctx.waitFor(() => {
      const n = document.querySelector('.score-form .score-number');
      return n && n.dataset.last === n.textContent ? true : (n && (n.dataset.last = n.textContent), false);
    }, 6000);
    await this.sleep(600);
    const shown = await this.ev(() => {
      const f = document.querySelector('.score-form');
      const n = f.querySelector('.score-number').textContent;
      const errs = [0, 1, 2].map(i => +(f.querySelector('.score-err-' + i) || {}).textContent || 0);
      return { n: +n, errs };
    });
    await ctx.checkImages();
    await ctx.shot(`${label}-score`);
    const saved = await this.ev((a, k) => {
      const m = /unit\/(\d+)\//.exec(location.hash);
      const p = HND.loadProgress(a, +m[1], k); return p && p.last;
    }, this.app, key);
    if (expected != null) {
      ctx.check(shown.n === expected, 'score form shows wrong score', `${label}: shown ${shown.n}, expected ${expected}`);
      ctx.check(saved === expected, 'saved score wrong', `${label}: saved ${saved}, expected ${expected} (key ${key})`);
    }
    if (qCount != null) {
      const sum = shown.errs.reduce((a, b) => a + b, 0);
      ctx.check(sum === qCount, 'score-form error buckets do not add up', `${label}: ${shown.errs.join('/')} vs ${qCount} questions`);
    }
    return shown;
  }

  // ---------- MATCH / HATAMA ----------
  async playMatch(u, key) {
    const { ctx } = this;
    const info = await this.ev(() => { const g = __hndGame; return { Q: g.QCount, askCol: g.askCol, idOrder: g.idOrder, ask: g.cal.askSide }; });
    const Q = info.Q;
    let wrongs = 0;
    for (let n = 0; n < Q; n++) {
      const ready = await ctx.waitFor(() => { const s = __hndGame.state; return s.completed || s.gameEnabled; }, 15000);
      if (!ready) { ctx.finding('error', 'stuck', `match: not re-enabled before question ${n + 1}`); await ctx.shot('match-stuck'); return null; }
      const s = await this.ev(() => { const s = __hndGame.state; return { qId: s.qId, idStatus: s.idStatus.slice(), penalty: s.penalty, qAnswered: s.qAnswered }; });
      // Oracle: the asked item is the one whose wave was just played, and its
      // row must show that item's ask text.
      const origIdx = info.idOrder[s.qId];
      const evs = await this.flushAudio('match');
      const waves = evs.filter(e => e.ev === 'play' && /\/wave\//.test(e.src)).map(e => rel(e.src));
      if (u.hasWaves && waves.length) {
        const last = waves[waves.length - 1];
        ctx.check(new RegExp(`/wave/${origIdx}_${info.ask}\\.`).test(last), 'match asked wave ≠ asked row', `q${n + 1}: played ${last}, row item ${origIdx}`);
      }
      const rowOk = await this.ev((r, idx) => {
        const g = __hndGame;
        const t = document.querySelector(`.hat-line[data-row="${r}"] .hat-text-right`);
        return t && t.textContent === (g.items[idx][g.askCol] || '');
      }, s.qId, origIdx);
      ctx.check(rowOk, 'match row text ≠ data', `row ${s.qId}`);
      if (n === 0 && Q > 1) {
        const wrong = s.idStatus.findIndex((st, i) => st === 'notAnswered' && i !== s.qId);
        await this.clickEl(`.hat-line[data-row="${wrong}"]`, { wait: 250 });
        const after = await this.ev(() => { const s = __hndGame.state; return { idStatus: s.idStatus.slice(), penalty: s.penalty, qAnswered: s.qAnswered }; });
        ctx.check(after.idStatus[wrong] === 'notAnswered' && after.idStatus[s.qId] === 'notAnswered' && after.qAnswered === s.qAnswered,
          'match accepted a wrong row', `clicked row ${wrong}, asked ${s.qId}`);
        ctx.check(after.penalty > s.penalty, 'match wrong row not penalised', `penalty ${s.penalty}→${after.penalty}`);
        wrongs++;
        await ctx.waitFor(() => __hndGame.state.gameEnabled, 3000);
        await ctx.shot(`u${u.id}-match-wrong`);
      }
      await this.clickEl(`.hat-line[data-row="${s.qId}"]`, { wait: 150 });
      const done = await ctx.waitFor(r => __hndGame.state.idStatus[r] === 'answered', 4000, s.qId);
      ctx.check(done, 'match rejected the right row', `row ${s.qId}`);
      if (!done) return null;
      if (n === Math.floor(Q / 2)) await ctx.shot(`u${u.id}-match-mid`);
    }
    const fin = await ctx.waitFor(() => __hndGame.state.completed, 15000);
    ctx.check(fin, 'match did not finish', 'all rows answered but game not completed');
    const expected = Math.max(0, 100 - Math.floor(Math.min(60, wrongs * 20 / Q)));
    await this.checkScoreForm(`u${u.id}-${key}`, expected, key, Q);
    return { menuBadge: key === 'hatamaplus' ? null : expected };
  }

  // ---------- AMERICAN ----------
  async playAmerican(u, key) {
    const { ctx } = this;
    const info = await this.ev(() => { const g = __hndGame; return { Q: g.QCount, layout: g.layout, mode: g.modeSlot }; });
    let wrongs = 0;
    for (let n = 0; n < info.Q; n++) {
      const ready = await ctx.waitFor(k => { const s = __hndGame.state; return s.completed || (s.gameEnabled && s.current === k); }, 15000, n);
      if (!ready) { ctx.finding('error', 'stuck', `american: question ${n + 1} never became answerable`); await ctx.shot('american-stuck'); return null; }
      // Oracle from DATA: every item whose ask text equals the asked item's
      // ask text (synonyms) → its answer text is a right answer.
      const q = await this.ev(() => {
        const g = __hndGame, s = g.state;
        const idx = g.idOrder[s.current];
        const ask = g.items[idx][g.askCol], ans = g.items[idx][g.ansCol];
        const okTexts = new Set();
        g.items.forEach(it => { if (it[g.askCol] === ask || it[g.ansCol] === ans) okTexts.add(it[g.ansCol]); });
        const opts = [...document.querySelectorAll('.am-option')].map(o => (o.querySelector('.am-option-text').textContent));
        const qShown = document.querySelector('.am-q-text').textContent;
        return { idx, ask, ok: [...okTexts], opts, qShown, picLoaded: !!document.querySelector('.am-option-text.am-pic-loaded') };
      });
      if (info.layout === 'text-text' && info.mode !== 2) ctx.check(q.qShown === (q.ask || ''), 'american question text ≠ data', `q${n + 1}: "${q.qShown}" vs "${q.ask}"`);
      const right = q.opts.findIndex(t => q.ok.includes(t));
      const wrong = q.opts.findIndex(t => !q.ok.includes(t));
      ctx.check(right >= 0, 'american: no correct option offered', `q${n + 1} options ${q.opts.join(' | ')}`);
      if (right < 0) return null;
      if (n === 0 && wrong >= 0) {
        const pen0 = await this.ev(() => __hndGame.state.penalty);
        await this.clickEl(`.am-option[data-opt-i="${wrong}"]`, { wait: 200 });
        const s = await this.ev(() => ({ cur: __hndGame.state.current, pen: __hndGame.state.penalty, en: __hndGame.state.gameEnabled }));
        ctx.check(s.cur === 0 && s.en, 'american accepted a wrong answer', `option "${q.opts[wrong]}"`);
        ctx.check(s.pen > pen0, 'american wrong answer not penalised', `${pen0}→${s.pen}`);
        wrongs++;
        await ctx.shot(`u${u.id}-${key}-wrong`);
      }
      await this.clickEl(`.am-option[data-opt-i="${right}"]`, { wait: 150 });
      const acc = await ctx.waitFor(k => { const s = __hndGame.state; return !s.gameEnabled || s.current > k || s.completed; }, 3000, n);
      ctx.check(acc, 'american rejected the right answer', `q${n + 1}: "${q.opts[right]}"`);
      if (n === Math.floor(info.Q / 2)) await ctx.shot(`u${u.id}-${key}-mid`);
    }
    const fin = await ctx.waitFor(() => __hndGame.state.completed, 20000);
    ctx.check(fin, 'american did not finish');
    const expected = Math.max(0, 100 - Math.floor(Math.min(60, wrongs * 20 / info.Q)));
    await this.checkScoreForm(`u${u.id}-${key}`, expected, key, info.Q);
    return { menuBadge: expected };
  }

  // ---------- HAKLADA (typing) ----------
  async playHaklada(u, key) {
    const { ctx } = this;
    await this.clickEl('.hak-typing', { wait: 300 });      // "click to start"
    const info = await this.ev(() => ({ Q: __hndGame.QCount }));
    let penaltyExpected = 0, clean = true;
    for (let n = 0; n < info.Q; n++) {
      const ready = await ctx.waitFor(k => { const s = __hndGame.state; return s.completed || (s.gameEnabled && s.current === k); }, 20000, n);
      if (!ready) { ctx.finding('error', 'stuck', `haklada: question ${n + 1} never became typeable`); await ctx.shot('haklada-stuck'); return null; }
      const q = await this.ev(() => {
        const g = __hndGame, s = g.state;
        return { answer: s.answer, sel: s.selected.slice(), typed: s.typed.slice(), cur: s.currentChar,
          data: (g.items[g.idOrder[s.current]][g.ansCol] || '').trim() };
      });
      ctx.check(q.answer === q.data, 'haklada answer ≠ data', `q${n + 1}`);
      const need = [];
      for (let i = 0; i < q.answer.length; i++) if (q.sel[i] && !q.typed[i]) need.push(q.answer[i]);
      const bad = need.filter(c => !/^[a-zA-Z0-9]$/.test(c) && !HEB_CODE[c]);
      if (bad.length) {
        ctx.finding('error', 'untypeable character required', `haklada q${n + 1} "${q.answer}" wants ${bad.map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase()).join(',')} — no key produces it (stuck)`);
        await ctx.shot(`u${u.id}-${key}-untypeable`);
        clean = false;
        await this.page.keyboard.press('F12');          // original's skip-question cheat
        continue;
      }
      if (n === 0) {
        // wrong key: a Hebrew letter that is not the expected one
        const exp = need[0];
        const wrongCh = Object.keys(HEB_CODE).find(c => c !== exp && HEB_CODE[c] !== HEB_CODE[exp] && c.toLowerCase() !== exp.toLowerCase());
        const before = await this.ev(() => ({ t: __hndGame.state.typed.filter(Boolean).length, e: __hndGame.state.currErrors }));
        await this.pressChar(wrongCh, 'he');
        await this.sleep(80);
        const after = await this.ev(() => ({ t: __hndGame.state.typed.filter(Boolean).length, e: __hndGame.state.currErrors }));
        ctx.check(after.t === before.t, 'haklada accepted a wrong letter', `typed "${wrongCh}" for "${exp}"`);
        ctx.check(after.e === before.e + 1, 'haklada wrong letter not counted', `errors ${before.e}→${after.e}`);
        penaltyExpected = Math.min(60, penaltyExpected + (20 / info.Q) / (q.sel.filter(Boolean).length / 1.5));
      }
      let k = 0;
      for (const ch of need) {
        const before = await this.ev(() => __hndGame.state.typed.filter(Boolean).length);
        await this.pressChar(ch, (k++ % 3 === 2) ? 'en' : 'he');
        await this.sleep(40);
        const after = await this.ev(() => ({ t: __hndGame.state.typed.filter(Boolean).length, c: __hndGame.state.current }));
        if (after.c === n) ctx.check(after.t === before + 1, 'haklada rejected the right letter', `q${n + 1} "${ch}"`);
      }
      const adv = await ctx.waitFor(k2 => { const s = __hndGame.state; return s.current > k2 || s.completed; }, 20000, n);
      ctx.check(adv, 'haklada did not advance after a fully typed answer', `q${n + 1}`);
      if (n === 0) await ctx.shot(`u${u.id}-${key}-q1`);
    }
    const fin = await ctx.waitFor(() => __hndGame.state.completed, 20000);
    ctx.check(fin, 'haklada did not finish');
    const expected = clean ? Math.max(0, 100 - Math.floor(penaltyExpected)) : null;
    await this.checkScoreForm(`u${u.id}-${key}`, expected, key, info.Q);
    return { menuBadge: expected };
  }

  // ---------- APPLE ----------
  async playApple(u, key) {
    const { ctx } = this;
    const info = await this.ev(() => ({ Q: __hndGame.QCount }));
    let clean = true;
    const errsPerQ = [];
    for (let n = 0; n < info.Q; n++) {
      const ready = await ctx.waitFor(k => { const s = __hndGame.state; return s.completed || (s.gameEnabled && s.current === k); }, 25000, n);
      if (!ready) {
        const cur = await this.ev(() => __hndGame.state.current);
        if (cur > n) { n = cur - 1; continue; }        // skipped (empty answer)
        ctx.finding('error', 'stuck', `apple: question ${n + 1} never became typeable`); await ctx.shot('apple-stuck'); return null;
      }
      const q = await this.ev(() => {
        const g = __hndGame, s = g.state;
        return { answer: s.answer, sel: s.selected.slice(), filled: s.filled.slice(), cur: s.current,
          data: (g.items[g.idOrder[s.current]][g.ansCol] || '').trim() };
      });
      if (q.cur !== n) { n = q.cur - 1; continue; }
      ctx.check(q.answer === q.data, 'apple answer ≠ data', `q${n + 1}`);
      const need = [...new Set(q.answer.split('').filter((c, i) => q.sel[i] && !q.filled[i]))];
      const bad = need.filter(c => !/^[a-zA-Z0-9]$/.test(c) && !HEB_CODE[c]);
      let errs = 0;
      if (n === 0) {
        // #35: a letter NOT in the answer must count as a mistake and fill nothing.
        const wrongCh = Object.keys(HEB_CODE).find(c => !q.answer.includes(c) && HEB_CODE[c] !== 'Period' && HEB_CODE[c] !== 'Comma');
        if (wrongCh) {
          await this.pressChar(wrongCh, 'en');
          await this.sleep(60);
          const s = await this.ev(() => ({ f: __hndGame.state.filled.filter(Boolean).length, e: __hndGame.state.errorCount }));
          ctx.check(s.f === q.filled.filter(Boolean).length, 'apple accepted a wrong letter', `"${wrongCh}" not in "${q.answer}"`);
          ctx.check(s.e === 1, 'apple wrong letter not counted', `errorCount=${s.e}`);
          await this.pressChar(wrongCh, 'he');          // same physical key again → banned, no second error
          await this.sleep(60);
          const s2 = await this.ev(() => __hndGame.state.errorCount);
          ctx.check(s2 === 1, 'apple repeated key counted twice', `errorCount=${s2}`);
          errs = 1;
          await ctx.shot(`u${u.id}-apple-wrong`);
        }
      }
      if (bad.length) {
        ctx.finding('error', 'untypeable character required', `apple q${n + 1} "${q.answer}" wants ${bad.map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase()).join(',')} — no key produces it (question can only be failed)`);
        await ctx.shot(`u${u.id}-apple-untypeable`);
        clean = false;
      }
      let k = 0;
      for (const ch of need) {
        if (bad.includes(ch)) continue;
        const before = await this.ev(() => __hndGame.state.filled.slice());
        await this.pressChar(ch, (k++ % 2) ? 'en' : 'he');
        await this.sleep(40);
        const after = await this.ev(() => ({ f: __hndGame.state.filled.slice(), c: __hndGame.state.current }));
        if (after.c !== n) break;
        // exactly the positions holding `ch` flip to filled
        const wrongFill = after.f.some((f, i) => f && !before[i] && q.answer[i] !== ch);
        const missFill = q.answer.split('').some((c, i) => q.sel[i] && c === ch && !after.f[i]);
        ctx.check(!wrongFill, 'apple filled letters that were not typed', `q${n + 1} typed "${ch}"`);
        ctx.check(!missFill, 'apple did not fill the typed letter', `q${n + 1} typed "${ch}"`);
      }
      if (bad.length) {
        // Only way out: burn the remaining wrong-key budget (8 errors → eat).
        const pool = Object.keys(HEB_CODE).filter(c => !q.answer.includes(c) && !['Period', 'Comma'].includes(HEB_CODE[c]));
        for (const c of pool) {
          if (await this.ev(k2 => __hndGame.state.current !== k2 || !__hndGame.state.gameEnabled, n)) break;
          await this.pressChar(c, 'en'); await this.sleep(40);
        }
      }
      errsPerQ.push(errs);
      const adv = await ctx.waitFor(k2 => { const s = __hndGame.state; return s.current > k2 || s.completed; }, 25000, n);
      ctx.check(adv, 'apple did not advance', `q${n + 1}`);
      if (n === 0) await ctx.shot(`u${u.id}-apple-q1`);
    }
    const fin = await ctx.waitFor(() => __hndGame.state.completed, 25000);
    ctx.check(fin, 'apple did not finish');
    // Drain formula: each basket drains (8 - errors) apples + 8-apple bonus.
    // A flawless game must score 100.
    let expected = null;
    if (clean) {
      const Q = info.Q;
      const perfect = errsPerQ.every(e => e === 0);
      if (perfect) expected = 100;
      else expected = Math.min(100, Math.round(errsPerQ.reduce((a, e) => a + (8 - e > 0 ? 16 - e : 0), 0) * 100 / Q / 16));
    }
    await this.checkScoreForm(`u${u.id}-apple`, expected, 'apple', null);
    return { menuBadge: expected };
  }

  // ---------- CONNECT ----------
  async playConnect(u, key) {
    const { ctx } = this;
    const total = await this.ev(() => __hndGame.gameState.totalPairs);
    let errors = 0, set = 0;
    while (true) {
      await this.page.mouse.move(2, 760);            // no hover → no repulsion
      const settled = await ctx.waitFor(() => {
        const bs = __hndGame.boxes;
        return bs.length && bs.every(b => __hndGame.state.matched[b.pairId] || (Math.abs(b.x - b.xk) < 2 && Math.abs(b.y - b.yk) < 2));
      }, 10000);
      if (!settled) ctx.finding('warn', 'connect boxes never settled', `set ${set + 1}`);
      const boxes = await this.ev(() => __hndGame.boxes.map((b, i) => ({ i, pairId: b.pairId, kind: b.kind, text: b.text, origIdx: b.origIdx })));
      set++;
      await ctx.checkImages();
      if (set === 1) await ctx.shot(`u${u.id}-connect-set1`);
      // Oracle: pair by DATA text (Q text → item → answer text).
      const pairs = await this.ev(() => {
        const g = __hndGame;
        return g.boxes.filter(b => b.kind === 'Q').map(q => {
          const want = g.items[q.origIdx][g.rightCol] || '';
          const a = g.boxes.findIndex(b => b.kind === 'A' && b.text === want);
          return { q: g.boxes.indexOf(q), a, pairId: q.pairId };
        });
      });
      for (let p = 0; p < pairs.length; p++) {
        const pr = pairs[p];
        ctx.check(pr.a >= 0, 'connect: answer box missing', `pair ${pr.pairId}`);
        if (pr.a < 0) continue;
        const other = pairs.find(x => x.pairId !== pr.pairId && x.a >= 0 && !x.done);
        if (set === 1 && p === 0 && other) {
          // Q first, then a wrong A.
          await this.clickBox(pr.q); await this.clickBox(other.a);
          ctx.check(!await this.ev(id => !!__hndGame.state.matched[id], other.pairId), 'connect accepted a wrong pair', 'Q→wrong A');
          errors++;
        }
        if (set === 1 && p === 1 && other) {
          // A first, then a wrong Q — must count as a mistake too.
          await this.clickBox(pr.a); await this.clickBox(other.q);
          ctx.check(!await this.ev(id => !!__hndGame.state.matched[id], pr.pairId), 'connect accepted a wrong pair', 'A→wrong Q');
          errors++;
        }
        await this.clickBox(pr.q); await this.clickBox(pr.a);
        const ok = await this.ev(id => !!__hndGame.state.matched[id], pr.pairId);
        ctx.check(ok, 'connect rejected the right pair', `"${boxes[pr.q].text}" ↔ "${boxes[pr.a].text}"`);
        pr.done = true;
      }
      const next = await ctx.waitFor(s => __hndGame.gameState.completed || __hndGame.gameState.setNum > s, 5000, set);
      if (!next) { ctx.finding('error', 'stuck', `connect: set ${set} complete but no next set / finish`); await ctx.shot('connect-stuck'); return null; }
      if (await this.ev(() => __hndGame.gameState.completed)) break;
    }
    const errTotal = await this.ev(() => __hndGame.gameState.totalErrors);
    ctx.check(errTotal === errors, 'connect miscounted mistakes', `made ${errors} wrong pairings, game counted ${errTotal}`);
    const expected = Math.max(0, Math.round(100 - errors * 15 / total));
    // Connect's win animation replaces the score form (orig WinTimer).
    await this.sleep(3500);
    await ctx.shot(`u${u.id}-connect-win`);
    const shown = await this.ev(() => { const e = document.querySelector('.connect-win-score'); return e && e.textContent; });
    ctx.check(shown === String(expected), 'connect final score wrong', `shown ${shown}, expected ${expected}`);
    const saved = await this.ev((a, id) => { const p = HND.loadProgress(a, id, 'connect'); return p && p.last; }, this.app, u.id);
    ctx.check(saved === expected, 'connect saved score wrong', `saved ${saved}, expected ${expected}`);
    return { menuBadge: expected };
  }

  async clickBox(i) {
    const pos = await this.ev(k => {
      const n = __hndGame.boxes[k]._node; const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, ok: !!hit && (hit === n || n.contains(hit)) };
    }, i);
    if (!pos.ok) {
      this.ctx.finding('info', 'connect box overlapped', `box ${i} centre covered — using element.click()`);
      await this.ev(k => __hndGame.boxes[k]._node.click(), i);
    } else {
      await this.ctx.click(pos.x, pos.y, 120);
    }
    await this.sleep(120);
  }

  // ---------- HAKIRA (reading scroll) ----------
  async playHakira(u) {
    const { ctx } = this;
    const info = await this.ev(() => ({ n: __hndGame.items.length, hint: !!__hndGame.hintCol, ask: __hndGame.cal.askSide, ans: __hndGame.cal.ansSide }));
    await ctx.waitFor(() => !__hndGame.state.animating, 8000);
    await this.sleep(300);
    await this.audioSince();
    const steps = info.hint ? 3 : 2;
    let resets = 0;
    for (let pos = 0; pos < info.n; pos++) {
      for (let st = 0; st < steps; st++) {
        await ctx.waitFor(() => !__hndGame.state.animating, 8000);
        const s = await this.ev(() => ({ pos: __hndGame.state.currentPos, ls: __hndGame.state.lineStatus, cin: __hndGame.state.currentCountIn }));
        if (s.cin === -1) { await this.clickEl('.hakira-parchment', { wait: 300, allowCovered: true }); resets++; await ctx.waitFor(() => !__hndGame.state.animating, 8000); }
        await this.clickEl('.hakira-parchment', { wait: 120, allowCovered: true });
        if (st < 2) {
          const evs = await this.flushAudio('hakira');
          const side = st === 0 ? info.ask : info.ans;
          const want = new RegExp(`/wave/${pos}_${side}\\.`);
          if (u.hasWaves) ctx.check(evs.some(e => e.ev === 'play' && want.test(e.src)), 'hakira step played no audio', `item ${pos} ${st === 0 ? 'question' : 'answer'} (${side})`);
        }
      }
      // wait for the item's audio to finish like a listening user would
      await this.sleep(250);
      const shown = await this.ev(p => {
        const g = __hndGame, it = g.items[p];
        const cells = [...document.querySelectorAll('.hakira-cell')].map(c => c.textContent);
        return { ask: cells.includes(it[g.askCol] || ''), ans: cells.includes(it[g.ansCol] || '') };
      }, pos);
      ctx.check(shown.ask && shown.ans, 'hakira text missing', `item ${pos}: ask=${shown.ask} ans=${shown.ans}`);
      if (pos === 2) await ctx.shot(`u${u.id}-hakira-mid`);
    }
    await ctx.checkImages();
    await ctx.shot(`u${u.id}-hakira-end`);
    await this.clickEl('.hakira-next', { wait: 700 });
    ctx.check(await this.ev(() => /\/games$/.test(location.hash)), 'hakira "next" did not exit to the menu');
    return {};
  }

  // ---------- chaos ----------
  async chaos(u, slot, game) {
    const { ctx } = this;
    const name = SLOT_NAMES[slot];
    ctx.step(`u${u.id}/${name}/chaos`);
    const t0 = await this.openSlot(u, slot);
    if (!await this.ctx.waitFor(a => window.__hndGame && window.__hndGame.startedAt >= a, 8000, t0)) return;
    await this.sleep(500);
    const n = ctx.quick ? 10 : 18;
    await ctx.monkey({ n, avoid: '.exit-icon,.score-exit,.hakira-next', wait: 200, randomTapRate: 0.15 });
    if (game === 'apple' || game === 'haklada') {
      await ctx.waitFor(() => __hndGame.state.gameEnabled, 8000);
      // key mash; for apple keep an exact record to check #35
      const pressed = [];
      const letters = Object.keys(HEB_CODE);
      for (let i = 0; i < 14; i++) {
        const ch = ctx.pick(letters);
        pressed.push(ch);
        await this.pressChar(ch, ctx.rand() < 0.5 ? 'he' : 'en');
        await this.sleep(30);
      }
      if (game === 'apple') {
        const bad = await this.ev(ks => {
          const s = __hndGame.state;
          if (s.completed) return null;
          const out = [];
          for (let i = 0; i < s.answer.length; i++) if (s.selected[i] && s.filled[i] && !ks.includes(s.answer[i])) out.push(s.answer[i]);
          return out;
        }, pressed);
        ctx.check(!bad || !bad.length, 'apple filled letters nobody typed', bad && bad.join(','));
      }
    }
    await ctx.checkImages();
    await ctx.shot(`u${u.id}-${name}-chaos`);
    await ctx.assertAlive(`${name} chaos`, 1500);
    await this.flushAudio(`${name} chaos`);
    await this.leaveGame(u);
    await this.checkListeners(`${name} chaos`);
  }
}

function rel(u) { return String(u || '').replace(/^https?:\/\/[^/]+\//, ''); }

module.exports = { makeDriver };
