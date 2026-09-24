// Shared Tirgolit / Tirgolit2 monkey driver. Tirgolit.js and Tirgolit2.js are
// thin wrappers choosing the product ('t1' integers / 't2' decimals).
//
// Plays every unit × every GList game (slot 0..6) CORRECTLY to the end, with
// exactly one deliberate wrong answer per game, and checks the penalty, the
// final score, the score-screen stats and the stored GList badge. All game
// state is read through the read-only hook window.__tirgolit (app.js).
//
// Env knobs (all optional):
//   TIRGOLIT_UNITS=all|sample|<id,id,…>   default: all (with --quick: sample)
//   TIRGOLIT_SLOTS=0,1,…                  default: 0..6
//   TIRGOLIT_SPEED=4                      timer acceleration factor
const { checkQ } = require('./math');

const SPEED = +(process.env.TIRGOLIT_SPEED || 4);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SLOT_NAMES = ['tirgol1-kind2', 't2-kind1', 't2-kind2', 'tirgol1-kind1', 'tirgol3', 'war', 'krav'];

// ─── page helpers ────────────────────────────────────────────────────────────

// Accelerate page timers so a 16-question game takes seconds, and record
// overlapping audio (two media elements audible at once — issue #59).
function installShims(page) {
  return page.evaluateOnNewDocument((speed) => {
    const st = window.setTimeout, si = window.setInterval;
    window.setTimeout = (fn, ms, ...a) => st(fn, Math.max(0, (ms || 0) / speed), ...a);
    window.setInterval = (fn, ms, ...a) => si(fn, Math.max(4, (ms || 0) / speed), ...a);
    window.__monkeyAudio = { overlaps: [], playing: new Set() };
    const P = HTMLMediaElement.prototype, play = P.play;
    P.play = function () {
      const self = this;
      const r = play.apply(this, arguments);
      Promise.resolve(r).then(() => {
        if (self.muted || self.tagName === 'VIDEO') return;
        const M = window.__monkeyAudio;
        for (const o of M.playing) if (o !== self && !o.paused && !o.ended) M.overlaps.push([o.currentSrc, self.currentSrc]);
        M.playing.add(self);
      }, () => {});
      return r;
    };
  }, SPEED);
}

const T = (ctx, fn, ...a) => ctx.eval(fn, ...a);
const app = ctx => T(ctx, () => window.__tirgolit.app());
const peek = (ctx, which) => T(ctx, w => window.__tirgolit[w](), which);

async function box(ctx, sel) {
  return ctx.page.$eval(sel, el => {
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }).catch(() => null);
}
async function clickSel(ctx, sel, wait = 120) {
  const b = await box(ctx, sel);
  if (!b || !b.w) { ctx.finding('error', 'missing control', `selector not visible: ${sel}`); return false; }
  await ctx.click(b.x, b.y, wait);
  return true;
}
async function text(ctx, sel) { return ctx.page.$eval(sel, e => e.textContent.trim()).catch(() => null); }

// Type one character the way a US-keyboard user would (Shift for + * ( )).
const SHIFTED = { '+': 'Equal', '*': 'Digit8', '(': 'Digit9', ')': 'Digit0' };
const PLAIN = { '.': 'Period', '-': 'Minus', '/': 'Slash', '=': 'Equal' };
async function typeChar(ctx, ch) {
  const kb = ctx.page.keyboard;
  if (SHIFTED[ch]) { await kb.down('Shift'); await kb.press(SHIFTED[ch]); await kb.up('Shift'); }
  else if (PLAIN[ch]) await kb.press(PLAIN[ch]);
  else if (/\d/.test(ch)) await kb.press('Digit' + ch);
  else await kb.type(ch);
}
const wrongDigit = exp => (exp === '7' ? '3' : '7');

async function until(ctx, fn, timeout, arg) { return ctx.waitFor(fn, timeout, arg); }

// Leave whatever game screen is up via Esc → MMenu → exit.
async function bailOut(ctx, why) {
  await ctx.shot('bail-' + why);
  await openMenuExit(ctx);
  await sleep(300);
}
// Open the in-game MMenu (unless already open) and press its exit button.
async function openMenuExit(ctx) {
  const open = () => ctx.eval(() => !!document.querySelector('.screen.active .mmenu[style*="block"]'));
  if (!await open()) { await ctx.page.keyboard.press('Escape'); await sleep(40); }
  if (!await open()) return false;
  return clickSel(ctx, '.screen.active .mmenu[style*="block"] .mmenu-btn', 60);
}

// ─── GList / units navigation ────────────────────────────────────────────────

async function openUnit(ctx, tab, uid) {
  const a = await app(ctx);
  if (a.glist) await clickSel(ctx, '.glist-exit', 200);
  if (a.screen !== 'units') { ctx.finding('error', 'not on units screen', `expected units, on ${a.screen}`); return false; }
  if (a.tab !== tab) await clickSel(ctx, `#u-tab-${tab}`, 150);
  if (!await clickSel(ctx, `#u-list .u-row[data-uid="${uid}"]`, 100)) return false;
  await clickSel(ctx, '#u-play', 250);
  const b = await app(ctx);
  return ctx.check(b.glist && String(b.glistUnitId) === String(uid), 'GList did not open', `unit ${uid} via Play button`);
}

// ─── the seven games ─────────────────────────────────────────────────────────

// Slots 0 + 3: Tirgol1 matching game (click the plank whose answer fits).
async function playMatch(ctx, res) {
  if (!await until(ctx, () => window.__tirgolit.game().target && document.querySelector('#game-rows .q-row'), 8000)) return 'no first target';
  let s = await peek(ctx, 'game');
  const perWrong = Math.max(1, Math.round(5 - s.total / 8));
  let wrongDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const a = await app(ctx);
    if (a.screen === 'score') break;
    s = await peek(ctx, 'game');
    if (!s.target) { await sleep(20); continue; }
    const shown = await text(ctx, '#game-target-value');
    if (shown !== s.target.value) ctx.finding('error', 'target bar shows wrong value', `bar "${shown}" vs target "${s.target.value}"`);
    const unmatched = s.scene.map((p, i) => i).filter(i => !s.matched[i]);
    const right = unmatched.filter(i => s.scene[i].answer === s.target.matchAnswer);
    if (!right.length) return 'no row carries the target answer';
    if (!wrongDone) {
      const wrong = unmatched.find(i => s.scene[i].answer !== s.target.matchAnswer);
      if (wrong !== undefined) {
        await clickSel(ctx, `#game-rows .q-row[data-idx="${wrong}"]`, 60);
        const s2 = await peek(ctx, 'game');
        ctx.check(s2.penalty === s.penalty + perWrong, 'wrong plank not penalised',
          `penalty ${s.penalty} → ${s2.penalty}, expected +${perWrong}`);
        ctx.check(!s2.matched[wrong], 'wrong plank accepted as correct', `row ${wrong} "${s.scene[wrong].expr}=${s.scene[wrong].answer}" for target ${s.target.value}`);
        res.wrong = 1; res.expPenalty += perWrong; wrongDone = true;
        continue;
      }
    }
    const before = s.matched.filter(Boolean).length + s.sceneIndex * 100;
    await clickSel(ctx, `#game-rows .q-row[data-idx="${right[0]}"]`, 30);
    const ok = await until(ctx, b => { const g = window.__tirgolit.game(); return g.matched.filter(Boolean).length + g.sceneIndex * 100 !== b || window.__tirgolit.app().screen === 'score'; }, 3000, before);
    if (!ok) return `correct plank click ignored (row ${right[0]}, target ${s.target.value})`;
  }
  res.total = s.total;
  return null;
}

// Slots 1 + 2: Tirgol2 sequential typing.
async function playTyping(ctx, res, kind) {
  await sleep(1700 / SPEED + 100);            // intro animation
  if (!await until(ctx, () => { const g = window.__tirgolit.t2(); return g.tshP && !g.blocked && g.scene.length; }, 8000)) return 'typing row never became active';
  let s = await peek(ctx, 't2');
  const perWrong = Math.max(1, Math.round(5 - s.total / 8));
  let wrongDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    if ((await app(ctx)).screen === 'score') break;
    s = await peek(ctx, 't2');
    if (s.blocked || s.typedCount >= s.tshP.length) { await sleep(20); continue; }
    const pair = s.scene[s.tshNom];
    if (s.typedCount === 0) {
      if (kind === 1) ctx.check(s.tshP === pair.answer, 'typing target is not the answer', `${pair.expr}=${pair.answer}, must type "${s.tshP}"`);
      else ctx.check(pair.expr.substr(s.staStr - 1, s.tshP.length) === s.tshP, 'typing target not inside expression', `${pair.expr}: "${s.tshP}" @${s.staStr}`);
      if (kind === 2 && s.tshP[0] === '-' && s.staStr > 1 && !/[+\-*/(]/.test(pair.expr[s.staStr - 2]))
        ctx.finding('error', 'Tirgol2 blank swallows the minus operator', `${pair.expr} = ${pair.answer}: must type "${s.tshP}" but the screen shows "${pair.expr.slice(0, s.staStr - 1)}_${pair.expr.slice(s.staStr - 1 + s.tshP.length)}"`);
    }
    const exp = s.tshP[s.typedCount];
    if (!wrongDone) {
      await typeChar(ctx, wrongDigit(exp)); await sleep(30);
      const s2 = await peek(ctx, 't2');
      ctx.check(s2.penalty === s.penalty + perWrong && s2.typedCount === s.typedCount, 'wrong key not penalised',
        `expected "${exp}", typed "${wrongDigit(exp)}": penalty ${s.penalty}→${s2.penalty}, typed ${s.typedCount}→${s2.typedCount}`);
      res.wrong = 1; res.expPenalty += perWrong; wrongDone = true;
      continue;
    }
    const key = `${s.sceneIndex}/${s.tshNom}/${s.typedCount}`;
    await typeChar(ctx, exp);
    const ok = await until(ctx, k => { const g = window.__tirgolit.t2(); return `${g.sceneIndex}/${g.tshNom}/${g.typedCount}` !== k || g.blocked || window.__tirgolit.app().screen === 'score'; }, 2000, key);
    if (!ok) return `typing "${exp}" not accepted (target "${s.tshP}" in ${pair.expr}=${pair.answer})`;
  }
  res.total = s.total;
  return null;
}

// Slot 4: Tirgol3 — spot the row with the wrong answer, then type the right one.
async function playSpot(ctx, res) {
  await sleep(1700 / SPEED + 100);
  let wrongDone = false;
  const t0 = Date.now();
  let lastScene = -1;
  while (Date.now() - t0 < 120000) {
    if ((await app(ctx)).screen === 'score') break;
    const s = await peek(ctx, 't3');
    if (!s.scene.length) { await sleep(30); continue; }
    if (s.phase === 1) {
      if (s.sceneIdx !== lastScene) {
        lastScene = s.sceneIdx;
        // The planted answer must really be wrong, the other three really right.
        const fakeBad = checkQ(s.scene[s.targetRow].expr, s.fakeAnswer);
        if (!fakeBad) ctx.finding('error', 'Tirgol3 "wrong" row shows a correct answer',
          `${s.scene[s.targetRow].expr} = ${s.fakeAnswer} (planted as the mistake; real ${s.realAnswer})`);
        const shown = await ctx.eval(() => [0, 1, 2, 3].map(i => { const e = document.getElementById('t3-ans-' + i); return e && e.textContent; }));
        s.scene.forEach((p, i) => {
          if (i !== s.targetRow && shown[i] !== p.answer) ctx.finding('error', 'Tirgol3 row shows wrong text', `row ${i}: ${p.expr} = "${shown[i]}" (data ${p.answer})`);
        });
      }
      if (!wrongDone) {
        const w = (s.targetRow + 1) % 4;
        await clickSel(ctx, `#game-rows .t3-row[data-idx="${w}"]`, 40);
        const s2 = await peek(ctx, 't3');
        ctx.check(s2.penalty === s.penalty + 1 && s2.phase === 1, 'Tirgol3 wrong row not penalised', `penalty ${s.penalty}→${s2.penalty}`);
        res.wrong = 1; res.expPenalty += 1; wrongDone = true;
        continue;
      }
      await clickSel(ctx, `#game-rows .t3-row[data-idx="${s.targetRow}"]`, 40);
      if (!await until(ctx, () => window.__tirgolit.t3().phase === 2, 1500)) return 'clicking the planted row did not start typing';
      continue;
    }
    // phase 2 — type the real answer
    if (s.typedSoFar.length >= s.realAnswer.length) { await sleep(20); continue; }
    const exp = s.realAnswer[s.typedSoFar.length];
    await typeChar(ctx, exp);
    const ok = await until(ctx, n => { const g = window.__tirgolit.t3(); return g.typedSoFar.length !== n || g.phase !== 2 || window.__tirgolit.app().screen === 'score'; }, 1500, s.typedSoFar.length);
    if (!ok) {
      const s3 = await peek(ctx, 't3');
      return `typing "${exp}" not accepted (answer "${s.realAnswer}" for ${s.scene[s.targetRow].expr}; penalty now ${s3.penalty})`;
    }
  }
  res.total = 8;
  return null;
}

// Slot 5: WarG — type answers to shoot the walking creatures (3 waves × 4).
async function playWar(ctx, res) {
  if (!await until(ctx, () => { const w = window.__tirgolit.war(); return w.gameRunning && w.spritesReady; }, 15000)) return 'war never started';
  let wrongDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const a = await app(ctx);
    if (a.screen === 'score') break;
    const w = await peek(ctx, 'war');
    if (w.losing) return `rooster lost (creature reached it) in wave ${w.shlav}`;
    if (!w.gameRunning || w.rMachav !== 0 || !w.pair || w.answered[(w.rLane - 1) + (w.shlav - 1) * 4 + 1]) { await sleep(15); continue; }
    const exp = w.strAns[w.strAns.length - 1];
    if (!wrongDone) {
      await typeChar(ctx, wrongDigit(exp)); await sleep(20);
      const w2 = await peek(ctx, 'war');
      ctx.check(w2.warScore === w.warScore - 7, 'war wrong key not penalised', `score ${w.warScore}→${w2.warScore}`);
      res.wrong = 1; res.expPenalty += 7; wrongDone = true;
      await until(ctx, () => window.__tirgolit.war().rMachav === 0, 3000);
      continue;
    }
    const key = `${w.shlav}/${w.rLane}/${w.strAns}/${w.tshNom}`;
    await typeChar(ctx, exp);
    const ok = await until(ctx, k => { const g = window.__tirgolit.war(); return `${g.shlav}/${g.rLane}/${g.strAns}/${g.tshNom}` !== k || g.rMachav !== 0 || !g.gameRunning; }, 2000, key);
    if (!ok) return `war: typing "${exp}" not accepted (answer "${w.tshP}" for ${w.pair.expr})`;
  }
  res.total = 12;
  return null;
}

// Canvas point → page coords for the 800×600 canvases.
async function canvasPt(ctx, id, x, y) {
  return ctx.page.$eval('#' + id, (c, x, y) => { const r = c.getBoundingClientRect(); return { x: r.left + x * r.width / 800, y: r.top + y * r.height / 600 }; }, x, y);
}

// Slot 6: Krav — two-player tug of war on one keyboard. Player B (right) answers
// every question instantly; player A idles, so each round ends with the
// indicator reaching A's side (roundWin(0)). Replays rounds until 3 are won.
async function playKrav(ctx, res) {
  if (!await until(ctx, () => { const b = document.getElementById('krav-name-b'); return b && b.style.display === 'block'; }, 15000)) return 'name entry never shown';
  await ctx.page.focus('#krav-name-b'); await ctx.page.keyboard.type('Bee'); await ctx.page.keyboard.press('Enter');
  if (!await until(ctx, () => document.getElementById('krav-name-a').style.display === 'block', 3000)) return 'second name box never shown';
  await ctx.page.focus('#krav-name-a'); await ctx.page.keyboard.type('Ay'); await ctx.page.keyboard.press('Enter');
  await ctx.shot('krav-names');
  let wrongDone = false, rounds = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const a = await app(ctx);
    if (a.screen !== 'krav') break;
    const k = await peek(ctx, 'krav');
    if (k.showScoreOverlay) {
      rounds++;
      await ctx.shot(`krav-round-${rounds}`);
      const ex = k.scoreOverlayGameOver;
      const p = await canvasPt(ctx, 'krav-canvas', ex ? 263 + 60 : 391 + 60, ex ? 215 + 27 : 214 + 27);
      await ctx.click(p.x, p.y, 200);
      if (!ex && (await peek(ctx, 'krav')).showScoreOverlay) return 'krav replay button did not respond';
      res.kravScore = k.scoreT;
      continue;
    }
    if (!k.gameRunning || !k.showQ || k.tor !== 1) { await sleep(20); continue; }
    const exp = k.strAns[k.strAns.length - 1];
    if (!wrongDone) {
      await typeChar(ctx, wrongDigit(exp)); await sleep(20);
      const k2 = await peek(ctx, 'krav');
      ctx.check(k2.realScore[1] >= k.realScore[1] + 2, 'krav wrong key not penalised', `realScore ${k.realScore[1]}→${k2.realScore[1]}`);
      wrongDone = true; continue;
    }
    const key = `${k.shela}/${k.strAns}/${k.tor}`;
    await typeChar(ctx, exp);
    const ok = await until(ctx, kk => { const g = window.__tirgolit.krav(); return `${g.shela}/${g.strAns}/${g.tor}` !== kk || !g.showQ; }, 2000, key);
    if (!ok) return `krav: typing "${exp}" not accepted (answer "${k.tshP}" for ${k.pair && k.pair.expr})`;
  }
  res.total = rounds;
  return null;
}

// ─── one game, end to end ───────────────────────────────────────────────────

async function playSlot(ctx, P, tab, uid, slot, opts) {
  const res = { wrong: 0, expPenalty: 0 };
  await clickSel(ctx, `#glist-row-${slot}`, 200);
  const a = await app(ctx);
  const wantScreen = slot === 5 ? 'war' : slot === 6 ? 'krav' : 'game';
  if (!ctx.check(a.screen === wantScreen && String(a.unitId) === String(uid) && a.slot === slot, 'game did not open',
    `slot ${slot} → screen ${a.screen} unit ${a.unitId} slot ${a.slot}`)) return;
  if (opts.shots) { await sleep(400); await ctx.checkImages(); await ctx.shot(`${P}-u${uid}-${SLOT_NAMES[slot]}-start`); }

  let err;
  const t0 = Date.now();
  if (slot === 0 || slot === 3) err = await playMatch(ctx, res);
  else if (slot === 1 || slot === 2) err = await playTyping(ctx, res, slot);
  else if (slot === 4) err = await playSpot(ctx, res);
  else if (slot === 5) err = await playWar(ctx, res);
  else err = await playKrav(ctx, res);
  const ms = Date.now() - t0;

  if (err) {
    ctx.finding('error', `${SLOT_NAMES[slot]}: stuck`, `${P} unit ${uid}: ${err}`);
    await bailOut(ctx, `${P}-u${uid}-s${slot}`);
    const b = await app(ctx);
    ctx.check(b.glist, 'exit from stuck game did not return to GList', `on ${b.screen}`);
    return false;
  }

  if (slot === 6) {
    // Krav returns straight to GList (VB6 CafEx) and stores scoreT[0]*50.
    if (!await until(ctx, () => window.__tirgolit.app().glist, 5000)) { ctx.finding('error', 'krav exit did not return to GList', ''); return; }
    const stored = await ctx.eval((u, prod) => (JSON.parse(localStorage.tirgolit_users)[window.__tirgolit.app().user].scores[prod + '/' + u + '_s6']) || 0, String(uid), P);
    const exp = Math.min(100, (res.kravScore ? res.kravScore[0] : 0) * 50);
    ctx.check(stored === exp || stored > exp, 'krav stored score wrong', `unit ${uid}: stored ${stored}, rounds ${JSON.stringify(res.kravScore)} → ${exp}`);
    opts.log(`  ${P} u${uid} krav rounds=${res.total} scoreT=${JSON.stringify(res.kravScore)} ${ms}ms`);
    return exp > 0;
  }

  if (!await until(ctx, () => window.__tirgolit.app().screen === 'score', 8000)) {
    ctx.finding('error', `${SLOT_NAMES[slot]}: score screen never shown`, `${P} unit ${uid}`); await bailOut(ctx, 'noscore'); return;
  }
  await sleep(150);
  const sc = await ctx.eval(() => ({
    n: +document.getElementById('sc-number').textContent, tov: +document.getElementById('sc-tov').textContent,
    be: +document.getElementById('sc-be').textContent, ra: +document.getElementById('sc-ra').textContent,
    rating: document.getElementById('sc-rating').textContent,
    eggs: document.querySelectorAll('#score-eggs .egg-sprite').length,
  }));
  const expScore = 100 - res.expPenalty;
  ctx.check(sc.n === expScore, `${SLOT_NAMES[slot]}: wrong final score`, `${P} unit ${uid}: shows ${sc.n}, expected ${expScore} (${res.wrong} wrong answer)`);
  const nQ = slot === 4 ? 8 : slot === 5 ? 12 : res.total;
  ctx.check(sc.tov + sc.be + sc.ra === nQ && sc.be + sc.ra === res.wrong, `${SLOT_NAMES[slot]}: score-screen stats wrong`,
    `${P} unit ${uid}: tov/be/ra ${sc.tov}/${sc.be}/${sc.ra} for ${nQ} questions, ${res.wrong} wrong`);
  if (slot !== 5) ctx.check(sc.eggs === Math.min(nQ, 32), 'score-screen egg count wrong', `${sc.eggs} eggs for ${nQ} questions`);
  if (opts.shots) { await ctx.checkImages(); await ctx.shot(`${P}-u${uid}-${SLOT_NAMES[slot]}-score`); }
  await clickSel(ctx, '.sc-exit-btn', 250);
  const b = await app(ctx);
  if (!ctx.check(b.glist, 'score exit did not return to GList', `on ${b.screen}`)) return;
  if (slot <= 5) {
    const badge = await text(ctx, `#glist-snum-${slot}`);
    ctx.check(+badge >= expScore, 'GList badge missing/wrong after game', `${P} unit ${uid} slot ${slot}: badge "${badge}", scored ${expScore}`);
  }
  opts.log(`  ${P} u${uid} ${SLOT_NAMES[slot]} score=${sc.n} n=${nQ} ${ms}ms`);
  return sc.n > 0;
}

module.exports = {
  SPEED, SLOT_NAMES, installShims, app, peek, box, clickSel, text, typeChar, until, bailOut, openMenuExit, openUnit, playSlot, canvasPt, sleep,
};
