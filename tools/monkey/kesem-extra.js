// Extra per-instance checks for the Kesem walker (../kesem.js), used by the
// Heshbon / Ivrit / Kesem / Shirim / Shirim&Meshalim drivers. Installed onto a
// walker instance (never the prototype), so drivers that don't opt in are
// unaffected:
//
//   require('../kesem-extra').install(k, { hak: true, hint: true })
//
//   hak  — replaces k.hak with a deeper Games3 hak ("radio") pass: every wa /
//          dif control, audio gating while the name wav plays (#67), record →
//          play-back, prev/next item, disabled controls look disabled (#69).
//   hint — the first wrong-answer path also checks that the 3rd-wrong Remez
//          hint box stays lit while the player keeps clicking wrong (#70).
'use strict';

/** Count "audio play:" trace lines since index i. */
function plays(k, i) { return k.ctx.traceSince(i).filter(l => / audio play: /.test(l)).length; }

async function hakDeep(k, tag) {
  const { ctx } = k;
  const vis = sel => k.eval(q => window.__km.visible(q), sel);
  const waImg = i => k.eval(j => { const e = document.querySelector(`.frm-ctrl--wa[data-index="${j}"] img`); return e ? e.getAttribute('src').split('/').pop() : null; }, i);
  const enabled = sel => k.eval(q => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).pointerEvents !== 'none'; }, sel);
  const nom = () => k.eval(() => window.__kesemSession._hakNom);

  await k.waitIdle();
  let t = ctx.traceLen();
  await k.tap('.frm-ctrl--act1[data-index="1"]', 0, 150);
  if (!ctx.check(await vis('.frm-ctrl--Picture22'), 'hak panel does not open', tag)) return;
  // The name wav starts on open. While it plays, hammering wa(0) (replay
  // name) / wa(3) / dif must not restart or stack audio (#67).
  const busy = await k.eval(() => { const s = window.__km.snap(); return s.busy; });
  if (busy) {
    const t1 = ctx.traceLen();
    // Only clicks made while the wav is still playing count (a short wav at
    // ×16 can end between clicks — a replay after that is correct).
    for (let c = 0; c < 3; c++) {
      if (!(await k.eval(() => window.__km.snap().busy))) break;
      await k.tap('.frm-ctrl--wa[data-index="0"]', 0, 60, { quiet: true });
    }
    ctx.check(plays(k, t1) === 0 || !(await k.eval(() => window.__km.snap().busy)) && plays(k, t1) <= 1, 'hak: replay button restarts audio while it is still playing', `${tag}: ${plays(k, t1)} restarts from 3 clicks on wa(0) during the name wav`);
  }
  await ctx.checkImages();
  await ctx.shot(`${tag}-hak`);
  await k.waitIdle();

  // Every visible, enabled control must be reachable (top-most somewhere).
  const ctrls = await k.eval(() => [...document.querySelectorAll('.frm-ctrl--Picture22 .frm-ctrl--wa, .frm-ctrl--Picture22 .frm-ctrl--dif')]
    .filter(e => getComputedStyle(e).display !== 'none').map(e => ({ name: e.dataset.name, i: +e.dataset.index, pe: getComputedStyle(e).pointerEvents, p: window.__km.point(e) })));
  for (const c of ctrls) {
    if (c.name === 'wa' && c.i === 5) continue;                      // decorative
    if (c.pe === 'none') continue;
    ctx.check(c.p && c.p.hit, 'hak: control covered', `${tag}: ${c.name}(${c.i}) is not clickable anywhere`);
  }
  // wa(2) (play recording) is disabled until something is recorded, and must
  // LOOK disabled (playc3 sprite) — otherwise it reads as a dead button (#69).
  const wa2dis = !(await enabled('.frm-ctrl--wa[data-index="2"]'));
  ctx.check(!wa2dis || (await waImg(2)) === 'playc3.png' || (await waImg(2)) === 'playc3.webp', 'hak: disabled play-recording button looks enabled', `${tag}: wa(2) img ${await waImg(2)}`);

  // wa(0) replays the name.
  t = ctx.traceLen();
  await k.tap('.frm-ctrl--wa[data-index="0"]', 0, 300);
  ctx.check(plays(k, t) >= 1 || (await k.eval(() => (window.__kesemSession.audioFiles || { has: () => true }).size === 0)), 'hak: wa(0) plays nothing', tag);
  await k.waitIdle();
  // wa(3) elaboration (hidden when the stage has no <n>_2 wav).
  if (await enabled('.frm-ctrl--wa[data-index="3"]')) {
    t = ctx.traceLen();
    await k.tap('.frm-ctrl--wa[data-index="3"]', 0, 300);
    ctx.check(ctx.traceSince(t).some(l => /audio (play|skip)/.test(l)), 'hak: wa(3) does nothing', tag);
    await k.waitIdle();
  }
  // Record → stop → play back.
  await k.tap('.frm-ctrl--wa[data-index="1"]', 0, 900);
  const rec = await k.eval(() => { const r = window.__kesemSession._kkbRec; return r && r.mr ? r.mr.state : 'none'; });
  ctx.check(rec === 'recording', 'hak record does not start', `${tag}: MediaRecorder state ${rec}`);
  ctx.check(!(await enabled('.frm-ctrl--wa[data-index="0"]')), 'hak: replay stays enabled while recording', tag);
  await k.tap('.frm-ctrl--wa[data-index="1"]', 0, 700);
  const url = await k.eval(() => !!(window.__kesemSession._kkbRec || {}).url);
  ctx.check(url && await enabled('.frm-ctrl--wa[data-index="2"]'), 'hak recording not captured / play-back not enabled', `${tag}: url=${url}`);
  // Hammer play-back: must not stack several copies of the recording.
  for (let c = 0; c < 3; c++) await k.tap('.frm-ctrl--wa[data-index="2"]', 0, 60, { quiet: true });
  await ctx.sleep(300);
  await k.flushOverlaps();
  await ctx.shot(`${tag}-hak-rec`);
  await k.waitIdle();
  // Next / previous item: _hakNom moves, recording invalidated.
  const n1 = await nom();
  await k.tap('.frm-ctrl--dif[data-index="1"]', 0, 400);
  const n2 = await nom();
  ctx.check(n2 !== n1, 'hak next item does nothing', `${tag}: _hakNom ${n1} → ${n2}`);
  ctx.check(!(await enabled('.frm-ctrl--wa[data-index="2"]')), 'hak: recording of the previous item still playable', tag);
  await k.waitIdle();
  await k.tap('.frm-ctrl--dif[data-index="0"]', 0, 400);
  ctx.check((await nom()) === n1, 'hak previous item does not go back', `${tag}: ${n2} → ${await nom()} (want ${n1})`);
  await k.waitIdle();
  await k.tap('.frm-ctrl--wa[data-index="4"]', 0, 500);
  ctx.check(!(await vis('.frm-ctrl--Picture22')) && await vis('.frm-ctrl--Spic1'), 'hak panel does not close', tag);
  await k.waitIdle();
}

/**
 * #70: after the 3rd wrong answer every further wrong click shows the Remez
 * hint (the correct hotspot lit yellow for 1.2 s). Clicking wrong again
 * while it is lit must keep it lit, not blink it off.
 */
async function hintHold(k, tag, s) {
  const { ctx } = k;
  const target = () => k.eval(() => {
    const s = window.__kesemSession;
    const idx = (s.activeStage && s.activeStage.gameNumber === 4) ? s.Pr_N : s.Gg_N || s.targetHotspot;
    const t = document.querySelector(`.frm-ctrl--Picture1 .stage-hotspot[data-idx="${idx}"]`) || document.querySelector(`.frm-ctrl--Picture1 .stage-cover[data-idx="${idx}"]`);
    return t ? getComputedStyle(t).backgroundColor + ' ' + getComputedStyle(t).outline : null;
  });
  const lit = c => !!c && (/rgba\(255, 255, 0, 0\.4/.test(c) || /rgb\(255, 255, 0\) solid 3px/.test(c));
  const p = await k.eval(() => window.__km.bgPoint());
  if (!p) return false;
  // The 3rd wrong has just been made: the hint must already be showing.
  if (!lit(await target())) {
    ctx.finding('warn', '3rd wrong answer shows no hint', `${tag} stage ${s.stageIdx + 1} game${s.gn}: target not lit after the 3rd wrong`);
    return false;
  }
  // Clicks at 0, 450, 900, 1350 ms; the hint must stay lit from the first
  // click until ≥1.2 s after the last one.
  const samples = [];
  const t0 = Date.now();
  let clicks = 0;
  while (Date.now() - t0 < 2400) {
    const dt = Date.now() - t0;
    if (clicks < 4 && dt >= clicks * 450) { await ctx.page.mouse.click(p.x, p.y); clicks++; }
    samples.push([Date.now() - t0, lit(await target())]);
    await ctx.sleep(60);
  }
  const lastClick = 3 * 450;
  const dark = samples.filter(([dt, on]) => dt > 150 && dt < lastClick + 1000 && !on);
  ctx.check(!dark.length, 'hint box blinks off while clicking wrong', `${tag} stage ${s.stageIdx + 1} game${s.gn}: hint dark at ${dark.map(d => d[0]).join(',')} ms (clicks every 450 ms)`);
  await ctx.sleep(1400);
  return true;
}

function install(k, opt = {}) {
  if (opt.hak) k.hak = tag => hakDeep(k, tag);
  if (opt.hint) {
    const orig = k.wrongClick.bind(k);
    let done = false;
    k.wrongClick = async (s, n) => {
      const r = await orig(s, n);
      // After the 3rd wrong of a question (n === 2) the Remez hint is live.
      if (r && n === 2 && !done && s.gn !== 5) {
        await k.waitIdle();
        if (await hintHold(k, 'hint', s)) done = true;
      }
      return r;
    };
  }
  return k;
}

module.exports = { install, hakDeep, hintHold };
