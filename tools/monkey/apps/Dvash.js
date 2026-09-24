// Dvash — shared Kesem walker (see ../kesem.js) plus the FrmSel launcher and
// the FrmCat video catalog. The Sst's activities are pinned to CHBOX4
// (config.activityRamaPin), and its Icon_s rama tabs are hidden, so the
// walker plays the 7 pinned paths once.
const { runApp } = require('../kesem');

async function toSst(k) {
  await k.ctx.waitFor(() => window.__kesemSession && window.__kesemSession.currentScreen === 'frmSel', 8000);
  await k.ctx.checkImages();
  await k.ctx.shot('frmSel');
  await k.tap('.frm-ctrl--CmdDvash', 0, 600);
}

async function catalog(k) {
  const { ctx } = k;
  ctx.step('catalog');
  await ctx.goto(`Kesem_site/index.html?reload=${Date.now()}#/Dvash`, 1200);   // query forces a real reload
  await ctx.waitFor(() => window.__kesemSession && window.__kesemSession.currentScreen === 'frmSel', 8000);
  await k.tap('.frm-ctrl--CmdCat', 0, 800);
  if (!ctx.check(await k.waitScreen('catalog', 4000), 'catalog did not open', '')) return;
  await ctx.sleep(600);
  await ctx.checkImages();
  await ctx.shot('catalog');
  const tiles = await k.eval(() => [...document.querySelectorAll('.catalog-tile')].map(t => t.dataset.cid));
  ctx.check(tiles.length > 0, 'catalog has no tiles', '');
  for (let i = 0; i < (ctx.quick ? Math.min(2, tiles.length) : tiles.length); i++) {
    ctx.step(`catalog/${tiles[i]}`);
    const n0 = ctx.traceLen();
    await k.tap('.catalog-tile', i, 700);
    const v = await k.eval(() => !!document.querySelector('.video-overlay'));
    // A clip shorter than the tap wait (×16 playback) has already ended and
    // auto-dismissed — the trace still shows it started.
    const started = ctx.traceSince(n0).find(l => /video play: .*catalog\//.test(l));
    const ended = ctx.traceSince(n0).some(l => /video ended/.test(l));
    if (!v && started && ended) {
      const dur = await k.eval(u => new Promise(res => { const m = document.createElement('video'); m.muted = true; m.preload = 'metadata'; m.onloadedmetadata = () => res(m.duration); m.onerror = () => res(-1); m.src = u; setTimeout(() => res(null), 4000); }), `assets/Dvash/catalog/${tiles[i]}.mp4`);
      if (dur != null && dur < 1) ctx.finding('warn', 'catalog video is a single frame', `catalog/${tiles[i]}.mp4 lasts ${dur}s — the shipped transcode has no footage`);
    } else if (ctx.check(v, 'catalog tile plays no video', tiles[i])) {
      if (i === 0) await k.scrub(`cat${tiles[i]}`);
      await k.video(`cat${tiles[i]}`);
    }
    ctx.check((await k.snap()).screen === 'catalog', 'left catalog after video', tiles[i]);
  }
  // Rapid double-clicks on two tiles must not stack two players (#16/#63 style).
  if (tiles.length > 1) {
    ctx.step('catalog/double');
    const a = await k.eval(() => window.__km.point('.catalog-tile', 0));
    const b = await k.eval(() => window.__km.point('.catalog-tile', 1));
    await ctx.click(a.x, a.y, 30);
    await ctx.click(b.x, b.y, 300);
    const n = await k.eval(() => document.querySelectorAll('.video-overlay').length);
    ctx.check(n <= 1, 'catalog: overlapping video players', `${n} .video-overlay after two quick tile clicks`);
    await ctx.shot('catalog-double');
    for (let j = 0; j < n; j++) await k.eval(() => { const c = document.querySelector('.video-overlay button[aria-label="close"]'); if (c) c.click(); });
  }
  // Catalog exit → the exit misger (answer "no" and stay).
  await k.tap('.frm-ctrl--CmdExit', 0, 500);
  if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(false);
  ctx.check((await k.snap()).screen === 'catalog', 'catalog exit "no" left catalog', '');
  // Back to Sst for the walker's reset / exit steps.
  await ctx.goto(`Kesem_site/index.html?reload=${Date.now()}#/Dvash`, 1200);   // query forces a real reload
  await toSst(k);
  await k.waitScreen('sst', 4000);
}

module.exports = {
  run: ctx => runApp(ctx, 'Dvash', { entry: toSst, extra: catalog }),
};
