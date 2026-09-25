// KolKoreA–D Sst specifics layered on the shared Kesem walker (../kesem.js).
// The four Kol Kore apps share Games*.frm but each Sst.frm is its own thing:
//
//   A  two Icon_s tabs (rama 1 / 2); rama 1 shows only btnIcon 0..4 (five
//      wide tiles, applyKolKoreARamaLayout), rama 2 twelve narrow ones.
//   B  one Icon_s that TOGGLES rama 1↔2 (defaultRama 2); btnIcon 0..6 only
//      *pick* an activity (temC sprite, stroke-drawn letter, star previews);
//      star(0)/star(1) start slot cHos / cHos+7; btnLamp(0/1) follow the
//      star pane, not the slot index.
//   C  one Icon_s that toggles rama with a PolaPic page-flip (8 frames).
//   D  same flip (7 frames) + rama 2 shifts btnIcon 0..7 by +65 px and hides
//      btnIcon/btnLamp 11 (applyKolKoreDRamaLayout).
//
// All four: Lampas prints v = Int((bx*5 + cx + dX)*20/ax) on each lit lamp;
// C/D alias gameNumber 6/7/8 → Games3 (6/7/8 hide the hak record button).
'use strict';
const { runApp } = require('./kesem');

// In-page: rama-dependent Sst state that must agree after any rama switch.
function sstState() {
  const s = window.__kesemSession;
  const q = sel => [...document.querySelectorAll(sel)];
  const vis = e => getComputedStyle(e).display !== 'none';
  const src = e => { const i = e.querySelector('img.frm-img') || e.querySelector('img'); return i ? (i.getAttribute('src') || '') : ''; };
  const pola = document.querySelector('.frm-ctrl--PolaPic img.frm-flip');
  return {
    rama: String(s.rama),
    bg: s.bg ? s.bg.getAttribute('src') : '',
    icons: q('.frm-ctrl--btnIcon').map(e => ({ i: +e.dataset.index, vis: vis(e), src: src(e), left: e.style.left, op: e.style.opacity })),
    lamps: q('.frm-ctrl--btnLamp').map(e => ({ i: +e.dataset.index, vis: vis(e), src: src(e), left: e.style.left, score: (e.querySelector('.lamp-score') || {}).textContent || null })),
    iconS: q('.frm-ctrl--Icon_s').map(src),
    pola: pola ? pola.getAttribute('src') : null,
    flipping: !!s._flipTimer,
    stars: q('.frm-ctrl--star').map(src),
    cHos: s.kkb_cHos,
  };
}

// Click the single Icon_s toggle until state.rama === r (B/C/D).
// Last mouse position (page side) for the cursor-piece check.
function mouseTracker() {
  addEventListener('mousemove', e => { window.__kmMouse = { x: e.clientX, y: e.clientY }; }, true);
}

async function toggleRama(k, r) {
  const ctx = k.ctx;
  for (let n = 0; n < 3; n++) {
    const cur = await k.eval(() => String(window.__kesemSession.rama));
    if (cur === String(r)) break;
    await k.tap('.frm-ctrl--Icon_s', 0, 200);
    const ok = await ctx.waitFor(t => String(window.__kesemSession.rama) === t && !window.__kesemSession._flipTimer, 4000, String(r));
    if (!ok) ctx.finding('warn', 'rama toggle slow', `Icon_s → rama ${r} not reached in 4 s (now ${await k.eval(() => window.__kesemSession.rama)})`);
  }
  await ctx.sleep(350);                                     // fade-in (160 ms)
  const got = await k.eval(() => String(window.__kesemSession.rama));
  if (got !== String(r)) { ctx.finding('error', 'rama tab did not switch', `Icon_s toggle → wanted rama ${r}, rama=${got}`); return false; }
  return true;
}

// Every rama-dependent control matches the settled rama.
async function checkSstConsistent(k, label) {
  const { ctx } = k;
  const st = await k.eval(sstState);
  const app = k.app;
  const r = st.rama;
  const bad = [];
  if (app !== 'KolKoreB') {
    for (const ic of st.icons) if (ic.vis && ic.src && !new RegExp(`tem_${ic.i + 1}${r}\\.(png|webp)$`).test(ic.src)) bad.push(`btnIcon[${ic.i}] ${ic.src}`);
  } else {
    for (const ic of st.icons) if (ic.src && !new RegExp(`tem(c)?_${r}${ic.i + 1}\\.(png|webp)$`).test(ic.src)) bad.push(`btnIcon[${ic.i}] ${ic.src}`);
    const sel = st.icons.filter(ic => /temc_/.test(ic.src)).map(ic => ic.i);
    if (sel.length !== 1 || sel[0] !== st.cHos) bad.push(`selected sprite on [${sel}] but cHos=${st.cHos}`);
  }
  const noext = u => String(u || '').replace(/\.(png|webp)$/, '');
  if (st.iconS.length === 1 && /dafm/.test(st.iconS[0]) && !noext(st.iconS[0]).endsWith(`dafm${r}`)) bad.push(`Icon_s ${st.iconS[0]}`);
  if (st.pola && !st.flipping) {
    const n = app === 'KolKoreC' ? 8 : 7;
    const want = r === '2' ? `daf${n}` : 'daf1';
    if (!st.pola.replace(/\.(png|webp)$/, '').endsWith(want)) bad.push(`PolaPic ${st.pola} (want ${want})`);
  }
  for (const ic of st.icons) if (ic.vis && ic.op && +ic.op < 1) bad.push(`btnIcon[${ic.i}] opacity ${ic.op}`);
  for (const l of st.lamps) if (l.vis && l.src && !/lamp[12]/.test(l.src)) bad.push(`btnLamp[${l.i}] ${l.src}`);
  ctx.check(!bad.length, 'Sst inconsistent with rama', `${label}: rama ${r}: ${bad.slice(0, 4).join(' ; ')}`);
  return st;
}

// Lampas: the number printed on every lit lamp = Int((g*5+y+r)*20/total)
// over the saved stages of the slot the lamp stands for.
async function checkLampScores(k, label) {
  const { ctx } = k;
  const st = await k.eval(sstState);
  const ls = await k.eval(a => window.__km.ls(a), k.app);
  const sc = ls.scores[st.rama] || {};
  const done = ls.completed[st.rama] || {};
  for (const l of st.lamps) {
    if (!l.vis) continue;
    const slot = k.app === 'KolKoreB' ? st.cHos + (l.i === 1 ? 7 : 0) : l.i;
    const lit = /lamp2/.test(l.src);
    ctx.check(lit === !!done[slot], 'lamp state ≠ completion', `${label}: rama ${st.rama} lamp ${l.i} (slot ${slot}) lit=${lit} completed=${!!done[slot]}`);
    if (!lit) { ctx.check(l.score == null, 'score printed on unlit lamp', `${label}: lamp ${l.i}`); continue; }
    const e = sc[slot];
    let ax = 0, bx = 0, cx = 0, dx = 0;
    for (const s of (e && e.stages) || []) if (s) { ax += s.total || 0; bx += s.green || 0; cx += s.yellow || 0; dx += s.red || 0; }
    const want = ax ? String(Math.floor(((bx * 5 + cx + dx) * 20) / ax)) : null;
    ctx.check(l.score === want, 'wrong score printed on lamp', `${label}: rama ${st.rama} lamp ${l.i} (slot ${slot}) shows ${l.score}, saved stages give ${want}`);
  }
}

// #50: while a game's audio plays (Games*.frm Timer1: MMControl2.Mode = 526)
// the gated controls are Enabled=False — VB6 shows their "_2" sprite and
// fires no MouseMove, so nothing may light up or show a hand cursor. Hover
// (no clicks — they could advance the game) every gated act1 and the
// answer area once per game type while the stage-entry audio is playing.
async function busyHoverProbe(k, s) {
  const { ctx } = k;
  const key = s.gn;
  k._probed = k._probed || new Set();
  if (k._probed.has(key)) return;
  const busy = () => k.eval(() => window.__km.snap().busy);
  if (!(await busy())) return;
  k._probed.add(key);
  // Media runs at ×16; slow the current clip so the probe finishes inside it.
  await k.eval(() => { const a = window.__kesemSession._audio; if (a) a.playbackRate = 0.5; });
  const targets = await k.eval(() => {
    const out = [];
    const vis = e => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 2;
    for (const e of document.querySelectorAll('.frm-ctrl--act1[data-audio-gated="1"]')) if (vis(e)) out.push({ sel: `.frm-ctrl--act1[data-index="${e.dataset.index}"]`, what: `act1[${e.dataset.index}]` });
    for (const q of ['.stage-hotspot', '.stage-cover', '.stage-game5-choice', '.frm-ctrl--Picture2']) {
      const e = [...document.querySelectorAll(q)].find(vis);
      if (e && e.closest('.frm-ctrl--Picture22') == null) out.push({ sel: q, what: q });
    }
    return out;
  });
  for (const t of targets) {
    const p = await k.eval(q => window.__km.point(q), t.sel);
    if (!p || !p.hit) continue;
    await ctx.page.mouse.move(p.x, p.y);
    await ctx.sleep(120);
    const st = await k.eval((q, x, y) => {
      const el = document.querySelector(q);
      const img = el.querySelector('img.act1-img');
      const s = window.__kesemSession;
      const cfg = s.config.act1Images || {};
      const idx = el.dataset.index;
      const a1 = idx != null ? ((cfg[s.currentScreen] || {})[idx] || (cfg.default || {})[idx]) : null;
      const h = document.elementFromPoint(x, y);
      return { busy: window.__km.snap().busy, src: img ? img.getAttribute('src') : null, hover: a1 && a1.hover, idle: a1 && a1.idle,
               cursor: h ? getComputedStyle(h).cursor : '' };
    }, t.sel, p.x, p.y);
    if (!st.busy) break;                                    // audio ended mid-probe
    const tag = `game${s.gn} ${t.what} while audio plays`;
    const ne = u => String(u || '').replace(/\.(png|webp)$/, '');
    if (st.src) {
      ctx.check(ne(st.src) !== ne(st.hover), 'disabled button lights up on hover', `${tag}: hover sprite ${st.src.split('/').pop()}`);
      ctx.check(ne(st.src) !== ne(st.idle), 'disabled button shows its enabled sprite', `${tag}: ${st.src.split('/').pop()} (VB6 swaps to the _2 sprite)`);
    }
    ctx.check(st.cursor !== 'pointer', 'disabled control shows a hand cursor', `${tag}: cursor ${st.cursor}`);
  }
  await ctx.shot(`busy-probe-g${s.gn}`);
  await ctx.page.mouse.move(512, 3);
  await k.eval(r => { const a = window.__kesemSession._audio; if (a) a.playbackRate = r; }, k.o.rate);
}

// #48: the Games3 hak ("speaking zone") panel. Every visible control must
// either work or look disabled; the "?" (wa[5], tipl(8) "עזרה") must show
// the tipl captions; a refused microphone must not leave the record button
// silently dead.
async function hakPanelChecks(k, tag) {
  const { ctx } = k;
  const vis = q => k.eval(x => window.__km.visible(x), q);
  if (!(await vis('.frm-ctrl--act1[data-index="1"]'))) return;
  await k.waitIdle();
  await k.tap('.frm-ctrl--act1[data-index="1"]', 0, 500);
  if (!(await vis('.frm-ctrl--Picture22'))) return;
  const captions = () => k.eval(() => [...document.querySelectorAll('.hak-tip')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent));
  // hover each control → its caption
  const ctrls = await k.eval(() => [...document.querySelectorAll('.frm-ctrl--Picture22 .frm-ctrl--wa, .frm-ctrl--Picture22 .frm-ctrl--dif')]
    .filter(e => getComputedStyle(e).display !== 'none').map(e => ({ n: e.dataset.name, i: +e.dataset.index, pe: getComputedStyle(e).pointerEvents })));
  for (const c of ctrls) {
    const p = await k.eval((n, i) => window.__km.point(`.frm-ctrl--${n}[data-index="${i}"]`), c.n, c.i);
    if (!p) continue;
    await ctx.page.mouse.move(p.x, p.y);
    await ctx.sleep(150);
    const got = await captions();
    if (c.n === 'wa' && c.i === 5) {
      await ctx.shot(`${tag}-hak-help`);
      ctx.check(p.hit && got.length >= 4, 'hak help (?) shows nothing', `${tag}: hovering wa[5] shows ${got.length} captions (${got.join(', ')}), pointer-events=${c.pe}, top-most=${p.hit}`);
    } else if (c.pe !== 'none') {
      ctx.check(got.length === 1, 'hak control has no caption on hover', `${tag}: ${c.n}[${c.i}] → [${got.join(', ')}]`);
    }
  }
  await ctx.page.mouse.move(512, 3);
  await ctx.sleep(150);
  ctx.check(!(await captions()).length, 'hak captions stay up after hover', tag);
  // tap "?" (touch): captions toggle on
  if (await vis('.frm-ctrl--wa[data-index="5"]')) {
    await k.tap('.frm-ctrl--wa[data-index="5"]', 0, 200, { quiet: true });
    ctx.check((await captions()).length >= 4, 'hak help (?) tap shows no captions', tag);
    await ctx.page.mouse.move(512, 3);
  }
  // refused microphone → visible feedback, panel still usable
  await k.eval(() => { const md = navigator.mediaDevices; window.__kmGum = md.getUserMedia; md.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    const r = window.__kesemSession._kkbRec; if (r && r.stream) { r.stream.getTracks().forEach(t => t.stop()); r.stream = null; } });
  await k.tap('.frm-ctrl--wa[data-index="1"]', 0, 500);
  const msg = await k.eval(() => [...document.querySelectorAll('.hak-tip, .hak-mic-msg')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent).join(' | '));
  ctx.check(/מיקרופון/.test(msg), 'refused microphone gives no feedback', `${tag}: after wa[1] with getUserMedia rejected, visible text: "${msg}"`);
  await ctx.shot(`${tag}-hak-nomic`);
  await k.eval(() => { navigator.mediaDevices.getUserMedia = window.__kmGum; });
  for (const [n, i] of [['dif', 0], ['dif', 1], ['wa', 0], ['wa', 4]]) {
    const p = await k.eval((a, b) => window.__km.point(`.frm-ctrl--${a}[data-index="${b}"]`), n, i);
    ctx.check(p && p.hit, 'hak control not clickable after mic refusal', `${tag}: ${n}[${i}]`);
  }
  // …and they must DO something, not just be top-most: prev/next item
  // (dif), hear the word (wa[0]), leave the panel (wa[4]).
  const nom = () => k.eval(() => window.__kesemSession._hakNom);
  await k.waitIdle();
  const n0 = await nom();
  await k.tap('.frm-ctrl--dif[data-index="1"]', 0, 300);
  const n1 = await nom();
  ctx.check(n1 !== n0, 'hak next-item (dif[1]) does nothing', `${tag}: item ${n0} → ${n1}`);
  await k.waitIdle();
  await k.tap('.frm-ctrl--dif[data-index="0"]', 0, 300);
  ctx.check((await nom()) === n0, 'hak prev-item (dif[0]) does not go back', `${tag}: item ${n1} → ${await nom()} (want ${n0})`);
  await k.waitIdle();
  const t0 = ctx.traceLen();
  await k.tap('.frm-ctrl--wa[data-index="0"]', 0, 300);
  ctx.check(ctx.traceSince(t0).some(l => /audio (play|skip)/.test(l)), 'hak hear-word (wa[0]) does nothing', `${tag}: no audio after wa[0]`);
  await k.waitIdle();
  await k.tap('.frm-ctrl--wa[data-index="4"]', 0, 500);
  ctx.check(!(await vis('.frm-ctrl--Picture22')), 'hak exit (wa[4]) does not close the panel', tag);
  await k.waitIdle();
}

// #49: games 2/4 float a cropped piece (Picture3) on the cursor; Picture1
// MouseMove centres it there. A freshly-painted piece (next question) must
// sit on the cursor — not at Picture1's corner until the mouse moves.
async function cursorPieceCheck(k, tag, s) {
  const st = await k.eval(() => {
    const pc = document.querySelector('.stage-cursor-piece');
    const pic1 = document.querySelector('.frm-ctrl--Picture1');
    const m = window.__kmMouse;
    if (!pc || !pic1 || !m) return null;
    const r = pc.getBoundingClientRect(), pr = pic1.getBoundingClientRect();
    const inside = m.x > pr.left && m.x < pr.right && m.y > pr.top && m.y < pr.bottom;
    return { inside, vis: getComputedStyle(pc).visibility !== 'hidden' && getComputedStyle(pc).display !== 'none', dx: Math.round(r.left + r.width / 2 - m.x), dy: Math.round(r.top + r.height / 2 - m.y), at: [Math.round(r.left - pr.left), Math.round(r.top - pr.top)] };
  });
  if (!st || !st.inside || !st.vis) return;
  k.ctx.check(Math.abs(st.dx) <= 4 && Math.abs(st.dy) <= 4, 'cursor piece not on the cursor', `${tag} stage ${s.stageIdx + 1} game${s.gn}: piece centre is ${st.dx},${st.dy} px from the mouse (piece at ${st.at} in Picture1)`);
}

// Full run: every path the Sst exposes has been completed, so the catalog's
// progress battery (Tekoa.Progress, visited maslulim / total) must be 100%
// and its denominator must equal the number of reachable paths.
async function catalogProgressCheck(k) {
  const p = await k.eval(a => { const P = window.Tekoa && window.Tekoa.Progress; if (!P) return null; const x = P.getApp(a);
    return { total: x.total, visited: Object.values(x.activities || {}).filter(v => v.visited).length, pct: P.getPercent(a) }; }, k.app);
  if (!p) return;
  const n = k._completed.size;
  k.ctx.check(p.total === n && p.pct === 100, 'catalog progress wrong after every path', `${k.app}: ${n} reachable paths completed → Tekoa.Progress total=${p.total} visited=${p.visited} → ${p.pct}%`);
}

// Interrupting a correct answer's Tguva → affirmation → mus chain:
//   picexi → "no" in the misger (the answer is already scored, so the game
//     must move on — not leave the same question live to be scored again);
//   Space (keyboard replay of the question, act1(0)'s twin) — must be
//     ignored while audio plays like act1(0), not strand the chain.
// Once per mode × game type 1/2/5, on a clean (no-wrongs) question.
// Returns a playTurn result, or null when skipped.
async function midChain(k, tag, s) {
  const { ctx } = k;
  k._midChain = k._midChain || new Set();
  if (![1, 2, 5].includes(s.gn) || !s.nHot) return null;
  const mode = ['picexi', 'space'].find(m => !k._midChain.has(m + s.gn));
  if (!mode) return null;
  await k.waitIdle();
  const pre = await k.snap();
  if (pre.stageIdx !== s.stageIdx || pre.razNom !== s.razNom || pre.ov || pre.wrong) return null;
  if (s.gn === 5 && !(await ctx.waitFor(() => !!document.querySelector('.stage-game5-choice'), 5000))) return null;
  k._midChain.add(mode + s.gn);
  const before = await k.key();
  const sum = x => x.score.green + x.score.yellow + x.score.red;
  if (s.gn === 1) await k.tap(`.stage-hotspot[data-idx="${pre.target}"]`, 0, 60);
  else if (s.gn === 2) await k.tap(`.stage-cover[data-idx="${pre.Gg_N}"]`, 0, 60);
  else await k.tap('.frm-ctrl--Picture2', pre.Pr_N - 1, 60);
  if (!(await k.eval(() => window.__km.snap().busy))) return null;          // chain already over (missing wavs)
  if (mode === 'picexi') { await k.tap('.frm-ctrl--picexi', 0, 300); await k.misgerAnswer(false); }
  else { await k.eval(() => document.activeElement && document.activeElement.blur()); await ctx.page.keyboard.press('Space'); }
  const moved = await k.waitKeyChange(before, 15000);
  const post = await k.snap();
  await ctx.shot(`${tag}-midchain-${mode}-g${s.gn}`);
  const what = mode === 'picexi' ? 'picexi → "no"' : 'Space (replay)';
  ctx.check(moved, `answer lost after ${what} mid-chain`, `${tag} stage ${s.stageIdx + 1} game${s.gn}: the correct answer's chain was cut by ${what}; the same question stayed live (target ${pre.target}/${post.target}, Pobeda ${pre.Pobeda}/${post.Pobeda}, Tek_N ${pre.Tek_N}/${post.Tek_N}, busy ${post.busy})`);
  if (moved && post.stageIdx === pre.stageIdx && post.razNom === pre.razNom && !post.ov)
    ctx.check(sum(post) === sum(pre) + 1, `${what} mid-chain answer scored ≠ once`, `${tag} game${s.gn}: tally ${JSON.stringify(pre.score)} → ${JSON.stringify(post.score)}`);
  return moved ? { bucket: 'green' } : { stuck: true };
}

// Rapid Icon_s toggling (odd number of clicks, some during the page flip):
// must settle on the opposite rama with everything consistent.
async function toggleBurst(k) {
  const { ctx } = k;
  ctx.step('sst/rama-toggle-burst');
  const r0 = await k.eval(() => String(window.__kesemSession.rama));
  const p = await k.eval(() => window.__km.point('.frm-ctrl--Icon_s', 0));
  if (!p) { ctx.finding('error', 'missing control', 'Icon_s'); return; }
  for (let c = 0; c < 5; c++) await ctx.click(p.x, p.y, 90);
  await ctx.waitFor(() => !window.__kesemSession._flipTimer, 5000);
  await ctx.sleep(900);
  const r1 = await k.eval(() => String(window.__kesemSession.rama));
  ctx.check(r1 !== r0, 'rama after 5 fast toggles', `started on ${r0}, 5 clicks → ${r1} (expected the other rama)`);
  await checkSstConsistent(k, 'after fast toggles');
  await ctx.checkImages();
  await ctx.shot('rama-toggle-burst');
  await toggleRama(k, Number(r0));
  await checkSstConsistent(k, 'after toggling back');
}

function kolkore(app, extraOpts = {}) {
  const base = {
    exitSel: app === 'KolKoreB' ? '.frm-ctrl--btnexi' : '.frm-ctrl--btnexi[data-index="2"]',
    patch(k) {
      k.ctx.page.evaluateOnNewDocument(mouseTracker);
      const sel0 = k.selectRama.bind(k);
      k.selectRama = async r => {
        const ok = app === 'KolKoreA' ? await sel0(r) : await toggleRama(k, r);
        if (ok) { await checkSstConsistent(k, `select rama ${r}`); await checkLampScores(k, `select rama ${r}`); }
        return ok;
      };
      const hak0 = k.hak.bind(k);
      k.hak = async tag => { await hakPanelChecks(k, tag); await hak0(tag); };
      const turn0 = k.playTurn.bind(k);
      k.playTurn = async (tag, s, wrongs) => {
        if (s.gn === 2 || s.gn === 4) { await k.waitIdle(); await cursorPieceCheck(k, tag, s); }
        if (!wrongs) { const r = await midChain(k, tag, s); if (r) return r; }
        return turn0(tag, s, wrongs);
      };
      const ready0 = k.waitStageReady.bind(k);
      k.waitStageReady = async s => { await ready0(s); await busyHoverProbe(k, s); };
      if (extraOpts.patch) extraOpts.patch(k);
    },
    async extra(k) {
      if (!k.ctx.quick) await catalogProgressCheck(k);
      if (app !== 'KolKoreA') await toggleBurst(k);
      if (extraOpts.extra) await extraOpts.extra(k);
    },
  };
  const o = Object.assign({}, extraOpts, base);
  return {
    async run(ctx) {
      const k = await runApp(ctx, app, o);
      // finalExit lands on the launcher catalog, which re-seeds totals from
      // progress.js DEFAULT_TOTALS: the battery must still read 100%.
      if (!ctx.quick && k._completed && k._completed.size && !/Kesem_site/.test(await ctx.eval(() => location.pathname))) {
        const p = await ctx.eval(a => window.Tekoa && window.Tekoa.Progress ? { total: window.Tekoa.Progress.getApp(a).total, pct: window.Tekoa.Progress.getPercent(a) } : null, app);
        if (p) ctx.check(p.pct === 100 && p.total === k._completed.size, 'catalog battery wrong after every path', `${app}: launcher shows ${p.pct}% (total ${p.total}, ${k._completed.size} paths completed)`);
      }
    },
  };
}

module.exports = { kolkore, sstState, toggleRama, checkSstConsistent, checkLampScores };
