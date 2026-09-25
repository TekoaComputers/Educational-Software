// Mikraot (מקראות) — VB6 reading app port. Walks PROBA → KIVUN (all 10
// songs) → free route (START → reading modes, text Q&A, picture Q&A,
// MILON popup → all 7 dictionary games) and the 3 maslul chains, playing
// every game correctly (plus one deliberate wrong answer per game) and
// checking coins / Tozaot / SOFER totals. Then AGDARA, misc routes and a
// seeded chaos pass.
//
// Test hooks: MK._test = { screen, state, refs, stage } set by each screen.
const APP = 'Mikraot_site/index.html';
const SHIR = ['שרה ראתה תחנה', 'שרה לחשה ', '?למה צחקה דנה', 'סבא קנה מתנה', 'גל נפל',
  '?מה בגינה', 'בית ואוירון', 'סודר חדש לגל', 'החיט העליז', 'עגלה עם סוסים'];

// Injected before page scripts: media life-cycle log + optional speed-up of
// media playback and setTimeout delays (the games are paced by audio and
// VB6-style Sleep()s; 2-3x keeps a full run under an hour).
function pageHooks() {
  const mm = window.__mm = { log: [], speed: 1, timeScale: 1 };
  const track = el => {
    if (el.__mm) return; el.__mm = true;
    for (const ev of ['playing', 'pause', 'ended', 'error']) {
      el.addEventListener(ev, () => mm.log.push({ ev, src: el.currentSrc || el.src, t: performance.now(),
        ct: el.currentTime, dur: el.duration, err: el.error && el.error.code }));
    }
  };
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    track(this);
    if (mm.speed !== 1) try { this.playbackRate = mm.speed; } catch (e) {}
    mm.log.push({ ev: 'play', src: this.src, t: performance.now() });
    return origPlay.apply(this, arguments);
  };
  document.addEventListener('play', e => { if (e.target instanceof HTMLMediaElement) track(e.target); }, true);
  const st = window.setTimeout;
  window.setTimeout = function (f, ms, ...a) { return st(f, (ms || 0) / mm.timeScale, ...a); };
  // Centre of an element if it is visible, plus whether it is the top-most
  // thing there (i.e. a real click would reach it).
  window.__c = el => {
    if (!el || !el.isConnected) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, top: !!hit && (hit === el || el.contains(hit)), hit: hit ? (hit.className || hit.tagName) : '' };
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
  async run(ctx) {
    const { page } = ctx;
    await page.evaluateOnNewDocument(pageHooks);
    const SPEED = 2;
    const hash = () => ctx.eval(() => location.hash);
    const go = async h => { await ctx.eval(h => { location.hash = h; }, h); await sleep(500); };
    const waitHash = (re, t = 20000) => ctx.waitFor(re => new RegExp(re).test(location.hash), t, re.source || re);
    const screen = () => ctx.eval(() => (window.MK && MK._test && MK._test.screen) || '');
    const T = fn => ctx.eval(fn);
    // Click the element a page-side getter returns (via __c); records a
    // finding when it is hidden or covered by something else.
    async function clickEl(getter, label, arg, wait = 250) {
      const p = await ctx.eval(getter, arg);
      if (!p) { ctx.finding('error', 'control not visible', label); return false; }
      if (!p.top) ctx.finding('error', 'control covered — click would not reach it', `${label} (hit ${p.hit})`);
      await ctx.click(p.x, p.y, wait);
      return true;
    }
    const setSpeed = s => ctx.eval(s => { window.__mm.speed = s; window.__mm.timeScale = s; }, s);

    // ------------------------------------------------------------ PROBA
    ctx.step('proba');
    await ctx.goto(APP, 1500);
    await ctx.checkImages();
    const v = await T(() => { const v = document.querySelector('video'); return v && { src: v.getAttribute('src'), t: v.currentTime, err: v.error && v.error.code }; });
    ctx.check(v && /cred\.mp4/.test(v.src) && !v.err, 'intro video not loaded', JSON.stringify(v));
    await ctx.shot('proba');
    await clickEl(() => __c(MK._test.refs.btnStart_1), 'pause');
    ctx.check(await T(() => document.querySelector('video').paused), 'pause button did not pause');
    await clickEl(() => __c(MK._test.refs.btnStart_0), 'play');
    await sleep(600);
    ctx.check(await T(() => !document.querySelector('video').paused), 'play button did not resume');
    await clickEl(() => __c(MK._test.refs.btnKnisa), 'knisa');
    ctx.check(await waitHash(/^#\/maslul$/), 'knisa did not open the maslul picker');
    await sleep(800);

    // ------------------------------------------------------------ KIVUN
    ctx.step('kivun');
    await ctx.checkImages();
    await ctx.shot('kivun');
    const nShir = await T(() => MK._test.refs.btnShir.filter(Boolean).length);
    ctx.check(nShir === 10, 'song buttons', `got ${nShir}`);
    for (let i = 0; i < 10; i++) {
      ctx.step(`kivun/song${i + 1}`);
      if (await hash() !== '#/maslul') { await go('#/maslul'); }
      await clickEl(i => __c(MK._test.refs.btnShir[i]), `btnShir ${i}`, i);
      ctx.check(await waitHash(new RegExp(`^#/maslul/${i + 1}$`)), 'song pick did not route', `song ${i + 1}`);
      await sleep(400);
      const st = await T(() => ({ masl: MK._test.refs.btnMsl1.map(b => b && b.style.display !== 'none' && b.style.backgroundImage),
        hof: MK._test.refs.btnHofshi.style.display !== 'none',
        shm: MK._test.refs.lblShm.filter(l => l && l.style.visibility === 'visible').map(l => l.textContent) }));
      ctx.check(st.masl.every(Boolean) && st.hof, 'maslul buttons not shown', JSON.stringify(st));
      ctx.check(st.shm.length === 1 && st.shm[0] === SHIR[i], 'wrong song caption', JSON.stringify(st.shm));
      if (i === 0) { await ctx.checkImages(); await ctx.shot('kivun-song1'); }
      await clickEl(() => __c(document.querySelector('button[title="חזרה"]')), 'kivun return');
      ctx.check(await waitHash(/^#\/maslul$/), 'kivun return did not reset the song');
      await sleep(300);
    }

    // #72 — clicking between songs quickly must not leave sound dead.
    ctx.step('kivun/rapid-72');
    await sleep(2500);
    for (const i of [3, 8, 3, 8, 3, 8]) {
      const p = await ctx.eval(i => __c(MK._test.refs.btnShir[i]), i);
      if (p) await ctx.click(p.x, p.y, 280);
    }
    const mark72 = await T(() => window.__mm.log.length);
    await sleep(6000);
    const ev72 = await ctx.eval(m => window.__mm.log.slice(m), mark72);
    const played72 = ev72.filter(e => e.ev === 'playing' || e.ev === 'ended');
    ctx.check(await hash() === '#/maslul/9', 'rapid clicks ended on the wrong song', await hash());
    ctx.check(played72.some(e => /9l1|i2|i8/.test(e.src)), 'sound dead after rapid song switching (#72)',
      ev72.map(e => e.ev + ':' + (e.src || '').replace(/.*assets\//, '')).join(' '));

    // #72 (routes = maslulim): three quick clicks on different maslul
    // buttons must run ONE pick — the first cue plays out, one walker.
    ctx.step('kivun/rapid-72-maslul');
    await go('#/maslul/3');
    await sleep(2500);
    const markM = await T(() => window.__mm.log.length);
    for (const m of [0, 1, 2]) {
      const p = await ctx.eval(m => MK._test.screen === 'kivun' && __c(MK._test.refs.btnMsl1[m]), m);
      if (p) await ctx.click(p.x, p.y, 300);
    }
    ctx.check(await ctx.waitFor(() => /^#\/play\//.test(location.hash), 25000), 'rapid maslul clicks never started a maslul', await hash());
    await sleep(1500);
    const evM = (await ctx.eval(m => window.__mm.log.slice(m), markM)).map(e => e.ev + ':' + (e.src || '').replace(/.*assets\//, ''));
    const chainM = await T(() => JSON.parse(sessionStorage.getItem('mikraot:chain') || 'null'));
    ctx.check(chainM && chainM.masl === 0 && chainM.stepIdx === 0, 'rapid maslul clicks: wrong / doubled maslul walker (#72)', JSON.stringify(chainM));
    ctx.check(evM.includes('ended:mik_siha/i3.mp3') && !evM.some(e => /^play:.*mik_siha\/i[45]\./.test(e)), 'rapid maslul clicks cut the maslul cue (#72)', evM.join(' '));
    // This leaves an ABANDONED maslul chain in sessionStorage: the free
    // route below must not record into / advance it (checked by every
    // free Q&A ending on SOFER).

    // ------------------------------------------------------------ helpers per game
    const expectCoins = {};   // `${song}/${masl}` → { code: coins }
    const note = (key, code, coins) => { (expectCoins[key] = expectCoins[key] || {})[code] = coins; };

    // Q&A (tirgul 4 text / 5 picture). Returns KolMonet earned.
    async function playQA(tag) {
      const ok = await ctx.waitFor(() => MK._test && MK._test.screen === 'likro' && MK._test.state.qa.N_V > 0, 20000);
      if (!ok) { ctx.finding('error', 'Q&A never asked a question', tag); await ctx.shot('qa-stuck'); return 0; }
      const info = await T(() => { const s = MK._test.state; return { tirgul: s.tirgul, total: s.qa.SahAkol }; });
      const want = Math.min(3, info.total);
      let expect = 0;
      for (let k = 0; k < want; k++) {
        if (await screen() !== 'likro') break;
        const q = await T(() => { const s = MK._test.state, qa = s.qa; const nodes = s.tirgul === 4 ? s.slovoNodes : s.zoneNodes;
          const list = s.tirgul === 4 ? MK._test.stage.words : MK._test.stage.zones;
          const valid = list.map((e, i) => i).filter(i => { const q = list[i].q || ''; return q && q.replace(/^[?\s]+/, '').length && q !== 'None'; });
          return { nv: qa.N_V, otvet: qa.otvet, kol: qa.KolMonet, text: s.btnVoprosNode.textContent, valid,
            reach: valid.map(i => { const c = __c(nodes[i]); return c && c.top; }) }; });
        // Every question's answer overlay must be clickable (not buried
        // under a same-rect sentinel twin).
        const unreach = q.valid.filter((v, j) => !q.reach[j]).map(i => i + 1);
        if (k === 0) ctx.check(!unreach.length, 'Q&A answer zone unreachable', `${tag}: questions ${unreach.join(',')}`);
        if (k === 0 && q.valid.length > 1) {
          // one wrong answer first: must be rejected, question unchanged
          const wrong = q.valid.find(i => i !== q.nv - 1 && q.reach[q.valid.indexOf(i)]);
          if (wrong != null) {
            await clickEl(i => { const s = MK._test.state; return __c((s.tirgul === 4 ? s.slovoNodes : s.zoneNodes)[i]); }, `${tag} wrong answer`, wrong, 200);
            await ctx.waitFor(() => MK._test.state.qa.Mis_Tsuva === 2, 15000);
            const w = await T(() => ({ nv: MK._test.state.qa.N_V, otvet: MK._test.state.qa.otvet, taut: MK._test.state.qa.Taut }));
            ctx.check(w.nv === q.nv && w.otvet === q.otvet && w.taut === 1, 'wrong Q&A answer not rejected', `${tag}: ${JSON.stringify(w)}`);
          }
        }
        const taut = await T(() => MK._test.state.qa.Taut);
        // double-click the right answer: must count once (#73)
        const p = await ctx.eval(i => { const s = MK._test.state; return __c((s.tirgul === 4 ? s.slovoNodes : s.zoneNodes)[i]); }, q.nv - 1);
        if (!p) { ctx.finding('error', 'answer overlay missing', `${tag} q${q.nv}`); break; }
        await ctx.click(p.x, p.y, 80);
        await ctx.click(p.x, p.y, 80);
        await sleep(400);
        const a = await T(() => ({ otvet: MK._test.state.qa.otvet, kol: MK._test.state.qa.KolMonet }));
        const gain = taut === 0 ? 3 : taut === 1 ? 2 : taut === 2 ? 1 : 0;
        expect += gain;
        ctx.check(a.otvet === q.otvet + 1, 'Q&A answer counted more than once (#73)', `${tag} q${q.nv}: otvet ${q.otvet} → ${a.otvet}`);
        ctx.check(a.kol === q.kol + gain, 'Q&A coins wrong', `${tag} q${q.nv}: KolMonet ${q.kol} → ${a.kol}, expected +${gain}`);
        if (k === 0) await ctx.shot(`${tag}-answered`);
        // wait for the next question (or for the screen to leave)
        await ctx.waitFor(nv => !(window.MK && MK._test && MK._test.screen === 'likro') || MK._test.state.qa.N_V !== nv || MK._test.state.qa.otvet >= 3, 25000, q.nv);
        await ctx.waitFor(nv => !(MK._test && MK._test.screen === 'likro') || MK._test.state.qa.N_V !== nv, 25000, q.nv);
      }
      return expect;
    }

    // Dictionary quiz (game1 mishak 1/2/4, game5): 5 rounds.
    async function playQuiz(tag, commitSel) {
      const ok = await ctx.waitFor(() => MK._test && MK._test.screen === 'quiz' && MK._test.state.round >= 1, 15000);
      const empty = await T(() => /אין מספיק נתונים/.test(document.body.innerText));
      if (empty) { ctx.finding('error', 'dictionary game has no data — dead end', tag); await ctx.shot(`${tag}-nodata`); return null; }
      if (!ok) { ctx.finding('error', 'quiz never started', tag); return null; }
      await T(() => { window.__gs = MK._test.state; });
      let coins = 0;
      for (let r = 1; r <= 5; r++) {
        if (!await ctx.waitFor(r => MK._test.screen === 'quiz' && MK._test.state.round === r, 20000, r)) { ctx.finding('error', 'quiz round did not start', `${tag} r${r}`); break; }
        await sleep(200);
        const q = await T(() => { const s = MK._test.state; return { idx: s.choices.indexOf(s.current), n: s.choices.length,
          slg0: s.choices.map(c => (c.slg[0] || '').trim()), mila: s.choices.map(c => c.mila), coins: s.totalCoins }; });
        ctx.check(q.idx >= 0, 'correct answer not among the choices', `${tag} r${r}`);
        if (tag.includes('mishak4')) {
          const same = q.slg0.filter(x => x === q.slg0[q.idx]).length;
          ctx.check(same === 1, 'ambiguous choices: another answer starts with the same syllable', `${tag} r${r}: ${q.mila.join('/')} slg0=${q.slg0.join(',')}`);
        }
        let attempts = 0;
        if (r === 2) {
          const w = (q.idx + 1) % q.n;
          await clickEl((a) => __c(MK._test.refs[a]), `${tag} wrong`, commitSel(w), 150);
          attempts = 1;
          await sleep(300);
          const s2 = await T(() => ({ round: MK._test.state.round, att: MK._test.state.attempts }));
          ctx.check(s2.round === r && s2.att === 1, 'wrong dictionary answer not rejected', `${tag} r${r}: ${JSON.stringify(s2)}`);
          await sleep(4200 / SPEED);
        }
        const p = await ctx.eval(a => __c(MK._test.refs[a]), commitSel(q.idx));
        if (!p) { ctx.finding('error', 'answer button missing', `${tag} r${r}`); break; }
        await ctx.click(p.x, p.y, 60);
        await ctx.click(p.x, p.y, 60);            // double-click must count once
        await sleep(300);
        const gain = attempts === 0 ? 2 : 1;
        coins += gain;
        const s3 = await T(() => ({ coins: window.__gs.totalCoins, round: window.__gs.round }));
        ctx.check(s3.coins === q.coins + gain, 'dictionary coins wrong / double counted', `${tag} r${r}: ${q.coins} → ${s3.coins}, expected +${gain}`);
        if (r === 1) await ctx.shot(`${tag}-r1`);
      }
      return coins;
    }

    async function playGame2(tag) {
      if (!await ctx.waitFor(() => MK._test && MK._test.screen === 'game2' && MK._test.state.round >= 1, 20000)) {
        const empty = await T(() => /אין מספיק נתונים/.test(document.body.innerText));
        ctx.finding('error', empty ? 'dictionary game has no data — dead end' : 'game2 never started', tag); return null;
      }
      await T(() => { window.__gs = MK._test.state; });
      let coins = 0;
      for (let r = 1; r <= 5; r++) {
        if (!await ctx.waitFor(r => MK._test.screen === 'game2' && MK._test.state.round === r, 20000, r)) { ctx.finding('error', 'game2 round did not start', `${tag} r${r}`); break; }
        await sleep(200);
        const s = await T(() => ({ slot: MK._test.state.mistakeSlot, coins: MK._test.state.totalCoins }));
        let att = 0;
        if (r === 3) {
          await clickEl(i => __c(MK._test.refs['btnOtvet_' + i]), `${tag} wrong`, (s.slot + 1) % 3, 200);
          att = 1;
          ctx.check((await T(() => MK._test.state.round)) === r, 'wrong game2 answer advanced the round', tag);
          await sleep(4200 / SPEED);
        }
        const p = await ctx.eval(i => __c(MK._test.refs['btnOtvet_' + i]), s.slot);
        await ctx.click(p.x, p.y, 60); await ctx.click(p.x, p.y, 60);
        await sleep(300);
        const gain = att ? 1 : 2; coins += gain;
        const c = await T(() => window.__gs.totalCoins);
        ctx.check(c === s.coins + gain, 'game2 coins wrong / double counted', `${tag} r${r}: ${s.coins} → ${c}`);
        if (r === 1) await ctx.shot(`${tag}-r1`);
      }
      return coins;
    }

    async function playSlog(tag) {
      if (!await ctx.waitFor(() => MK._test && MK._test.screen === 'slog' && MK._test.state.round >= 1, 20000)) { ctx.finding('error', 'slog never started', tag); return null; }
      await T(() => { window.__gs = MK._test.state; });
      let coins = 0;
      for (let r = 1; r <= 5; r++) {
        if (!await ctx.waitFor(r => MK._test.screen === 'slog' && MK._test.state.round === r, 20000, r)) { ctx.finding('error', 'slog round did not start', `${tag} r${r}`); break; }
        await sleep(200);
        const w = await T(() => { const s = MK._test.state; return { n: Math.max(1, Math.min(4, s.current.misp || 1)), misp: s.current.misp, slg: s.current.slg.map(x => (x || '').trim()), map: s.slgMap.slice(), coins: s.totalCoins, mila: s.current.mila }; });
        const codes = w.slg.slice(0, w.n);
        ctx.check(codes.every(Boolean), 'slog word has an empty syllable', `${tag}: ${w.mila} ${JSON.stringify(w.slg)} misp=${w.misp}`);
        ctx.check(new Set(codes).size === codes.length, 'slog word repeats a syllable — identical tiles, only one accepted', `${tag}: ${w.mila} ${codes.join(',')}`);
        let att = 0;
        for (let k = 0; k < w.n; k++) {
          if (r === 4 && k === 0 && w.n < 4) {
            const free = [0, 1, 2, 3].find(i => !w.map.includes(i));
            await clickEl(i => __c(MK._test.refs['btnOtvet_' + i]), `${tag} wrong`, free, 150);
            att = 1;
            await sleep(4200 / SPEED);
          }
          const tek = await T(() => MK._test.state.tekSlog);
          ctx.check(tek === k, 'slog syllable index out of step', `${tag} r${r}: tek=${tek} expected ${k}`);
          const p = await ctx.eval(i => __c(MK._test.refs['btnOtvet_' + i]), w.map[k]);
          await ctx.click(p.x, p.y, 60); await ctx.click(p.x, p.y, 60);
          await ctx.waitFor(([k, r]) => MK._test.screen !== 'slog' || MK._test.state.tekSlog > k || MK._test.state.round !== r, 8000, [k, r]);
          await sleep(150);
        }
        await ctx.waitFor(r => MK._test.screen !== 'slog' || MK._test.state.round > r, 15000, r);
        const gain = att ? 1 : 2; coins += gain;
        const c = await T(() => window.__gs.totalCoins);
        ctx.check(c === w.coins + gain, 'slog coins wrong / double counted', `${tag} r${r}: ${w.coins} → ${c}, expected +${gain}`);
        if (r === 1) await ctx.shot(`${tag}-r1`);
      }
      return coins;
    }

    async function playGam3(tag) {
      if (!await ctx.waitFor(() => MK._test && MK._test.screen === 'gam3' && MK._test.state.round >= 1, 20000)) { ctx.finding('error', 'gam3 never started', tag); return null; }
      await T(() => { window.__gs = MK._test.state; });
      let coins = 0;
      for (let r = 1; r <= 5; r++) {
        if (!await ctx.waitFor(r => MK._test.screen === 'gam3' && MK._test.state.round === r, 20000, r)) { ctx.finding('error', 'gam3 round did not start', `${tag} r${r}`); break; }
        await sleep(200);
        const w = await T(() => { const s = MK._test.state; return { slovo: s.slovo, mas: s.mas.slice(), kol: s.kol, coins: s.totalCoins, abc: MK._test.abc }; });
        ctx.check(w.kol >= 1 && w.kol <= 7, 'gam3 word does not fit the 7 slots', `${tag}: ${w.slovo} kol=${w.kol}`);
        let att = 0;
        for (let k = 0; k < w.kol; k++) {
          const letter = w.slovo[w.mas[k]];
          const idx = w.abc.indexOf(letter);
          if (idx < 0) { ctx.finding('error', 'gam3 letter has no key — word unanswerable', `${tag}: ${w.slovo} needs ${letter}`); break; }
          if (r === 5 && k === 0) {
            const wrong = (idx + 1) % 27;
            await clickEl(i => __c(MK._test.refs['btnABC_' + i]), `${tag} wrong`, wrong, 150);
            att = 1;
            await sleep(4200 / SPEED);
          }
          if (r === 2 && k === 0) {
            // keyboard: the Israeli-layout Latin key for this letter
            const CP = 'אבגדהוזחטיךכלםמןנסעףפץצקרשת';
            const key = 'tcdsvuzjyhlfkonibxg;p.mera,'[CP.indexOf(letter)];
            await page.keyboard.press(key);
            await ctx.waitFor(k => MK._test.state.tek > k + 1 || MK._test.state.attempts > 0, 5000, k);
            const s = await T(() => ({ tek: MK._test.state.tek, att: MK._test.state.attempts }));
            ctx.check(s.att === 0 && s.tek === k + 2, 'gam3 keyboard shortcut types the wrong letter', `${tag}: key "${key}" for ${letter} → ${JSON.stringify(s)}`);
            if (s.att > 0) { att = s.att; await sleep(4200 / SPEED); } else continue;
          }
          const p = await ctx.eval(i => __c(MK._test.refs['btnABC_' + i]), idx);
          await ctx.click(p.x, p.y, 60); await ctx.click(p.x, p.y, 60);
          await ctx.waitFor(([k, r]) => MK._test.screen !== 'gam3' || MK._test.state.tek > k + 1 || MK._test.state.round !== r, 8000, [k, r]);
          await sleep(120);
        }
        await ctx.waitFor(r => MK._test.screen !== 'gam3' || MK._test.state.round > r, 15000, r);
        const gain = att ? Math.max(0, 2 - (att > 2 ? 2 : 1)) : 2; coins += gain;
        const c = await T(() => window.__gs.totalCoins);
        ctx.check(c === w.coins + gain, 'gam3 coins wrong / double counted', `${tag} r${r} ${w.slovo}: ${w.coins} → ${c}, expected +${gain}`);
        if (r === 1) await ctx.shot(`${tag}-r1`);
      }
      return coins;
    }

    // Read modes (tirgul 1/2/3): click every word + zone, check audio.
    async function playRead(tag) {
      await ctx.waitFor(() => MK._test && MK._test.screen === 'likro', 10000);
      await sleep(400);
      const n = await T(() => ({ w: MK._test.state.slovoNodes.length, z: MK._test.state.zoneNodes.length, t: MK._test.state.tirgul }));
      const mark = await T(() => window.__mm.log.length);
      for (let i = 0; i < n.w; i++) {
        const p = await ctx.eval(i => { const el = MK._test.state.slovoNodes[i]; const c = __c(el); if (!c || c.top) return c;
          // covered: fine if the thing on top is a twin overlay with the same rect
          const hit = document.elementFromPoint(c.x, c.y); const a = el.getBoundingClientRect(), b = hit.getBoundingClientRect();
          c.twin = MK._test.state.slovoNodes.includes(hit) && Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2 && Math.abs(a.width - b.width) < 2;
          c.hitIdx = MK._test.state.slovoNodes.indexOf(hit); return c; }, i);
        if (!p) continue;
        if (!p.top && !p.twin) ctx.finding('warn', 'read-mode word zone partly covered by another zone', `${tag} word ${i} under word ${p.hitIdx}`);
        await ctx.click(p.x, p.y, 120);
      }
      for (let i = 0; i < n.z; i++) {
        const p = await ctx.eval(i => __c(MK._test.state.zoneNodes[i]), i);
        if (p && p.top) await ctx.click(p.x, p.y, 120);
      }
      const ev = await ctx.eval(m => window.__mm.log.slice(m), mark);
      const errs = ev.filter(e => e.ev === 'error').map(e => (e.src || '').replace(/.*assets\//, ''));
      ctx.check(!errs.length, 'read-mode audio missing', `${tag}: ${[...new Set(errs)].join(' ')}`);
      if (n.t > 0) ctx.check(ev.some(e => e.ev === 'play'), 'read-mode clicks played nothing', tag);
    }

    // Dispatch on the current route, play it, return coins (or null).
    async function playCurrent(tag) {
      const h = await hash();
      if (/^#\/play\//.test(h)) {
        const t = +(/tirgul=(\d)/.exec(h) || [])[1];
        if (t === 4 || t === 5) return playQA(tag + '-qa' + t);
        await playRead(tag + '-read' + t);
        await clickEl(() => __c([...document.querySelectorAll('button.ctrl[title="חזרה"]')].pop()), `${tag} hemsheh`);
        return 0;
      }
      if (/^#\/game1\//.test(h)) {
        const m = +(/mishak=(\d)/.exec(h) || [])[1];
        return playQuiz(`${tag}-game1-mishak${m}`, i => 'btnOtvet_' + i);
      }
      if (/^#\/game5\//.test(h)) return playQuiz(`${tag}-game5`, i => 'btnOtvet_' + i);
      if (/^#\/game2\//.test(h)) return playGame2(`${tag}-game2`);
      if (/^#\/slog\//.test(h)) return playSlog(`${tag}-slog`);
      if (/^#\/gam3\//.test(h)) return playGam3(`${tag}-gam3`);
      ctx.finding('error', 'unexpected route in game flow', h);
      return null;
    }

    await setSpeed(SPEED);

    // ------------------------------------------------------------ free route per song
    const songs = ctx.quick ? [1, 2, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const s of songs) {
      ctx.step(`free/${s}/start`);
      await go('#/maslul/' + s);
      await clickEl(() => __c(MK._test.refs.btnHofshi), 'hofshi');
      if (!await waitHash(/^#\/start$/)) { ctx.finding('error', 'free route did not open START', `song ${s}`); continue; }
      await sleep(500);
      await ctx.checkImages();
      const title = await T(() => MK._test.refs.Panel3D1 && MK._test.refs.Panel3D1.textContent);
      ctx.check(title === SHIR[s - 1], 'START shows the wrong song title', `song ${s}: ${title}`);
      if (s === 1) await ctx.shot('start');
      // Book pages must stay inside their PictureBoxes (VB6 clips).
      const spill = await T(() => ['Picture1', 'Picture2'].map(n => { const b = MK._test.refs[n]; if (!b) return null;
        const r = b.getBoundingClientRect(), im = b.querySelector('img'); if (!im) return null; const q = im.getBoundingClientRect();
        const clip = getComputedStyle(b).overflow === 'hidden'; return (!clip && (q.bottom > r.bottom + 1 || q.right > r.right + 1)) ? n : null; }).filter(Boolean));
      ctx.check(!spill.length, 'START page picture spills out of its box over the book/toolbar', `song ${s}: ${spill.join(',')}`);
      await clickEl(() => __c(MK._test.refs.PicFea), 'start PicFea', null, 100);
      await clickEl(() => __c(MK._test.refs.PicBur), 'start PicBur', null, 100);

      // Likro (tirgul 0) → the three read modes
      ctx.step(`free/${s}/likro`);
      await clickEl(() => __c(MK._test.refs.btnLikro), 'btnLikro');
      await waitHash(/^#\/play\/\d+\/2\?tirgul=0/);
      await sleep(600);
      await ctx.checkImages();
      if (s === 1) await ctx.shot('likro');
      const ptitle = await T(() => ([...document.querySelectorAll('.lbl')].find(l => /0, 128, 255/.test(l.style.background)) || {}).textContent || '');
      ctx.check(ptitle === SHIR[s - 1], 'reading screen title is not the song name', `song ${s}: "${ptitle}"`);
      if (s === songs[0]) {
        // #77: rapid multi-clicks must not select page content.
        const bx = await ctx.eval(() => { const r = MK._test.state.picture2Node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.mouse.click(bx.x, bx.y, { count: 3 });
        const sel = await T(() => { const g = getSelection(); return { collapsed: g.isCollapsed, n: g.rangeCount }; });
        ctx.check(sel.collapsed, 'multi-click selects page content (#77)', JSON.stringify(sel));
        await T(() => getSelection().removeAllRanges());
        // #75/#76: hammering a sprite must not start overlapping cycles,
        // and every cell must already be cached (no blank frames).
        await setSpeed(1);
        const reqs = [];
        const onReq = r => { if (/assets\/anim\//.test(r.url())) reqs.push(r.url()); };
        page.on('request', onReq);
        await T(() => { const n = MK._test.state.picBurNode; const seq = window.__frames = [];
          const t0 = performance.now(); (function tick() { const m = /pic_bur_(\d+)/.exec(n.style.backgroundImage); seq.push(m ? +m[1] : -1);
            if (performance.now() - t0 < 3500) setTimeout(tick, 40); })(); });
        for (let k = 0; k < 6; k++) { await clickEl(() => __c(MK._test.state.picBurNode), 'PicBur', null, 110); }
        await sleep(3000);
        page.off('request', onReq);
        const fr = (await T(() => window.__frames)).filter((f, i, a) => i === 0 || f !== a[i - 1]);
        const back = fr.filter((f, i) => i > 0 && f < fr[i - 1] && f !== 0);
        ctx.check(!back.length, 'sprite frames run backwards — overlapping animations (#75/#76)', fr.join(','));
        ctx.check(!reqs.length, 'sprite cells fetched mid-animation — blank frames on slow networks (#75/#76/#78)', [...new Set(reqs)].map(u => u.replace(/.*assets\//, '')).join(' '));
        await setSpeed(SPEED);
      }
      const m0 = await T(() => window.__mm.log.length);
      await clickEl(() => __c(MK._test.state.slovoNodes[0]), 'tirgul0 word', null, 200);
      ctx.check(!(await ctx.eval(m => window.__mm.log.slice(m).some(e => e.ev === 'play' && /wav\/\d+_\d\//.test(e.src)), m0)), 'tirgul 0 word click played audio (should be inert)');
      for (const [btn, t, vnt] of [['btnStrokaNode', 1, 1], ['btnSlovoNode', 2, 2], ['btnSlogNode', 3, 3]]) {
        ctx.step(`free/${s}/mode${t}`);
        await clickEl(b => __c(MK._test.state[b]), btn, btn);
        if (!await waitHash(new RegExp(`^#/play/${s}/${vnt}\\?tirgul=${t}`), 8000)) { ctx.finding('error', 'mode button did not switch', `${s} ${btn}`); continue; }
        await sleep(500);
        await ctx.checkImages();
        if (s === 1) await ctx.shot(`likro-mode${t}`);
        const act = await ctx.eval(b => { const n = MK._test.state[b]; return n && n.style.backgroundImage; }, btn);
        ctx.check(act && act.includes(`kl${t === 1 ? 33 : t === 2 ? 22 : 11}.`), 'active mode button reverted to idle after switching (#78)', `${btn}: ${act}`);
        await playRead(`free${s}-mode${t}`);
        // btnShma(0/1) — "play next"
      }
      await clickEl(() => __c([...document.querySelectorAll('button.ctrl[title="חזרה"]')].pop()), 'likro back');
      ctx.check(await waitHash(/^#\/start$/), 'likro back did not return to START');
      await sleep(400);

      for (const [btn, t] of [['btnVoprTx', 4], ['btnVoprTm', 5]]) {
        ctx.step(`free/${s}/qa${t}`);
        if (await hash() !== '#/start') { await go('#/start'); }
        await clickEl(b => __c(MK._test.refs[b]), btn, btn);
        await waitHash(new RegExp(`tirgul=${t}`));
        await ctx.checkImages();
        const kol = await playQA(`free${s}-qa${t}`);
        const left = await ctx.waitFor(() => /^#\/sofer\//.test(location.hash), 15000);
        ctx.check(left, 'Q&A did not finish to SOFER', `song ${s} tirgul ${t}: at ${await hash()}`);
        if (left) {
          await sleep(600); if (s === 1) await ctx.shot(`sofer-after-qa${t}`); await ctx.checkImages();
          // #74: the free-route SOFER must show this round's result, not an empty board.
          const txt = await T(() => document.body.innerText);
          ctx.check(new RegExp(`אספת ${kol} מטבעות מתוך 9`).test(txt), 'free-route SOFER does not show the round score (#74)', `song ${s} tirgul ${t}: expected ${kol}; text: ${(txt.match(/אספת[^\n]*/) || ['(none)'])[0]}`);
          const halon = await T(() => [...document.querySelectorAll('.ctrl')].filter(e => /matbea\d/.test(e.style.backgroundImage) && e.style.display !== 'none').length);
          ctx.check(halon >= 1, 'free-route SOFER shows no coins (#74)', `song ${s} tirgul ${t}`);
        }
        await go('#/start');
      }

      // MILON popup → 7 dictionary games
      const milon = [['btn1', 0, 'game1', 4], ['btn1', 1, 'game1', 2], ['btn2', null, 'game1', 1], ['btn3', null, 'game5'], ['btn4', null, 'game2'], ['btn5', null, 'slog'], ['btn6', null, 'gam3']];
      for (const [b, idx, g, mishak] of milon) {
        ctx.step(`free/${s}/milon/${g}${mishak || ''}`);
        await go('#/milon');
        await sleep(300);
        if (s === 1 && b === 'btn1' && idx === 0) { await ctx.checkImages(); await ctx.shot('milon'); }
        const img = `milon_btn/${b}${idx != null ? '_' + idx : ''}`;
        await clickEl(img => __c([...document.querySelectorAll('button.ctrl')].find(e => e.style.backgroundImage.includes(img))), `milon ${img}`, img);
        if (!await waitHash(new RegExp(`^#/${g}/`), 5000)) { ctx.finding('error', 'milon button did not open game', img); continue; }
        await sleep(300);
        await ctx.checkImages();
        // Coin holes (Halon, AutoSize) must all be the coin picture's size.
        const hs = await T(() => [...document.querySelectorAll('.ctrl')].filter(e => /matbea\d/.test(e.style.backgroundImage))
          .map(e => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }));
        ctx.check(hs.length === 5 && new Set(hs).size === 1, 'dictionary game coin holes differ in size / missing', `${g}${mishak || ''} song ${s}: ${hs.join(' ')}`);
        const coins = await playCurrent(`free${s}`);
        if (coins != null) {
          const back = await ctx.waitFor(s => location.hash === '#/maslul/' + s, 15000, s);
          ctx.check(back, 'dictionary game did not end', `${g}${mishak || ''} song ${s}: at ${await hash()}`);
        }
      }
    }

    // ------------------------------------------------------------ maslul chains
    const chainSongs = ctx.quick ? [1, 2] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const s of chainSongs) {
      for (let m = 0; m < 3; m++) {
        const key = `${s}/${m}`;
        ctx.step(`chain/${key}`);
        await go('#/maslul/' + s);
        await sleep(300);
        await clickEl(m => __c(MK._test.refs.btnMsl1[m]), `maslul ${m}`, m);
        let steps = 0;
        while (steps < 6) {
          const moved = await ctx.waitFor(() => /^#\/(play|game1|game2|game5|slog|gam3|sofer)\//.test(location.hash), 20000);
          if (!moved) { ctx.finding('error', 'maslul chain stalled', `${key} at ${await hash()}`); await ctx.shot('chain-stall'); break; }
          if (/^#\/sofer\//.test(await hash())) break;
          const h = await hash();
          ctx.step(`chain/${key}/${h.replace(/^#\//, '').split('?')[0]}`);
          const code = +(/nomerMasl=(\d+)/.exec(h) || [])[1];
          const coins = await playCurrent(`chain${s}-${m}`);
          if (coins == null) { await ctx.shot('chain-dead'); break; }
          note(key, code, coins);
          // wait to leave this step
          await ctx.waitFor(h => location.hash !== h, 20000, h);
          steps++;
        }
        const atSofer = await ctx.waitFor(() => /^#\/sofer\//.test(location.hash), 15000);
        if (!atSofer) continue;
        await sleep(2500);
        await ctx.checkImages();
        if (s === 1 && m === 0) await ctx.shot('sofer-chain');
        const tz = await T(() => JSON.parse(localStorage.getItem('mikraot:tozaot') || '{}'));
        const saved = (tz[s] || {})[m] || {};
        ctx.check(saved.done === 1, 'maslul not marked done after its chain', `${key}: ${JSON.stringify(saved)}`);
        for (const [code, c] of Object.entries(expectCoins[key] || {})) {
          ctx.check(+(saved[code] || 0) === c, 'Tozaot step coins mismatch', `${key} step ${code}: saved ${saved[code]}, earned ${c}`);
        }
        const sum = Object.values(expectCoins[key] || {}).reduce((a, b) => a + b, 0);
        const label = await T(() => document.body.innerText);
        ctx.check(new RegExp(`אספת ${sum} מטבעות`).test(label), 'SOFER total wrong', `${key}: expected ${sum}; text: ${(label.match(/אספת[^\n]*/) || [''])[0]}`);
        // back to the picker: this maslul now shows as completed
        await clickEl(() => __c([...document.querySelectorAll('button.ctrl')].find(b => /back|hemsheh/.test(b.style.backgroundImage))), 'sofer return');
        await waitHash(new RegExp(`^#/maslul/${s}$`));
        await sleep(500);
        const img = await ctx.eval(m => MK._test.refs.btnMsl1[m] && MK._test.refs.btnMsl1[m].style.backgroundImage, m);
        ctx.check(new RegExp(`masl${m + 1}b\\.`).test(img), 'completed maslul not shown as done', `${key}: ${img}`);
      }
      if (s === 1) {
        // A completed maslul opens SOFER directly.
        ctx.step('chain/1/revisit');
        await clickEl(() => __c(MK._test.refs.btnMsl1[0]), 'done maslul');
        ctx.check(await waitHash(/^#\/sofer\/1\/0$/, 15000), 'completed maslul did not open SOFER', await hash());
        await sleep(1500);
      }
    }

    // ------------------------------------------------------------ progress UI after completion
    ctx.step('kivun/after-progress');
    await go('#/maslul');
    await sleep(800);
    await ctx.checkImages();
    await ctx.shot('kivun-progress');
    const colors = await T(() => MK._test.refs.Label1.map(l => l.style.color));
    ctx.check(colors[0] === 'rgb(255, 255, 0)', 'completed song number not yellow', colors.join(' '));
    ctx.step('kivun/modiin');
    await clickEl(() => __c([...document.querySelectorAll('button[title="מודיעין"]')][0]), 'modiin');
    await sleep(1500);
    await ctx.shot('azaga');
    // Only cred.mp4 exists; the per-song film must not leave a dead
    // black screen — PROBA falls back to kolnoa + L1 and returns.
    ctx.check(await waitHash(/^#\/maslul$/, 25000), 'Azaga film screen never returned to the picker', await hash());

    // ------------------------------------------------------------ AGDARA
    ctx.step('agdara');
    // lblAgdara is hidden on completed maslulim — forget song 1's results.
    await T(() => { const t = JSON.parse(localStorage.getItem('mikraot:tozaot') || '{}'); delete t[1]; localStorage.setItem('mikraot:tozaot', JSON.stringify(t)); });
    await go('#/maslul');
    await go('#/maslul/1');
    const ag = await ctx.eval(() => { const l = MK._test.refs.lblAgdara.find(l => l && l.style.display !== 'none'); return __c(l); });
    ctx.check(ag, 'no AGDARA label on an uncompleted maslul');
    if (ag) {
      await page.mouse.click(ag.x, ag.y, { count: 2 });
      ctx.check(await waitHash(/^#\/agdara\//, 5000), 'agdara double-click did nothing');
      await sleep(400);
      await ctx.checkImages();
      await ctx.shot('agdara');
      await ctx.monkey({ n: 15, avoid: 'button[style*="stop"],button[style*="back"]' });
      await clickEl(() => __c([...document.querySelectorAll('button.ctrl')].find(b => /back/.test(b.style.backgroundImage))), 'agdara return');
      await sleep(500);
    }

    // ------------------------------------------------------------ misc routes
    for (const h of ['#/misger?kind=2&return=%23%2Fstart', '#/tozaot/1/0', '#/notready?label=x', '#/likro', '#/voprTx', '#/voprTm', '#/sofer/3/2', '#/bogus']) {
      ctx.step('route ' + h);
      await go(h);
      await sleep(800);
      await ctx.checkImages();
      await ctx.assertAlive(h, 600);
    }

    // ------------------------------------------------------------ #79
    // Every full-screen form must land on the same on-screen rectangle —
    // otherwise the whole picture jumps a few pixels on each screen change.
    ctx.step('stage-geometry-79');
    const rects = {};
    for (const h of ['#/maslul', '#/maslul/3', '#/start', '#/play/3/1?tirgul=1', '#/play/3/2?tirgul=4', '#/sofer/1/0',
      '#/game5/3/0?nomerMasl=6', '#/game2/3/0?nomerMasl=8', '#/slog/3/0?nomerMasl=9', '#/gam3/3/0?nomerMasl=11', '#/agdara/1']) {
      await go(h);
      await sleep(400);
      rects[h] = await T(() => { const r = document.querySelector('.stage').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10).join(','); });
    }
    const distinct = [...new Set(Object.values(rects))];
    ctx.check(distinct.length === 1, 'screens are scaled/offset differently — picture jumps on screen change (#79)', JSON.stringify(rects));

    // ------------------------------------------------------------ chaos
    await setSpeed(1);
    for (const h of ['#/maslul/3', '#/start', '#/play/3/1?tirgul=5', '#/game1/3/0?mishak=4&nomerMasl=5', '#/gam3/4/0?nomerMasl=11']) {
      ctx.step('monkey ' + h);
      await go(h);
      await sleep(800);
      await ctx.monkey({ n: ctx.quick ? 20 : 40, avoid: 'button[title="יציאה"],button[style*="stop.png"],button[style*="stop.webp"]', stopWhen: () => !/^#\//.test(location.hash) });
      await ctx.checkImages();
      await ctx.assertAlive('after monkey ' + h, 1000);
    }
    await ctx.shot('after-monkey');
  },
};
