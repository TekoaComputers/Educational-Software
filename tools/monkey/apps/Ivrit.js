// Ivrit — the Sst is a song picker, not the usual btnIcon grid: Picture2
// holds List1 (every MASLUL/*.MAS, 44 songs), the "ok" button activ(0) that
// plays the highlighted song (Sst.list1_DblClick / activ_Click 0 → PutGFile 1:
// the .MAS is opened directly, not via CHBOX), the pri preview, the Credit
// "!" (full-screen credit.jpg, click to hide) and cmdexit (X). The Picture1
// activity grid + Icon_s rama tabs exist in the .frm but no control on the
// picker reaches them (the .frm has only activ(0)), so they are not walked.
//
// Covered here: every song × every stage (correct play, every 3rd song with
// deliberate wrongs, every 5th with a chaos burst), nikod score/verdict/
// counters/title per song, the hak "radio" deep pass (../kesem-extra.js),
// the Remez hint persistence (#70), rapid double-clicks on a song while the
// app is still loading (#68, throttled network), Credit, right-click unselect,
// and the shared exit/no-exit flow.
const { runApp, expectedBoard } = require('../kesem');
const extra = require('../kesem-extra');

async function songs(k) {
  const { ctx } = k;
  const list = await k.eval(() => (window.__kesemSession.ivritSongs || []).map((s, i) => ({ i, name: s.name, mas: s.masFile, n: (s.slot.stages || []).length, pic: s.pic })));
  ctx.check(list.length >= 40, 'Ivrit song list incomplete', `${list.length} songs in List1`);
  const pick = ctx.quick ? list.slice(0, 3) : list;
  for (const song of pick) {
    k.played++;
    const wrongs = k.played % 3 === 2;
    const chaos = k.played % 5 === 4;
    const tag = `song${song.mas.replace(/\.mas$/i, '')}`;
    ctx.step(`${tag}/enter`);
    if (!song.n) { ctx.finding('info', 'song has no stages', `${song.mas} ${song.name}`); continue; }
    await k.eval(i => document.querySelector(`.frm-ctrl--List1 li[data-idx="${i}"]`).scrollIntoView({ block: 'center' }), song.i);
    await k.tap(`.frm-ctrl--List1 li[data-idx="${song.i}"]`, 0, 300);
    const sel = await k.eval(i => {
      const li = document.querySelector(`.frm-ctrl--List1 li[data-idx="${i}"]`);
      const pri = document.querySelector('.frm-ctrl--pri img');
      return { sel: window.__kesemSession.ivritSelected, hl: li && li.style.background !== '', pri: pri ? pri.getAttribute('src') : null };
    }, song.i);
    ctx.check(sel.sel === song.i && sel.hl, 'song click does not select it', `${tag}: ${JSON.stringify(sel)}`);
    if (song.pic) ctx.check(sel.pri && sel.pri.toLowerCase().includes(song.pic.toLowerCase().replace(/\.bmp$/, '')), 'song preview shows the wrong picture', `${tag}: pri=${sel.pri} want ${song.pic}`);
    await k.tap('.frm-ctrl--activ[data-index="0"]', 0, 400);
    const started = await ctx.waitFor(() => { const s = window.__km.snap(); return s.ov === 'video' || /^game/.test(s.screen || ''); }, 8000);
    if (!started) { ctx.finding('error', 'song did not start', `${tag} ${song.name}`); await ctx.shot(`${tag}-nostart`); continue; }
    const res = await k.playPath(tag, { wrongs, chaos });
    if (!res) { k.cover(`${tag} ${song.name}: ABORTED`); continue; }
    const ls = await k.eval(a => window.__km.ls(a), 'Ivrit');
    const r = String(await k.eval(() => window.__kesemSession.rama));
    const key = await k.eval(() => String(window.__kesemSession.currentPath));
    const lsStages = ((ls.scores[r] || {})[key] || {}).stages;
    ctx.check(!!(ls.completed[r] || {})[key], 'completion not recorded', `${tag}: completed[${r}][${key}] missing`);
    k._completed.add(`${r}/${key}`);
    const prog = await k.eval(m => window.Tekoa && Tekoa.Progress ? { has: !!Tekoa.Progress.getApp('Ivrit').activities['mas/' + m], total: Tekoa.Progress.getApp('Ivrit').total } : null, song.mas);
    if (prog) ctx.check(prog.has && prog.total === list.length, 'song not counted in catalog progress', `${tag}: ${JSON.stringify(prog)} (${list.length} songs)`);
    const want = k.checkBoard(tag, res, lsStages);
    if (res.board) ctx.check(res.board.title === song.name, 'nikod shows wrong song title', `${tag}: "${res.board.title}" vs "${song.name}"`);
    if (!wrongs && !chaos) ctx.check(want.mispar === 100 && res.board && res.board.ltott === '100', 'all-correct song is not top score', `${tag}: board ${res.board && res.board.ltott}`);
    k.cover(`${tag} ${song.name}: ${res.slotLen} stages [${res.expected.map(e => (e === null ? 'g3' : e === 'chaos' ? 'chaos' : `${e.green}/${e.yellow}/${e.red}`)).join(' ')}] → ${res.board && res.board.ltott}%${wrongs ? ' (wrongs)' : ''}${chaos ? ' (chaos)' : ''}`);
    ctx.step(`${tag}/after`);
    ctx.check(await k.closeNikod(), 'nikod does not close', tag);
    ctx.check(await k.waitScreen('sst', 5000), 'did not return to Sst after nikod', tag);
    const back = await k.eval(() => ({ view: window.__kesemSession.ivritView, sel: window.__kesemSession.ivritSelected, list: window.__km.visible('.frm-ctrl--List1') }));
    ctx.check(back.list && back.sel === song.i, 'picker not restored after a song', `${tag}: ${JSON.stringify(back)}`);
  }
  return list;
}

async function sideScreens(k) {
  const { ctx } = k;
  // Credit "!" → full-screen credit.jpg → click hides it.
  ctx.step('sst/credit');
  await k.tap('.frm-ctrl--Credit', 0, 500);
  ctx.check(await k.eval(() => window.__km.visible('.frm-ctrl--CreditPic')), 'Credit does not show the credit banner', '');
  await ctx.checkImages();
  await ctx.shot('credit');
  await k.tap('.frm-ctrl--CreditPic', 0, 400);
  ctx.check(!(await k.eval(() => window.__km.visible('.frm-ctrl--CreditPic'))), 'credit banner does not close', '');
  // Right-click a song: preview hides, column headers return.
  ctx.step('sst/unselect');
  const p = await k.eval(() => window.__km.point('.frm-ctrl--List1 li', 1));
  if (p) {
    await ctx.page.mouse.click(p.x, p.y, { button: 'right' });
    await ctx.sleep(300);
    const st = await k.eval(() => ({ pri: window.__km.visible('.frm-ctrl--pri'), pirut: window.__km.visible('.frm-ctrl--lblPirut') }));
    ctx.check(!st.pri && st.pirut, 'right-click does not clear the preview', JSON.stringify(st));
    await ctx.shot('unselect');
  }
  // Keyboard: Enter/ESC on the picker must not break it.
  await ctx.page.keyboard.press('Escape');
  await ctx.sleep(400);
  if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(false);
  ctx.check((await k.snap()).screen === 'sst', 'ESC on the picker left Sst', '');
}

/** #68: several quick clicks / double-clicks on a song on a cold, slow load. */
async function coldRapidStart(k) {
  const { ctx, page } = { ctx: k.ctx, page: k.ctx.page };
  ctx.step('cold-rapid-start');
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 250 * 1024, uploadThroughput: 64 * 1024 });
  try {
    await ctx.goto(`Kesem_site/index.html?cold=${Date.now()}#/Ivrit`, 500);
    await ctx.waitFor(() => !!document.querySelector('.frm-ctrl--List1 li'), 20000);
    const q = await k.eval(() => window.__km.point('.frm-ctrl--List1 li', 3));
    // 4 quick clicks = click, dblclick, click, dblclick — like the report.
    const t0 = ctx.traceLen();
    for (let c = 0; c < 4; c++) { await ctx.page.mouse.click(q.x, q.y, { delay: 20, clickCount: c % 2 + 1 }); await ctx.sleep(120); }
    const starts = ctx.traceSince(t0).filter(l => /startPath:/.test(l)).length;
    ctx.check(starts <= 1, 'song started more than once by rapid clicks', `${starts} startPath calls`);
    const frames = [];
    for (const ms of [150, 600, 1500, 3000, 6000]) {
      await ctx.sleep(ms - (frames.length ? frames[frames.length - 1].ms : 0));
      const st = await k.eval(() => {
        const s = window.__kesemSession;
        const bg = document.querySelector('.frm-bg');
        return { screen: s && s.currentScreen, bgDone: !!(bg && bg.complete && bg.naturalWidth), picDone: !!(s && s.stageImg && s.stageImg.complete && s.stageImg.naturalWidth) };
      });
      frames.push({ ms, ...st, shot: await ctx.shot(`cold-${ms}ms`) });
    }
    ctx.finding('info', 'cold start timeline', frames.map(f => `${f.ms}ms ${f.screen} bg=${f.bgDone} pic=${f.picDone}`).join(' | '));
  } finally {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  }
  await k.bailOut('cold');
  await ctx.goto(`Kesem_site/index.html?r=${Date.now()}#/Ivrit`, 1200);
  await k.waitScreen('sst', 8000);
}

module.exports = {
  run: ctx => runApp(ctx, 'Ivrit', {
    exitSel: '.frm-ctrl--cmdexit',
    ramas: [],                       // no reachable rama grid — songs are walked in `extra`
    entry: async k => {
      extra.install(k, { hak: true, hint: true });
      // The walker's picexi scenario opens "path i" by tapping btnIcon[i];
      // on Ivrit a path is a List1 song + the ok button.
      const tap = k.tap.bind(k);
      k.tap = async (sel, i = 0, wait, o) => {
        if (sel !== '.frm-ctrl--btnIcon') return tap(sel, i, wait, o);
        const song = await k.eval(j => +document.querySelectorAll('.frm-ctrl--btnIcon')[j].dataset.index, i);
        await k.eval(j => document.querySelector(`.frm-ctrl--List1 li[data-idx="${j}"]`).scrollIntoView({ block: 'center' }), song);
        await tap(`.frm-ctrl--List1 li[data-idx="${song}"]`, 0, 200);
        return tap('.frm-ctrl--activ[data-index="0"]', 0, wait, o);
      };
    },
    extra: async k => {
      await sideScreens(k);
      await songs(k);
      // Mid-song picexi: no / next-stage / yes → partial board (song 1: game1 first).
      const first = await k.eval(() => window.__kesemSession.ivritSongs.findIndex((s, i) => i < 6 && s.slot.stages[0] && ![3, 6].includes(s.slot.stages[0].gameNumber)));
      if (first >= 0) await k.picexiScenario(4, first);
      await coldRapidStart(k);
    },
  }),
  songs, coldRapidStart, sideScreens,
};
