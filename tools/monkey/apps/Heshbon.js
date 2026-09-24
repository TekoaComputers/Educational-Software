// Heshbon — shared Kesem walker (../kesem.js) for the 3 ramas × 5 paths, plus
// the Heshbon-only side screens:
//   * hyju (top-right "X", Sst.hyju_Click → Ezia) is the exit — no CmdExit;
//   * avi(0..4) camera labels over each path window (\avi\_<rama><i>.avi);
//   * Picture2 (ladybug) → the Lmath mini-game (js/apps/Heshbon.lmath.js):
//     start screen, the 3 preset levels played to WIN (one with deliberate
//     wrong answers: push / announce / blink), the custom-settings form
//     (Form2: sliders, pa2<pa1 clamp, layout clipping #85, selectable text
//     #86), a fast custom game played to LOSE, play-again, pause/resume, the
//     help hotspot, keyboard input on the end screens, ESC and the × exit.
const { runApp } = require('../kesem');

async function lstate(k) {
  return k.eval(() => {
    const st = window.LmathGame && window.LmathGame._debug.state();
    const stage = document.querySelector('.lmath-stage');
    const bg = stage ? (stage.style.backgroundImage.match(/([\w-]+)\.(?:png|webp)/) || [])[1] : null;
    if (!st) return { bg, none: true };
    return { bg, sivov: st.sivov, tur: st.params.tur, NomStl: st.NomStl, need: st.columns[st.NomStl], columns: st.columns.slice(),
             params: Object.assign({}, st.params), paused: st.paused, x: st.ladybugX, wrong: st.wrongCount,
             eaten: document.querySelectorAll('.lmath-flower.lmath-eaten').length };
  });
}
const bgIs = (k, name, ms = 4000) => k.ctx.waitFor(n => { const s = document.querySelector('.lmath-stage'); return s && /\/([\w-]+)\.(?:png|webp)/.test(s.style.backgroundImage) && s.style.backgroundImage.match(/\/([\w-]+)\.(?:png|webp)/)[1] === n; }, ms, name);

/** Anything inside `sel` boxes that sticks out of its box, or is text-selectable. */
async function layoutProblems(k, sel) {
  return k.eval(q => {
    const out = [];
    for (const box of document.querySelectorAll(q)) {
      const b = box.getBoundingClientRect();
      for (const c of box.querySelectorAll('*')) {
        const r = c.getBoundingClientRect();
        if (!r.width) continue;
        if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1)
          out.push(`${c.tagName.toLowerCase()} "${(c.textContent || '').trim()}" sticks out of ${q} (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(b.left)}..${Math.round(b.right)})`);
      }
      if (getComputedStyle(box).userSelect !== 'none') out.push(`${q} text is selectable (user-select: ${getComputedStyle(box).userSelect})`);
    }
    return out;
  }, sel);
}

async function answer(k, digit) {
  const ok = await k.tap(`.lmath-cmda[data-digit="${digit}"]`, 0, 60, { quiet: true });
  if (!ok) await k.eval(d => window.dispatchEvent(new KeyboardEvent('keydown', { key: String(d) })), digit);
  // cmda buttons re-enable 250 ms after each press.
  await k.ctx.waitFor(() => { const b = document.querySelector('.lmath-cmda'); return !b || !b.disabled || !window.LmathGame._debug.state(); }, 3000);
}

/** Play the current Lmath game to the win screen. wrongs: per-column wrong-press plan. */
async function playToWin(k, tag, { wrongPlan = [] } = {}) {
  const { ctx } = k;
  let guard = 0, lastRound = 0;
  while (guard++ < 200) {
    const s = await lstate(k);
    if (s.none || s.bg === 'win' || s.bg === 'blose') break;
    if (s.sivov !== lastRound) {
      lastRound = s.sivov;
      await ctx.waitFor(() => document.querySelectorAll('.lmath-flower').length > 0, 3000);
      const shown = await k.eval(() => document.querySelectorAll('.lmath-flower:not(.lmath-eaten)').length);
      const want = s.columns.reduce((a, b) => a + b, 0);
      ctx.check(shown === want, 'lmath: flower count differs from columns', `${tag} round ${s.sivov}: ${shown} flowers drawn, columns sum ${want}`);
      ctx.check(s.columns.every(c => c >= s.params.pa2 && c <= s.params.pa1), 'lmath: column outside [pa2, pa1]', `${tag}: ${s.columns.join(',')} params ${JSON.stringify(s.params)}`);
      const siv = await k.eval(() => [...document.querySelectorAll('.lmath-siv')].map(e => (e.getAttribute('src').match(/s(\d)\.(?:png|webp)/) || [])[1]).join(''));
      ctx.check(siv.length === s.tur && siv[s.sivov - 1] === '3', 'lmath: round indicator wrong', `${tag} round ${s.sivov}/${s.tur}: siv=${siv}`);
      await ctx.checkImages();
      await ctx.shot(`${tag}-round${s.sivov}`);
    }
    const nWrong = s.sivov === 1 ? (wrongPlan[s.NomStl] || 0) : 0;
    for (let w = 0; w < nWrong; w++) {
      const before = await lstate(k);
      if (before.wrong >= w + 1) continue;           // already done (re-entered loop)
      const bad = before.need === 1 ? 2 : 1;
      await answer(k, bad);
      const after = await lstate(k);
      if (after.none || after.bg === 'blose') break;
      ctx.check(after.wrong === before.wrong + 1 && after.NomStl === before.NomStl, 'lmath: wrong digit not counted', `${tag} col ${before.NomStl}: need ${before.need} pressed ${bad} → wrong ${before.wrong}→${after.wrong}, col ${after.NomStl}`);
      if (after.wrong === 1) ctx.check(after.x - before.x >= (before.params.lbls * 3 + 200) / 15 - 0.5, 'lmath: first wrong did not push the ladybug', `${tag}: x ${before.x}→${after.x}`);
      if (after.wrong === 3) {
        const blinked = await ctx.waitFor(d => { const b = document.querySelector(`.lmath-cmda[data-digit="${d}"]`); return b && b.style.visibility === 'hidden'; }, 1500, before.need);
        ctx.check(blinked, 'lmath: 3rd wrong does not blink the right digit', `${tag}: need ${before.need}`);
        await ctx.shot(`${tag}-wrong3`);
        await ctx.sleep(1700);                      // blink ends
      }
    }
    const cur = await lstate(k);
    if (cur.none || cur.bg !== 'backk10') continue;
    await answer(k, cur.need);
    const post = await lstate(k);
    if (post.bg === 'backk10' && post.sivov === cur.sivov)
      ctx.check(post.NomStl === cur.NomStl + 1 && post.wrong === 0, 'lmath: correct digit not accepted', `${tag}: col ${cur.NomStl} need ${cur.need} → col ${post.NomStl} wrong ${post.wrong}`);
    if (post.sivov !== cur.sivov) await ctx.sleep(2300);   // starts.wav → auto-start next round
  }
  const won = await bgIs(k, 'win', 5000);
  if (!ctx.check(won, 'lmath: game did not reach the win screen', `${tag}: ${JSON.stringify(await lstate(k))}`)) { await ctx.shot(`${tag}-nowin`); return false; }
  await ctx.sleep(800);
  await ctx.checkImages();
  const vid = await k.eval(() => { const v = document.querySelector('.lmath-stage video'); return v && { err: !!v.error, rs: v.readyState }; });
  ctx.check(vid && !vid.err, 'lmath: win video (end.mp4) broken', JSON.stringify(vid));
  await ctx.shot(`${tag}-win`);
  return true;
}

/** Digit keys / Enter on an end screen must not keep playing the hidden game. */
async function keysOnEndScreen(k, tag, bg) {
  const { ctx } = k;
  const before = await lstate(k);
  for (const key of ['1', '2', '3', '4', '5', 'Enter', '9', '1', '1', '1']) { await ctx.page.keyboard.press(key); await ctx.sleep(80); }
  await ctx.sleep(600);
  const s = await lstate(k);
  ctx.check(s.bg === bg, 'lmath: keyboard input on the end screen changes it', `${tag}: ${bg} screen → ${s.bg} after pressing digit keys`);
  const moved = ['NomStl', 'wrong', 'x', 'sivov', 'eaten'].filter(f => before[f] !== s[f]);
  ctx.check(!moved.length, 'lmath: digit keys still play the finished game', `${tag} (${bg} screen): ${moved.map(f => `${f} ${before[f]}→${s[f]}`).join(', ')}`);
}

async function lmath(k) {
  const { ctx } = k;
  ctx.step('lmath/open');
  await k.waitScreen('sst', 3000);
  await k.tap('.frm-ctrl--Picture2', 0, 800);
  if (!ctx.check(await bgIs(k, 'rac'), 'lmath start screen did not open', '')) return;
  await ctx.checkImages();
  await ctx.shot('lmath-start');
  const hot = t => `.lmath-hot[title="${t}"]`;

  // Level 1 — straight win, then keys on the win screen, then "exit" (caf1).
  ctx.step('lmath/level1');
  await k.tap(hot('קל'), 0, 600);
  let s = await lstate(k);
  ctx.check(!s.none && s.params.pa1 === 5 && s.params.tur === 2 && s.paused, 'lmath level 1 params', JSON.stringify(s));
  ctx.check(await k.eval(() => document.querySelectorAll('.lmath-cmda').length) === 5, 'lmath: level 1 digit count', '');
  // Pause/resume: targ starts, second click pauses (bug must stop), third resumes.
  await k.tap('.lmath-targ', 0, 700);
  const x0 = (await lstate(k)).x;
  await k.tap('.lmath-targ', 0, 200);
  const xp = (await lstate(k)).x;
  await ctx.sleep(900);
  const xp2 = (await lstate(k)).x;
  ctx.check(x0 >= 60 && xp2 === xp && (await lstate(k)).paused, 'lmath: pause does not stop the ladybug', `x ${x0} → ${xp} → ${xp2}`);
  await k.tap('.lmath-targ', 0, 200);
  await k.tap('.lmath-hotspot[title="עזרה"]', 0, 200);
  if (await playToWin(k, 'lmath-l1')) {
    await keysOnEndScreen(k, 'lmath-l1', 'win');
    await k.tap('.lmath-end[title="לצאת"]', 0, 600);
    ctx.check(await bgIs(k, 'rac'), 'lmath: win "exit" does not return to the level select', '');
  }

  // Level 2 — wrong answers (1, 2, 3 on the first columns), still a win; play again.
  ctx.step('lmath/level2-wrongs');
  await k.tap(hot('בינוני'), 0, 600);
  s = await lstate(k);
  ctx.check(!s.none && s.params.pa1 === 8, 'lmath level 2 params', JSON.stringify(s));
  if (await playToWin(k, 'lmath-l2', { wrongPlan: [1, 2, 3] })) {
    await k.tap('.lmath-end[title="לשחק עוד פעם"]', 0, 600);
    s = await lstate(k);
    ctx.check(s.bg === 'backk10' && s.params.pa1 === 8 && s.sivov === 1 && s.NomStl === 0, 'lmath: play again does not restart the same level', JSON.stringify(s));
    await ctx.page.keyboard.press('Escape');
    ctx.check(await bgIs(k, 'rac'), 'lmath: ESC in game does not return to the level select', '');
  }

  // Level 3 — 3 rounds, straight win.
  ctx.step('lmath/level3');
  await k.tap(hot('קשה'), 0, 600);
  s = await lstate(k);
  ctx.check(!s.none && s.params.pa1 === 9 && s.params.tur === 3, 'lmath level 3 params', JSON.stringify(s));
  if (await playToWin(k, 'lmath-l3')) await k.tap('.lmath-end[title="לצאת"]', 0, 600);

  // Custom settings (Form2).
  ctx.step('lmath/settings');
  await bgIs(k, 'rac');
  await k.tap(hot('התאמה אישית'), 0, 600);
  if (ctx.check(await bgIs(k, 'ba2'), 'lmath settings did not open', '')) {
    await ctx.checkImages();
    await ctx.shot('lmath-settings');
    for (const p of await layoutProblems(k, '.lmath-slider')) ctx.finding('error', 'lmath settings: text clipped / selectable', p);
    const setSlider = (i, v) => k.eval((j, val) => { const inp = document.querySelectorAll('.lmath-slider input')[j]; inp.value = String(val); inp.dispatchEvent(new Event('input', { bubbles: true })); return inp.parentElement.querySelector('span').textContent; }, i, v);
    // sliders: 0=tur 1=pa1(עד) 2=pa2(מ) 3=lbls. Lower bound above upper → start clamps pa2 < pa1.
    await setSlider(0, 1); await setSlider(1, 3); await setSlider(2, 8); const shown = await setSlider(3, 50);
    ctx.check(shown === '50', 'lmath settings slider value label not updated', shown);
    for (const p of await layoutProblems(k, '.lmath-slider')) ctx.finding('error', 'lmath settings: text clipped / selectable', `after max values: ${p}`);
    await ctx.shot('lmath-settings-set');
    await k.tap('.lmath-settings-go', 0, 600);
    s = await lstate(k);
    ctx.check(!s.none && s.params.pa2 < s.params.pa1 && s.params.pa1 === 3 && s.params.tur === 1 && s.params.lbls === 50, 'lmath custom params not applied', JSON.stringify(s && s.params));
    // Fast bug (lbls=50 → 30 ms/px): let it walk to the lose line.
    ctx.step('lmath/custom-lose');
    await k.tap('.lmath-targ', 0, 200);
    const lost = await bgIs(k, 'blose', 25000);
    if (ctx.check(lost, 'lmath: ladybug never reached the lose line', JSON.stringify(await lstate(k)))) {
      await ctx.checkImages();
      await ctx.shot('lmath-lose');
      await keysOnEndScreen(k, 'lmath-lose', 'blose');
      await k.tap('.lmath-end[title="לשחק עוד פעם"]', 0, 600);
      s = await lstate(k);
      ctx.check(s.bg === 'backk10' && s.params.lbls === 50 && s.params.pa1 === 3, 'lmath: play again after lose lost the custom params', JSON.stringify(s));
      ctx.step('lmath/custom-win');
      // Win it this time (1 round, 3 digits).
      if (await playToWin(k, 'lmath-custom')) await k.tap('.lmath-end[title="לצאת"]', 0, 600);
    }
    // Settings "לצאת" (back) and the invisible close hotspot.
    await bgIs(k, 'rac');
    await k.tap(hot('התאמה אישית'), 0, 500);
    await k.tap('.lmath-settings-x', 0, 500);
    ctx.check(await bgIs(k, 'rac'), 'lmath settings "לצאת" does not go back', '');
  }

  // Chaos on the level select + in a game, then exit via ×.
  ctx.step('lmath/chaos');
  await k.tap(hot('קל'), 0, 500);
  await ctx.monkey({ n: 25, within: '.lmath-stage', wait: 120, avoid: '.lmath-hotspot[title="יציאה"],.lmath-end[title="לצאת"]' });
  await ctx.page.keyboard.press('Escape');
  await ctx.sleep(400);
  await ctx.shot('lmath-after-chaos');
  ctx.step('lmath/exit');
  if (!(await bgIs(k, 'rac', 1500))) { await ctx.page.keyboard.press('Escape'); await ctx.sleep(400); }
  await k.tap('.lmath-hot.lmath-exit', 0, 800);
  const back = await k.waitScreen('sst', 4000);
  ctx.check(back && !(await k.eval(() => !!document.querySelector('.lmath-stage'))), 'lmath × does not return to Sst', JSON.stringify(await k.snap()));
  await ctx.checkImages();
  await ctx.shot('lmath-back-to-sst');
  // The Sst must be fully live again (a path starts).
  const lamps = await k.eval(() => document.querySelectorAll('.frm-ctrl--btnLamp').length);
  ctx.check(lamps > 0, 'Sst not rebuilt after Lmath', '');
  // ESC on the level select also exits.
  await k.tap('.frm-ctrl--Picture2', 0, 600);
  await ctx.page.keyboard.press('Escape');
  ctx.check(await k.waitScreen('sst', 4000), 'lmath ESC on level select does not return to Sst', '');
}

/** avi(0..4) camera labels: per-path intro videos on every rama. */
async function avi(k) {
  const { ctx } = k;
  for (let r = 1; r <= 3; r++) {
    await k.selectRama(r);
    await ctx.sleep(300);
    const n = await k.eval(() => document.querySelectorAll('.frm-ctrl--avi').length);
    for (let i = 0; i < n; i++) {
      if (ctx.quick && i > 0) break;
      ctx.step(`sst/avi-r${r}-${i}`);
      const idx = await k.eval(ix => [...document.querySelectorAll('.frm-ctrl--avi')].findIndex(e => +e.dataset.index === ix), i);
      await k.tap('.frm-ctrl--avi', idx, 700);
      if (await k.eval(() => !!document.querySelector('.video-overlay'))) await k.video(`avi-r${r}-${i}`, { watch: 600 });
      else ctx.finding('warn', 'avi label plays no video', `rama ${r} avi(${i}) → \\avi\\_${r}${i + 1}.avi`);
      ctx.check((await k.snap()).screen === 'sst', 'not on Sst after avi video', `r${r} avi${i}`);
    }
  }
  await k.selectRama(1);
}

module.exports = {
  run: ctx => runApp(ctx, 'Heshbon', {
    exitSel: '.frm-ctrl--hyju',
    extra: async k => { await avi(k); await lmath(k); },
  }),
  lmath, avi,
};
