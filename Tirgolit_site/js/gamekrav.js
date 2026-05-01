// gamekrav.js — Krav: 2-player indicator push game (GList row 6)
// VB6 source: Krav.frm — same keyboard, alternating turns, indicator moves toward active player
const GameKrav = (() => {
  // ─── Constants (from VB6 Krav.frm) ──────────────────────────────────────────
  const TAR_AX   = 100;   // indicator left boundary → player 0 wins round
  const TAR_BX   = 440;   // indicator right boundary → player 1 wins round
  const TT_START = 270;   // indicator start x (center)
  const TT_SPEED = 0.5;   // indicator px per tick
  const TICK_MS  = 270;   // RunG.Interval
  const PANEL_W  = 370;   // QPic width (5550 twips / 15)
  const PANEL_H  = 115;   // QPic height (1725 twips / 15)
  const PANEL_Y  = 107;   // QPic top (1605 twips / 15)
  const PANEL1_X = 430;   // QPic(1) left (6450 twips / 15)
  // Rooster/indicator sprite: TarP(10) = 240×180, OneTar.Machav=1
  const IND_W = 240, IND_H = 180;
  const IND_Y = 250;
  // Player character sprites: TarP(2..5) = 150×180; TarP(9/10) win animations = 130×180
  const CHAR_W = 150, CHAR_H = 180;
  const WIN_W  = 130, WIN_H  = 180;

  // ─── State ────────────────────────────────────────────────────────────────────
  let canvas, ctx;
  let unit, onComplete;
  let allPairs;       // all questions
  let shela;          // current question index (1-based)
  let tor;            // whose turn: 0=left, 1=right (VB6 Tor, starts at 1)
  let strAns, tshP;
  let xq, yq, xqQ;
  let ttPosR;         // indicator x position
  let showQ;          // question visible
  let scoreT;         // [rounds won by player 0, rounds won by player 1]
  let totalCorrect, totalQuestions;
  let wrongScore;     // accumulates per question
  // VB6 TwoTar.Machav: 3=left idle, 2=right idle, 9=left wins, 10=right wins
  let charStates;     // [state for player 0, state for player 1]
  let charPositions;  // [x for player 0, x for player 1]

  // Panel animation (LoaHC/LoaHT)
  let loaHC, loaHT;   // [frame for panel 0, frame for panel 1] (0=closed, 6=open)

  // Sprites
  let bgImg;
  let tarSpr  = {};   // tarSpr[state] = HTMLImageElement[]
  let quesSpr = {};   // quesSpr[player][frame] = HTMLImageElement
  let spritesReady = false;

  // VB6 ttVis: True = roosters visible / indicator hidden; False = indicator visible / roosters hidden
  let ttVis;

  let tickId, blinkId;
  let keyHandler;
  let cursorVis = true;
  let gameRunning;

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
    bgImg = await loadImg('./assets/krav/Back.jpg');

    const promises = [];
    for (let s = 0; s <= 10; s++) {
      const ss = s;
      promises.push(
        loadSeq(f => `./assets/krav/Tar/${ss}Tar${f}.png`, 15).then(fr => { tarSpr[ss] = fr; })
      );
    }

    // Ques panel sprites: Q{player}{frame}.png, player=0|1, frame=0..6 (not sequential, load all)
    for (let p = 0; p <= 1; p++) {
      quesSpr[p] = {};
      for (let f = 0; f <= 6; f++) {
        const pp = p, ff = f;
        promises.push(loadImg(`./assets/krav/Ques/Q${pp}${ff}.png`).then(img => { quesSpr[pp][ff] = img; }));
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

    canvas = document.getElementById('krav-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    allPairs      = shuffle([...unitData.questions]);
    totalQuestions = allPairs.length;
    totalCorrect  = 0;
    wrongScore    = 0;

    ctx.fillStyle = '#2a2a5a';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#fff';
    ctx.font = '32px serif';
    ctx.textAlign = 'center';
    ctx.fillText('טוען...', 400, 300);

    loadAllSprites().then(() => {
      if (!gameRunning) startGame();
    });
  }

  function destroy() {
    gameRunning = false;
    ttVis = false;
    clearInterval(tickId);
    clearInterval(blinkId);
    tickId  = null;
    blinkId = null;
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
  }

  // ─── Game start ──────────────────────────────────────────────────────────────

  function startGame() {
    gameRunning = true;
    ttVis       = true;   // VB6 Restart: roosters shown, indicator hidden
    shela       = 1;
    tor         = 1;   // VB6 Restart: Tor = 1
    ttPosR      = TT_START;
    showQ       = false;
    scoreT        = [0, 0];
    charStates    = [3, 2];   // VB6 Restart: TwoTar(0).Machav=3, TwoTar(1).Machav=2
    charPositions = [120, 520];
    loaHC         = [6, 6];
    loaHT         = [6, 6];

    // VB6 Restart: only close the active player's panel (Tor=1) to trigger first ShelInit
    loaHT[tor] = 0;

    keyHandler = e => handleKey(e);
    window.addEventListener('keydown', keyHandler);
    blinkId = setInterval(() => { cursorVis = !cursorVis; }, 400);
    tickId  = setInterval(tick, TICK_MS);

    AudioMgr.play('./assets/krav/Pla1.wav');
  }

  function shelInit() {
    if (shela > allPairs.length) { finish(); return; }
    const pair = allPairs[shela - 1];
    tshP   = pair.answer;
    strAns = tshP[0];
    yq     = 30;
    xqQ    = tor === 0 ? 30 : 20;
    showQ  = true;
  }

  // ─── Tick ────────────────────────────────────────────────────────────────────

  function tick() {
    if (!gameRunning) return;
    updatePanels();
    if (showQ) updateIndicator();
    render();
  }

  function updatePanels() {
    let sheShow = false;
    for (let i = 0; i <= 1; i++) {
      if (loaHC[i] !== loaHT[i]) {
        if (loaHT[i] > loaHC[i]) loaHC[i]++;
        else {
          loaHC[i]--;
          if (loaHC[i] === 0) sheShow = true;
        }
      }
    }
    if (sheShow && !showQ) {
      ttVis = false;  // VB6: panel closed → indicator becomes active, roosters hide
      shelInit();
      AudioMgr.play(`./assets/krav/Click${tor}.wav`);
    }
  }

  function updateIndicator() {
    // Move indicator toward current player's boundary
    if (tor === 0) ttPosR -= TT_SPEED;
    else           ttPosR += TT_SPEED;

    if (ttPosR <= TAR_AX) {
      // Player 0 wins this round (indicator went left past boundary)
      roundWin(0);
    } else if (ttPosR >= TAR_BX) {
      // Player 1 wins this round
      roundWin(1);
    }
  }

  function roundWin(player) {
    ttVis = true;   // VB6: round won → show roosters in win pose, hide indicator
    scoreT[player]++;
    showQ  = false;
    totalCorrect++;
    AudioMgr.play('./assets/war/Victor.wav');

    // VB6: winning player → machav 9 (player 0) or 10 (player 1); move to boundary
    if (player === 0) {
      charStates    = [9, 2];
      charPositions = [TAR_AX, TAR_AX + 110];
    } else {
      charStates    = [3, 10];
      charPositions = [TAR_BX, TAR_BX + 160];
    }

    if (shela > allPairs.length || scoreT[0] >= 3 || scoreT[1] >= 3) {
      setTimeout(finish, 1500);
    } else {
      // Reset indicator and characters, then start next round (VB6 Restart: Tor always=1)
      setTimeout(() => {
        ttPosR        = TT_START;
        charStates    = [3, 2];
        charPositions = [120, 520];
        tor   = 1;
        loaHC = [6, 6];
        loaHT = [6, 6];
        loaHT[tor] = 0;
      }, 1200);
    }
  }

  function finish() {
    gameRunning = false;
    clearInterval(tickId);
    clearInterval(blinkId);
    if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
    const score = Math.min(100, Math.max(0, scoreT[0] * 50 - wrongScore));
    if (onComplete) onComplete(score, { tov: scoreT[0], be: scoreT[1], ra: 0 }, []);
  }

  // ─── Input ───────────────────────────────────────────────────────────────────

  function handleKey(e) {
    if (!gameRunning || !showQ) return;

    const ch = keyToChar(e.keyCode, e.shiftKey);
    if (ch !== null) {
      e.preventDefault();
      shelClick(ch);
    }
  }

  function shelClick(ch) {
    if (!showQ || shela > allPairs.length) return;

    const expected = strAns[strAns.length - 1];
    if (ch === expected) {
      if (strAns.length >= tshP.length) {
        // Correct complete answer
        AudioMgr.play(`./assets/krav/AAA${tor + 1}.wav`);
        shela++;
        showQ = false;
        // Switch tor
        const prevTor = tor;
        tor = 1 - tor;
        // Open prev player's panel, close new player's
        loaHT[prevTor]  = 6;
        loaHT[tor]      = 0;
        totalCorrect++;
        if (shela > allPairs.length) { setTimeout(finish, 800); }
      } else {
        strAns = tshP.slice(0, strAns.length + 1);
        AudioMgr.playAnim('Tovk.wav');
      }
    } else {
      // Wrong character — pressure increases
      wrongScore += 2;
      AudioMgr.playAnim('1ra.wav');
    }
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
      ctx.fillStyle = '#2a2a5a';
      ctx.fillRect(0, 0, 800, 600);
    }

    if (!spritesReady) {
      ctx.fillStyle = '#fff';
      ctx.font = '32px serif';
      ctx.textAlign = 'center';
      ctx.fillText('טוען...', 400, 300);
      return;
    }

    renderCharacters();
    renderPanels();
    renderIndicator();
    renderScores();
  }

  function renderCharacters() {
    if (!ttVis) return;  // VB6: roosters hidden while indicator is active
    const states = charStates    || [3, 2];
    const pos    = charPositions || [120, 520];
    for (let p = 0; p <= 1; p++) {
      const st     = states[p];
      const frames = tarSpr[st];
      if (!frames || !frames.length) continue;
      const frame = frames[Math.floor(Date.now() / 200) % frames.length];
      if (!frame) continue;
      // VB6: TarP(9/10) = 130×180, TarP(2-5) = 150×180
      const w = (st === 9 || st === 10) ? WIN_W : CHAR_W;
      const h = WIN_H;
      ctx.drawImage(frame, pos[p], IND_Y, w, h);
    }
  }

  function renderPanels() {
    for (let p = 0; p <= 1; p++) {
      const frame = loaHC[p];
      const img   = quesSpr[p]?.[frame];
      const px    = p === 0 ? 0 : PANEL1_X;

      if (img) {
        ctx.drawImage(img, px, PANEL_Y, PANEL_W, PANEL_H);
      } else {
        ctx.fillStyle = p === 0 ? '#442222' : '#222244';
        ctx.fillRect(px, PANEL_Y, PANEL_W, PANEL_H);
        ctx.strokeStyle = p === 0 ? '#ff8888' : '#8888ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, PANEL_Y, PANEL_W, PANEL_H);
      }

      // Draw question text when panel is closed (loaHC=0 = fully closed = question visible)
      if (showQ && p === tor) {
        renderPanelQuestion(p, px);
      }
    }
  }

  function renderPanelQuestion(player, panelX) {
    if (shela > allPairs.length) return;
    const pair  = allPairs[shela - 1];
    const typed = strAns.slice(0, -1);
    const cursor = cursorVis ? '_' : ' ';

    ctx.font = 'bold 28px "Frank Ruhl Libre", serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgb(230,255,230)';

    const fullW = ctx.measureText(pair.expr + ' = ' + pair.answer).width;
    const lx    = panelX + xqQ + Math.max(0, (330 - fullW) / 2);

    ctx.fillText(pair.expr + ' = ' + typed, lx, PANEL_Y + yq + 24);
    const typedW = ctx.measureText(pair.expr + ' = ' + typed).width;
    ctx.fillStyle = 'rgb(150,255,150)';
    ctx.fillText(cursor, lx + typedW, PANEL_Y + yq + 24);
  }

  function renderIndicator() {
    if (ttVis) return;  // VB6: indicator hidden while roosters are shown (entry/win phase)

    // Draw the central indicator (OneTar) — uses TarP(1) = 240×180
    const frames = tarSpr[1];
    if (frames && frames.length) {
      const frame = frames[Math.floor(Date.now() / 100) % frames.length];
      if (frame) ctx.drawImage(frame, ttPosR - IND_W / 2, IND_Y, IND_W, IND_H);
    } else {
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(ttPosR - 15, IND_Y + 60, 30, 60);
    }

    // Draw boundary markers
    ctx.strokeStyle = 'rgba(255,50,50,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(TAR_AX, PANEL_Y);
    ctx.lineTo(TAR_AX, PANEL_Y + PANEL_H + 200);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(50,50,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(TAR_BX, PANEL_Y);
    ctx.lineTo(TAR_BX, PANEL_Y + PANEL_H + 200);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function renderScores() {
    ctx.font = 'bold 36px "Frank Ruhl Libre", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8080';
    ctx.fillText(scoreT[0], 200, 80);
    ctx.fillStyle = '#8080ff';
    ctx.fillText(scoreT[1], 600, 80);

    // Player labels
    ctx.font = '20px "Frank Ruhl Libre", serif';
    ctx.fillStyle = '#ffcc88';
    ctx.fillText('שחקן א׳', 200, 45);
    ctx.fillText('שחקן ב׳', 600, 45);

    // Active player indicator
    const arrowX = tor === 0 ? 200 : 600;
    ctx.fillStyle = '#ffff00';
    ctx.font = '24px serif';
    ctx.fillText('▼', arrowX, 105);
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
