// gamekrav.js — Krav: 2-player indicator push game (GList row 6)
// VB6 source: Krav.frm
const GameKrav = (() => {
  // ─── Constants (from VB6 Krav.frm) ──────────────────────────────────────────
  const TAR_AX   = 100;   // indicator left boundary → player 0 wins round
  const TAR_BX   = 440;   // indicator right boundary → player 1 wins round
  const TT_START = 270;   // indicator start x (center)
  const TT_SPEED = 0.5;   // indicator px per tick (VB6: 0.5)
  const TICK_MS  = 270;   // RunG.Interval
  const PANEL_W  = 370;   // QPic width  (5550 twips / 15)
  const PANEL_H  = 115;   // QPic height (1725 twips / 15)
  const PANEL_Y  = 107;   // QPic top    (1605 twips / 15)
  const PANEL1_X = 430;   // QPic(1) left (6450 twips / 15)
  // Indicator sprite: TarP(1) = 240×180
  const IND_W = 240, IND_H = 180;
  const IND_Y = 250;
  // Character sprites: TarP(2-5)=150×180, TarP(9/10)=130×180
  const CHAR_W = 150, CHAR_H = 180;
  const WIN_W  = 130;
  // VB6 Sname(0/1) placed at PlayN(0/1) positions after name entry — always visible
  // PlayN(0): Left=1260/15=84, Width=2085/15=139, Top=810/15=54, Height=600/15=40
  // PlayN(1): Left=8550/15=570, Width=139, Top=54, Height=40
  // Text centered in width → center x = Left + Width/2; baseline ≈ Top + Height*0.8
  // ForeColor: Sname(0)=&H00FF8080=rgb(255,128,128), Sname(1)=&H000000C0=rgb(0,0,192)
  const NAME_AX = 84 + 139 / 2;   // player A center x = 153.5
  const NAME_BX = 570 + 139 / 2;  // player B center x = 639.5
  const NAME_Y  = 54 + 32;        // baseline ≈ top + font size (~32px for David 24pt)
  // VB6 Sname(2/3) time-pressure score positions:
  // Sname(2) Left=7110/15=474, Top=855/15=57 (active player 0's score area when Tor=0)
  // Sname(3) Left=4095/15=273, Top=855/15=57 (active player 1's score area when Tor=1)
  const SCORE_X = [474, 273];  // indexed by tor: SCORE_X[0] for player 0, SCORE_X[1] for player 1
  const SCORE_Y  = 72;
  // ClickT: 4 seconds after panel closes before playing click hint sound
  const CLICK_DELAY_MS = 4000;

  // ─── State ────────────────────────────────────────────────────────────────────
  let canvas, ctx;
  let unit, onComplete;
  let allPairs;
  let shela;          // current question index (1-based)
  let tor;            // whose turn: 0=left, 1=right (VB6 Tor=1 at start)
  let strAns, tshP;
  let yq, xqQ;
  let ttPosR;         // indicator x position
  let showQ;          // question visible
  let scoreT;         // [rounds won by player 0, rounds won by player 1]
  let realScore;      // [Player(0).RealScore, Player(1).RealScore] — time pressure per tick + wrong answers
  let totalCorrect, totalQuestions;

  // VB6 TwoTar: machav 2=right idle, 3=left idle, 4=run left, 5=run right, 9=left wins, 10=right wins
  let charStates;     // [machav0, machav1]
  let charPositions;  // [px0, px1]
  let charAni;        // [frame index 0, frame index 1] — per-character animation counter
  let charPy;         // [py0, py1] — y position (changes during win jump animation)

  // Player names (VB6 PlayN: index 0=left player A, index 1=right player B)
  let playerNames = ['שחקן א', 'שחקן ב'];

  // Panel animation (LoaHC=current frame, LoaHT=target frame; 0=closed, 6=open)
  let loaHC, loaHT;

  // VB6 ttVis: True=roosters visible/indicator hidden; False=indicator visible/roosters hidden
  let ttVis;

  // Sprites
  let bgImg;
  let tarSpr  = {};   // tarSpr[state][frameIdx] = HTMLImageElement
  let quesSpr = {};   // quesSpr[player][frame] = HTMLImageElement
  let spritesReady = false;

  let tickId, blinkId, clickTimerId;
  let keyHandler;
  let cursorVis  = true;
  let gameRunning;
  let animRunning;    // true during run-in (pre-game character animation)
  let indAni = 0;     // OneTar animation frame counter

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
    animRunning  = false;

    canvas = document.getElementById('krav-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    allPairs       = shuffle([...unitData.questions]);
    totalQuestions = allPairs.length;
    totalCorrect   = 0;

    ctx.fillStyle = '#2a2a5a';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#fff';
    ctx.font = '32px serif';
    ctx.textAlign = 'center';
    ctx.fillText('טוען...', 400, 300);

    loadAllSprites().then(() => {
      if (!gameRunning) startNameEntry();
    });
  }

  function destroy() {
    gameRunning  = false;
    animRunning  = false;
    ttVis        = false;
    clearInterval(tickId);
    clearInterval(blinkId);
    clearTimeout(clickTimerId);
    tickId = blinkId = clickTimerId = null;
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    const overlay = document.getElementById('krav-names');
    if (overlay) overlay.style.display = 'none';
    playerNames = ['שחקן א', 'שחקן ב'];
  }

  // ─── Name entry (VB6 PlayN textboxes, index 1=right first) ──────────────────
  function startNameEntry() {
    const overlay = document.getElementById('krav-names');
    const inputB  = document.getElementById('krav-name-b');  // PlayN(1) right
    const inputA  = document.getElementById('krav-name-a');  // PlayN(0) left

    // Start pre-game character animation (idle pose during name entry)
    charStates    = [3, 2];   // player 0 idle left (machav=3), player 1 idle right (machav=2)
    charAni       = [0, 0];
    charPy        = [250, 250];
    charPositions = [120, 520];
    ttVis         = true;     // show characters, hide indicator
    animRunning   = true;
    scoreT        = [0, 0];
    realScore     = [0, 0];
    loaHC         = [6, 6];
    loaHT         = [6, 6];
    tickId = setInterval(tick, TICK_MS);

    if (!overlay || !inputB || !inputA) { startRunIn(); return; }

    if (bgImg) ctx.drawImage(bgImg, 0, 0, 800, 600);
    overlay.style.display = 'block';

    // Phase 1: Player B (right, index=1) enters name
    inputB.value = '';
    inputB.placeholder = 'שחקן ב';
    inputB.style.display = 'block';
    inputB.focus();
    AudioMgr.play('./assets/krav/Pla2.wav');  // Pla2 = player B (index 1+1=2)

    function onBDone(e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      playerNames[1] = inputB.value.trim() || 'שחקן ב';
      inputB.removeEventListener('keydown', onBDone);
      inputB.style.display = 'none';
      // VB6: TwoTar(1).Machav = 5-1 = 4 (run left)
      charStates[1] = 4;
      charAni[1]    = 0;

      // Phase 2: Player A (left, index=0) enters name
      inputA.value = '';
      inputA.placeholder = 'שחקן א';
      inputA.style.display = 'block';
      inputA.focus();
      AudioMgr.play('./assets/krav/Pla1.wav');  // Pla1 = player A (index 0+1=1)

      function onADone(e2) {
        if (e2.key !== 'Enter') return;
        e2.preventDefault();
        playerNames[0] = inputA.value.trim() || 'שחקן א';
        inputA.removeEventListener('keydown', onADone);
        inputA.style.display = 'none';
        overlay.style.display = 'none';
        // VB6: TwoTar(0).Machav = 5-0 = 5 (run right) — completion triggers game start
        startRunIn();
      }
      inputA.addEventListener('keydown', onADone);
    }
    inputB.addEventListener('keydown', onBDone);
  }

  // VB6: After names entered, characters run into position (machav 4/5)
  // When machav=5 (left char running right) completes → game starts
  function startRunIn() {
    charStates[0] = 5;   // left player runs right
    charStates[1] = 4;   // right player runs left
    charAni[0]    = 0;
    charAni[1]    = 0;
  }

  // ─── Game start (called from updateCharacters when run-in completes) ─────────
  function startGame() {
    gameRunning = true;
    animRunning = false;
    ttVis       = false;  // VB6: run-in done → ttVis=False → show indicator
    shela       = 1;
    tor         = 1;      // VB6 Restart: Tor=1 (right player goes first)
    ttPosR      = TT_START;
    showQ       = false;
    indAni      = 0;
    realScore   = [0, 0];
    // Character positions after run-in (will have moved from 120/520 during run)
    // Reset to standard battle positions
    charStates    = [3, 2];
    charAni       = [0, 0];
    charPy        = [250, 250];
    charPositions = [120, 520];
    loaHC = [6, 6];
    loaHT = [6, 6];
    loaHT[tor] = 0;   // close right player's panel first (tor=1)

    keyHandler = e => handleKey(e);
    window.addEventListener('keydown', keyHandler);
    blinkId = setInterval(() => { cursorVis = !cursorVis; }, 400);
    // tick is already running from startNameEntry
  }

  function shelInit() {
    if (shela > allPairs.length) { finish(); return; }
    const pair = allPairs[shela - 1];
    tshP   = pair.answer;
    strAns = tshP[0];
    yq     = 30;
    xqQ    = tor === 0 ? 30 : 20;
    // Reset time-pressure score for new question
    realScore[tor] = 0;
    showQ = true;
    // ClickT: play click hint after 4 seconds of no answer
    clearTimeout(clickTimerId);
    clickTimerId = setTimeout(() => {
      if (gameRunning && showQ) AudioMgr.play(`./assets/krav/Click${tor}.wav`);
      clickTimerId = null;
    }, CLICK_DELAY_MS);
  }

  // ─── Tick ────────────────────────────────────────────────────────────────────
  function tick() {
    if (gameRunning) {
      updatePanels();
      if (showQ) updateIndicator();
    }
    if (gameRunning || animRunning) updateCharacters();
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
      ttVis = false;
      shelInit();
    }
  }

  function updateIndicator() {
    // Move indicator toward current player's win boundary
    if (tor === 0) ttPosR -= TT_SPEED;
    else           ttPosR += TT_SPEED;

    // VB6: Player(Tor).RealScore += 0.1 per tick (time pressure, no cap)
    realScore[tor] += 0.1;

    // Boundary win
    if (ttPosR <= TAR_AX) { roundWin(0); return; }
    if (ttPosR >= TAR_BX) { roundWin(1); return; }

    // VB6: if RealScore > 100 → OneTar.Machav = 6+Tor → active player wins by pressure
    if (realScore[tor] > 100) { roundWin(tor); }
  }

  // ─── Character animation ─────────────────────────────────────────────────────
  // VB6 loop runs ii=0→i=1 then ii=1→i=0 (draws player 1 first)
  function updateCharacters() {
    for (let ii = 0; ii <= 1; ii++) {
      const i = 1 - ii;
      const st     = charStates[i];
      const frames = tarSpr[st];
      if (!frames || !frames.length) continue;
      const nframe = frames.length;

      switch (st) {
        case 2: case 3:
          // VB6: idle — Ani reset to -1 every tick → always shows frame 0
          charAni[i] = 0;
          break;

        case 4: { // run left (TwoTar machav=4)
          charAni[i]++;
          if (charAni[i] > 2 && charAni[i] < 11) charPositions[i] -= 18;
          if (charAni[i] >= nframe) {
            charAni[i] = nframe - 1; // freeze
          }
          break;
        }

        case 5: { // run right (TwoTar machav=5)
          charAni[i]++;
          if (charAni[i] > 2 && charAni[i] < 11) charPositions[i] += 18;
          if (charAni[i] >= nframe) {
            charAni[i] = nframe - 1; // freeze
            if (!gameRunning && animRunning) {
              // VB6: machav=5 completes → ttVis=False, LoaHT(1)=0 → game starts
              startGame();
            }
          }
          break;
        }

        case 9: { // player 0 win jump
          const prev = charAni[i];
          charAni[i]++;
          if (prev === 0)                            charPositions[i] -= 32;
          if (prev >= 0 && prev < 4)                 charPositions[i] -= 15;
          if (prev > 2  && prev < 7)  charPy[i] += (prev - 2) * 10.5 - 5;
          if (charAni[i] >= nframe) charAni[i] = nframe - 1;
          break;
        }

        case 10: { // player 1 win jump
          const prev = charAni[i];
          charAni[i]++;
          if (prev === 0)                            charPositions[i] += 23;
          if (prev >= 0 && prev < 4)                 charPositions[i] += 8;
          if (prev > 2  && prev < 7)  charPy[i] += (prev - 2) * 11 - 5;
          if (charAni[i] >= nframe) charAni[i] = nframe - 1;
          break;
        }

        default:
          charAni[i]++;
          if (charAni[i] >= nframe) charAni[i] = 0;
          break;
      }
    }
  }

  function roundWin(player) {
    ttVis = true;   // show roosters in win pose
    scoreT[player]++;
    showQ  = false;
    clearTimeout(clickTimerId);
    clickTimerId = null;
    AudioMgr.play('./assets/war/Victor.wav');

    charPy = [IND_Y, IND_Y]; // reset y positions before win animation

    // VB6: winning player → machav 9 or 10; positions set per boundary win
    if (player === 0) {
      charStates    = [9, 2];
      charPositions = [TAR_AX, TAR_AX + 110];
    } else {
      charStates    = [3, 10];
      charPositions = [TAR_BX, TAR_BX + 160];
    }
    charAni = [0, 0];

    // VB6 LoaHT both → 6 on win
    loaHT = [6, 6];
    loaHC = [6, 6];

    if (shela > allPairs.length || scoreT[0] >= 3 || scoreT[1] >= 3) {
      setTimeout(finish, 1500);
    } else {
      setTimeout(() => {
        ttPosR        = TT_START;
        charStates    = [3, 2];
        charAni       = [0, 0];
        charPy        = [IND_Y, IND_Y];
        charPositions = [120, 520];
        tor   = 1;        // VB6 Restart: always start with Tor=1
        realScore = [0, 0];
        loaHC = [6, 6];
        loaHT = [6, 6];
        loaHT[tor] = 0;
      }, 1200);
    }
  }

  function finish() {
    gameRunning  = false;
    animRunning  = false;
    clearInterval(tickId);
    clearInterval(blinkId);
    clearTimeout(clickTimerId);
    tickId = blinkId = clickTimerId = null;
    if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
    // Score: round wins × 50, capped at 100
    const score = Math.min(100, scoreT[0] * 50);
    if (onComplete) onComplete(score, { tov: scoreT[0], be: scoreT[1], ra: 0 }, []);
  }

  // ─── Input ───────────────────────────────────────────────────────────────────
  function handleKey(e) {
    if (!gameRunning || !showQ) return;
    const ch = keyToChar(e.keyCode, e.shiftKey);
    if (ch !== null) { e.preventDefault(); shelClick(ch); }
  }

  function shelClick(ch) {
    if (!showQ || shela > allPairs.length) return;
    // VB6: ClickT.Enabled=False at TOP of ShelClick (any keypress stops hint timer)
    clearTimeout(clickTimerId); clickTimerId = null;

    const expected = strAns[strAns.length - 1];
    if (ch === expected) {
      if (strAns.length >= tshP.length) {
        // Correct complete answer — AAA1=player B (tor=1→2-1=1), AAA2=player A (tor=0→2-0=2)
        AudioMgr.play(`./assets/krav/AAA${2 - tor}.wav`);
        realScore[tor] = 0;   // VB6: Taot=0 on correct
        shela++;
        showQ = false;
        const prevTor = tor;
        tor = 1 - tor;
        loaHT[prevTor] = 6;
        loaHT[tor]     = 0;
        totalCorrect++;
        if (shela > allPairs.length) { setTimeout(finish, 800); }
      } else {
        strAns = tshP.slice(0, strAns.length + 1);
        AudioMgr.playAnim('Tovk.wav');
      }
    } else {
      // Wrong — VB6: Player(Tor).RealScore += 2; Taot += 1 (no cap)
      realScore[tor] += 2;
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
    if (!ttVis) return;
    for (let ii = 0; ii <= 1; ii++) {
      const p  = 1 - ii;
      const st = charStates[p];
      const frames = tarSpr[st];
      if (!frames || !frames.length) continue;
      const aniIdx = Math.max(0, Math.min(charAni[p], frames.length - 1));
      const frame  = frames[aniIdx];
      if (!frame) continue;
      const w = (st === 9 || st === 10) ? WIN_W : CHAR_W;
      ctx.drawImage(frame, charPositions[p], charPy[p], w, CHAR_H);
    }
  }

  function renderPanels() {
    if (!gameRunning) return;
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
      if (showQ && p === tor) renderPanelQuestion(p, px);
    }
  }

  function renderPanelQuestion(player, panelX) {
    if (shela > allPairs.length) return;
    const pair  = allPairs[shela - 1];
    const typed = strAns.slice(0, -1);
    const cursor = cursorVis ? '_' : ' ';

    ctx.font = 'bold 28px "Frank Ruhl Libre", serif';
    ctx.direction = 'ltr';
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
    if (ttVis) return;
    // Advance indicator animation frame
    indAni++;
    const frames = tarSpr[1];
    if (frames && frames.length) {
      if (indAni >= frames.length) indAni = 0;
      const frame = frames[indAni];
      if (frame) ctx.drawImage(frame, ttPosR - IND_W / 2, IND_Y, IND_W, IND_H);
    } else {
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(ttPosR - 15, IND_Y + 60, 30, 60);
    }
  }

  function renderScores() {
    // VB6 Sname(0/1) placed at PlayN positions — always visible, David 24pt
    ctx.font = '28px "Frank Ruhl Libre", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8080';   // Sname(0) ForeColor = &H00FF8080
    ctx.fillText(playerNames[0], NAME_AX, NAME_Y);
    ctx.fillStyle = '#0000c0';   // Sname(1) ForeColor = &H000000C0
    ctx.fillText(playerNames[1], NAME_BX, NAME_Y);

    if (!gameRunning) return;

    // VB6 Sname(2/3) — time-pressure score for each player (0-100)
    // Sname(Tor+2): player 0 → Sname(2) at x=474; player 1 → Sname(3) at x=273
    ctx.font = 'bold 22px "Frank Ruhl Libre", serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgb(250,250,200)';
    ctx.fillText(Math.floor(realScore[0]), SCORE_X[0], SCORE_Y);
    ctx.fillText(Math.floor(realScore[1]), SCORE_X[1], SCORE_Y);

    // Active player indicator
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffff00';
    ctx.font = '18px serif';
    const arrowX = tor === 0 ? NAME_AX : NAME_BX;
    ctx.fillText('▼', arrowX, NAME_Y + 16);
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
