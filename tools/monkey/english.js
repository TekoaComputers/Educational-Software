// English A/B/C — shared Kesem walker (./kesem.js) plus English-specific
// overrides and side screens:
//   * Sst exit control is `BtnExit` (not CmdExit);
//   * EnglishC hides btnIcon/btnLamp 4 and 9 in rama 1/2
//     (applyEnglishCRamaLayout) — those .MAS slots are filler duplicates;
//   * #65.1 "you can leave without confirming by pressing Escape again":
//     Escape on Sst / in a game must open the misger, a second Escape must
//     only close it, and a burst of Escapes must never leave the app;
//   * Escape while the nikod board / a video is up must not stack a misger
//     on top or leave the app.
'use strict';
const { runApp } = require('./kesem');

const HIDDEN_ENGLISHC = new Set([4, 9]);

async function esc(k, n = 1, gap = 120) {
  for (let i = 0; i < n; i++) { await k.ctx.page.keyboard.press('Escape'); await k.ctx.sleep(gap); }
  await k.ctx.sleep(300);
}
const onApp = k => k.eval(() => /Kesem_site/.test(location.pathname) && !!window.__kesemSession);
const hasMisger = k => k.eval(() => document.querySelectorAll('.misger-overlay').length);

async function escapeSst(k) {
  const ctx = k.ctx;
  ctx.step('esc/sst');
  await esc(k, 1);
  ctx.check(await hasMisger(k) === 1, 'Escape on Sst shows no exit confirm', JSON.stringify(await k.snap()));
  await ctx.shot('esc-sst-misger');
  await esc(k, 1);
  ctx.check(await onApp(k), 'second Escape left the app without confirming (#65.1)', await k.eval(() => location.href));
  if (!(await onApp(k))) return false;
  ctx.check(await hasMisger(k) === 0 && (await k.snap()).screen === 'sst', 'second Escape did not just cancel the exit confirm', JSON.stringify(await k.snap()));
  // Burst: 5 Escapes 60 ms apart — odd count leaves a misger open, never exits.
  await esc(k, 5, 60);
  ctx.check(await onApp(k), 'Escape burst left the app (#65.1)', await k.eval(() => location.href));
  if (!(await onApp(k))) return false;
  ctx.check(await hasMisger(k) <= 1, 'Escape burst stacked misger modals', `${await hasMisger(k)} overlays`);
  if (await hasMisger(k)) await k.misgerAnswer(false);
  return true;
}

async function escapeGame(k) {
  const ctx = k.ctx;
  ctx.step('esc/game');
  // A path that opens on a scored stage, so the partial board has an answer.
  const idx = await k.eval(() => {
    const s = window.__kesemSession;
    const sl = (s.paths.ramas[String(s.config.activityRamaPin || s.rama)] || {}).slots || [];
    const vis = [...document.querySelectorAll('.frm-ctrl--btnIcon')].filter(e => getComputedStyle(e).display !== 'none').map(e => +e.dataset.index);
    const ok = vis.filter(i => sl[i] && sl[i].stages && sl[i].stages.length > 1);
    return ok.find(i => ![3, 6].includes(sl[i].stages[0].gameNumber)) ?? ok[0];
  });
  const btn = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--btnIcon')].findIndex(e => +e.dataset.index === ix), idx);
  await k.tap('.frm-ctrl--btnIcon', btn, 400);
  await ctx.waitFor(() => { const s = window.__km.snap(); return s.ov === 'video' || /^game/.test(s.screen || ''); }, 8000);
  if ((await k.snap()).ov === 'video') {
    // Escape on top of a video must not leave the app or stack a misger.
    await esc(k, 1);
    ctx.check(await onApp(k), 'Escape during a video left the app', '');
    if (await hasMisger(k)) { ctx.finding('info', 'Escape during video opened the misger', ''); await k.misgerAnswer(false); }
    await k.video('esc-intro', { watch: 300 });
  }
  let s = await k.snap();
  if (!/^game/.test(s.screen || '')) { ctx.finding('error', 'escape scenario: path did not start', JSON.stringify(s)); return; }
  await k.waitStageReady(s);
  let answered = false;
  if (s.gn !== 3 && s.gn !== 6 && s.nHot) { const r = await k.playTurn('esc', s, 0); answered = !!(r && r.bucket); }
  await k.waitIdle();
  s = await k.snap();
  await esc(k, 1);
  ctx.check(await hasMisger(k) === 1, 'Escape in game shows no confirm', JSON.stringify(await k.snap()));
  await ctx.shot('esc-game-misger');
  await esc(k, 1);
  const s2 = await k.snap();
  ctx.check(await onApp(k) && s2.screen === s.screen && s2.stageIdx === s.stageIdx && !s2.ov,
    'second Escape in game did not just cancel (#65.1)', JSON.stringify(s2));
  await esc(k, 4, 60);
  ctx.check(await onApp(k) && /^game/.test((await k.snap()).screen || ''), 'Escape burst in game left the stage', JSON.stringify(await k.snap()));
  ctx.check(await hasMisger(k) === 0, 'Escape burst (even) left a misger open', `${await hasMisger(k)} overlays`);
  // The Escape misger is picexi's: its next-stage arrow must work.
  await k.waitIdle();
  await esc(k, 1);
  if (await k.eval(() => !!document.querySelector('.misger-overlay img[title="שלב הבא"]'))) {
    const before = (await k.snap()).stageIdx;
    await k.tap('.misger-overlay img[title="שלב הבא"]', 0, 800);
    const s3 = await k.snap();
    ctx.check(s3.stageIdx === before + 1 && /^game/.test(s3.screen || ''), 'Escape misger next-stage arrow does nothing', `stage ${before} → ${s3.stageIdx} (${s3.screen})`);
    await k.waitIdle();
  } else {
    ctx.finding('warn', 'Escape misger has no next-stage arrow', JSON.stringify(await k.snap()));
    if (await hasMisger(k)) await k.misgerAnswer(false);
  }
  // Escape → Enter confirms (misger default) → same partial board as picexi yes.
  await esc(k, 1);
  await ctx.page.keyboard.press('Enter');
  const board = await ctx.waitFor(() => !!document.querySelector('.nikod-overlay'), 3000);
  if (answered) ctx.check(board, 'Escape-exit from a game shows no results board (picexi yes does) (#56)', JSON.stringify(await k.snap()));
  if (board) {
    await ctx.sleep(1700);
    const b = await k.eval(() => window.__km.nikod());
    await ctx.shot('esc-game-nikod');
    if (answered) ctx.check(b && b.toch[1] >= 1, 'Escape-exit board lost the answered question', JSON.stringify(b));
    // Escape on top of the board must not stack a misger or leave.
    await esc(k, 1);
    ctx.check(await onApp(k), 'Escape on nikod left the app', '');
    const m = await hasMisger(k);
    ctx.check(!m, 'Escape on nikod opened a misger on top of the board', `${m} overlays, screen ${(await k.snap()).screen}`);
    if (m) await k.misgerAnswer(false);
    if (await k.eval(() => !!document.querySelector('.nikod-overlay'))) await k.closeNikod();
  }
  ctx.check(await k.waitScreen('sst', 4000), 'Escape+Enter in game did not return to Sst', JSON.stringify(await k.snap()));
  const lamp = await k.lampState(idx);
  ctx.check(!lamp.done || k._completed.has(`${(await k.snap()).rama}/${idx}`), 'Escape-aborted path marked completed', `path ${idx}`);
}

// #83: on a slow connection, flipping rama tabs faster than thumbnails
// arrive must not keep aborting their downloads — after a burst (and a
// short settle, still throttled) every rama's pictures must be ready the
// moment its tab is clicked again. Runs first, while only rama 1 is cached.
async function slowSwap(k) {
  const ctx = k.ctx;
  ctx.step('sst/slow-swap');
  await k.waitScreen('sst');
  const maxRama = (await k.cfg()).maxRama || 1;
  if (maxRama < 2) return;
  const cdp = await ctx.page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 48 * 1024, uploadThroughput: 48 * 1024 });
  const pts = [];
  for (let r = 1; r <= maxRama; r++) pts.push(await k.eval(i => window.__km.point([...document.querySelectorAll('.frm-ctrl--Icon_s')].find(e => +e.dataset.index === i)), r - 1));
  const seq = [];
  for (let n = 0; n < 16; n++) seq.push(n % 2 ? 1 + (n >> 1) % maxRama : 1 + ((n >> 1) + 1) % maxRama);
  for (const r of seq) if (pts[r - 1]) await ctx.click(pts[r - 1].x, pts[r - 1].y, 280);
  await ctx.sleep(6000);
  const stale = [];
  for (let r = 1; r <= maxRama; r++) {
    if (!pts[r - 1]) continue;
    await ctx.click(pts[r - 1].x, pts[r - 1].y, 250);
    const miss = await k.eval(() => [window.__kesemSession.bg, ...document.querySelectorAll('.frm-ctrl--btnIcon img')]
      .filter(im => im && im.getAttribute('src') && getComputedStyle(im.closest('.frm-ctrl') || im).display !== 'none' && !(im.complete && im.naturalWidth))
      .map(im => im.getAttribute('src').split('/').pop()));
    if (miss.length) stale.push(`rama ${r}: ${miss.join(' ')}`);
  }
  await ctx.shot('slow-swap');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.detach().catch(() => {});
  ctx.check(!stale.length, 'rama images still not loaded after fast tab switching on a slow network (#83)', stale.join('; '));
  await k.selectRama(1);
}

async function extra(k) {
  if (!(await escapeSst(k))) return;
  await escapeGame(k);
}

async function run(ctx, app, over = {}) {
  const o = {
    exitSel: '.frm-ctrl--BtnExit',        // English Sst names its exit PictureBox BtnExit
    entry: slowSwap,                      // initialScreen is sst; run the #83 check before anything is cached
    extra,
  };
  if (app === 'EnglishC') {
    // rama 1/2 show 8 paths; .MAS slots 4 and 9 there are filler (duplicate
    // path names of neighbouring slots) behind hidden btnIcons.
    o.slots = (r, slots) => slots.map((_, i) => i).filter(i => slots[i].n > 0 && (r === 3 || !HIDDEN_ENGLISHC.has(i)));
  }
  return runApp(ctx, app, Object.assign(o, over));
}

module.exports = { run };
