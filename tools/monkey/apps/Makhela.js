// Makhela (מקהלה) — pure-JS rebuild of the DOS music game.
// Walks the hub, every hub hotspot, every sub-game (songs + all 10 song
// playbacks, instruments + all 10 instruments, memory game, game-show quiz,
// settings, credits) — plays each game correctly to completion, checks
// scores/rejections, exits back through every screen (issue #81), then a
// seeded chaos pass.
//
// Test hooks: MKH._test.memoryGame() / MKH._test.gameShow() (screens.js).
const HUB = 'makhela_site/index.html';

// Injected before any page script: records every media element's life
// (play / playing / pause / ended / error) so the driver can assert on
// audio + video playback, and optionally speeds all media up.
function mediaHook() {
  const mm = window.__mm = { log: [], els: [], speed: 1 };
  const track = el => {
    if (el.__mm) return; el.__mm = true; mm.els.push(el);
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
  // <video autoplay> never calls play() — catch it in the capture phase.
  document.addEventListener('play', e => { if (e.target instanceof HTMLMediaElement) track(e.target); }, true);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// image_format.js swaps .png → .webp at runtime; compare on the .png name.
const norm = s => s && String(s).replace(/\.webp$/, '.png');

module.exports = {
  async run(ctx) {
    const { page } = ctx;
    await page.evaluateOnNewDocument(mediaHook);

    const hs = label => `button.hotspot[title="${label}"]`;
    const hashIs = h => ctx.waitFor(h => location.hash === h, 15000, h);
    const hubIdle = () => ctx.waitFor(() => location.hash.replace('#/', '') === '' &&
      document.querySelectorAll('button.hotspot').length >= 10 && !document.querySelector('.stage video'), 20000);
    const mediaMark = () => ctx.eval(() => window.__mm.log.length);
    const mediaSince = i => ctx.eval(i => window.__mm.log.slice(i), i);

    // Poll (in page) how long the hub shows the bare m0.png — no video frame
    // painted yet — after a mini-game exit. Issue #81: "a second where you
    // stand still (start position) and then teleport back to the cutscene".
    async function armReturnProbe() {
      await ctx.eval(() => {
        const p = window.__retProbe = { staticMs: 0, videoSeen: false, t0: performance.now(), done: false };
        let last = performance.now();
        (function tick() {
          const now = performance.now();
          const onHub = location.hash === '#/' || location.hash === '' || location.hash === '#';
          const v = document.querySelector('.stage video');
          const stage = document.querySelector('.stage');
          const bg = stage ? getComputedStyle(stage).backgroundImage : '';
          if (onHub && /m0\.(png|webp)/.test(bg)) {
            if (v && v.readyState >= 2 && !v.paused) p.videoSeen = true;
            else if (!p.videoSeen) p.staticMs += now - last;
          }
          last = now;
          if (now - p.t0 < 4000 && !p.videoSeen) requestAnimationFrame(tick); else p.done = true;
        })();
      });
    }
    async function checkReturnProbe(label) {
      await ctx.waitFor(() => window.__retProbe && window.__retProbe.done, 6000);
      const p = await ctx.eval(() => window.__retProbe);
      ctx.check(p.videoSeen, 'return anim never played', `${label}: no return video after exit`, 'warn');
      ctx.check(p.staticMs < 150, 'static hub flash before return anim (#81)',
        `${label}: bare m0.png shown for ${p.staticMs | 0}ms before the return cutscene`);
    }

    // Common: from hub click a routed hotspot, wait for the target route.
    async function enter(label, route) {
      ctx.check(await hubIdle(), 'hub not idle', `before entering ${label}`);
      await ctx.clickSel(hs(label));
      const ok = await hashIs(route);
      ctx.check(ok, 'hotspot did not route', `${label} → ${route}, at ${await ctx.eval(() => location.hash)}`);
      await sleep(600);
      return ok;
    }
    async function exitVia(sel, label, expectReturn = true) {
      if (expectReturn) await armReturnProbe();
      await ctx.clickSel(sel);
      ctx.check(await hashIs('#/'), 'exit did not return to hub', label);
      if (expectReturn) await checkReturnProbe(label);
      ctx.check(await hubIdle(), 'hub hotspots never came back', `after exiting ${label}`);
    }

    // ------------------------------------------------------------ hub
    ctx.step('hub');
    await ctx.goto(HUB, 1200);
    await ctx.checkImages();
    await ctx.shot('hub');
    const hubLabels = await ctx.eval(() => [...document.querySelectorAll('button.hotspot')].map(b => b.title));
    ctx.check(hubLabels.length === 12, 'hub hotspot count', `got ${hubLabels.length}: ${hubLabels.join(', ')}`);

    // Decorative hotspots: each click plays a clipped effect then restores.
    const deco = ['clock', 'window', 'bell', 'surprise box', 'kid playing the game', 'kid playing the game',
      'kid playing the game', 'kid playing the game', 'kid playing the game'];
    for (const [i, label] of deco.entries()) {
      ctx.step(`hub/deco/${label}#${i}`);
      await hubIdle();
      const m = await mediaMark();
      await ctx.clickSel(hs(label), 300);
      const v = await ctx.eval(() => { const v = document.querySelector('.stage video'); return v && { src: v.getAttribute('src'), clip: v.style.clipPath }; });
      ctx.check(v, 'decorative hotspot played nothing', label);
      if (v) ctx.check(/inset/.test(v.clip), 'decorative anim not clipped (#28)', `${label}: ${v.src}`);
      // The clip must still contain every pixel the effect moves (#80) —
      // bounds measured offline by diffing each MP4's frames (320x200).
      const MOTION = { 'm5_1': [122, 12, 159, 45], 'm5_2': [6, 10, 39, 48], 'm5_3': [283, 19, 310, 37], 'm5_4': [0, 118, 42, 170],
        'fok1': [132, 67, 179, 108], 'fok2': [126, 67, 184, 120], 'fok3': [128, 67, 173, 108], 'fok4': [124, 67, 172, 108], 'fok5': [132, 68, 184, 108] };
      const mb = v && MOTION[(v.src.match(/(m5_\d|fok\d)\.mp4/) || [])[1]];
      const ins = v && (v.clip.match(/inset\(([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px\)/) || []).slice(1).map(Number);
      if (mb && ins && ins.length === 4) {
        const [t, r, b, l] = ins;          // stage px (640x400)
        const cx0 = l / 2, cy0 = t / 2, cx1 = (640 - r) / 2, cy1 = (400 - b) / 2;
        ctx.check(cx0 <= mb[0] && cy0 <= mb[1] && cx1 > mb[2] && cy1 > mb[3], 'decorative anim clipped mid-sprite (#80)',
          `${v.src}: clip ${cx0},${cy0}..${cx1},${cy1} vs motion ${mb.join(',')}`);
      }
      await sleep(1200);
      if (i <= 5) await ctx.shot(`deco-${label}-${i}-mid`);
      ctx.check(await hubIdle(), 'decorative anim never finished', label);
      const ev = await mediaSince(m);
      const bad = ev.filter(e => e.ev === 'error');
      ctx.check(!bad.length, 'media error', bad.map(e => e.src).join(' '));
      // An anim that ends much earlier than its media duration = "cut off" (#80).
      const vid = ev.filter(e => /\.mp4/.test(e.src || '') && (e.ev === 'pause' || e.ev === 'ended'));
      for (const e of vid) {
        if (e.dur && e.ct < e.dur - 0.5) ctx.finding('warn', 'anim stopped early', `${label}: ${e.src.replace(/.*assets\//, '')} at ${e.ct.toFixed(2)}/${e.dur.toFixed(2)}s`);
      }
    }

    // ------------------------------------------------------------ songs
    ctx.step('songs/enter');
    await enter('listn music chair', '#/songs');
    await ctx.checkImages();
    await ctx.shot('songs');
    const SONGS = await ctx.eval(() => Object.fromEntries((MKH.SONGS || []).map(s => [s.key, s.video])));
    const LINES = ['aviron', 'tiktak', 'ionatan', 'shofan', 'taish', 'aba', 'udi', 'zebra', 'parash', 'aliza'];
    for (let n = 1; n <= 10; n++) {
      const key = LINES[n - 1];
      ctx.step(`songs/${n}-${key}`);
      await ctx.waitFor(() => location.hash === '#/songs' && document.querySelectorAll('button.hotspot').length >= 12, 10000);
      await ctx.clickSel(hs(`song ${n}`), 350);
      const prev = await ctx.eval(() => { const i = document.querySelector('.stage img'); return i && { src: i.getAttribute('src'), op: i.style.opacity }; });
      ctx.check(prev && norm(prev.src) === `assets/song_thumbs/${key}.png` && prev.op === '1', 'song line did not select song', `line ${n} → ${JSON.stringify(prev)}`);
      await sleep(900);   // kid voice intro running
      if (n === 1) await ctx.shot('song-line-intro');
      await ctx.clickSel(hs('preview song'), 200);
      ctx.check(await hashIs(`#/songs/${key}`), 'preview song did not open playback', key);
      await sleep(2500);
      const pl = await ctx.eval(() => { const v = document.querySelector('.song-player video'); return v && { src: v.getAttribute('src'), t: v.currentTime, err: v.error && v.error.code, paused: v.paused }; });
      ctx.check(pl && pl.src === 'assets/' + SONGS[key], 'wrong song video', `${key}: ${JSON.stringify(pl)}`);
      ctx.check(pl && !pl.err && pl.t > 0.5, 'song video not playing', `${key}: ${JSON.stringify(pl)}`);
      if (n === 1 || n === 7) { await ctx.checkImages(); await ctx.shot(`songplay-${key}`); }
      if (n === 1) {
        await ctx.clickSel('button.lyrics-toggle', 200);
        ctx.check(await ctx.eval(() => document.querySelector('.lyrics-overlay').style.display === 'none'), 'lyrics toggle did not hide lyrics');
        await ctx.clickSel('button.lyrics-toggle', 200);
      }
      await ctx.clickSel('button.btn-x', 300);
      ctx.check(await hashIs('#/songs'), 'song close did not return to list', key);
      await sleep(400);
      ctx.check(await ctx.eval(() => [...document.querySelectorAll('video')].every(v => v.paused || !v.isConnected)), 'song audio leaks after close', key);
    }

    // #47 — clicking a different song while the kid is announcing one.
    ctx.step('songs/overlap-47');
    await ctx.clickSel(hs('song 4'), 400);
    const m47 = await mediaMark();
    await sleep(500);
    await ctx.clickSel(hs('song 5'), 600);
    const ev47 = await mediaSince(m47);
    const sel47 = await ctx.eval(() => document.querySelector('.stage img').getAttribute('src'));
    ctx.check(!ev47.some(e => e.ev === 'play' && /m_5_2/.test(e.src)),
      'song click accepted while another song intro plays (#47)', `selected=${sel47}; plays=${ev47.filter(e => e.ev === 'play').map(e => e.src.replace(/.*\//, '')).join(',')}`);
    await sleep(3500);

    // double-click path + kid-on-chair shortcut
    ctx.step('songs/dblclick');
    const b3 = await page.$eval(hs('song 3'), el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(b3.x, b3.y, { clickCount: 1 });
    await page.mouse.click(b3.x, b3.y, { clickCount: 2 });
    ctx.check(await hashIs('#/songs/ionatan'), 'double-click did not open song', 'ionatan');
    await sleep(800);
    await ctx.clickSel('button.btn-x');
    await hashIs('#/songs');
    ctx.step('songs/kid-on-chair');
    await sleep(600);
    await ctx.clickSel(hs('song 2'), 400);
    await sleep(3800);
    await ctx.clickSel(hs('kid on chair'), 300);
    ctx.check(await hashIs('#/songs/tiktak'), 'kid-on-chair shortcut did not open selected song', await ctx.eval(() => location.hash));
    await sleep(500);
    await ctx.clickSel('button.btn-x');
    await hashIs('#/songs');
    await sleep(600);

    ctx.step('songs/monkey');
    await ctx.monkey({ n: 25, avoid: `${hs('exit')},${hs('preview song')},${hs('kid on chair')}`, stopWhen: () => location.hash !== '#/songs' });
    if (await ctx.eval(() => location.hash) !== '#/songs') { await ctx.eval(() => { location.hash = '#/songs'; }); await sleep(800); }
    await ctx.assertAlive('songs', 1000);
    ctx.step('songs/exit');
    await sleep(4000);
    await exitVia(hs('exit'), 'songs');

    // ------------------------------------------------------------ instruments
    ctx.step('instruments/enter');
    await enter('instruments', '#/instruments');
    await ctx.checkImages();
    await ctx.shot('instruments');
    ctx.step('instruments/notes');
    for (let n = 1; n <= 8; n++) await ctx.clickSel(hs('not' + n), 120);
    const notes = await ctx.eval(() => [...document.querySelectorAll('.music-note')].map(e => parseFloat(e.style.top)));
    ctx.check(notes.length === 8, 'note keys did not write notes', `got ${notes.length}`);
    ctx.check(notes.every((y, i) => i === 0 || y < notes[i - 1]), 'staff notes not ascending for do..do', notes.join(','));
    await ctx.page.keyboard.press('3');
    ctx.check((await ctx.eval(() => document.querySelectorAll('.music-note').length)) === 9, 'keyboard digit did not add a note');
    await ctx.shot('notes-written');
    ctx.step('instruments/tempo');
    const t0 = await ctx.eval(() => +document.querySelector('.tempo-control input').value);
    await ctx.clickSel('.tempo-btn[data-act="fast"]', 100);
    const t1 = await ctx.eval(() => +document.querySelector('.tempo-control input').value);
    ctx.check(t1 < t0, 'tempo + did not speed up', `${t0} → ${t1}`);
    await ctx.clickSel('.tempo-btn[data-act="slow"]', 100);
    ctx.step('instruments/play');
    await ctx.clickSel(hs('play music'), 700);
    const playing = await ctx.eval(() => document.querySelectorAll('.music-note.playing').length);
    ctx.check(playing === 1, 'play music does not highlight the playing note', `playing=${playing}`);
    await sleep(2600);
    ctx.check(await ctx.eval(() => [...document.querySelectorAll('.music-note')].every(e => e.style.visibility !== 'hidden')), 'notes left hidden after playback');

    ctx.step('instruments/picker');
    for (let inst = 1; inst <= 10; inst++) {
      await ctx.clickSel(hs('instrument selector'));
      if (!await hashIs('#/instruments/select')) { ctx.finding('error', 'instrument selector did not open'); break; }
      if (inst === 1) { await ctx.checkImages(); await ctx.shot('instrument-picker'); }
      const m = await mediaMark();
      await ctx.clickSel(hs('instrument ' + inst), 300);
      const st = await ctx.eval(() => ({ thumb: (document.querySelector('.pan-sel-thumb') || {}).getAttribute && document.querySelector('.pan-sel-thumb').getAttribute('src'),
        ring: !!document.querySelector('.pan-sel-frame') }));
      ctx.check(norm(st.thumb) === `assets/bitmaps/instruments/inst${inst}.png` && st.ring, 'instrument pick not reflected', `inst ${inst}: ${JSON.stringify(st)}`);
      const ev = await mediaSince(m);
      ctx.check(ev.some(e => e.ev === 'play' && new RegExp(`instruments/${inst}\\.ogg`).test(e.src)), 'instrument name not spoken', `inst ${inst}`);
      await ctx.clickSel(hs(inst % 2 ? 'select instrument' : 'exit'));
      await hashIs('#/instruments');
      await sleep(300);
      const th = await ctx.eval(() => document.querySelector('.pan-sel-thumb') && document.querySelector('.pan-sel-thumb').getAttribute('src'));
      ctx.check(norm(th) === `assets/bitmaps/instruments/inst${inst}.png`, 'notes screen shows wrong instrument', `want inst${inst}, got ${th}`);
      ctx.check((await ctx.eval(() => document.querySelectorAll('.music-note').length)) === 9, 'composition lost across instrument change', `inst ${inst}`);
    }
    ctx.step('instruments/monkey');
    await ctx.monkey({ n: 25, avoid: `${hs('exit game')},${hs('instrument selector')}` });
    await ctx.assertAlive('instruments', 800);
    ctx.step('instruments/exit');
    await exitVia(hs('exit game'), 'instruments');

    // ------------------------------------------------------------ memory game
    ctx.step('memory/enter');
    await enter('pazel game', '#/freeplay');
    await ctx.checkImages();
    await ctx.shot('memory');
    const deck = (await ctx.eval(() => MKH._test && MKH._test.memoryGame && MKH._test.memoryGame())).deck;
    ctx.check(deck && deck.length === 12, 'memory deck not 12 cards', JSON.stringify(deck));
    const cardSel = i => `.memory-card:nth-of-type(${i + 1})`;
    const clickCard = async i => {
      const box = await ctx.eval(i => { const c = document.querySelectorAll('.memory-card')[i]; if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
      if (!box) return false;
      await ctx.click(box.x, box.y, 150);
      return true;
    };
    ctx.step('memory/wrong-pair');
    const a0 = 0, b0 = deck.findIndex(s => s !== deck[0]);
    await clickCard(a0); await clickCard(b0);
    await sleep(1200);
    const st0 = await ctx.eval(() => MKH._test.memoryGame());
    ctx.check(st0.matched === 0, 'mismatched pair accepted', JSON.stringify(st0));
    ctx.check(await ctx.eval(() => [...document.querySelectorAll('.memory-card')].every(c => !c.children.length)), 'mismatched cards did not flip back');
    ctx.step('memory/triple-click');
    // Clicking a third card while a mismatch is showing must be ignored.
    const c3 = deck.findIndex((s, i) => i > 1 && s !== deck[0] && s !== deck[b0]);
    await clickCard(a0); await clickCard(b0); await clickCard(c3);
    await sleep(1200);
    ctx.check(await ctx.eval(() => [...document.querySelectorAll('.memory-card')].every(c => !c.children.length)), 'card flipped during mismatch lockout');
    ctx.step('memory/solve');
    const done = new Set();
    // cards are removed from the DOM once matched — map deck index → DOM
    // index by counting survivors.
    for (let i = 0; i < 12; i++) {
      if (done.has(i)) continue;
      const j = deck.findIndex((s, k) => k !== i && s === deck[i] && !done.has(k));
      const domIdx = x => x - [...done].filter(d => d < x).length;
      await clickCard(domIdx(i)); await clickCard(domIdx(j));
      done.add(i); done.add(j);
      await sleep(950);
      const st = await ctx.eval(() => MKH._test.memoryGame());
      ctx.check(st.matched === done.size / 2, 'matching pair not accepted', `after pair ${deck[i]}: ${JSON.stringify(st)}`);
      if (done.size === 6) await ctx.shot('memory-half');
    }
    ctx.step('memory/win-video');
    // Track the celebration video element itself: how long it stays on
    // screen and how far it plays before being removed (#11).
    await ctx.eval(() => {
      const p = window.__winProbe = { t0: null, maxCt: 0, gone: null, dur: null };
      (function tick() {
        const v = [...document.querySelectorAll('.stage video')].find(v => v.style.zIndex === '300');
        const now = performance.now();
        if (v) { if (p.t0 == null && v.currentTime > 0) p.t0 = now; p.maxCt = Math.max(p.maxCt, v.currentTime); p.dur = v.duration; }
        else if (p.t0 != null && p.gone == null) p.gone = now;
        if (p.gone == null && now - (p.t0 || now) < 15000) requestAnimationFrame(tick);
      })();
    });
    const mWin = await mediaMark();
    const winOk = await ctx.waitFor(() => { const v = [...document.querySelectorAll('.stage video')].find(v => v.style.zIndex === '300'); return v && v.currentTime > 0.2; }, 5000);
    ctx.check(winOk, 'memory win video did not start');
    await ctx.shot('memory-win-start');
    await sleep(1500);
    await ctx.shot('memory-win-1.5s');
    await sleep(4500);
    const wp = await ctx.eval(() => window.__winProbe);
    const aEnd = (await mediaSince(mWin)).find(e => /song_names/.test(e.src || '') && e.ev === 'ended');
    const shown = wp.gone && wp.t0 ? (wp.gone - wp.t0) / 1000 : null;
    ctx.finding('info', 'memory win timing', `video on screen ${shown && shown.toFixed(2)}s, played to ${wp.maxCt.toFixed(2)}/${wp.dur && wp.dur.toFixed(2)}s, voice ${aEnd ? 'ended at ' + aEnd.ct.toFixed(2) + 's' : 'n/a'}`);
    ctx.check(wp.t0 && wp.maxCt > (wp.dur || 4) - 0.5, 'memory win video cut short (#11)', JSON.stringify(wp));
    await ctx.waitFor(() => !document.querySelector('.btn-x'), 6000);
    ctx.step('memory/replay');
    await ctx.clickSel(hs('play video when game complete'), 800);
    ctx.check(await ctx.eval(() => !!document.querySelector('.btn-x')), 'replay-win hotspot did nothing after completion');
    await ctx.clickSel('button.btn-x', 300);
    ctx.step('memory/exit');
    await exitVia(hs('return to main screen'), 'memory');

    // ------------------------------------------------------------ game show
    ctx.step('gameshow/enter');
    await enter('quiz game', '#/mini');
    await ctx.checkImages();
    await ctx.shot('gameshow');
    let wrongPlanned = 0;
    for (let r = 0; r < 9; r++) {
      ctx.step(`gameshow/round${r + 1}`);
      const ok = await ctx.waitFor(r => { const s = MKH._test.gameShow(); return s.round === r && !s.busy && document.querySelectorAll(`.gs-slot[data-round="${r}"]`).length === 4; }, 6000, r);
      if (!ok) { ctx.finding('error', 'game-show round did not start', `round ${r + 1}`); await ctx.shot('gs-stuck'); break; }
      const st = await ctx.eval(() => MKH._test.gameShow());
      ctx.check(st.slotSongs.includes(st.currentTarget), 'target song missing from the 4 choices', JSON.stringify(st));
      ctx.check(new Set(st.slotSongs).size === 4, 'duplicate song among choices', JSON.stringify(st.slotSongs));
      const audio = await ctx.eval(() => { const e = window.__mm.log.filter(e => e.ev === 'play' && /assets\/songs\//.test(e.src)).pop(); return e && e.src; });
      const KEYS = [null, 'aviron', 'tiktak', 'ionatan', 'shofan', 'taish', 'aba', 'udi', 'zebra', 'parash', 'aliza'];
      ctx.check(audio && audio.includes('/songs/' + KEYS[st.currentTarget] + '.mp4'), 'round audio is not the target song', `target=${KEYS[st.currentTarget]} audio=${audio}`);
      const wrong = r === 2 || r === 5;          // two deliberate misses
      const slotIdx = wrong ? st.slotSongs.findIndex(s => s !== st.currentTarget) : st.slotSongs.indexOf(st.currentTarget);
      if (wrong) wrongPlanned++;
      const box = await ctx.eval((r, i) => { const el = document.querySelector(`.gs-slot[data-round="${r}"][data-slot="${i}"]`); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, r, slotIdx);
      await ctx.click(box.x, box.y, 60);
      await ctx.click(box.x, box.y, 60);            // double click must not score twice
      await sleep(300);
      const kid = await ctx.eval(() => (document.querySelector('.gs-kid') || {}).src || '');
      const f = +((kid.match(/_(\d\d)\.(png|webp)/) || [])[1] || 0);
      ctx.check(wrong ? (f === 7 || f === 8) : (f === 5 || f === 6), 'kid reaction wrong for answer', `wrong=${wrong} frame=${f}`);
      if (r === 0) await ctx.shot('gs-answered');
      const after = await ctx.eval(() => MKH._test.gameShow());
      ctx.check(after.correct === (r + 1) - wrongPlanned, 'game-show score wrong', `round ${r + 1}: correct=${after.correct} expected ${(r + 1) - wrongPlanned}`);
    }
    ctx.step('gameshow/finale');
    const fin = await ctx.waitFor(() => { const v = document.querySelector('.stage video'); return v && /kohav/.test(v.getAttribute('src')); }, 6000);
    ctx.check(fin, 'game-show finale video missing');
    if (fin) {
      const src = await ctx.eval(() => document.querySelector('.stage video').getAttribute('src'));
      ctx.check(src === `assets/animations/durno/kohav${9 - wrongPlanned}.mp4`, 'finale shows wrong star count', `${src} (expected kohav${9 - wrongPlanned})`);
      await sleep(1200);
      await ctx.shot('gs-finale');
      await armReturnProbe();
      await ctx.clickSel('button.btn-x');
      await hashIs('#/');
      await checkReturnProbe('game-show finale');
      await hubIdle();
    }
    // Round timer expiry exits to hub (25 s) — only in full runs.
    if (!ctx.quick) {
      ctx.step('gameshow/timeout');
      await enter('quiz game', '#/mini');
      ctx.check(await ctx.waitFor(() => location.hash === '#/', 32000), 'game-show timer never expired');
      await hubIdle();
    }
    ctx.step('gameshow/monkey');
    await enter('quiz game', '#/mini');
    await ctx.monkey({ n: 30, avoid: hs('return to main menu'), stopWhen: () => location.hash !== '#/mini' });
    if (await ctx.eval(() => location.hash) === '#/mini') await exitVia(hs('return to main menu'), 'game-show');
    else await hubIdle();

    // ------------------------------------------------------------ settings
    ctx.step('settings/enter');
    await enter('set volume', '#/settings');
    await ctx.checkImages();
    await ctx.shot('settings');
    const rows = [['music', 'main screen music volume'], ['speech', 'child speach volume'], ['songs', 'songs clip volume'], ['master', 'master volume']];
    for (const [ch, pre] of rows) {
      ctx.step('settings/' + ch);
      const v0 = await ctx.eval(ch => MKH.settings[ch], ch);
      await ctx.clickSel(hs(ch === 'master' ? 'master volume down' : pre + ' down btn'), 100);
      const v1 = await ctx.eval(ch => MKH.settings[ch], ch);
      ctx.check(Math.abs(v1 - Math.max(0, v0 - 0.1)) < 1e-6, 'volume down wrong', `${ch}: ${v0} → ${v1}`);
      await ctx.clickSel(hs(ch === 'master' ? 'master volume up' : pre + ' up btn'), 100);
      const v2 = await ctx.eval(ch => MKH.settings[ch], ch);
      ctx.check(Math.abs(v2 - Math.min(1, v1 + 0.1)) < 1e-6, 'volume up wrong', `${ch}: ${v1} → ${v2}`);
      // click the slider track at 75%
      const idx = rows.findIndex(r => r[0] === ch);
      const box = await ctx.eval(i => { const b = document.querySelectorAll('.vol-slider')[i].getBoundingClientRect(); return { x: b.left + b.width * 0.75, y: b.top + b.height / 2 }; }, idx);
      await ctx.click(box.x, box.y, 150);
      const v3 = await ctx.eval(ch => MKH.settings[ch], ch);
      ctx.check(Math.abs(v3 - 0.75) < 0.03, 'slider click did not set volume', `${ch}: ${v3}`);
    }
    for (const s of ['play screen music mipi', 'play child sound', 'ply songs clip']) await ctx.clickSel(hs(s), 400);
    const persisted = await ctx.eval(() => JSON.parse(localStorage.getItem('makhela:settings') || '{}'));
    ctx.check(Math.abs(persisted.music - 0.75) < 0.03 && Math.abs(persisted.master - 0.75) < 0.03, 'settings not persisted', JSON.stringify(persisted));
    await ctx.shot('settings-after');
    ctx.step('settings/monkey');
    await ctx.monkey({ n: 20, avoid: hs('exit back to main menu') });
    ctx.step('settings/exit');
    await exitVia(hs('exit back to main menu'), 'settings', false);

    // ------------------------------------------------------------ credits
    ctx.step('credits');
    await enter('credits', '#/about');
    await sleep(1500);
    ctx.check(await ctx.eval(() => { const v = document.querySelector('.stage video'); return v && v.currentTime > 0.3 && !v.error; }), 'credits video not playing');
    await ctx.shot('credits');
    await ctx.clickSel(hs('exit credits'));
    ctx.check(await hashIs('#/'), 'credits exit did not return to hub');
    await hubIdle();

    // ------------------------------------------------------------ settings persist across reload
    ctx.step('reload');
    const beforeReload = await ctx.eval(() => JSON.stringify(MKH.settings));
    await ctx.goto(HUB, 1000);
    const afterReload = await ctx.eval(() => JSON.stringify(MKH.settings));
    ctx.check(afterReload === beforeReload, 'settings lost on reload', `${beforeReload} → ${afterReload}`);

    // ------------------------------------------------------------ deep links / unknown route
    ctx.step('deeplinks');
    for (const h of ['#/songs/nosuchsong', '#/bogus', '#/instruments/select', '#/mini', '#/freeplay', '#/settings', '#/about']) {
      await ctx.eval(h => { location.hash = h; }, h);
      await sleep(700);
      await ctx.assertAlive(h, 500);
    }
    await ctx.eval(() => { location.hash = '#/'; });
    await sleep(800);

    // ------------------------------------------------------------ chaos on hub
    ctx.step('hub/monkey');
    for (let k = 0; k < (ctx.quick ? 2 : 4); k++) {
      await hubIdle();
      await ctx.monkey({ n: 20, avoid: hs('exit game'), wait: 450, stopWhen: () => location.hash.length > 2 });
      await sleep(1500);
      await ctx.assertAlive('monkey sub-screen ' + await ctx.eval(() => location.hash), 800);
      await ctx.monkey({ n: 12, avoid: '.btn-x', wait: 400, stopWhen: () => location.hash.length <= 2 });
      await ctx.eval(() => { if (location.hash.length > 2) location.hash = '#/'; });
    }
    await sleep(1500);
    await ctx.checkImages();
    await ctx.shot('after-monkey');
    await ctx.assertAlive('after monkey', 1500);

    // ------------------------------------------------------------ exit game
    ctx.step('exit-game');
    await ctx.eval(() => { location.hash = '#/'; });
    await hubIdle();
    await ctx.clickSel(hs('exit game'));
    const left = await ctx.waitFor(() => !/makhela_site/.test(location.pathname), 8000);
    ctx.check(left, 'exit game did not leave to the catalog', await ctx.eval(() => location.href));
  },
};
