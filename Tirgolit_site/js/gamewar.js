// gamewar.js — WarG: shoot creatures by typing answers (GList row 5)
// VB6 source: WarG.frm — 3 levels × 4 questions each, 4 lanes, rooster at x=550
const GameWar = (() => {
  // ─── Constants (from VB6 Ipos / WarG.frm) ───────────────────────────────────
  const LANE_Y    = [70, 170, 270, 370];  // YPlaces[1-4]
  const ROOSTER_X = 550;
  const END_X     = ROOSTER_X - 90;       // creature x that triggers EndGame
  const C_W = 110, C_H = 100;             // creature frame size (VB6 AAAAP.Width/Hight)
  const R_W = 150, R_H = 112;             // rooster frame size (VB6 TarP 0-7 default)
  // TarP(9) = flower/explosion: 60×100 (VB6 IntEggs Case 9)
  const FLOWER_W = 60, FLOWER_H = 100;
  const GAME_SPEEDS = [0, 0.7, 0.8, 0.9]; // indexed by shlav 1-3
  const TICK_MS    = 70;                   // RunG.Interval
  const INIT_PAGAZ = 6;
  const WRONG_DEDUCT = 7;
  // TarP(8) sprite sheet (279×37): cursor at x=0 (22px/frame × 9), pagaz at x=210(30×35), miss at x=250(25×35)
  const PAG_SHEET_HIT_X = 210, PAG_SHEET_HIT_W = 30;
  const PAG_SHEET_MIS_X = 250, PAG_SHEET_MIS_W = 25;
  const PAG_H = 35;
  // TarP(10/11) = hen sprites (TarNLet): 105×79, positioned at x=695, y=LANE_Y[i]+33
  const HEN_W = 105, HEN_H = 79;
  const HEN_X = 695;
  // Klipa (pagaz counter image): position from VB6 left=8820/15, top=7515/15
  const KLIPA_X = 588, KLIPA_Y = 501, KLIPA_W = 96, KLIPA_H = 76;

  // ─── State ────────────────────────────────────────────────────────────────────
  let canvas, ctx;
  let unit, onComplete;
  let allPairs;      // 12 shuffled Q/A pairs
  let answered;      // boolean[13] (1-indexed)

  let shlav, warScore, tshNom, pagazNum, wrongCount, tarHit;

  // Rooster (TarN)
  let rPx, rPy, rLane;
  let rMachav, rAni;   // 0=idle, 1=down, 2=up, 3=shoot, 4=victory, 5=stagger, 6=flee
  let rTargetY;

  // Creatures[1..4] each: {px, py, lane, machav, ani, speed}
  // machav: 0=walk, 2=die, 99=flower playing (ani<999) or fully dead (ani===999)
  let creatures;

  // Pagaz (projectile)
  let pagaz;  // {fly, px, py, speed, ang, dest, hit}

  // Question
  let strAns, tshP, xq, yq, xqQ;

  // TarNLet — hen indicators on right side, one per lane
  // machav: 10=fast creature indicator (visible, loops), 11=brief flash, 99=hidden
  let tarnlet;  // array[1..4]

  // Sprites
  let bgImg;
  let pagazSheet = null;    // TarP(8) sprite sheet (8Tar1.png)
  let pagazImgs  = {};      // pagazImgs[n] = Pag_n.png (count 0-6, for Klipa HUD)
  let tarSpr  = {};         // tarSpr[state] = HTMLImageElement[]
  let mflSpr  = {};         // mflSpr[level][state] = HTMLImageElement[]
  let spritesReady = false;

  // Win-dance state (VB6 DansTrans)
  let dansTrans, celebrating;
  let fastLane;  // lane index (1-4) of the current fast creature

  // Lose sequence state (VB6 EndGame → rooster machav=6→7)
  let losing, losingLane;

  let permFlowers;  // [{x, y}] flowers baked into background — persist across waves

  let tickId, blinkId;
  let keyHandler;
  let cursorVis = true;
  let gameRunning, gameOver;

  // ─── Sprite loading ─────────────────────────────────────────────────────────
  function loadImg(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function loadSeq(urlFn, max) {
    const frames = [];
    for (let f = 1; f <= max; f++) {
      const img = await loadImg(urlFn(f));
      if (!img) break;
      frames.push(img);
    }
    return frames;
  }

  async function loadAllSprites() {
    bgImg      = await loadImg('./assets/war/Back.jpg');
    pagazSheet = await loadImg('./assets/war/Tar/8Tar1.png');

    const promises = [];
    // TarP 0-11 from AnimWar/Tar/ (skip 8 — already loaded as pagazSheet)
    for (let s = 0; s <= 11; s++) {
      if (s === 8) continue;
      const ss = s;
      promises.push(
        loadSeq(f => `./assets/war/Tar/${ss}Tar${f}.png`, 15).then(fr => { tarSpr[ss] = fr; })
      );
    }
    // Pagaz count images (Klipa HUD): Pag_0.png … Pag_6.png
    for (let n = 0; n <= 6; n++) {
      const nn = n;
      promises.push(loadImg(`./assets/war/Pagaz/Pag_${nn}.png`).then(img => { pagazImgs[nn] = img; }));
    }
    // Creature sprites per level (0-3 states)
    for (let lv = 1; lv <= 3; lv++) {
      if (!mflSpr[lv]) mflSpr[lv] = {};
      for (let st = 0; st <= 3; st++) {
        const lv2 = lv, st2 = st;
        promises.push(
          loadSeq(f => `./assets/war/Miflach${lv2}/${st2}Mflach${f}.png`, 20)
            .then(fr => { mflSpr[lv2][st2] = fr; })
        );
      }
    }
    await Promise.all(promises);
    spritesReady = true;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  function init(unitData, completeCb) {
    destroy();
    unit       = unitData;
    onComplete = completeCb;
    spritesReady = false;
    gameRunning  = false;
    gameOver     = false;

    canvas = document.getElementById('war-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    allPairs = buildPairs(unitData.questions, 12);
    answered = new Array(13).fill(false);

    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#fff';
    ctx.font = '32px serif';
    ctx.textAlign = 'center';
    ctx.fillText('טוען...', 400, 300);

    loadAllSprites().then(() => {
      if (!gameOver) restart();
    });
  }

  function destroy() {
    gameRunning = false;
    celebrating = false;
    dansTrans   = false;
    losing      = false;
    losingLane  = 0;
    gameOver    = true;
    clearInterval(tickId);
    clearInterval(blinkId);
    tickId  = null;
    blinkId = null;
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
  }

  // ─── Game setup ──────────────────────────────────────────────────────────────

  function buildPairs(questions, count) {
    const result = [];
    while (result.length < count) result.push(...shuffle([...questions]));
    return result.slice(0, count);
  }

  function restart() {
    warScore     = 100;
    wrongCount   = 0;
    shlav        = 1;
    dansTrans    = false;
    celebrating  = false;
    losing       = false;
    losingLane   = 0;
    gameRunning  = true;
    gameOver     = false;
    permFlowers  = [];

    rLane    = 1;
    rPx      = ROOSTER_X;
    rPy      = LANE_Y[0];
    rTargetY = LANE_Y[0];
    rMachav  = 0;
    rAni     = 0;

    for (let i = 1; i <= 12; i++) answered[i] = false;
    initLevel();
    shelInit();

    keyHandler = e => handleKey(e);
    window.addEventListener('keydown', keyHandler);
    blinkId = setInterval(() => { cursorVis = !cursorVis; }, 400);
    tickId  = setInterval(tick, TICK_MS);

    AudioMgr.play('./assets/war/Sta.wav');
  }

  function initLevel() {
    tshNom   = 0;
    pagazNum = INIT_PAGAZ;
    const speed = GAME_SPEEDS[shlav];
    creatures = {};
    for (let i = 1; i <= 4; i++) {
      creatures[i] = { px: -90, py: LANE_Y[i - 1], lane: i, machav: 0, ani: 0, speed };
    }
    const fast = Math.floor(Math.random() * 4) + 1;
    creatures[fast].speed = speed * 1.5;
    fastLane = fast;

    // TarNLet: all lanes start with brief flash (machav=11, VB6 init), fast one gets
    // continuous animation (machav=10) starting at frame 2 (VB6: TarNLet(Soho).Ani=2)
    tarnlet = {};
    for (let i = 1; i <= 4; i++) {
      tarnlet[i] = { machav: 11, ani: 0, px: HEN_X, py: LANE_Y[i - 1] + 33 };
    }
    tarnlet[fast].machav = 10;
    tarnlet[fast].ani    = 2;

    pagaz = { fly: false, px: 0, py: 0, speed: 35, ang: 0, dest: 0, hit: false };
  }

  function qi(lane) { return (lane - 1) + (shlav - 1) * 4 + 1; }

  function shelInit() {
    const idx = qi(rLane);
    if (idx < 1 || idx > allPairs.length) return;
    tshP   = allPairs[idx - 1].answer;
    strAns = tshP[0];
    yq     = 520;
    xqQ    = 100;
  }

  // ─── Tick ────────────────────────────────────────────────────────────────────

  function tick() {
    if (!gameRunning && !celebrating && !losing) return;
    if (gameRunning || losing) {
      updateRooster();
      if (pagaz && pagaz.fly) updatePageaz();
      for (let i = 1; i <= 4; i++) updateCreature(i);
    }
    // Render BEFORE updateHens — matches VB6 order: draw frame, then advance/hide.
    render();
    if (gameRunning || celebrating) updateHens();
  }

  function updateHens() {
    if (!tarnlet) return;
    for (let i = 1; i <= 4; i++) {
      const h = tarnlet[i];
      if (!h) continue;

      if (dansTrans) {
        // VB6 DansTrans win dance: pick random frame from specific range within TarP(11)
        // fast lane (machav=10): VB6 TrR in 6-8 → array index 5-7
        // other lanes (machav=11): VB6 TrR in 2-5 → array index 1-4
        const dFrames = tarSpr[11] || [];
        if (!dFrames.length) continue;
        const isFast = (h.machav === 10);
        let fr;
        let attempts = 0;
        do {
          fr = isFast ? (5 + Math.floor(Math.random() * 3)) : (1 + Math.floor(Math.random() * 4));
          attempts++;
        } while (fr === h.ani && attempts < 5);
        h.ani = Math.min(fr, dFrames.length - 1);
        continue;
      }

      if (h.machav === 99) continue;

      // VB6 random pause: at frame 1, skip advancement 7/8 of the time
      if (h.machav === 10 && h.ani === 1 && Math.random() < 7 / 8) continue;

      const frames = tarSpr[h.machav] || [];
      if (frames.length) {
        h.ani = (h.ani + 1) % frames.length;
      }
      // VB6 Case 11 fires EVERY tick (not just at wrap) — hide after one frame drawn
      if (h.machav === 11) h.machav = 99;
    }
  }

  function updateRooster() {
    // machav=7: transition to lose score (VB6 Case 7 → ShowScore 1)
    if (rMachav === 7) {
      losing = false;
      finish();
      return;
    }

    if (rMachav === 1) {
      rPy = Math.min(rPy + 10, rTargetY);
      if (rPy >= rTargetY) arriveAtLane();
    } else if (rMachav === 2) {
      rPy = Math.max(rPy - 10, rTargetY);
      if (rPy <= rTargetY) arriveAtLane();
    } else if (rMachav === 6) {
      rPx -= 13;  // flee left (VB6 Case 6: TarN.Px = TarN.Px - 13)
    }

    const frames = tarSpr[rMachav] || [];
    const nf = frames.length || 1;
    rAni = (rAni + 1) % nf;

    if (frames.length > 0 && rAni === 0) {
      switch (rMachav) {
        case 3:
          rMachav = tarHit || 0; rAni = 0;
          break;
        case 4:
          rMachav = 0; rAni = 0;
          break;
        case 5:
          if (pagazNum < 1 && tshNom < 4) {
            triggerEndGame(rLane);
          } else {
            rMachav = 0; rAni = 0;
          }
          break;
        case 6:
          // VB6: after ani wrap, set Ani=4. If Px<100, transition to machav=7.
          rAni = 4;
          if (rPx < 100) { rAni = 0; rMachav = 7; }
          break;
        default:
          if (rMachav !== 0 && rMachav !== 1 && rMachav !== 2) {
            rMachav = 0; rAni = 0;
          }
      }
    }
  }

  function arriveAtLane() {
    rPy      = rTargetY;
    rPx      = ROOSTER_X;
    rMachav  = 0;
    rAni     = 0;
    shelInit();
  }

  function updatePageaz() {
    pagaz.ang -= 1;
    pagaz.py  -= pagaz.ang * 4;
    pagaz.px  -= pagaz.speed;

    if (pagaz.hit && pagaz.px < pagaz.dest + 70) {
      pagaz.fly = false;
      const c = creatures[rLane];
      if (c && c.machav === 0) { c.machav = 2; c.ani = 0; }
    } else if (!pagaz.hit && pagaz.px < pagaz.dest) {
      pagaz.fly = false;
    }
  }

  function updateCreature(i) {
    const c = creatures[i];
    if (!c) return;

    if (c.machav === 99) {
      // Flower/explosion animation (TarP(9), 60×100)
      if (c.ani === 999) return;  // fully done
      const fFrames = tarSpr[9] || [];
      if (fFrames.length === 0) { c.ani = 999; afterCreatureDies(i); return; }
      c.ani++;
      if (c.ani >= fFrames.length) {
        c.ani = 999;  // flower complete
        afterCreatureDies(i);
      }
      return;
    }

    if (c.machav === 0 || c.machav === 3) {
      // machav=0: walk toward rooster; machav=3: flee (negative speed)
      c.px += c.speed;
      if (c.machav === 0 && c.px > END_X && rMachav < 6) { triggerEndGame(i); return; }
      const st = c.machav === 3 ? 3 : 0;
      const wFrames = mflSpr[shlav]?.[st] || mflSpr[shlav]?.[0] || [];
      if (wFrames.length) c.ani = (c.ani + 1) % wFrames.length;
    } else if (c.machav === 2) {
      const dFrames = mflSpr[shlav]?.[2] || [];
      c.ani++;
      const limit = dFrames.length || 3;
      if (c.ani >= limit) {
        // Death animation done → start flower animation (VB6: machav=99, Ani=0)
        c.machav = 99;
        c.ani    = 0;
      }
    }
  }

  function afterCreatureDies(lane) {
    // VB6: when fast creature dies, reassign speed to another creature
    const baseSpeed = GAME_SPEEDS[shlav];
    const died = creatures[lane];
    if (died && died.speed > baseSpeed && tshNom < 4) {
      // Pick a new random unanswered creature to be fast (VB6 lines 1365-1374)
      // VB6: TarNLet(i).Machav = 11, Ani = 0 — brief flash (not instant hide)
      if (tarnlet && tarnlet[lane]) { tarnlet[lane].machav = 11; tarnlet[lane].ani = 0; }
      const candidates = [];
      for (let i = 1; i <= 4; i++) {
        if (!answered[qi(i)] && creatures[i] && creatures[i].machav === 0) candidates.push(i);
      }
      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        creatures[pick].speed = baseSpeed * 1.5;
        fastLane = pick;
        if (tarnlet && tarnlet[pick]) { tarnlet[pick].machav = 10; tarnlet[pick].ani = 0; }
      }
    }

    if (pagazNum < 1 && tshNom < 4) { triggerEndGame(rLane); return; }
    if (tshNom >= 4) { advanceLevel(); return; }

    // Auto-navigate rooster to next unanswered lane (VB6 lines 1550-1566)
    for (let ii = lane; ii <= 4; ii++) {
      if (!answered[qi(ii)]) { moveToLane(ii); return; }
    }
    for (let ii = lane - 1; ii >= 1; ii--) {
      if (!answered[qi(ii)]) { moveToLane(ii); return; }
    }
  }

  function moveToLane(lane) {
    if (lane === rLane) { shelInit(); return; }
    rMachav  = lane > rLane ? 1 : 2;
    rLane    = lane;
    rTargetY = LANE_Y[lane - 1];
    rAni     = 0;
  }

  function advanceLevel() {
    if (shlav >= 3) {
      triggerWinGame();
    } else {
      savePermFlowers();  // bake current-wave flowers before resetting creatures
      shlav++;
      rLane    = 1;
      rPy      = LANE_Y[0];
      rTargetY = LANE_Y[0];
      rMachav  = 0;
      rAni     = 0;
      initLevel();
      shelInit();
    }
  }

  function savePermFlowers() {
    if (!creatures) return;
    const fFrames = tarSpr[9] || [];
    const lastIdx = fFrames.length - 1;
    const qiY = shlav === 3 ? 23 : 15;
    for (let i = 1; i <= 4; i++) {
      const c = creatures[i];
      if (c && c.machav === 99 && c.ani === 999) {
        permFlowers.push({ x: c.px + 30, y: c.py - qiY, frameIdx: lastIdx });
      }
    }
  }

  function triggerWinGame() {
    gameRunning = false;
    celebrating = true;
    dansTrans   = true;
    // Show all 4 hens for the win dance (VB6 DansTrans): fast lane keeps machav=10,
    // others set to 11 so renderHens can tell which range to use
    if (tarnlet) {
      for (let i = 1; i <= 4; i++) {
        if (tarnlet[i]) tarnlet[i].machav = (i === fastLane) ? 10 : 11;
      }
    }
    AudioMgr.play('./assets/war/Victor.wav');
    setTimeout(() => { celebrating = false; finish(); }, 2000);
  }

  function triggerEndGame(lane) {
    if (losing || !gameRunning) return;  // prevent re-trigger
    gameRunning = false;
    losing      = true;
    losingLane  = lane || rLane;

    // VB6 EndGame: rooster teleports to failing lane, enters from right
    rMachav  = 6;
    rAni     = 0;
    rLane    = losingLane;
    rPy      = LANE_Y[losingLane - 1];
    rPx      = 820;
    rTargetY = rPy;

    // Failing creature: move to x=730, machav=3, speed=-14 (VB6)
    const fc = creatures[losingLane];
    if (fc) { fc.px = 730; fc.machav = 3; fc.ani = 0; fc.speed = -14; }

    // All other creatures: speed=-4, reset ani if not flower-complete (VB6)
    for (let i = 1; i <= 4; i++) {
      if (i === losingLane) continue;
      const c = creatures[i];
      if (!c) continue;
      c.speed = -4;
      if (c.ani !== 999) c.ani = 0;
    }

    // Stop pagaz in flight
    if (pagaz) pagaz.fly = false;

    // All hens hidden (VB6: TarNLet(ii).Machav = 99)
    for (let i = 1; i <= 4; i++) {
      if (tarnlet && tarnlet[i]) tarnlet[i].machav = 99;
    }

    AudioMgr.play('./assets/war/AAAA.wav');
  }

  function finish() {
    clearInterval(tickId);
    clearInterval(blinkId);
    if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
    const score = Math.max(0, warScore);
    if (onComplete) onComplete(score, { tov: tshNom, be: 0, ra: wrongCount }, []);
  }

  // ─── Input ───────────────────────────────────────────────────────────────────

  function handleKey(e) {
    if (!gameRunning) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rMachav !== 0) return;
      for (let ii = rLane - 1; ii >= 1; ii--) {
        if (!answered[qi(ii)]) { moveToLane(ii); return; }
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rMachav !== 0) return;
      for (let ii = rLane + 1; ii <= 4; ii++) {
        if (!answered[qi(ii)]) { moveToLane(ii); return; }
      }
      return;
    }

    const ch = keyToChar(e.keyCode, e.shiftKey);
    if (ch !== null) { e.preventDefault(); shelClick(ch); }
  }

  function shelClick(ch) {
    if (rMachav !== 0) return;
    const idx = qi(rLane);
    if (answered[idx]) return;

    const expected = strAns[strAns.length - 1];
    if (ch === expected) {
      if (strAns.length >= tshP.length) {
        pagazNum--;
        tshNom++;
        answered[idx] = true;
        firePagaz(true);
        AudioMgr.play('./assets/war/Fire.wav');
      } else {
        strAns = tshP.slice(0, strAns.length + 1);
        AudioMgr.playAnim('Tovk.wav');
      }
    } else {
      pagazNum--;
      warScore = Math.max(0, warScore - WRONG_DEDUCT);
      wrongCount++;
      firePagaz(false);
      AudioMgr.play('./assets/war/Missed.wav');
    }
  }

  function firePagaz(hit) {
    const c = creatures[rLane];
    pagaz.fly   = true;
    pagaz.px    = rPx - (hit ? 20 : 15);
    pagaz.py    = rPy + 20 + (hit ? 0 : Math.floor(Math.random() * 6));
    pagaz.dest  = hit ? (c ? c.px + 80 : rPx - 40) : (rPx - Math.floor(Math.random() * 3) - 38);
    pagaz.speed = hit ? 35 : 8;
    pagaz.ang   = ((rPx - pagaz.dest) / pagaz.speed) / 2 - (hit ? 0 : 3);
    pagaz.hit   = hit;
    tarHit      = hit ? 4 : 5;   // VB6 ShelClick: TarHit=4 on correct, TarHit=5 on wrong
    rMachav     = 3;
    rAni        = 0;
  }

  function keyToChar(k, shift) {
    if (shift && k === 57) return ')';
    if (shift && k === 48) return '(';
    if (k >= 48 && k <= 57)  return String.fromCharCode(k);
    if (k >= 96 && k <= 105) return String.fromCharCode(k - 48);
    if (k === 190 || k === 191 || k === 188 || k === 110 || k === 222) return '.';
    if (k === 109 || k === 189) return '-';
    if (k === 106) return '*';
    if (k === 107) return '+';
    if (k === 111 || k === 220) return '/';
    if (k === 221) return ')';
    if (k === 219) return '(';
    return null;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  function render() {
    if (!ctx) return;

    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, 800, 600);
    } else {
      ctx.fillStyle = '#1a3a1a';
      ctx.fillRect(0, 0, 800, 600);
    }

    if (!spritesReady) {
      ctx.fillStyle = '#fff';
      ctx.font = '32px serif';
      ctx.textAlign = 'center';
      ctx.fillText('טוען...', 400, 300);
      return;
    }

    renderPermFlowers();
    for (let i = 1; i <= 4; i++) renderCreature(i);
    renderHens();
    if (pagaz.fly) renderPageaz();
    renderRooster();
    renderQuestion();
    renderHUD();
  }

  function renderPermFlowers() {
    if (!permFlowers || !permFlowers.length) return;
    const fFrames = tarSpr[9] || [];
    if (!fFrames.length) return;
    const lastFrame = fFrames[fFrames.length - 1];
    if (!lastFrame) return;
    for (const f of permFlowers) {
      ctx.drawImage(lastFrame, f.x, f.y, FLOWER_W, FLOWER_H);
    }
  }

  function renderCreature(i) {
    const c = creatures[i];
    if (!c) return;

    if (c.machav === 99) {
      // Draw flower — keep showing last frame permanently (VB6: DrawEggsP burns to DcMain background)
      const fFrames = tarSpr[9] || [];
      if (fFrames.length) {
        const frameIdx = c.ani === 999 ? fFrames.length - 1 : Math.min(c.ani, fFrames.length - 1);
        const frame = fFrames[frameIdx];
        const qiY = shlav === 3 ? 23 : 15;
        if (frame) ctx.drawImage(frame, c.px + 30, c.py - qiY, FLOWER_W, FLOWER_H);
      }
      return;
    }

    if (c.px < -C_W || c.px > 850) return;  // off-screen

    const st = c.machav === 2 ? 2 : (c.machav === 3 ? 3 : 0);
    const frames = mflSpr[shlav]?.[st] || mflSpr[shlav]?.[0] || [];
    if (frames.length > 0) {
      const frame = frames[Math.min(c.ani, frames.length - 1)];
      if (frame) {
        if (c.machav === 3) {
          // VB6: StretchBlt mirrors AAAAP(0) for flee — draw flipped
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(frame, -c.px - C_W, c.py, C_W, C_H);
          ctx.restore();
        } else {
          ctx.drawImage(frame, c.px, c.py, C_W, C_H);
        }
      }
    } else {
      ctx.fillStyle = `hsl(${i * 85}, 70%, 45%)`;
      ctx.fillRect(c.px, c.py, C_W, C_H);
    }

    // Expression label above creature
    const idx = qi(i);
    if (!answered[idx] && c.machav === 0 && idx >= 1 && idx <= allPairs.length) {
      const expr = allPairs[idx - 1].expr;
      ctx.font = 'bold 16px "Frank Ruhl Libre", serif';
      ctx.fillStyle = '#ffff80';
      ctx.textAlign = 'center';
      ctx.fillText(expr, c.px + C_W / 2, c.py - 5);
    }
  }

  function renderPageaz() {
    if (pagazSheet) {
      // TarP(8) sprite sheet: hit pagaz at x=210 (30×35), miss at x=250 (25×35)
      const sx = pagaz.hit ? PAG_SHEET_HIT_X : PAG_SHEET_MIS_X;
      const sw = pagaz.hit ? PAG_SHEET_HIT_W : PAG_SHEET_MIS_W;
      ctx.drawImage(pagazSheet, sx, 0, sw, PAG_H, pagaz.px - sw / 2, pagaz.py - PAG_H / 2, sw, PAG_H);
    } else {
      ctx.save();
      ctx.fillStyle = '#FF6600';
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(pagaz.px, pagaz.py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function renderRooster() {
    const state  = Math.min(rMachav, 9);
    const frames = tarSpr[state] || tarSpr[0] || [];
    if (frames.length > 0) {
      const f = frames[Math.min(rAni, frames.length - 1)];
      if (f) ctx.drawImage(f, rPx, rPy, R_W, R_H);
    } else {
      ctx.fillStyle = '#cc2200';
      ctx.fillRect(rPx, rPy, 80, 80);
    }
  }

  function renderQuestion() {
    const idx = qi(rLane);
    if (idx < 1 || idx > allPairs.length || answered[idx]) return;
    if (rMachav !== 0) return;  // don't show question while rooster is moving/shooting
    const pair   = allPairs[idx - 1];
    const typed  = strAns.slice(0, -1);
    const cursor = cursorVis ? '_' : ' ';

    ctx.font = 'bold 36px "Frank Ruhl Libre", serif';
    ctx.textAlign = 'left';

    const fullW = ctx.measureText(pair.expr + ' = ' + pair.answer).width;
    xq = xqQ + Math.max(0, (450 - fullW) / 2);

    // VB6: two-pass shadow (red foreground + black shadow offset −1,−1)
    ctx.fillStyle = 'rgb(200,100,100)';
    ctx.fillText(pair.expr + ' = ' + typed, xq, yq);
    ctx.fillStyle = 'black';
    ctx.fillText(pair.expr + ' = ' + typed, xq - 1, yq - 1);

    // Cursor / next expected char indicator (VB6: TarP(8) animated cursor; JS: blinking _)
    const typedW = ctx.measureText(pair.expr + ' = ' + typed).width;
    ctx.fillStyle = 'rgb(100,100,200)';
    ctx.fillText(cursor, xq + typedW, yq);
    ctx.fillStyle = 'black';
    ctx.fillText(cursor, xq + typedW - 1, yq - 1);
  }

  function renderHens() {
    if (!tarnlet) return;

    // VB6 EndGame bakes hens to background: frame 0 for all, frame 1 for failing lane
    if (losing) {
      const frames = tarSpr[11] || [];
      for (let i = 1; i <= 4; i++) {
        const h = tarnlet[i];
        if (!h) continue;
        const frameIdx = (i === losingLane) ? 1 : 0;
        const frame = frames[Math.min(frameIdx, frames.length - 1)];
        if (frame) ctx.drawImage(frame, h.px, h.py, HEN_W, HEN_H);
      }
      return;
    }

    for (let i = 1; i <= 4; i++) {
      const h = tarnlet[i];
      if (!h) continue;

      if (dansTrans) {
        // VB6 DansTrans: draw all 4 hens using TarP(11) (tarSpr[11]) at current ani index
        const frames = tarSpr[11] || [];
        if (!frames.length) continue;
        const frame = frames[Math.min(h.ani, frames.length - 1)];
        if (frame) ctx.drawImage(frame, h.px, h.py, HEN_W, HEN_H);
        continue;
      }

      if (h.machav === 99) continue;
      const frames = tarSpr[h.machav] || [];
      if (frames.length) {
        const frame = frames[Math.min(h.ani, frames.length - 1)];
        if (frame) ctx.drawImage(frame, h.px, h.py, HEN_W, HEN_H);
      }
    }
  }

  function renderHUD() {
    // VB6: Klipa PictureBox at (588, 501) shows pag{n}.bmp — pagaz count image
    const n = Math.max(0, Math.min(6, pagazNum));
    const img = pagazImgs[n];
    if (img) {
      ctx.drawImage(img, KLIPA_X, KLIPA_Y, KLIPA_W, KLIPA_H);
    } else {
      // Fallback text if image not loaded
      ctx.font = 'bold 18px "Frank Ruhl Libre", serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = pagazNum <= 2 ? '#ff4444' : '#fff';
      ctx.fillText(`${pagazNum}`, KLIPA_X + KLIPA_W / 2, KLIPA_Y + KLIPA_H / 2 + 6);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { init, destroy };
})();
