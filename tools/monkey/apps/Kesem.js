// Kesem ("magical windows") — the teacher's editor + lesson player. Not the
// Sst → Games walker's shape: the Sst is a lesson list (List1, 47 seed
// lessons from MASLUL/), activ(0..6) buttons (play / free-play grid / album /
// path editor / path browser / 2 videos), plus the editor screens:
//   main (picture album ⇄ menu mode) → chgames (game type + cutouts, test
//   play), gzira (hotspot-rect editor), gr_edit (paint), print;
//   maslul (lesson sequencer) → expo (publish JSON) / impo (import it back);
//   start_maslul (lesson browser, favourites, play).
//
// Covered: every lesson clicked (preview must load — #43) and played through
// the shared walker's playPath (all stages, wrongs / chaos schedule, nikod
// checks), the free-play grid, and every editor screen: a "button audit"
// (every visible control on the screen must be clickable — #44 — and must
// react), scripted edits (draw a gzira rect, paint strokes, build a new lesson
// in maslul, export + re-import it, play it), a chaos burst per screen, and
// checkImages + screenshots throughout.
const { runApp } = require('../kesem');
const extra = require('../kesem-extra');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP = 'Kesem_site/index.html#/Kesem';
const scr = k => k.eval(() => window.__kesemSession && window.__kesemSession.currentScreen);

async function reload(k, screenAfter = 'sst') {
  await k.ctx.goto(`Kesem_site/index.html?r=${Date.now()}#/Kesem`, 1200);
  await k.ctx.waitFor(() => !!window.__kesemSession, 8000);
  return k.waitScreen(screenAfter, 6000);
}

/** activ(i) on the Sst album view. */
async function activ(k, i, wait = 700) {
  if ((await scr(k)) !== 'sst') await reload(k);
  if (!(await k.eval(() => window.__km.visible('.frm-ctrl--activ', 0)))) {
    // free-play view is showing → bac back to the list view
    if (await k.eval(() => window.__km.visible('.frm-ctrl--bac'))) await k.tap('.frm-ctrl--bac', 0, 400);
  }
  const j = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--activ')].findIndex(e => +e.dataset.index === ix), i);
  return k.tap('.frm-ctrl--activ', j, wait);
}

/**
 * Button audit for the current screen: every visible control must be
 * top-most somewhere (#44 "a good majority of buttons aren't pressable") and
 * clicking it must do *something* (trace line, DOM/screen change, dialog…).
 * `skip` = CSS selector of controls not to click (destructive / leaves the
 * app); `back` = async fn restoring the screen after a control navigates away.
 */
async function audit(k, label, { skip = '', back = null, click = true } = {}) {
  const { ctx } = k;
  ctx.step(`${label}/audit`);
  await ctx.sleep(400);
  await ctx.checkImages();
  await ctx.shot(label);
  const screen = await scr(k);
  const ctrls = await k.eval((sk) => [...document.querySelectorAll('.frm-stage .frm-hotspot, .frm-stage [data-action]')]
    .filter((e, i, a) => a.indexOf(e) === i && window.__km.visible && (() => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2 && e.offsetParent !== null; })())
    .filter(e => !(sk && e.matches(sk)))
    .map(e => ({ name: e.dataset.name || e.className, i: e.dataset.index ? +e.dataset.index : null, action: e.dataset.action || '', pe: getComputedStyle(e).pointerEvents, hit: (window.__km.point(e) || {}).hit })), skip);
  const covered = ctrls.filter(c => c.pe !== 'none' && !c.hit);
  for (const c of covered) ctx.finding('warn', 'control covered (cannot be clicked)', `${label}: ${c.name}${c.i != null ? `(${c.i})` : ''} ${c.action}`);
  if (!click) return ctrls;
  const dead = [];
  for (const c of ctrls) {
    if (c.pe === 'none' || !c.hit) continue;
    if (back) await back(); else if ((await scr(k)) !== screen) break;
    const sel = `.frm-stage .frm-ctrl--${c.name}` + (c.i != null ? `[data-index="${c.i}"]` : '');
    const t0 = ctx.traceLen();
    const f0 = await ctx.fingerprint();
    const html0 = await k.eval(() => document.querySelector('.frm-stage').innerHTML.length + ':' + document.body.children.length);
    const nDialogs = ctx.log.console.filter(x => x.type === 'dialog').length;
    await k.tap(sel, 0, 450, { quiet: true });
    const lines = ctx.traceSince(t0).filter(l => !/\] click /.test(l));
    const f1 = await ctx.fingerprint();
    const html1 = await k.eval(() => document.querySelector('.frm-stage') ? document.querySelector('.frm-stage').innerHTML.length + ':' + document.body.children.length : 'gone');
    const dialogs = ctx.log.console.filter(x => x.type === 'dialog').length - nDialogs;
    if (!lines.length && f0 === f1 && html0 === html1 && !dialogs) dead.push(`${c.name}${c.i != null ? `(${c.i})` : ''}${c.action ? ' ' + c.action : ''}`);
    // Close whatever opened.
    await k.eval(() => { const v = document.querySelector('.video-overlay button[aria-label="close"]'); if (v) v.click(); });
    if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(false);
    if (await k.eval(() => !!document.querySelector('.nikod-overlay'))) await k.closeNikod();
    await k.eval(() => { for (const o of document.querySelectorAll('.kesem-print-layer, .kesem-modal-overlay')) o.remove(); });
    await k.eval(() => { const x = [...document.querySelectorAll('body > div')].find(d => /fixed/.test(d.style.position) && d.style.zIndex >= 1000 && !d.id); if (x && !x.querySelector('#feedback-fab')) x.click(); });
    await k.flushOverlaps();
  }
  if (dead.length) ctx.finding('warn', 'buttons that do nothing', `${label}: ${dead.join(', ')}`);
  if ((await scr(k)) !== screen && back) await back();
  return ctrls;
}

async function chaos(k, label, avoid, back) {
  const { ctx } = k;
  ctx.step(`${label}/chaos`);
  await ctx.monkey({ n: ctx.quick ? 12 : 30, within: '.frm-stage', wait: 180, avoid,
    stopWhen: () => !!document.querySelector('.nikod-overlay,.video-overlay,.misger-overlay') });
  await k.eval(() => { const v = document.querySelector('.video-overlay button[aria-label="close"]'); if (v) v.click(); });
  if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(false);
  if (await k.eval(() => !!document.querySelector('.nikod-overlay'))) await k.closeNikod();
  await ctx.assertAlive(`${label} after chaos`, 1200);
  await ctx.shot(`${label}-chaos`);
  if (back) await back();
}

// ------------------------------------------------------------------ Sst
async function lessonList(k) {
  const { ctx } = k;
  ctx.step('sst/lessons');
  const n = await k.eval(() => document.querySelectorAll('.frm-ctrl--List1 li').length);
  const doc = await k.eval(() => window.__kesemSession.editor.doc.maslul.map((m, i) => ({ i, name: m.name, mas: m.masFile, n: (m.stages || []).length, pic: m.stages && m.stages[0] && m.stages[0].pic })));
  ctx.check(n === doc.length && n > 0, 'Sst lesson list incomplete', `${n} rows for ${doc.length} lessons`);
  const bad = [];
  let scrollJumps = 0;
  const idx = ctx.quick ? doc.slice(0, 12) : doc;
  for (const L of idx) {
    // Scroll the row into the middle, click it, and check the list did not
    // jump and the preview shows the lesson's first picture.
    const before = await k.eval(i => { const li = document.querySelector(`.frm-ctrl--List1 li[data-idx="${i}"]`); li.scrollIntoView({ block: 'center' }); const l = document.querySelector('.frm-ctrl--List1'); return { top: l.scrollTop, y: li.getBoundingClientRect().top }; }, L.i);
    await k.tap(`.frm-ctrl--List1 li[data-idx="${L.i}"]`, 0, 80, { quiet: true });
    const ok = await ctx.waitFor(i => { const im = document.querySelector('.frm-ctrl--pri img.kesem-preview'); const s = window.__kesemSession.editor; return s.sstSelMaslul === i && im && im.complete && im.naturalWidth > 0 && getComputedStyle(im).opacity !== '0'; }, 3000, L.i);
    const after = await k.eval(i => { const li = document.querySelector(`.frm-ctrl--List1 li[data-idx="${i}"]`); const im = document.querySelector('.frm-ctrl--pri img.kesem-preview'); return { y: li.getBoundingClientRect().top, bg: li.style.background, src: im && im.getAttribute('src') }; }, L.i);
    if (Math.abs(after.y - before.y) > 2) scrollJumps++;
    if (!ok && L.pic) bad.push(`${L.mas} (${L.pic} → ${String(after.src).slice(0, 60)})`);
  }
  ctx.check(!bad.length, 'lesson preview picture does not load', `${bad.length}/${idx.length}: ${bad.slice(0, 6).join('; ')}`);
  ctx.check(!scrollJumps, 'lesson list jumps when a row is clicked', `${scrollJumps}/${idx.length} clicks moved the clicked row (list re-rendered + scroll reset)`);
  // Rapid clicking through many rows (#43: "pictures stop loading").
  ctx.step('sst/lessons-rapid');
  for (let c = 0; c < 20; c++) {
    const i = Math.floor(ctx.rand() * doc.length);
    await k.eval(j => document.querySelector(`.frm-ctrl--List1 li[data-idx="${j}"]`).scrollIntoView({ block: 'center' }), i);
    await k.tap(`.frm-ctrl--List1 li[data-idx="${i}"]`, 0, 40, { quiet: true });
  }
  const last = await k.eval(() => window.__kesemSession.editor.sstSelMaslul);
  const okLast = await ctx.waitFor(() => { const im = document.querySelector('.frm-ctrl--pri img.kesem-preview'); return im && im.complete && im.naturalWidth > 0 && getComputedStyle(im).opacity !== '0'; }, 4000);
  ctx.check(okLast || !doc[last].pic, 'preview blank after rapid lesson switching', `lesson ${last}`);
  await ctx.shot('sst-after-rapid');
  // Right-click → stage detail (SpG_l).
  ctx.step('sst/stage-detail');
  const p = await k.eval(() => window.__km.point('.frm-ctrl--List1 li', 0));
  await k.eval(() => document.querySelector('.frm-ctrl--List1 li').scrollIntoView({ block: 'center' }));
  const p2 = await k.eval(() => window.__km.point('.frm-ctrl--List1 li', 0));
  if (p2) {
    await ctx.page.mouse.click(p2.x, p2.y, { button: 'right' });
    await ctx.sleep(300);
    const d = await k.eval(() => ({ spg: window.__km.visible('.frm-ctrl--SpG_l'), rows: document.querySelectorAll('.frm-ctrl--SpG_l li').length, n: window.__kesemSession.editor.doc.maslul[0].stages.length }));
    ctx.check(d.spg && d.rows >= d.n, 'right-click shows no stage detail', JSON.stringify(d));
    await ctx.shot('sst-stage-detail');
  }
  return doc;
}

/** Start lesson i by double-clicking its row; play it with the walker. */
async function playLesson(k, L, { via = 'dblclick', wrongs = false, chaos = false } = {}) {
  const { ctx } = k;
  const tag = `L${L.mas.replace(/\.mas$/i, '')}`;
  ctx.step(`${tag}/enter`);
  if ((await scr(k)) !== 'sst') await reload(k);
  if (!(await k.eval(() => window.__km.visible('.frm-ctrl--List1')))) await k.tap('.frm-ctrl--bac', 0, 400);
  await k.eval(i => document.querySelector(`.frm-ctrl--List1 li[data-idx="${i}"]`).scrollIntoView({ block: 'center' }), L.i);
  const pt = await k.eval(i => window.__km.point(`.frm-ctrl--List1 li[data-idx="${i}"]`), L.i);
  if (via === 'dblclick') {
    await ctx.page.mouse.click(pt.x, pt.y, { clickCount: 1 });
    await ctx.page.mouse.click(pt.x, pt.y, { clickCount: 2 });
  } else {
    await ctx.page.mouse.click(pt.x, pt.y);
    await ctx.sleep(200);
    await activ(k, 0, 400);
  }
  const started = await ctx.waitFor(() => { const s = window.__km.snap(); return s.ov === 'video' || /^game/.test(s.screen || ''); }, 8000);
  if (!started) { ctx.finding('error', 'lesson did not start', `${tag} via ${via} (${L.name}) screen=${await scr(k)}`); await ctx.shot(`${tag}-nostart`); return null; }
  ctx.check((await k.eval(() => window.__kesemSession.currentPath)) === L.i, 'wrong lesson started', `${tag}: currentPath ${await k.eval(() => window.__kesemSession.currentPath)} want ${L.i}`);
  const res = await k.playPath(tag, { wrongs, chaos });
  if (!res) { k.cover(`${tag} ${L.name}: ABORTED`); await reload(k); return null; }
  const ls = await k.eval(() => window.__km.ls('Kesem'));
  const r = String(await k.eval(() => window.__kesemSession.rama));
  const lsStages = ((ls.scores[r] || {})[String(L.i)] || {}).stages;
  ctx.check(!!(ls.completed[r] || {})[String(L.i)], 'completion not recorded', `${tag}: completed[${r}][${L.i}] missing`);
  const want = k.checkBoard(tag, res, lsStages);
  if (res.board) ctx.check(res.board.title === L.name, 'nikod shows wrong lesson title', `${tag}: "${res.board.title}" vs "${L.name}"`);
  if (!wrongs && !chaos) ctx.check(want.mispar === 100 && res.board && res.board.ltott === '100', 'all-correct lesson is not top score', `${tag}: board ${res.board && res.board.ltott}`);
  k.cover(`${tag} ${L.name}: ${res.slotLen} stages [${res.expected.map(e => (e === null ? 'g3' : e === 'chaos' ? 'chaos' : `${e.green}/${e.yellow}/${e.red}`)).join(' ')}] → ${res.board && res.board.ltott}%${wrongs ? ' (wrongs)' : ''}${chaos ? ' (chaos)' : ''}`);
  ctx.step(`${tag}/after`);
  ctx.check(await k.closeNikod(), 'nikod does not close', tag);
  ctx.check(await k.waitScreen('sst', 5000), 'did not return to Sst after nikod', tag);
  return res;
}

async function lessons(k, doc) {
  const pick = k.ctx.quick ? doc.slice(0, 3) : doc;
  for (const L of pick) {
    if (!L.n) { k.ctx.finding('info', 'lesson has no stages', `${L.mas} ${L.name}`); continue; }
    k.played++;
    await playLesson(k, L, { via: k.played % 4 === 1 ? 'ok' : 'dblclick', wrongs: k.played % 3 === 2, chaos: k.played % 5 === 4 });
  }
}

/** activ(1): free-play grid of the first 6 lessons; tiles play, bac returns. */
async function freePlay(k, doc) {
  const { ctx } = k;
  ctx.step('sst/free-play');
  await activ(k, 1, 600);
  const v = await k.eval(() => ({ p1: window.__km.visible('.frm-ctrl--Picture1'), tiles: [...document.querySelectorAll('.frm-ctrl--btnIcon img.kesem-tile')].filter(i => i.complete && i.naturalWidth).length }));
  ctx.check(v.p1 && v.tiles === Math.min(6, doc.length), 'free-play grid tiles missing', JSON.stringify(v));
  await audit(k, 'sst-freeplay', { click: false });
  // Play tile 0 (walker-style) and check the lamp lights.
  const ti = await k.eval(() => [...document.querySelectorAll('.frm-ctrl--btnIcon')].findIndex(e => e.dataset.index === '0'));
  await k.tap('.frm-ctrl--btnIcon', ti, 500);
  const started = await ctx.waitFor(() => { const s = window.__km.snap(); return s.ov === 'video' || /^game/.test(s.screen || ''); }, 8000);
  if (ctx.check(started, 'free-play tile does not start its lesson', '')) {
    ctx.check((await k.eval(() => window.__kesemSession.currentPath)) === 0, 'free-play tile started the wrong lesson', '');
    const res = await k.playPath('free0', {});
    if (res) {
      await k.closeNikod();
      await k.waitScreen('sst', 5000);
      await ctx.sleep(300);
      const lamp = await k.lampState(0);
      const view = await k.eval(() => ({ p1: window.__km.visible('.frm-ctrl--Picture1'), p2: window.__km.visible('.frm-ctrl--Picture2') }));
      ctx.finding('info', 'free-play: view after the lesson', JSON.stringify({ view, lamp }));
    }
  }
  await ctx.shot('sst-freeplay-after');
}

// ----------------------------------------------------------- editor screens
async function toMain(k) { await reload(k); await activ(k, 2, 800); return k.waitScreen('main', 4000); }

async function mainAlbum(k) {
  const { ctx } = k;
  ctx.step('main/open');
  if (!ctx.check(await toMain(k), 'album (activ 2) does not open Main', '')) return;
  const pics = await k.eval(() => window.__kesemSession.editor.doc.pictures.length);
  const rows = await k.eval(() => document.querySelectorAll('.frm-ctrl--List1 li').length);
  ctx.check(rows === pics && pics > 0, 'album list incomplete', `${rows} rows / ${pics} pictures`);
  // Click through pictures: the preview must load each one.
  const bad = [];
  const sample = ctx.quick ? [0, 1, 2, pics - 1] : Array.from({ length: pics }, (_, i) => i);
  for (const i of sample) {
    await k.eval(j => document.querySelector(`.frm-ctrl--List1 li[data-idx="${j}"]`).scrollIntoView({ block: 'center' }), i);
    await k.tap(`.frm-ctrl--List1 li[data-idx="${i}"]`, 0, 60, { quiet: true });
    const ok = await ctx.waitFor(() => { const im = document.querySelector('.frm-ctrl--Spic1 img.kesem-preview'); return im && im.complete && im.naturalWidth > 0; }, 3000);
    if (!ok) bad.push(String(i));
  }
  ctx.check(!bad.length, 'album preview does not load', `pictures ${bad.slice(0, 10).join(',')} (${bad.length}/${sample.length})`);
  await audit(k, 'main-album', { skip: '.frm-ctrl--del[data-index="3"],.frm-ctrl--del[data-index="2"],.frm-ctrl--del[data-index="0"]', back: async () => { await toMain(k); } });
  await chaos(k, 'main-album', '.frm-ctrl--del,.frm-ctrl--endof,.frm-ctrl--ImpOle', null);
  // Accept selection → menu mode.
  ctx.step('main/menu-mode');
  await toMain(k);
  await k.tap('.frm-ctrl--del[data-index="1"]', 0, 500);
  const menu = await k.eval(() => [...document.querySelectorAll('.frm-ctrl--menu')].filter(e => getComputedStyle(e).display !== 'none').length);
  ctx.check(menu >= 4, 'accept selection does not show the menu', `${menu} menu buttons`);
  await audit(k, 'main-menu', { skip: '.frm-ctrl--menu', click: false });
  // menu(3) print — must ask, then print (stubbed).
  ctx.step('main/print');
  await k.eval(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  const mi = await k.eval(() => [...document.querySelectorAll('.frm-ctrl--menu')].findIndex(e => e.dataset.index === '3'));
  await k.tap('.frm-ctrl--menu', mi, 600);
  await ctx.shot('main-print-confirm');
  const yes = await k.eval(() => { const b = [...document.querySelectorAll('button')].find(b => /הדפס|אישור|כן/.test(b.textContent) && b.offsetParent); if (b) { b.click(); return b.textContent; } return null; });
  await ctx.sleep(600);
  ctx.check(await k.eval(() => window.__printed) >= 1 || !yes, 'print does not print', `confirm button ${yes}`);
  await k.eval(() => { for (const o of document.querySelectorAll('.kesem-print-layer')) o.remove(); });
  // exit → back to album mode.
  await toMain(k);
  await k.tap('.frm-ctrl--del[data-index="1"]', 0, 400);
  await k.tap('.frm-ctrl--exit', 0, 400);
  ctx.check(await k.eval(() => window.__kesemSession.editor.knica === 0 && window.__km.visible('.frm-ctrl--List1')), 'menu-mode exit does not return to the album', '');
  // endof → back to Sst.
  await k.tap('.frm-ctrl--endof', 0, 600);
  ctx.check((await scr(k)) === 'sst', 'Main endof does not return to Sst', await scr(k));
}

async function toMenu(k, pic = 0) {
  await toMain(k);
  await k.eval(j => { const li = document.querySelector(`.frm-ctrl--List1 li[data-idx="${j}"]`); li.scrollIntoView({ block: 'center' }); }, pic);
  await k.tap(`.frm-ctrl--List1 li[data-idx="${pic}"]`, 0, 200, { quiet: true });
  await k.tap('.frm-ctrl--del[data-index="1"]', 0, 400);
}
async function menuBtn(k, i, screen) {
  const mi = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--menu')].findIndex(e => +e.dataset.index === ix), i);
  await k.tap('.frm-ctrl--menu', mi, 800);
  return k.waitScreen(screen, 4000);
}

async function chgames(k) {
  const { ctx } = k;
  ctx.step('chgames/open');
  // A picture that has cutouts (rasb) — pick the first seed lesson's picture.
  const pic = await k.eval(() => { const d = window.__kesemSession.editor.doc; const p = d.maslul[0].stages[0].pic; return Math.max(0, d.pictures.findIndex(x => x.file.toLowerCase() === p.toLowerCase())); });
  await toMenu(k, pic);
  if (!ctx.check(await menuBtn(k, 0, 'chgames'), 'menu(0) does not open ChGames', await scr(k))) return;
  const back = async () => { await toMenu(k, pic); await menuBtn(k, 0, 'chgames'); };
  const n2 = await k.eval(() => document.querySelectorAll('.frm-ctrl--List2 li, .frm-ctrl--List2 option').length);
  ctx.check(n2 > 0, 'ChGames lists no cutouts for a picture that has them', `picture ${pic}`);
  await audit(k, 'chgames', { skip: '.frm-ctrl--Ed_But[data-index="2"],.frm-ctrl--Ed_But[data-index="1"]', back });
  // Each game type → commit → test-play that stage.
  for (let g = 0; g < 5; g++) {
    ctx.step(`chgames/type${g}`);
    await back();
    await k.eval(() => { const li = document.querySelector('.frm-ctrl--List2 li'); if (li) li.click(); });
    const ci = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--ChG')].findIndex(e => +e.dataset.index === ix), g);
    await k.tap('.frm-ctrl--ChG', ci, 250);
    const gn = await k.eval(() => window.__kesemSession.editor.currentGameNumber);
    ctx.check(gn === [3, 1, 2, 4, 5][g], 'ChG does not set the game type', `ChG(${g}) → Game_Number ${gn}, want ${[3, 1, 2, 4, 5][g]}`);
    await ctx.shot(`chgames-type${g}`);
    const bi = await k.eval(() => [...document.querySelectorAll('.frm-ctrl--butt_list')].findIndex(e => e.dataset.index === '2'));
    await k.tap('.frm-ctrl--butt_list', bi, 800);
    const s = await k.snap();
    if (!/^game/.test(s.screen || '')) { ctx.finding('warn', 'ChGames commit does not test-play', `ChG(${g}) → screen ${s.screen}`); continue; }
    const res = await k.playPath(`chg${g}`, {});
    if (res) await k.closeNikod();
    const after = await scr(k);
    ctx.finding('info', 'ChGames test-play returns to', `ChG(${g}) game${[3, 1, 2, 4, 5][g]} → ${after}`);
  }
  await back();
  await chaos(k, 'chgames', '.frm-ctrl--endof,.frm-ctrl--Ed_But,.frm-ctrl--butt_list', null);
}

async function gzira(k) {
  const { ctx } = k;
  ctx.step('gzira/open');
  await toMenu(k, 0);
  if (!ctx.check(await menuBtn(k, 1, 'gzira'), 'menu(1) does not open Gzira', await scr(k))) return;
  await ctx.sleep(500);
  await ctx.checkImages();
  await ctx.shot('gzira');
  const r0 = await k.eval(() => document.querySelectorAll('.kesem-gzira-rect:not(.kesem-gzira-draft)').length);
  // Drag a rectangle on the picture.
  const box = await k.eval(() => { const l = document.querySelector('.kesem-gzira-layer') || document.querySelector('.kesem-gzira-pic'); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  if (ctx.check(box, 'gzira has no drawing layer', '')) {
    const x0 = box.x + box.w * 0.2, y0 = box.y + box.h * 0.2;
    await ctx.page.mouse.move(x0, y0);
    await ctx.page.mouse.down();
    for (let s = 1; s <= 8; s++) await ctx.page.mouse.move(x0 + s * box.w * 0.02, y0 + s * box.h * 0.02);
    await ctx.page.mouse.up();
    await ctx.sleep(500);
    if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(true);
    const r1 = await k.eval(() => document.querySelectorAll('.kesem-gzira-rect:not(.kesem-gzira-draft)').length);
    ctx.check(r1 === r0 + 1, 'gzira: dragging does not add a rectangle', `${r0} → ${r1}`);
    await ctx.shot('gzira-drawn');
  }
  await audit(k, 'gzira', { skip: '.frm-ctrl--Label4,.frm-ctrl--endof', back: null, click: false });
  await chaos(k, 'gzira', '.frm-ctrl--Label4,.frm-ctrl--endof,.frm-ctrl--btnED', null);
  // Save & exit.
  ctx.step('gzira/save');
  if ((await scr(k)) === 'gzira') {
    await k.tap('.frm-ctrl--Label4', 0, 600);
    if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(true);
    await ctx.sleep(500);
    ctx.check((await scr(k)) !== 'gzira', 'gzira save & exit stays on Gzira', await scr(k));
  }
}

async function grEdit(k) {
  const { ctx } = k;
  ctx.step('gr_edit/open');
  await toMenu(k, 0);
  if (!ctx.check(await menuBtn(k, 2, 'gr_edit'), 'menu(2) does not open the paint editor', await scr(k))) return;
  await ctx.sleep(600);
  await ctx.checkImages();
  await ctx.shot('gr_edit');
  const cv = await k.eval(() => { const c = document.querySelector('.kesem-gr-canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  if (ctx.check(cv, 'paint editor has no canvas', '')) {
    const sum = () => k.eval(() => { const c = document.querySelector('.kesem-gr-canvas'); if (!c) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 97) s = (s + d[i] * (i % 13 + 1)) % 1e9; return s; });
    // Every tool: select it, then stroke across the canvas.
    const tools = (await k.eval(() => [...document.querySelectorAll('.frm-ctrl--butt_press')].filter(e => getComputedStyle(e).display !== 'none').map(e => +e.dataset.index))).sort((a, b) => (a === 10) - (b === 10) || a - b);
    const changed = [];
    for (const t of tools) {
      const ti = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--butt_press')].findIndex(e => +e.dataset.index === ix), t);
      await k.tap('.frm-ctrl--butt_press', ti, 200, { quiet: true });
      const a = await sum();
      const y = cv.y + cv.h * (0.15 + 0.06 * (t % 12));
      await ctx.page.mouse.move(cv.x + cv.w * 0.2, y);
      await ctx.page.mouse.down();
      for (let s = 1; s <= 6; s++) await ctx.page.mouse.move(cv.x + cv.w * (0.2 + s * 0.08), y + s * 3);
      await ctx.page.mouse.up();
      await ctx.sleep(150);
      if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(false);
      await k.eval(() => { for (const o of document.querySelectorAll('.kesem-modal-overlay')) o.remove(); });
      for (let e = 0; e < 2 && await k.eval(() => [...document.body.children].some(d => d.style && d.style.position === 'fixed' && +d.style.zIndex >= 1000)); e++) { await ctx.page.keyboard.press('Escape'); await ctx.sleep(150); }
      if ((await scr(k)) !== 'gr_edit') { ctx.finding('info', 'paint tool left the editor', `butt_press(${t}) → ${await scr(k)}`); break; }
      if ((await sum()) !== a) {
        changed.push(t);
        if (changed.length === 1) {
          // Undo must restore the canvas to before this stroke.
          await k.tap('.frm-ctrl--und', 0, 300, { quiet: true });
          ctx.check((await sum()) === a, 'paint undo does not restore the canvas', `tool ${t}`);
        }
      }
    }
    ctx.finding('info', 'paint tools that changed the canvas', `${changed.join(',')} of ${tools.join(',')}`);
    await ctx.shot('gr_edit-painted');
  }
  await audit(k, 'gr_edit', { skip: '.frm-ctrl--endof,.frm-ctrl--menu_gr,.frm-ctrl--Import', click: false });
  await chaos(k, 'gr_edit', '.frm-ctrl--endof,.frm-ctrl--menu_gr,.frm-ctrl--Import', null);
  ctx.step('gr_edit/close');
  if ((await scr(k)) === 'gr_edit') {
    await k.tap('.frm-ctrl--endof', 0, 600);
    if (await k.eval(() => !!document.querySelector('.misger-overlay'))) await k.misgerAnswer(false);
    await k.eval(() => { const b = [...document.querySelectorAll('button')].find(b => /לא|ביטול/.test(b.textContent) && b.offsetParent); if (b) b.click(); });
    await ctx.sleep(500);
    ctx.check((await scr(k)) !== 'gr_edit', 'paint editor endof does not leave', await scr(k));
  }
}

async function maslulEditor(k) {
  const { ctx } = k;
  ctx.step('maslul/open');
  await reload(k);
  const n0 = await k.eval(() => window.__kesemSession.editor.doc.maslul.length);
  await activ(k, 3, 800);
  if (!ctx.check(await k.waitScreen('maslul', 4000), 'activ(3) does not open Maslul', await scr(k))) return null;
  await ctx.sleep(400);
  await ctx.checkImages();
  await ctx.shot('maslul');
  // Build a 3-stage lesson: pick a picture, a cutout, a game type, commit.
  const addStage = async (picIdx, opt) => {
    await k.eval(j => { const li = document.querySelectorAll('.frm-ctrl--List1 li')[j]; if (li) { li.scrollIntoView({ block: 'center' }); } }, picIdx);
    await k.tap('.frm-ctrl--List1 li', picIdx, 300, { quiet: true });
    const n2 = await k.eval(() => document.querySelectorAll('.frm-ctrl--List2 li').length);
    if (n2) await k.tap('.frm-ctrl--List2 li', 0, 200, { quiet: true });
    const oi = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--Option1')].findIndex(e => +e.dataset.index === ix), opt);
    await k.tap('.frm-ctrl--Option1', oi, 200, { quiet: true });
    const before = await k.eval(() => (window.__kesemSession.editor.currentLesson || { stages: [] }).stages.length);
    await k.tap('.frm-ctrl--Command3', 0, 400);
    const after = await k.eval(() => (window.__kesemSession.editor.currentLesson || { stages: [] }).stages.length);
    return { n2, before, after };
  };
  // Pictures that have cutouts: those of seed lessons.
  const picIdx = await k.eval(() => { const d = window.__kesemSession.editor.doc; const want = d.maslul.slice(0, 6).map(m => m.stages[0].pic.toLowerCase()); return [...document.querySelectorAll('.frm-ctrl--List1 li')].map((li, i) => [i, li.textContent.toLowerCase()]).filter(([, t]) => want.some(w => t.includes(w.replace(/\.bmp$/, '')))).map(([i]) => i).slice(0, 3); });
  const results = [];
  for (const [j, opt] of [[0, 1], [1, 2], [2, 0]]) results.push(await addStage(picIdx[j] ?? j, opt));
  ctx.finding('info', 'maslul stage adds', JSON.stringify(results));
  ctx.check(results.every(r => r.after === r.before + 1 || !r.n2), 'maslul commit does not add a stage', JSON.stringify(results));
  const l3 = await k.eval(() => document.querySelectorAll('.frm-ctrl--List3 li').length);
  ctx.check(l3 === results.filter(r => r.after > r.before).length, 'maslul List3 does not show the added stages', `${l3} rows`);
  await ctx.shot('maslul-built');
  // Remove one (btnBitul) and re-add.
  await k.tap('.frm-ctrl--List3 li', 0, 200, { quiet: true });
  const b0 = await k.eval(() => window.__kesemSession.editor.currentLesson.stages.length);
  await k.tap('.frm-ctrl--btnBitul', 0, 300);
  const b1 = await k.eval(() => window.__kesemSession.editor.currentLesson.stages.length);
  ctx.check(b1 === b0 - 1, 'maslul btnBitul does not remove the stage', `${b0} → ${b1}`);
  await addStage(picIdx[0] ?? 0, 1);
  // Option1(0..6) pick the game type of the next stage.
  const gnus = [];
  for (let o = 0; o < 7; o++) {
    const oi = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--Option1')].findIndex(e => +e.dataset.index === ix), o);
    await k.tap('.frm-ctrl--Option1', oi, 150, { quiet: true });
    gnus.push(await k.eval(() => window.__kesemSession.editor.currentLesson.gnu));
  }
  ctx.check(new Set(gnus).size === 7, 'maslul Option1 radios do not all select a game type', gnus.join(','));
  // Video mode toggles.
  await k.tap('.frm-ctrl--btnSeret', 0, 200, { quiet: true });
  await audit(k, 'maslul', { skip: '.frm-ctrl--btnReturn,.frm-ctrl--endof,.frm-ctrl--expo1,.frm-ctrl--video,.frm-ctrl--btnBitul,.frm-ctrl--Command3,.frm-ctrl--Option1', click: true, back: null });
  // Save & return (prompts for a name — the harness accepts the default).
  ctx.step('maslul/save');
  await k.eval(() => { window.__kmPrompt = window.prompt; window.prompt = () => 'מונקי ' + (Date.now() % 1000); });
  await k.tap('.frm-ctrl--btnReturn', 0, 800);
  await k.eval(() => { window.prompt = window.__kmPrompt; });
  await k.eval(() => { const inp = document.querySelector('input[type="text"]'); if (inp && inp.offsetParent) { inp.value = 'מונקי ' + Date.now() % 1000; const ok = [...document.querySelectorAll('button')].find(b => /אישור|שמור|OK/i.test(b.textContent) && b.offsetParent); if (ok) ok.click(); } });
  await ctx.sleep(700);
  const n1 = await k.eval(() => window.__kesemSession.editor.doc.maslul.length);
  ctx.check(n1 === n0 + 1, 'saving a new lesson does not add it', `${n0} → ${n1} lessons (screen ${await scr(k)})`);
  await ctx.shot('maslul-saved');
  return n1 > n0 ? n1 - 1 : null;
}

async function expoImpo(k) {
  const { ctx } = k;
  ctx.step('expo/open');
  await reload(k);
  await activ(k, 3, 800);
  await k.waitScreen('maslul', 4000);
  const ei = await k.eval(() => [...document.querySelectorAll('.frm-ctrl--expo1')].findIndex(e => e.dataset.index === '0'));
  await k.tap('.frm-ctrl--expo1', ei, 800);
  if (!ctx.check(await k.waitScreen('expo', 4000), 'expo1(0) does not open Expo', await scr(k))) return;
  await ctx.sleep(400);
  await ctx.checkImages();
  await ctx.shot('expo');
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'kesem-expo-'));
  const cdp = await ctx.page.target().createCDPSession();
  // Per-app runs use their own browser context — downloads must be allowed for it.
  const bcid = ctx.page.browserContext().id;
  await cdp.send('Browser.setDownloadBehavior', Object.assign({ behavior: 'allow', downloadPath: dl }, bcid ? { browserContextId: bcid } : {})).catch(e => ctx.finding('info', 'download behavior', String(e)));
  // Select two lessons, add, transmit.
  for (const j of [0, 1]) await k.tap('.frm-ctrl--List1 li', j, 250, { quiet: true });
  await k.tap('.frm-ctrl--Command1', 0, 300);
  const sel = await k.eval(() => document.querySelectorAll('.frm-ctrl--gamor li').length);
  ctx.check(sel >= 1, 'Expo "add" does not add to the export list', `${sel} rows`);
  await k.tap('.frm-ctrl--transmit', 0, 1500);
  await k.eval(() => { const b = [...document.querySelectorAll('button')].find(b => /אישור|הורד|OK/i.test(b.textContent) && b.offsetParent); if (b) b.click(); });
  let file = null;
  for (let t = 0; t < 20 && !file; t++) { await ctx.sleep(300); file = fs.readdirSync(dl).find(f => !f.endsWith('.crdownload')); }
  ctx.check(file, 'Expo transmit downloads nothing', dl);
  await ctx.shot('expo-transmitted');
  await audit(k, 'expo', { skip: '.frm-ctrl--transmit,.frm-ctrl--Label3', click: false });
  await chaos(k, 'expo', '.frm-ctrl--transmit,.frm-ctrl--Label3', null);
  // Back (Label3) → Maslul, then impo with the file we just exported.
  if ((await scr(k)) === 'expo') await k.tap('.frm-ctrl--Label3', 0, 600);
  if (!file) return;
  ctx.step('impo');
  if ((await scr(k)) !== 'maslul') { await reload(k); await activ(k, 3, 800); }
  const ii = await k.eval(() => [...document.querySelectorAll('.frm-ctrl--expo1')].findIndex(e => e.dataset.index === '1'));
  await k.tap('.frm-ctrl--expo1', ii, 800);
  if (!ctx.check(await k.waitScreen('impo', 4000), 'expo1(1) does not open Impo', await scr(k))) return;
  await ctx.sleep(400);
  await ctx.checkImages();
  await ctx.shot('impo');
  const json = fs.readdirSync(dl).find(f => /\.json$/i.test(f)) || file;
  const n0 = await k.eval(() => window.__kesemSession.editor.doc.maslul.length);
  const pickP = ctx.page.waitForFileChooser({ timeout: 4000 }).catch(() => null);
  await k.tap('#kesem-impo-pick', 0, 100, { quiet: true });
  const chooser = await pickP;
  if (ctx.check(chooser, 'impo "choose file" opens no file picker', '')) {
    await chooser.accept([path.join(dl, json)]);
    await ctx.sleep(1500);
    const st = await k.eval(() => { const e = document.getElementById('kesem-impo-status'); return e ? e.textContent : null; });
    const n1 = await k.eval(() => window.__kesemSession.editor.doc.maslul.length);
    ctx.check(/יובא בהצלחה/.test(st || ''), 'impo of an Expo bundle fails', `${json}: ${st}`);
    ctx.finding('info', 'impo result', `${json}: "${st}" lessons ${n0} → ${n1}`);
    await ctx.shot('impo-loaded');
  }
  await audit(k, 'impo', { click: false });
}

async function startMaslul(k) {
  const { ctx } = k;
  ctx.step('start_maslul/open');
  await reload(k);
  await activ(k, 4, 800);
  if (!ctx.check(await k.waitScreen('start_maslul', 4000), 'activ(4) does not open Start_Maslul', await scr(k))) return;
  await ctx.sleep(400);
  await ctx.checkImages();
  await ctx.shot('start_maslul');
  const back = async () => { await reload(k); await activ(k, 4, 800); };
  // Select a lesson, star it as a favourite, play it.
  await k.tap('.frm-ctrl--List1 li', 2, 300, { quiet: true });
  const d = await k.eval(() => ({ sel: window.__kesemSession.editor.smaslulIdx, spg: window.__km.visible('.frm-ctrl--SpG_l') }));
  ctx.check(d.sel === 2, 'Start_Maslul list click does not select', JSON.stringify(d));
  // List1 double-click pins the lesson into the first free favourite slot;
  // Label4(0) then selects it.
  const lp = await k.eval(() => window.__km.point('.frm-ctrl--List1 li', 2));
  await ctx.page.mouse.click(lp.x, lp.y, { clickCount: 2 });
  await ctx.sleep(300);
  await k.tap('.frm-ctrl--List1 li', 0, 200, { quiet: true });
  await k.tap('.frm-ctrl--Label4[data-index="0"]', 0, 300, { quiet: true });
  ctx.check((await k.eval(() => window.__kesemSession.editor.smaslulIdx)) === 2, 'favourite slot does not select its lesson', '');
  const fav = await k.eval(() => window.__kesemSession.editor.doc.favorites);
  ctx.finding('info', 'favourites after Label4(0)', JSON.stringify(fav).slice(0, 200));
  await audit(k, 'start_maslul', { skip: '.frm-ctrl--Command2[data-index="2"],.frm-ctrl--SSCommand1,.frm-ctrl--lbl_OK,.frm-ctrl--lbl_Out,.frm-ctrl--endof', back });
  // Play (lbl_OK).
  ctx.step('start_maslul/play');
  await back();
  await k.tap('.frm-ctrl--List1 li', 3, 300, { quiet: true });
  await k.tap('.frm-ctrl--lbl_OK', 0, 800);
  const s = await k.snap();
  if (ctx.check(/^game/.test(s.screen || '') || s.ov === 'video', 'Start_Maslul play does not start the lesson', s.screen)) {
    const res = await k.playPath('smaslul-play', {});
    if (res) { await k.closeNikod(); ctx.finding('info', 'Start_Maslul play returns to', await scr(k)); }
  }
  await back();
  await chaos(k, 'start_maslul', '.frm-ctrl--Command2,.frm-ctrl--SSCommand1,.frm-ctrl--lbl_Out,.frm-ctrl--endof', null);
}

async function editor(k) {
  const { ctx } = k;
  const doc = await lessonList(k);
  await freePlay(k, doc);
  await mainAlbum(k);
  await chgames(k);
  await gzira(k);
  await grEdit(k);
  const newIdx = await maslulEditor(k);
  if (newIdx != null) {
    // The lesson we just authored must show up on the Sst list and play.
    await reload(k);
    const L = await k.eval(i => { const m = window.__kesemSession.editor.doc.maslul[i]; return m && { i, name: m.name, mas: m.masFile || `new${i}`, n: (m.stages || []).length }; }, newIdx);
    if (ctx.check(L && L.n >= 2, 'authored lesson missing / empty on Sst', JSON.stringify(L))) await playLesson(k, L, {});
  }
  await expoImpo(k);
  await startMaslul(k);
  await reload(k);
  await lessons(k, doc);
  await reload(k);
}

module.exports = {
  run: ctx => runApp(ctx, 'Kesem', {
    ramas: [],
    exitSel: '.frm-ctrl--activ[data-index="__none__"]',
    finalExit: false,
    sideScreens: false,              // no exit / rama tabs / seret / mashal on the editor's Sst
    entry: async k => {
      extra.install(k, { hak: true, hint: true });
      await k.ctx.page.evaluateOnNewDocument(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    },
    extra: editor,
  }),
  editor, lessonList, lessons, freePlay, mainAlbum, chgames, gzira, grEdit, maslulEditor, expoImpo, startMaslul, audit,
};
