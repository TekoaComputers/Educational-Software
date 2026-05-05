// gamekrav.js — Krav: 2-player indicator push game (GList row 6)
// VB6 source: Krav.frm
const GameKrav = (() => {
  // ─── Constants (from VB6 Krav.frm) ──────────────────────────────────────────
  const TAR_AX   = 100;   // indicator left boundary → player 0 wins round
  const TAR_BX   = 440;   // indicator right boundary → player 1 wins round
  const TT_START = 270;   // indicator start x (center)
  const TT_SPEED = 0.5;   // indicator px per tick (VB6: 0.5)
  const TICK_MS  = 70;    // RunG.Interval (VB6 dynamically adjusts to 70ms on fast PCs)
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
  // ScoreQ (BackS.jpg) overlay layout — all in canvas pixels
  const SCOREQ_X  = 210, SCOREQ_Y  = 114, SCOREQ_W  = 370, SCOREQ_H  = 160;
  // Myname(0/1) label positions inside ScoreQ (VB6 Left/15, Top/15 → canvas offset)
  // Myname(0/1) Alignment=2 (Center), Width=1197/15=80px → center = Left+40 inside ScoreQ
  const SCOREQ_S0_X = 346, SCOREQ_S1_X = 436, SCOREQ_S_BASELINE = 190;
  // CafEx (exit) and CafRe (replay) button positions/sizes — natural image size 120×55
  const SCOREQ_EX_X = 263, SCOREQ_EX_Y = 215, SCOREQ_EX_W = 120, SCOREQ_EX_H = 55;
  const SCOREQ_RE_X = 391, SCOREQ_RE_Y = 214, SCOREQ_RE_W = 120, SCOREQ_RE_H = 55;

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
  let canvasClickHandler;
  let showScoreOverlay = false;
  let scoreOverlayGameOver = false;
  let scoreImgs = {};
  let keyHandler;
  let cursorVis  = true;
  let gameRunning;
  let animRunning;     // true during run-in (pre-game character animation)
  let indAni = 0;      // OneTar animation frame counter
  let namesVisible = false;  // VB6: Sname(i) only shown after PlayN_KeyDown, not during name entry

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
    bgImg             = await loadImg('./assets/krav/Back.jpg');
    scoreImgs.backS   = await loadImg('./assets/krav/BackS.jpg');
    scoreImgs.ex1     = await loadImg('./assets/krav/Ex1.jpg');
    scoreImgs.ex2     = await loadImg('./assets/krav/Ex2.jpg');
    scoreImgs.re1     = await loadImg('./assets/krav/Re1.jpg');
    scoreImgs.re2     = await loadImg('./assets/krav/Re2.jpg');
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
    gameRunning      = false;
    animRunning      = false;
    ttVis            = false;
    namesVisible     = false;
    showScoreOverlay = false;
    clearInterval(tickId);
    clearInterval(blinkId);
    clearTimeout(clickTimerId);
    tickId = blinkId = clickTimerId = null;
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (canvasClickHandler && canvas) {
      canvas.removeEventListener('click', canvasClickHandler);
      canvasClickHandler = null;
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
    namesVisible  = false;   // VB6: Sname hidden during name entry, shown after PlayN_KeyDown
    shela         = 1;       // initialise here so shelInit() has a valid index after run-in
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
    inputB.placeholder = '';   // VB6 PlayN: empty text box, no placeholder
    inputB.style.display = 'block';
    inputB.focus();
    AudioMgr.play('./assets/krav/Pla1.wav');  // VB6 Form_Load: plays pla1.wav when showing PlayN(1)

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
      inputA.placeholder = '';   // VB6 PlayN: empty text box, no placeholder
      inputA.style.display = 'block';
      inputA.focus();
      AudioMgr.play('./assets/krav/Pla2.wav');  // VB6 PlayN_KeyDown index=1: plays pla2.wav when showing PlayN(0)

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
    namesVisible  = true;    // VB6: Sname(i).Visible = True after PlayN_KeyDown for each player
    charStates[0] = 5;   // left player runs right
    charStates[1] = 4;   // right player runs left
    charAni[0]    = 0;
    charAni[1]    = 0;
  }

function shelInit() {
    // VB6 ShelInit: "If Shela > nomQu Then IposQues" — reshuffle and continue, never finish mid-round
    if (shela > allPairs.length) {
      allPairs = shuffle([...unit.questions]);
      shela = 1;
    }
    const pair = allPairs[shela - 1];
    tshP   = String(pair.answer);
    strAns = tshP[0];
    yq     = 30;
    xqQ    = tor === 0 ? 30 : 20;
    // VB6 ShelInit does NOT reset Player(Tor).RealScore — score accumulates through the game
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
    if (realScore[tor] > 100) { roundWin(tor); return; }

    // Advance indicator animation frame each tick
    indAni++;
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
          const prev4 = charAni[i];
          charAni[i]++;
          if (prev4 > 2 && prev4 < 11) charPositions[i] -= 18;
          if (charAni[i] >= nframe) {
            charAni[i] = nframe - 1; // freeze
          }
          break;
        }

        case 5: { // run right (TwoTar machav=5)
          const prev5 = charAni[i];
          charAni[i]++;
          if (prev5 > 2 && prev5 < 11) charPositions[i] += 18;
          if (charAni[i] >= nframe) {
            charAni[i] = nframe - 1; // freeze
            if (!gameRunning && animRunning) {
              // VB6: machav=5 completes → ttVis=False, LoaHT(1)=0 → round starts
              // Do NOT reset charStates/charPositions here — they stay from run-in (CafRe restart)
              gameRunning = true;
              animRunning = false;
              ttVis       = false;
              tor         = 1;
              ttPosR      = TT_START;
              showQ       = false;
              indAni      = 0;
              realScore   = [0, 0];
              loaHC       = [6, 6];
              loaHT       = [6, 6];
              loaHT[1]    = 0;
              if (!keyHandler) {
                keyHandler = e => handleKey(e);
                window.addEventListener('keydown', keyHandler);
                blinkId = setInterval(() => { cursorVis = !cursorVis; }, 400);
              }
            }
          }
          break;
        }

        case 9: { // player 0 win jump — VB6: check Ani BEFORE increment
          const prev9 = charAni[i];
          charAni[i]++;
          if (prev9 === 1)               charPositions[i] -= 32;  // Ani=1: extra lurch
          if (prev9 >= 0 && prev9 < 5)  charPositions[i] -= 15;  // Ani=0..4: slide left
          if (prev9 > 2  && prev9 < 8)  charPy[i] += (prev9 - 2) * 10.5 - 5;  // Ani=3..7: fall
          if (charAni[i] >= nframe) charAni[i] = nframe - 1;
          break;
        }

        case 10: { // player 1 win jump — VB6: check Ani BEFORE increment
          const prev10 = charAni[i];
          charAni[i]++;
          if (prev10 === 1)               charPositions[i] += 23;  // Ani=1: extra lurch
          if (prev10 >= 0 && prev10 < 5) charPositions[i] += 8;   // Ani=0..4: slide right
          if (prev10 > 2  && prev10 < 8) charPy[i] += (prev10 - 2) * 11 - 5;  // Ani=3..7: fall
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

    const gameOver = scoreT[0] >= 3 || scoreT[1] >= 3;
    setTimeout(() => showScore(gameOver), 1500);
  }

  // ─── ShowScore overlay (VB6 ScoreQ / BackS.jpg panel) ───────────────────────
  function showScore(gameOver) {
    gameRunning          = false;
    showScoreOverlay     = true;
    scoreOverlayGameOver = gameOver;
    clearInterval(tickId); tickId = null;
    render();
    canvasClickHandler = e => handleScoreClick(e);
    canvas.addEventListener('click', canvasClickHandler);
  }

  function hideScoreOverlay() {
    showScoreOverlay = false;
    if (canvasClickHandler) {
      canvas.removeEventListener('click', canvasClickHandler);
      canvasClickHandler = null;
    }
  }

  function restartRound() {
    // VB6 CafRe_Click: IposQues + Restart + TwoTar(i).Machav = 5-i (run-in animation)
    allPairs      = shuffle([...unit.questions]);
    shela         = 1;
    ttPosR        = TT_START;
    ttVis         = true;      // show characters during run-in (VB6 Restart: ttVis=True)
    showQ         = false;
    realScore     = [0, 0];
    charPy        = [250, 250];
    charPositions = [120, 520];
    charAni       = [0, 0];
    charStates    = [5, 4];    // VB6: TwoTar(i).Machav = 5-i → player0=5(run right), player1=4(run left)
    loaHC         = [6, 6];
    loaHT         = [6, 6];
    namesVisible  = true;      // names already known, keep them visible during restart run-in
    animRunning   = true;
    gameRunning   = false;     // startRound() (inlined in case 5) will set this true after run-in
    tickId        = setInterval(tick, TICK_MS);
  }

  function handleScoreClick(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx     = (e.clientX - rect.left) * scaleX;
    const cy     = (e.clientY - rect.top)  * scaleY;
    if (cx >= SCOREQ_EX_X && cx < SCOREQ_EX_X + SCOREQ_EX_W &&
        cy >= SCOREQ_EX_Y && cy < SCOREQ_EX_Y + SCOREQ_EX_H) {
      hideScoreOverlay();
      finish();
      return;
    }
    if (!scoreOverlayGameOver &&
        cx >= SCOREQ_RE_X && cx < SCOREQ_RE_X + SCOREQ_RE_W &&
        cy >= SCOREQ_RE_Y && cy < SCOREQ_RE_Y + SCOREQ_RE_H) {
      hideScoreOverlay();
      restartRound();
    }
  }

  function renderScoreOverlay() {
    // Draw BackS.jpg panel at ScoreQ position
    if (scoreImgs.backS) {
      ctx.drawImage(scoreImgs.backS, SCOREQ_X, SCOREQ_Y, SCOREQ_W, SCOREQ_H);
    } else {
      ctx.fillStyle = '#003366';
      ctx.fillRect(SCOREQ_X, SCOREQ_Y, SCOREQ_W, SCOREQ_H);
      ctx.strokeStyle = '#88aaff'; ctx.lineWidth = 2;
      ctx.strokeRect(SCOREQ_X, SCOREQ_Y, SCOREQ_W, SCOREQ_H);
    }
    // Score numbers — VB6 ShowScore: Myname(1).Caption=ScoreT(0), Myname(0).Caption=ScoreT(1)
    // Myname font = Times New Roman 72pt; Alignment=2 (Center)
    // Colors decoded from VB6 BGR: Myname(0)=&H00FF8080→rgb(128,128,255), Myname(1)=&H0080C0FF→rgb(255,192,128)
    ctx.font = 'bold 80px "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgb(128,128,255)';                         // Myname(0): blue-purple
    ctx.fillText(String(scoreT[1]), SCOREQ_S0_X, SCOREQ_S_BASELINE);  // left position → ScoreT(1)
    ctx.fillStyle = 'rgb(255,192,128)';                         // Myname(1): light orange
    ctx.fillText(String(scoreT[0]), SCOREQ_S1_X, SCOREQ_S_BASELINE);  // right position → ScoreT(0)
    // CafEx button
    if (scoreImgs.ex1) {
      ctx.drawImage(scoreImgs.ex1, SCOREQ_EX_X, SCOREQ_EX_Y, SCOREQ_EX_W, SCOREQ_EX_H);
    }
    // CafRe button — hidden when game is over
    if (!scoreOverlayGameOver && scoreImgs.re1) {
      ctx.drawImage(scoreImgs.re1, SCOREQ_RE_X, SCOREQ_RE_Y, SCOREQ_RE_W, SCOREQ_RE_H);
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
        // Correct complete answer — VB6: playZad aaa(Tor+1).wav → aaa1 for Tor=0, aaa2 for Tor=1
        // VB6 Taot=0 resets only the wrong-answer counter, NOT Player(Tor).RealScore
        AudioMgr.play(`./assets/krav/AAA${tor + 1}.wav`);
        shela++;
        showQ = false;
        const prevTor = tor;
        tor = 1 - tor;
        loaHT[prevTor] = 6;
        loaHT[tor]     = 0;
        totalCorrect++;
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
    if (showScoreOverlay) renderScoreOverlay();
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
    // VB6 Sname(0/1): only visible after PlayN_KeyDown (names entered), not during name-entry phase
    if (namesVisible) {
      ctx.font = '28px "Frank Ruhl Libre", serif';
      ctx.textAlign = 'center';
      // VB6 BGR colours: Sname(0)=&H00FF8080→rgb(128,128,255), Sname(1)=&H000000C0→rgb(192,0,0)
      ctx.fillStyle = 'rgb(128,128,255)';
      ctx.fillText(playerNames[0], NAME_AX, NAME_Y);
      ctx.fillStyle = 'rgb(192,0,0)';
      ctx.fillText(playerNames[1], NAME_BX, NAME_Y);
    }

    if (!gameRunning) return;

    // VB6: Sname(2) and Sname(3) are always-visible label controls; RunG_Timer only updates
    // the active player's label but the other retains its last value — show both here.
    ctx.font = 'bold 22px "Frank Ruhl Libre", serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgb(250,250,200)';
    ctx.fillText(Math.min(100, Math.floor(realScore[0])), SCORE_X[0], SCORE_Y);
    ctx.fillText(Math.min(100, Math.floor(realScore[1])), SCORE_X[1], SCORE_Y);

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
