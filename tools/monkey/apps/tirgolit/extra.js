// Regression probes, teacher/admin screens, Sketch, and the random monkey.
const C = require('./common');
const F = require('./flow');
const { sleep, app, clickSel, text, until, peek, typeChar } = C;

const firstUnit = ctx => ctx.eval(() => ({ tab: 0, uid: String(UNITS_DATA.levels[0].units[0]) }));
async function toGList(ctx, u) { await F.recover(ctx); return C.openUnit(ctx, u.tab, u.uid); }
async function startSlot(ctx, slot) {
  await clickSel(ctx, `#glist-row-${slot}`, 60);
}
async function exitViaMenu(ctx) {
  return C.openMenuExit(ctx);
}
async function timerSecs(ctx) {
  const t = await text(ctx, '#game-timer'); const m = /(\d+):(\d+)/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : -1;
}

// 1. Switching tabs must start the new list at the top.
async function tabScroll(ctx, P) {
  ctx.step(`${P}/probe-tab-scroll`);
  await F.recover(ctx);
  await clickSel(ctx, '#u-tab-0', 100);
  for (let i = 0; i < 4; i++) await clickSel(ctx, '.u-scroll-dn', 20);
  await clickSel(ctx, '#u-tab-1', 150);
  const st = await ctx.eval(() => document.getElementById('u-list').scrollTop);
  ctx.check(st === 0, 'new tab opens scrolled into the middle', `u-list scrollTop=${st} after switching tab (rows 1..n hidden)`);
  if (st) await ctx.shot('tab-scroll');
}

// 2. Leaving / restarting a game during its intro must not leave its timers
//    running (double-speed clock, rows painted into a hidden screen).
async function introLeak(ctx, P) {
  const u = await firstUnit(ctx);
  for (const slot of [0, 1, 4]) {
    ctx.step(`${P}/probe-intro-restart-s${slot}`);
    await toGList(ctx, u);
    await startSlot(ctx, slot);
    await ctx.page.keyboard.press('Escape'); await sleep(30);
    await clickSel(ctx, '#mmenu-g-restart', 30);            // restart while the intro is still running
    await sleep(1800 / C.SPEED + 400);
    const a = await timerSecs(ctx); await sleep(4000 / C.SPEED * 1.0 + 50); const b = await timerSecs(ctx);
    const rate = (b - a) / 4;                                  // game-seconds per game-second
    ctx.check(rate < 1.5, `${C.SLOT_NAMES[slot]}: clock runs ${rate.toFixed(1)}× after restart during intro`,
      `timer ${a}s → ${b}s over 4 game-seconds (leaked intro setTimeout started a 2nd interval)`);
    await exitViaMenu(ctx); await sleep(200);

    ctx.step(`${P}/probe-intro-exit-s${slot}`);
    await startSlot(ctx, slot);
    await exitViaMenu(ctx);                                   // exit during the intro
    const t1 = await text(ctx, '#game-timer'); const rows1 = await ctx.eval(() => document.getElementById('game-rows').children.length);
    await sleep(2500 / C.SPEED + 600);
    const t2 = await text(ctx, '#game-timer'); const rows2 = await ctx.eval(() => document.getElementById('game-rows').children.length);
    const a2 = await app(ctx);
    ctx.check(a2.glist && t1 === t2 && rows2 === rows1, `${C.SLOT_NAMES[slot]}: game keeps running after exit during intro`,
      `on ${a2.screen}/glist=${a2.glist}; hidden timer ${t1} → ${t2}, rows ${rows1} → ${rows2}`);
  }
}

// 3. Exiting right after the last answer must not pop the score screen up
//    over the GList a moment later.
async function lateScore(ctx, P) {
  const u = await firstUnit(ctx);
  for (const slot of [0, 1, 4]) {
    ctx.step(`${P}/probe-late-score-s${slot}`);
    await toGList(ctx, u);
    await startSlot(ctx, slot);
    await sleep(1800 / C.SPEED + 200);
    const t0 = Date.now(); let done = false;
    while (!done && Date.now() - t0 < 60000) {
      if (slot === 0) {
        const s = await peek(ctx, 'game');
        if (!s.target) { await sleep(15); continue; }
        const left = s.matched.filter(m => !m).length;
        const last = left === 1 && (s.sceneIndex + 1) * 8 >= s.total;
        const i = s.scene.findIndex((p, k) => !s.matched[k] && p.answer === s.target.matchAnswer);
        await clickSel(ctx, `#game-rows .q-row[data-idx="${i}"]`, 0);
        if (last) done = true; else await until(ctx, m => window.__tirgolit.game().matched.filter(x => !x).length !== m || !window.__tirgolit.game().target, 2000, left);
      } else if (slot === 1) {
        const s = await peek(ctx, 't2');
        if (s.blocked || s.typedCount >= s.tshP.length) { await sleep(15); continue; }
        const last = s.tshNom === s.scene.length - 1 && (s.sceneIndex + 1) * 8 >= s.total && s.typedCount === s.tshP.length - 1;
        await typeChar(ctx, s.tshP[s.typedCount]);
        if (last) done = true; else await sleep(10);
      } else {
        const s = await peek(ctx, 't3');
        if (!s.scene.length) { await sleep(15); continue; }
        if (s.phase === 1) { await clickSel(ctx, `#game-rows .t3-row[data-idx="${s.targetRow}"]`, 20); continue; }
        if (s.typedSoFar.length >= s.realAnswer.length) { await sleep(15); continue; }
        const ch = s.realAnswer[s.typedSoFar.length];
        const last = s.sceneIdx === 7 && s.typedSoFar.length === s.realAnswer.length - 1;
        await typeChar(ctx, ch);
        const moved = await until(ctx, n => window.__tirgolit.t3().typedSoFar.length !== n || window.__tirgolit.t3().phase !== 2, 800, s.typedSoFar.length);
        if (!moved) { ctx.finding('warn', 'late-score probe could not type', `${ch} in ${s.realAnswer}`); break; }
        if (last) done = true;
      }
    }
    await exitViaMenu(ctx);
    await sleep(2500 / C.SPEED + 500);
    const a = await app(ctx);
    ctx.check(a.screen === 'units' && a.glist, `${C.SLOT_NAMES[slot]}: score screen pops up after exiting`,
      `exited right after the last answer, now on ${a.screen} (glist=${a.glist})`);
    if (a.screen !== 'units' || !a.glist) await ctx.shot(`late-score-s${slot}`);
  }
}

// 4. Keys pressed during the Tirgol2 intro or on the score screen afterwards
//    must not cost penalty / play the "wrong" sound.
async function typingStrayKeys(ctx, P) {
  const u = await firstUnit(ctx);
  ctx.step(`${P}/probe-t2-stray-keys`);
  await toGList(ctx, u);
  await startSlot(ctx, 1);
  await sleep(50);
  await typeChar(ctx, '5'); await typeChar(ctx, '5');               // during the intro
  await sleep(1800 / C.SPEED + 200);
  const s = await peek(ctx, 't2');
  ctx.check(s.penalty === 0, 'Tirgol2: keys during the intro are penalised', `penalty ${s.penalty} before the first row was shown`);
  await exitViaMenu(ctx); await sleep(150);

  // play a full correct game, then type on the score screen
  await startSlot(ctx, 1);
  await sleep(1800 / C.SPEED + 200);
  const t0 = Date.now();
  while (Date.now() - t0 < 60000 && (await app(ctx)).screen !== 'score') {
    const g = await peek(ctx, 't2');
    if (g.blocked || g.typedCount >= g.tshP.length) { await sleep(15); continue; }
    await typeChar(ctx, g.tshP[g.typedCount]); await sleep(5);
  }
  await sleep(300);
  const before = await peek(ctx, 't2'); const tr = ctx.traceLen();
  for (const ch of '123') await typeChar(ctx, ch);
  await sleep(200);
  const after = await peek(ctx, 't2');
  const wrongSnd = ctx.traceSince(tr).filter(l => /audio play .*1ra/.test(l)).length;
  ctx.check(after.penalty === before.penalty && !wrongSnd, 'Tirgol2: typing on the score screen still plays the game',
    `penalty ${before.penalty}→${after.penalty}, "wrong" sound played ${wrongSnd}× on the score screen`);
  await clickSel(ctx, '.sc-exit-btn', 200);
}

// 5. Tirgol3 clock restarts from 0:00 on every new game.
async function t3Timer(ctx, P) {
  const u = await firstUnit(ctx);
  ctx.step(`${P}/probe-t3-timer`);
  await toGList(ctx, u);
  await startSlot(ctx, 4);
  await sleep(1800 / C.SPEED + 3000 / C.SPEED + 200);
  await exitViaMenu(ctx); await sleep(100);
  await startSlot(ctx, 4);
  await sleep(1800 / C.SPEED + 1100 / C.SPEED + 100);
  const s = await timerSecs(ctx);
  ctx.check(s <= 2, 'Tirgol3: clock does not restart for a new game', `shows ${s}s ~1s into the second game`);
  await exitViaMenu(ctx);
}

// 6. Scores of one product must not show up in the other product's GList
//    (T1 and T2 share unit ids 1..90).
async function productBleed(ctx, P) {
  ctx.step(`${P}/probe-product-bleed`);
  await F.recover(ctx);
  const other = P === 't1' ? 't2' : 't1';
  const played = await ctx.eval(prod => {
    const s = JSON.parse(localStorage.tirgolit_users)[window.__tirgolit.app().user].scores;
    return [...new Set(Object.keys(s).filter(k => k.startsWith(prod + '/') && /_s\d$/.test(k)).map(k => k.slice(3).split('_')[0]))];
  }, P);
  await clickSel(ctx, '#u-product-badge', 200);
  await clickSel(ctx, `.product-card-${other}`, 300);
  const levels = await ctx.eval(() => UNITS_DATA.levels.map(l => l.units.map(String)));
  let checked = 0;
  for (const uid of played) {
    const tab = levels.findIndex(l => l.includes(uid));
    if (tab < 0) continue;
    if (!await C.openUnit(ctx, tab, uid)) continue;
    const badges = await ctx.eval(() => [0, 1, 2, 3, 4, 5].map(i => document.getElementById('glist-snum-' + i).textContent).join(','));
    const best = await text(ctx, '#glist-bestscore');
    ctx.check(badges === ',,,,,' && !/\d/.test(best), `${P} scores shown in ${other}`,
      `unit ${uid} never played in ${other} but GList shows badges [${badges}] best "${best}"`);
    if (++checked === 1 && badges !== ',,,,,') await ctx.shot('product-bleed');
    await clickSel(ctx, '.glist-exit', 100);
    if (checked >= 3) break;
  }
  await clickSel(ctx, '#u-product-badge', 200);
  await clickSel(ctx, `.product-card-${P}`, 300);
}

// 7. Teacher password (#59 item 5), student manager, lesson + bank editors.
async function tmsgAnswer(ctx, value, ok = true) {
  if (!await until(ctx, () => document.getElementById('tmsg-overlay').style.display === 'flex', 2000)) return false;
  if (value !== null) {
    await ctx.page.$eval('#tmsg-input', (e, v) => { e.value = v; }, value);
  }
  await clickSel(ctx, ok ? '#tmsg-ok' : '#tmsg-cancel', 150);
  return true;
}
async function dismissMsgs(ctx) {
  for (let i = 0; i < 3; i++) {
    if (!await ctx.eval(() => document.getElementById('tmsg-overlay').style.display === 'flex')) return;
    await clickSel(ctx, '#tmsg-ok', 100);
  }
}
async function toLogin(ctx) {
  await F.recover(ctx);
  const a = await app(ctx);
  if (a.screen === 'units') await clickSel(ctx, '.u-exit', 200);
  if (a.screen === 'usermgmt') await clickSel(ctx, '.um-exit', 200);
}

async function adminScreens(ctx, P) {
  ctx.step(`${P}/admin-password`);
  await toLogin(ctx);
  await ctx.checkImages();
  // blank password must be refused
  const zones = await ctx.page.$$('.admin-zone');
  const zoneBox = async i => zones[i].boundingBox();
  let b = await zoneBox(1); await ctx.click(b.x + b.width / 2, b.y + b.height / 2, 150);
  await tmsgAnswer(ctx, '');
  await dismissMsgs(ctx);
  ctx.check((await app(ctx)).screen === 'login', 'blank teacher password accepted', 'student manager opened with an empty password');
  // right password → student manager
  b = await zoneBox(1); await ctx.click(b.x + b.width / 2, b.y + b.height / 2, 150);
  await tmsgAnswer(ctx, '777');
  ctx.step(`${P}/student-manager`);
  if (!ctx.check((await app(ctx)).screen === 'usermgmt', 'student manager did not open with 777', '')) return;
  await ctx.checkImages(); await ctx.shot('usermgmt');
  const names = () => ctx.eval(() => [...document.querySelectorAll('#um-list .um-uitem')].map(e => e.dataset.name));
  ctx.check((await names()).includes(F.USER), 'student missing from manager list', JSON.stringify(await names()));
  const avg = await ctx.eval(() => [...document.querySelectorAll('#um-slist .um-sitem')].map(e => e.textContent));
  ctx.check(avg.some(t => /\d/.test(t)), 'student manager shows no average for a student who played', JSON.stringify(avg));
  const lessons = await ctx.eval(u => new Set(Object.keys(JSON.parse(localStorage.tirgolit_users)[u].scores)
    .filter(k => /^t[12]\/.+_s\d+$/.test(k)).map(k => k.replace(/_s\d+$/, ''))).size, F.USER);
  const shownCount = await ctx.eval(n => { const i = [...document.querySelectorAll('#um-list .um-uitem')].findIndex(e => e.dataset.name === n);
    const t = document.querySelectorAll('#um-slist .um-sitem')[i]; return t ? t.textContent : ''; }, F.USER);
  ctx.check(new RegExp('\\(' + lessons + '\\)').test(shownCount), 'student manager lesson count wrong',
    `shows "${shownCount}" for ${lessons} lessons played`);
  await clickSel(ctx, '#um-cmd-add', 100); await tmsgAnswer(ctx, 'תלמיד בדיקה');
  ctx.check((await names()).includes('תלמיד בדיקה'), 'add student failed', '');
  await clickSel(ctx, '#um-cmd-add', 100); await tmsgAnswer(ctx, 'תלמיד בדיקה');     // duplicate → error msg
  ctx.check((await names()).filter(n => n === 'תלמיד בדיקה').length === 1, 'duplicate student added', '');
  await dismissMsgs(ctx);
  await clickSel(ctx, '#um-cmd-detail', 100); await dismissMsgs(ctx);                  // nothing selected → msg
  await clickSel(ctx, `#um-list .um-uitem[data-name="${F.USER}"]`, 80);
  await clickSel(ctx, '#um-cmd-detail', 150); await ctx.shot('usermgmt-detail'); await dismissMsgs(ctx);
  await clickSel(ctx, '#um-cmd-selall', 60); await clickSel(ctx, '#um-cmd-clrall', 60);
  await clickSel(ctx, '#um-list .um-uitem[data-name="תלמיד בדיקה"]', 80);
  await clickSel(ctx, '#um-cmd-reset', 100); await tmsgAnswer(ctx, null, true);
  await clickSel(ctx, '#um-list .um-uitem[data-name="תלמיד בדיקה"]', 80);
  await clickSel(ctx, '#um-cmd-del', 100); await tmsgAnswer(ctx, null, true);
  ctx.check(!(await names()).includes('תלמיד בדיקה'), 'delete student failed', '');
  await clickSel(ctx, '.um-ques', 150); await ctx.shot('usermgmt-help'); await clickSel(ctx, '.um-minhal-close', 100);
  // blank new password must not switch the password prompt off
  await clickSel(ctx, '#um-cmd-pass', 100); await tmsgAnswer(ctx, '   '); await dismissMsgs(ctx);
  await clickSel(ctx, '.um-exit', 200);
  b = await zoneBox(1); await ctx.click(b.x + b.width / 2, b.y + b.height / 2, 200);
  const prompted = await ctx.eval(() => document.getElementById('tmsg-overlay').style.display === 'flex');
  ctx.check(prompted || (await app(ctx)).screen !== 'usermgmt', 'blank teacher password accepted',
    'after "change password" to blank, the student manager opens with no password at all');
  if (prompted) await tmsgAnswer(ctx, null, false);
  else { await clickSel(ctx, '.um-exit', 200); }
  await ctx.eval(() => localStorage.removeItem('tirgolit_admin_pass'));

  // Teacher login (UnM zone) → units with edit panel → lesson editor.
  ctx.step(`${P}/lesson-editor`);
  b = await zoneBox(0); await ctx.click(b.x + b.width / 2, b.y + b.height / 2, 150);
  await tmsgAnswer(ctx, '777');
  await until(ctx, () => document.getElementById('product-overlay').style.display === 'flex', 2000);
  await clickSel(ctx, `.product-card-${P}`, 300);
  ctx.check((await app(ctx)).user === 'מורה' && await ctx.eval(() => document.getElementById('u-editp').style.display === 'block'),
    'teacher login did not show the edit panel', '');
  await ctx.shot('teacher-units');
  await clickSel(ctx, '#u-ep-new', 200);
  await ctx.checkImages(); await ctx.shot('lesson-editor');
  const src = await ctx.eval(() => String(UNITS_DATA.levels[0].units[0]));
  await ctx.page.select('#led-unit-sel', src);
  await sleep(100);
  const nRows = await ctx.eval(() => document.querySelectorAll('#led-lista .led-lista-row').length);
  for (let i = 1; i <= Math.min(8, nRows); i++) await clickSel(ctx, `#led-lista .led-lista-row:nth-child(${i})`, 30);
  await ctx.page.focus('#led-expr'); await ctx.page.keyboard.type('7*8');
  const auto = await ctx.eval(() => document.getElementById('led-auto').value);
  ctx.check(auto === '56', 'lesson editor auto-answer wrong', `7*8 → "${auto}"`);
  await ctx.page.keyboard.press('Enter');
  await ctx.page.focus('#led-expr'); await ctx.page.keyboard.type('2+');   // invalid → must be refused
  await clickSel(ctx, '.led-addbtn', 100); await dismissMsgs(ctx);
  const qs = await ctx.eval(() => [...document.querySelectorAll('#led-listq .led-listq-row')].map(r => r.textContent));
  ctx.check(qs.length === Math.min(8, nRows) + 1 && qs.some(q => /7\*8=56/.test(q)), 'lesson editor question list wrong', JSON.stringify(qs));
  await ctx.page.$eval('#led-expr', e => { e.value = ''; });
  await ctx.page.focus('#led-nunit'); await ctx.page.keyboard.type('שיעור קוף');
  await ctx.shot('lesson-editor-filled');
  await clickSel(ctx, '#led-savel', 200); await dismissMsgs(ctx);
  ctx.check(await ctx.eval(() => document.getElementById('lesson-editor').style.display === 'none'), 'lesson editor did not close after save', '');
  await clickSel(ctx, '#u-tab-3', 200);
  const custom = await ctx.eval(() => [...document.querySelectorAll('#u-list .u-row')].filter(r => /שיעור קוף/.test(r.textContent)).map(r => r.dataset.uid));
  if (ctx.check(custom.length === 1, 'saved lesson not listed under שיעורים נוספים', JSON.stringify(custom))) {
    ctx.step(`${P}/custom-lesson-play`);
    if (await C.openUnit(ctx, 3, custom[0])) {
      await C.playSlot(ctx, P, 3, custom[0], 0, { shots: true, log: () => {} });
      await C.playSlot(ctx, P, 3, custom[0], 1, { shots: false, log: () => {} });
      await clickSel(ctx, '.glist-exit', 150);
    }
    // rename + delete
    await clickSel(ctx, '#u-tab-3', 150);
    await clickSel(ctx, `#u-list .u-row[data-uid="${custom[0]}"]`, 80);
    await clickSel(ctx, '#u-ep-delete', 100); await tmsgAnswer(ctx, null, true);
    ctx.check(!(await ctx.eval(u => !!document.querySelector(`#u-list .u-row[data-uid="${u}"]`), custom[0])), 'custom lesson not deleted', '');
  }

  ctx.step(`${P}/bank-editor`);
  await clickSel(ctx, '#u-ep-dict', 200);
  await ctx.checkImages(); await ctx.shot('bank-editor');
  const n0 = await ctx.eval(() => document.querySelectorAll('#bed-listq0 .bed-listq-row').length);
  ctx.check(n0 > 0, 'bank editor is empty', '');
  await ctx.page.focus('#bed-expr'); await ctx.page.keyboard.type('3+4');
  ctx.check(await ctx.eval(() => document.getElementById('bed-answer').value) === '7', 'bank editor auto-answer wrong', '');
  await clickSel(ctx, '.bed-okbtn', 100);
  await clickSel(ctx, 'img[onclick="appBank_save()"]', 100);
  await clickSel(ctx, '.bed-gbtn', 150);                          // close
  await clickSel(ctx, '#u-ep-dict', 200);
  const n1 = await ctx.eval(() => document.querySelectorAll('#bed-listq0 .bed-listq-row').length);
  ctx.check(n1 === n0 + 1, 'bank editor did not keep the new question', `${n0} → ${n1}`);
  await clickSel(ctx, '.bed-gbtn', 150);
  await clickSel(ctx, '#u-ep-help', 150); await ctx.shot('teacher-help'); await clickSel(ctx, '.units-lamoreh-close', 100);
  await clickSel(ctx, '.u-exit', 200);                            // back to login
}

// 8. Login screen overlays.
async function loginOverlays(ctx, P) {
  ctx.step(`${P}/login-overlays`);
  await toLogin(ctx);
  await clickSel(ctx, '.lbtn-help', 400); await ctx.shot('login-help-video'); await clickSel(ctx, '.login-help-close', 150);
  await clickSel(ctx, '.lbtn-caf2', 200); await ctx.shot('login-manual'); await clickSel(ctx, '.login-manual-close', 150);
  await clickSel(ctx, '.lbtn-exit', 200); await ctx.shot('login-exit'); await clickSel(ctx, '.msgx-no', 150);
  await clickSel(ctx, '.lbtn-ques', 150);
  ctx.check((await app(ctx)).screen === 'login', 'login overlay left the login screen', '');
}

async function relogin(ctx, P) {
  await toLogin(ctx);
  await clickSel(ctx, `.login-uitem[data-name="${F.USER}"] span`, 100);
  await clickSel(ctx, '.lbtn-ok', 300);
  await clickSel(ctx, `.product-card-${P}`, 300);
  return (await app(ctx)).screen === 'units';
}

// 9. Sketch (Tirgolit2): opens over a game with the exercise the student
//    can see (never the one to be found), takes keys, closes.
async function sketch(ctx, P) {
  const u = await firstUnit(ctx);
  for (const slot of [0, 3, 1]) {
    ctx.step(`${P}/sketch-s${slot}`);
    await toGList(ctx, u);
    await startSlot(ctx, slot);
    await sleep(1800 / C.SPEED + 300);
    const vis = await ctx.eval(() => getComputedStyle(document.getElementById('game-sketch-btn')).display !== 'none');
    if (!ctx.check(vis === (P === 't2'), 'sketch button visibility wrong', `visible=${vis} in ${P}`) || P !== 't2') { await exitViaMenu(ctx); return; }
    const g = slot === 1 ? await peek(ctx, 't2') : await peek(ctx, 'game');
    const title = await text(ctx, '#game-unit-title');
    await clickSel(ctx, '#game-sketch-btn', 300);
    const cap = await text(ctx, '#sketch-expr');
    const want = slot === 0 ? g.target.value : slot === 1 ? g.scene[g.tshNom].expr + ' =' : title;
    ctx.check(cap === want, 'Sketch opened with the wrong exercise', `slot ${slot}: caption "${cap}", expected "${want}"`);
    if (slot === 0) { await ctx.checkImages(); await ctx.shot('sketch-open'); }
    for (const ch of '12') await typeChar(ctx, ch);
    await clickSel(ctx, '#sketch-keybd .sk-key:nth-child(5)', 60);
    const after = slot === 1 ? await peek(ctx, 't2') : await peek(ctx, 'game');
    ctx.check(after.penalty === g.penalty, 'keys typed into Sketch leak into the game', `penalty ${g.penalty}→${after.penalty}`);
    if (slot === 0) await ctx.shot('sketch-typed');
    await clickSel(ctx, '#sketch-btn-close', 150);
    ctx.check(await ctx.eval(() => document.getElementById('sketch-overlay').style.display === 'none'), 'sketch did not close', '');
    await exitViaMenu(ctx);
  }
}

// 10. Random monkey on each screen type + audio overlap (#59 item 3).
async function chaos(ctx, P) {
  const u = await firstUnit(ctx);
  const avoid = '.msgx-yes,.lbtn-exit,.u-exit,.um-exit,.admin-zone,#vk-toggle,#u-product-badge,.product-back-btn,.u-ep-area';
  for (const slot of [0, 1, 3, 4, 5, 6]) {
    ctx.step(`${P}/monkey-s${slot}`);
    await toGList(ctx, u);
    await startSlot(ctx, slot);
    await sleep(800);
    await ctx.monkey({ n: ctx.quick ? 25 : 60, wait: 40, avoid, randomTapRate: 0.3 });
    const KEYS = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab', 'Space'];
    for (let i = 0; i < 16; i++) {
      if (ctx.rand() < 0.5) await typeChar(ctx, String(Math.floor(ctx.rand() * 10)));
      else await ctx.page.keyboard.press(ctx.pick(KEYS));
      await sleep(30);
    }
    // Enter straight away on a fresh target (no arrow navigation first).
    await sleep(700); await ctx.page.keyboard.press('Enter'); await sleep(100);
    await ctx.shot(`monkey-s${slot}`);
    await ctx.assertAlive(`slot ${slot} after monkey`, 800);
    await F.recover(ctx);
    const a = await app(ctx);
    ctx.check(a.screen === 'units', 'could not get back out of a game after monkey', `on ${a.screen}`);
  }
  ctx.step(`${P}/monkey-menus`);
  await F.recover(ctx);
  await ctx.monkey({ n: ctx.quick ? 30 : 80, wait: 30, avoid, randomTapRate: 0.2 });
  await ctx.shot('monkey-menus');
  await ctx.assertAlive('menus after monkey', 800);
  const ov = await ctx.eval(() => window.__monkeyAudio.overlaps.slice(0, 5));
  ctx.check(!ov.length, 'overlapping audio (#59)', ov.map(p => p.map(s => s.split('/').pop()).join(' + ')).join('; '));
  const errs = ctx.log.trace.filter(l => /audio error/.test(l));
  ctx.check(!errs.length, 'audio failed to load', [...new Set(errs)].slice(0, 5).join(' | '));
}


// 11. Touch keypad (vkeyboard.js): every character any answer needs must be
//     on it, and a typing game must be playable with taps alone.
async function touchKeypad(ctx, P) {
  ctx.step(`${P}/probe-touch-keypad`);
  const need = await ctx.eval(() => {
    const m = {};
    for (const [uid, u] of Object.entries(UNITS_DATA.units)) for (const q of u.questions)
      for (const c of q.answer) if (!/\d/.test(c)) (m[c] = m[c] || []).push(uid);
    return Object.fromEntries(Object.entries(m).map(([c, l]) => [c, [...new Set(l)].slice(0, 6)]));
  });
  const labels = await ctx.eval(() => [...document.querySelectorAll('#vk-panel .vk-key')].map(k => k.dataset.char || k.textContent));
  for (const [c, units] of Object.entries(need)) {
    ctx.check(labels.includes(c) || labels.includes({ '*': '×', '/': '÷', '-': '−' }[c]), 'touch keypad lacks a key answers need',
      `"${c}" (units ${units.join(',')}) — keypad has ${labels.join(' ')}`);
  }
  // Play a Tirgol2 typing game with taps only.
  const uid = P === 't1' ? '21' : '45';
  const levels = await ctx.eval(() => UNITS_DATA.levels.map(l => l.units.map(String)));
  const tab = levels.findIndex(l => l.includes(uid));
  if (tab < 0 || !await toGList(ctx, { tab, uid })) return;
  await startSlot(ctx, 1);
  await sleep(1800 / C.SPEED + 200);
  if (!await ctx.eval(() => document.getElementById('vk-panel').classList.contains('vk-open'))) await clickSel(ctx, '#vk-toggle', 100);
  await ctx.shot('touch-keypad');
  const t0 = Date.now();
  while (Date.now() - t0 < 60000 && (await app(ctx)).screen === 'game') {
    const g = await peek(ctx, 't2');
    if (g.blocked || g.typedCount >= g.tshP.length) { await sleep(15); continue; }
    const ch = g.tshP[g.typedCount];
    const key = await ctx.page.evaluateHandle(c => [...document.querySelectorAll('#vk-panel .vk-key')]
      .find(k => (k.dataset.char || k.textContent) === c || ({ '*': '×', '/': '÷', '-': '−' }[c] === k.textContent)), ch);
    const el = key.asElement();
    if (!el) { ctx.finding('error', 'touch keypad: answer cannot be typed', `${P} unit ${uid}: no key for "${ch}" in "${g.tshP}" — game stuck on touch devices`); break; }
    const bb = await el.boundingBox();
    await ctx.page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await sleep(15);
  }
  await ctx.eval(() => { try { localStorage.setItem('tirgolit_vk_open', '0'); } catch {} });
  if ((await app(ctx)).screen === 'score') await clickSel(ctx, '.sc-exit-btn', 200);
  else await C.openMenuExit(ctx);
}

// 12. One tap on a touch screen = one answer (rows listen to touchstart AND
//     the click the browser synthesises from the same tap).
async function touchTap(ctx, P) {
  ctx.step(`${P}/probe-touch-tap`);
  const u = await firstUnit(ctx);
  await toGList(ctx, u);
  const cdp = await ctx.page.target().createCDPSession();   // setViewport({hasTouch}) would reload the page
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  try {
    await startSlot(ctx, 0);
    if (!await until(ctx, () => window.__tirgolit.game().target && document.querySelector('#game-rows .q-row'), 5000)) return;
    const s = await peek(ctx, 'game');
    const perWrong = Math.max(1, Math.round(5 - s.total / 8));
    const wrong = s.scene.findIndex((p, i) => !s.matched[i] && p.answer !== s.target.matchAnswer);
    if (wrong < 0) return;
    const b = await C.box(ctx, `#game-rows .q-row[data-idx="${wrong}"]`);
    const tr = ctx.traceLen();
    await ctx.page.touchscreen.tap(b.x, b.y);
    await sleep(300);
    const clicked = ctx.traceSince(tr).some(l => / click /.test(l));
    const s2 = await peek(ctx, 'game');
    ctx.check(s2.penalty === s.penalty + perWrong, 'one tap on a wrong plank is counted twice',
      `penalty ${s.penalty} → ${s2.penalty} for a single tap (expected +${perWrong}; synthesized click seen: ${clicked})`);
  } finally {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await exitViaMenu(ctx);
  }
}

// 13. Keyboard play in Tirgol1: Enter/arrows on a fresh target.
async function keyboardPlay(ctx, P) {
  const u = await firstUnit(ctx);
  for (const slot of [0, 3]) {
    ctx.step(`${P}/probe-keyboard-s${slot}`);
    await toGList(ctx, u);
    await startSlot(ctx, slot);
    if (!await until(ctx, () => window.__tirgolit.game().target && document.querySelector('#game-rows .q-row'), 5000)) continue;
    await sleep(100);
    const e0 = ctx.log.errors.length;
    const s = await peek(ctx, 'game');
    await ctx.page.keyboard.press('Enter'); await sleep(100);
    const s1 = await peek(ctx, 'game');
    ctx.check(ctx.log.errors.length === e0, 'Enter before choosing a plank throws', (ctx.log.errors[e0] || {}).msg || '');
    ctx.check(s1.penalty === s.penalty && s1.matched.filter(Boolean).length === 0, 'Enter with no plank chosen counted as an answer', `penalty ${s.penalty}→${s1.penalty}`);
    // Arrow to the right plank and press Enter.
    const right = s.scene.findIndex((p, i) => !s.matched[i] && p.answer === s.target.matchAnswer);
    for (let i = 0; i <= right; i++) { await ctx.page.keyboard.press('ArrowDown'); await sleep(30); }
    await until(ctx, () => !window.__tirgolit.game().anim, 2000);
    await ctx.page.keyboard.press('Enter'); await sleep(150);
    const s2 = await peek(ctx, 'game');
    ctx.check(s2.matched[right], 'arrow keys + Enter cannot answer', `ArrowDown×${right + 1} then Enter; matched=${JSON.stringify(s2.matched)} penalty ${s2.penalty}`);
    await exitViaMenu(ctx);
  }
}

async function all(ctx, P, log) {
  const steps = [tabScroll, introLeak, lateScore, typingStrayKeys, t3Timer, productBleed, touchKeypad, touchTap, keyboardPlay, adminScreens, loginOverlays, sketch, chaos];
  for (const fn of steps) {
    try {
      if (fn === loginOverlays || fn === sketch) await relogin(ctx, P);
      if (fn === sketch && (await app(ctx)).screen !== 'units') await relogin(ctx, P);
      await fn(ctx, P);
    } catch (e) {
      ctx.finding('error', `probe ${fn.name} crashed`, String(e && e.stack || e));
      await ctx.shot('probe-crash').catch(() => {});
    }
    if (fn === adminScreens) await relogin(ctx, P);
    log(`${P}: probe ${fn.name} done`);
  }
}

module.exports = { all };
