// Song-book Sst (Shirim, Shirim&Meshalim): BookIndex (books1.jpg) with SelectZ
// chapter tabs + special tabs (exit / help video / credit popup); a chapter
// opens OpenPage with up to 4 (Shirim) / 5 (S&M) rows of ShowName +
// ShowMasNum (both start that maslul) + ShowNikod (saved score, click →
// score-board replay) and ExitPage back to the index. rama = chapter index.
//
// runBook() drives it through the shared walker (../kesem.js): every chapter ×
// every row × every stage, played correctly / with wrongs / with chaos per the
// walker's schedule, nikod checks, the row's ShowNikod score (value + colour,
// Sst.SelectZ_Click formula) and its replay board, tab hover paint, help video,
// credit popup, mid-path picexi, exit.
'use strict';
const { runApp } = require('./kesem');
const extra = require('./kesem-extra');

// Sst.SelectZ_Click (Shirim): v = Int(((bx*5 + cx + dX) * 20) / ax), colour
// <=50 red, 51..60 orange, 61..80 blue, >80 green.
function rowScore(stages) {
  let ax = 0, bx = 0, cx = 0, dx = 0;
  for (const s of stages || []) if (s) { ax += s.total || 0; bx += s.green || 0; cx += s.yellow || 0; dx += s.red || 0; }
  const v = ax ? Math.floor(((bx * 5 + cx + dx) * 20) / ax) : 0;
  const color = v > 80 ? 'rgb(20, 205, 0)' : v > 60 ? 'rgb(20, 20, 255)' : v > 50 ? 'rgb(255, 200, 0)' : 'rgb(255, 0, 0)';
  return { v, color };
}

async function openChapter(k, c) {
  const { ctx } = k;
  const i = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--SelectZ')].findIndex(e => +e.dataset.index === ix), c);
  if (i < 0) { ctx.finding('error', 'no SelectZ tab for chapter', String(c)); return false; }
  await k.tap('.frm-ctrl--SelectZ', i, 400);
  const ok = await k.eval(() => window.__km.visible('.frm-ctrl--OpenPage') && !window.__km.visible('.frm-ctrl--BookIndex'));
  const st = await k.snap();
  return ctx.check(ok && String(st.rama) === String(c), 'chapter does not open', `SelectZ(${c}) → OpenPage=${ok} rama=${st.rama}`);
}

async function rows(k) {
  return k.eval(() => [...document.querySelectorAll('.frm-ctrl--ShowName')]
    .filter(e => getComputedStyle(e).display !== 'none')
    .map(e => ({ i: +e.dataset.index, name: (e.textContent || '').trim() }))
    .sort((a, b) => a.i - b.i));
}

async function playRow(k, c, row, { wrongs, chaos, via = 'ShowName' }) {
  const { ctx } = k;
  const tag = `ch${c}r${row.i + 1}`;
  ctx.step(`${tag}/enter`);
  const slot = await k.eval(ix => { const x = window.__km.slots()[ix]; return x && { name: x.name, n: (x.stages || []).length, pathName: x.header && x.header.pathName }; }, row.i);
  ctx.check(slot && row.name === (slot.name || `שיר ${row.i + 1}`), 'book row shows wrong name', `${tag}: "${row.name}" vs slot "${slot && slot.name}"`);
  const ti = await k.eval((sel, ix) => [...document.querySelectorAll(sel)].findIndex(e => +e.dataset.index === ix), `.frm-ctrl--${via}`, row.i);
  await k.tap(`.frm-ctrl--${via}`, ti, 400);
  const started = await ctx.waitFor(() => { const s = window.__km.snap(); return s.ov === 'video' || /^game/.test(s.screen || ''); }, 8000);
  if (!started) { ctx.finding('error', 'path did not start', `${tag} via ${via} (${row.name})`); await ctx.shot(`${tag}-nostart`); return; }
  const res = await k.playPath(tag, { wrongs, chaos });
  if (!res) { k.cover(`${tag} ${row.name}: ABORTED`); await k.waitScreen('sst', 4000); return; }
  const ls = await k.eval(a => window.__km.ls(a), k.app);
  const lsStages = ((ls.scores[String(c)] || {})[String(row.i)] || {}).stages;
  ctx.check(!!(ls.completed[String(c)] || {})[String(row.i)], 'completion not recorded', `${tag}: completed[${c}][${row.i}] missing`);
  k._completed.add(`${c}/${row.i}`);
  const want = k.checkBoard(tag, res, lsStages);
  if (res.board && slot && slot.pathName) ctx.check(res.board.title === slot.pathName, 'nikod shows wrong path title', `${tag}: "${res.board.title}" vs .MAS "${slot.pathName}"`);
  if (!wrongs && !chaos) ctx.check(want.mispar === 100 && res.board && res.board.ltott === '100', 'all-correct path is not top score', `${tag}: board ${res.board && res.board.ltott}`);
  k.cover(`${tag} ${row.name}: ${res.slotLen} stages [${res.expected.map(e => (e === null ? 'g3' : e === 'chaos' ? 'chaos' : `${e.green}/${e.yellow}/${e.red}`)).join(' ')}] → ${res.board && res.board.ltott}%${wrongs ? ' (wrongs)' : ''}${chaos ? ' (chaos)' : ''}`);
  ctx.step(`${tag}/after`);
  ctx.check(await k.closeNikod(), 'nikod does not close', tag);
  ctx.check(await k.waitScreen('sst', 5000), 'did not return to Sst after nikod', tag);
  // Back on the same open chapter, with this row's score printed.
  await ctx.sleep(300);
  const page = await k.eval(ix => {
    const nik = [...document.querySelectorAll('.frm-ctrl--ShowNikod')].find(e => +e.dataset.index === ix);
    const cap = nik && nik.querySelector('.book-caption');
    return { open: window.__km.visible('.frm-ctrl--OpenPage'), rama: window.__kesemSession.rama, shown: !!nik && getComputedStyle(nik).display !== 'none', txt: cap ? cap.textContent : null, color: cap ? getComputedStyle(cap).color : null };
  }, row.i);
  ctx.check(page.open && String(page.rama) === String(c), 'chapter page not restored after a path', `${tag}: ${JSON.stringify(page)}`);
  const exp = rowScore(lsStages);
  ctx.check(page.shown && page.txt === String(exp.v) && page.color === exp.color, 'book row score wrong', `${tag}: shows ${page.txt} (${page.color}), saved stages → ${exp.v} (${exp.color})`);
  await ctx.checkImages();
  await ctx.shot(`${tag}-page`);
  // ShowNikod → replay board must match the end-of-path board.
  if (page.shown && (row.i === 0 || !ctx.quick)) {
    const ni = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--ShowNikod')].findIndex(e => +e.dataset.index === ix), row.i);
    await k.tap('.frm-ctrl--ShowNikod', ni, 400);
    const ok = await ctx.waitFor(() => !!document.querySelector('.nikod-overlay'), 4000);
    if (ctx.check(ok, 'ShowNikod click shows no score board', tag)) {
      await ctx.sleep(1700);
      const b2 = await k.eval(() => window.__km.nikod());
      ctx.check(b2 && res.board && b2.ltott === res.board.ltott && b2.toch.join() === res.board.toch.join(),
        'score replay board differs', `${tag}: end ${res.board && res.board.ltott}% ${res.board && res.board.toch.join('/')} vs replay ${b2 && b2.ltott}% ${b2 && b2.toch.join('/')}`);
      await k.closeNikod();
    }
  }
}

async function bookSide(k) {
  const { ctx } = k;
  const book = await k.eval(() => window.__kesemSession.config.book);
  // Hover paint on a chapter tab (Sst.SelectZ_MouseMove → books2.jpg slice).
  ctx.step('book/hover');
  const hi = await k.eval(c => [...document.querySelectorAll('.frm-ctrl--SelectZ')].findIndex(e => +e.dataset.index === c), book.chapters[1]);
  const box = await k.eval(i => window.__km.point('.frm-ctrl--SelectZ', i), hi);
  if (box) {
    await ctx.page.mouse.move(box.x, box.y);
    await ctx.sleep(300);
    const bg = await k.eval(i => getComputedStyle(document.querySelectorAll('.frm-ctrl--SelectZ')[i]).backgroundImage, hi);
    ctx.check(/books2/.test(bg), 'chapter tab hover paint missing', bg);
    await ctx.checkImages();
    await ctx.shot('book-hover');
    await ctx.page.mouse.move(2, 2);
  }
  // Help video.
  ctx.step('book/help');
  const helpI = await k.eval(c => [...document.querySelectorAll('.frm-ctrl--SelectZ')].findIndex(e => +e.dataset.index === c), book.help);
  await k.tap('.frm-ctrl--SelectZ', helpI, 700);
  if (await k.eval(() => !!document.querySelector('.video-overlay'))) await k.video('help', { watch: 800 });
  else ctx.finding('warn', 'help tab plays no video', `SelectZ(${book.help})`);
  // Credit popup: click anywhere closes it.
  ctx.step('book/credit');
  const credI = await k.eval(c => [...document.querySelectorAll('.frm-ctrl--SelectZ')].findIndex(e => +e.dataset.index === c), book.credit);
  await k.tap('.frm-ctrl--SelectZ', credI, 500);
  const pop = await k.eval(() => { const im = [...document.querySelectorAll('body > div img')].find(i => /meida/.test(i.src)); return im ? { ok: im.complete && im.naturalWidth > 0 } : null; });
  if (ctx.check(pop, 'credit popup does not open', '')) {
    ctx.check(pop.ok, 'credit popup image missing', '');
    await ctx.shot('book-credit');
    await ctx.page.mouse.click(20, 20);
    await ctx.sleep(300);
    ctx.check(!(await k.eval(() => [...document.querySelectorAll('body > div img')].some(i => /meida/.test(i.src)))), 'credit popup does not close', '');
  }
  // Keyboard on the index / page must not break it.
  await ctx.page.keyboard.press('Escape');
  await ctx.sleep(300);
  if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(false);
}

async function bookWalk(k) {
  const { ctx } = k;
  const book = await k.eval(() => window.__kesemSession.config.book);
  await bookSide(k);
  let picexiDone = false;
  const chapters = book.chapters;
  for (const c of chapters) {
    ctx.step(`ch${c}/open`);
    if (!(await openChapter(k, c))) continue;
    await ctx.checkImages();
    await ctx.shot(`ch${c}-page`);
    const rs = await rows(k);
    const nSlots = await k.eval(() => window.__km.slots().length);
    ctx.check(rs.length === Math.min(nSlots, await k.eval(() => document.querySelectorAll('.frm-ctrl--ShowName').length)), 'book rows ≠ chapter slots', `chapter ${c}: ${rs.length} rows for ${nSlots} slots`);
    const pick = ctx.quick ? rs.slice(0, 1) : rs;
    for (const row of pick) {
      k.played++;
      const wrongs = k.played % 3 === 2;
      const chaos = k.played % 5 === 4;
      // Alternate the two start labels (name / number) — both are StartGames.
      await playRow(k, c, row, { wrongs, chaos, via: k.played % 2 ? 'ShowName' : 'ShowMasNum' });
      if (!(await k.eval(() => window.__km.visible('.frm-ctrl--OpenPage')))) await openChapter(k, c);
    }
    // Mid-path picexi (no / next stage / yes → partial board) once.
    if (!picexiDone && rs.length) {
      picexiDone = true;
      const scored = await k.eval(() => window.__km.slots().findIndex(x => x.stages && x.stages[0] && ![3, 6].includes(x.stages[0].gameNumber)));
      k._bookRow = scored >= 0 ? scored : rs[0].i;
      await k.picexiScenario(c, k._bookRow);
      if (!(await k.eval(() => window.__km.visible('.frm-ctrl--OpenPage')))) await openChapter(k, c);
    }
    // ExitPage → back to the index.
    await k.tap('.frm-ctrl--ExitPage', 0, 400);
    ctx.check(await k.eval(() => window.__km.visible('.frm-ctrl--BookIndex') && !window.__km.visible('.frm-ctrl--OpenPage')), 'ExitPage does not return to the book index', `chapter ${c}`);
  }
  // Rapid chapter switching must land on the last one clicked, with its rows.
  ctx.step('book/rapid');
  for (const c of chapters.slice(0, 4)) {
    const i = await k.eval(x => [...document.querySelectorAll('.frm-ctrl--SelectZ')].findIndex(e => +e.dataset.index === x), c);
    const p = await k.eval(j => window.__km.point('.frm-ctrl--SelectZ', j), i);
    if (p) await ctx.click(p.x, p.y, 60);
    if (await k.eval(() => window.__km.visible('.frm-ctrl--OpenPage'))) await k.tap('.frm-ctrl--ExitPage', 0, 60);
  }
  await ctx.shot('book-after-rapid');
}

function runBook(ctx, app) {
  return runApp(ctx, app, {
    ramas: [],
    exitSel: '.frm-ctrl--SelectZ[data-index="__exit__"]',
    entry: async k => {
      extra.install(k, { hak: true, hint: true });
      const book = await k.eval(() => window.__kesemSession.config.book);
      k.o.exitSel = `.frm-ctrl--SelectZ[data-index="${book.exit}"]`;
      // The walker's picexi scenario opens "path i" by tapping btnIcon; on
      // the book it is the chapter row's ShowName.
      const tap = k.tap.bind(k);
      k.tap = async (sel, i = 0, wait, o) => {
        if (sel !== '.frm-ctrl--btnIcon') return tap(sel, i, wait, o);
        const ti = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--ShowName')].findIndex(e => +e.dataset.index === ix), k._bookRow);
        return tap('.frm-ctrl--ShowName', ti, wait, o);
      };
      // The walker (picexiScenario, playPathAt) enters paths via enterPath(),
      // which looks for btnIcon — the book has none.
      k.enterPath = async () => {
        const ti = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--ShowName')].findIndex(e => +e.dataset.index === ix), k._bookRow);
        if (ti < 0) return false;
        await tap('.frm-ctrl--ShowName', ti, 400);
        return true;
      };
    },
    extra: bookWalk,
  });
}

module.exports = { runBook, rowScore };
