// Tirgol3 game — identify-and-type (GList row 4, GameKind=1)
// VB6 source: Tirgol3.frm — 8 scenes × 4 questions each, find row with wrong answer then type
const GameT3 = (() => {
  let unit = null;
  let allPairs = [];    // 32 shuffled pairs (8 scenes × 4)
  let sceneIdx = 0;
  let scenePairs = [];  // current scene's 4 pairs
  let targetRow = 0;    // 0-3: which row has the fake answer
  let realAnswer = '';
  let fakeAnswer = '';
  let typedSoFar = '';
  let phase = 1;        // 1=click-to-identify, 2=type-answer
  let penalty = 0;
  let sceneErrors = 0;  // mistakes this scene (reset each scene)
  let phase1Errors = 0; // wrong clicks in current question's phase 1 (for TshFlash hint)
  let hintFlashId = null;
  let eggs = [];        // Array(8): -1=not yet, 0=no mistakes, 1/2=few, 3+=many
  let onComplete = null;
  let timerVal = 0;
  let timerInterval = null;
  let keyHandler = null;

  // Row layout: Shel(2-5) at Tirgol3 120DPI twips/15 positions
  const ROW_TOPS  = [232, 278, 324, 371]; // matches game.js ROW_TOPS[2..5]
  const ROW_LEFT  = 160;
  const ROW_W     = 550;
  const ROW_H     = 40;

  // Egg layout reuses same columns/rows as game.js but only 8 eggs (2 rows of 4)
  const EGG_COLS   = [18, 57, 96, 134];
  const EGG_ROWS   = [131, 181];
  const EGG_BGX    = { '-1': 0, '0': -156, '1': -117, '2': -117, 'bad': -78 };

  const ANIM_SEQUENCES = {
    start: ['Start1.bmp','Start2.bmp','Start3.bmp','Start4.bmp','Start5.bmp'],
    tov1:  ['1Tov1.bmp','1Tov2.bmp','1Tov3.bmp','1Tov4.bmp','1Tov5.bmp','1Tov6.bmp','1Tov7.bmp','1Tov8.bmp'],
    tov2:  ['2Tov1.bmp','2Tov2.bmp','2Tov3.bmp','2Tov4.bmp','2Tov5.bmp','2Tov6.bmp','2Tov7.bmp'],
    tov3:  ['3Tov1.bmp','3Tov2.bmp','3Tov3.bmp','3Tov4.bmp','3Tov5.bmp','3Tov6.bmp','3Tov7.bmp','3Tov8.bmp','3Tov9.bmp','3Tov10.bmp'],
    tov4:  ['4Tov1.bmp','4Tov2.bmp','4Tov3.bmp','4Tov4.bmp','4Tov5.bmp','4Tov6.bmp','4Tov7.bmp','4Tov8.bmp','4Tov9.bmp','4Tov10.bmp','4Tov11.bmp','4Tov12.bmp','4Tov13.bmp'],
    ra1:   ['1ra1.bmp','1ra2.bmp','1ra3.bmp','1ra4.bmp','1ra5.bmp','1ra6.bmp'],
  };
  let animInterval = null;
  let animFrame = 0;
  let chicksInterval = null;
  let eggFlip = false;
  const CHICK_BGX = [-156, -195, -234];
  let rowPlankEls = [];  // plank DOM element per row (0-3)

  // ─── Public API ─────────────────────────────────────────────────────────────

  function init(unitData, completeCb) {
    destroy();
    unit = unitData;
    onComplete = completeCb;
    penalty = 0;
    eggs = Array(8).fill(-1);

    const qs = shuffle([...unitData.questions]);
    // Build 32 pairs (8 scenes × 4), cycling if fewer questions
    allPairs = [];
    while (allPairs.length < 32) allPairs.push(...shuffle([...unitData.questions]));
    allPairs = allPairs.slice(0, 32);

    const vp = document.getElementById('game-viewport');
    if (vp) { vp.classList.remove('kind-2', 'bg-2'); vp.classList.add('bg-t3'); }

    document.getElementById('game-unit-title').textContent = unitData.title;
    document.getElementById('game-penalty').textContent = '0';
    document.getElementById('game-timer').textContent = '0:00';
    document.getElementById('game-target-value').textContent = '';

    keyHandler = e => handleKey(e);
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('resize', resizeVP);
    resizeVP();

    renderEggs();
    startAnim('start');
    AudioMgr.playAnim('Tirgol3Q99.wav');
    setTimeout(() => {
      startScene(0);
      startTimer();
    }, 1600);
  }

  function destroy() {
    stopTimer();
    stopAnim();
    stopChicksAnim();
    clearInterval(hintFlashId); hintFlashId = null;
    if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
    window.removeEventListener('resize', resizeVP);
    const vp = document.getElementById('game-viewport');
    if (vp) vp.classList.remove('bg-t3');
  }

  // ─── Scene ──────────────────────────────────────────────────────────────────

  function startScene(idx) {
    sceneIdx = idx;
    scenePairs = allPairs.slice(idx * 4, idx * 4 + 4);
    sceneErrors = 0;
    phase1Errors = 0;
    clearInterval(hintFlashId); hintFlashId = null;
    phase = 1;
    typedSoFar = '';

    targetRow = Math.floor(Math.random() * 4);
    realAnswer = scenePairs[targetRow].answer;
    fakeAnswer = pickFake(scenePairs, unit.questions);

    renderRows();
    setGaze(targetRow + 2); // rows 2-5 in gaze index
  }

  function pickFake(scene, allQs) {
    const sceneAnswers = new Set(scene.map(p => p.answer));
    const pool = allQs.map(q => q.answer).filter(a => !sceneAnswers.has(a));
    if (pool.length === 0) return allQs.find(q => q.answer !== realAnswer)?.answer || '?';
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ─── Row Rendering ──────────────────────────────────────────────────────────

  // VB6 Tirgol3: all plank types — BitBlt(208, top-7, 440, 45, sprite, 0, top-124)
  // GFull=ShePic(1), GGreen=ShePic(3), GTran=ShePic(0) — same position/size, just different image
  function setPlank(rowIdx, type) {
    const el = rowPlankEls[rowIdx];
    if (!el) return;
    el.className = type + '-plank';
    el.style.left   = '208px';
    el.style.width  = '440px';
    el.style.height = '45px';
    el.style.backgroundPosition = `0 ${124 - ROW_TOPS[rowIdx]}px`;
  }

  function renderRows() {
    const elRows   = document.getElementById('game-rows');
    const elPlanks = document.getElementById('game-planks');
    if (!elRows) return;
    if (elPlanks) elPlanks.innerHTML = '';
    elRows.innerHTML = '';
    rowPlankEls = [];

    scenePairs.forEach((pair, i) => {
      // VB6 SceneInit: GFull on every row — BitBlt(208, top-7, 440, 45, GFull, 0, top-124)
      const plankEl = document.createElement('div');
      plankEl.className = 'gfull-plank';
      plankEl.style.top    = (ROW_TOPS[i] - 7) + 'px';
      plankEl.style.left   = '208px';
      plankEl.style.width  = '440px';
      plankEl.style.height = '45px';
      plankEl.style.backgroundPosition = `0 ${124 - ROW_TOPS[i]}px`;
      if (elPlanks) elPlanks.appendChild(plankEl);
      rowPlankEls[i] = plankEl;

      const row = document.createElement('div');
      row.className = 'q-row t3-row';
      row.dataset.idx = i;
      row.style.top    = ROW_TOPS[i] + 'px';
      row.style.left   = ROW_LEFT + 'px';
      row.style.width  = ROW_W + 'px';
      row.style.height = ROW_H + 'px';

      const displayed = (i === targetRow) ? fakeAnswer : pair.answer;

      const expr = document.createElement('span');
      expr.className = 'row-expr t3-expr';
      expr.textContent = pair.expr;

      const sep = document.createElement('span');
      sep.className = 't3-sep';
      sep.textContent = '  =  ';

      const ans = document.createElement('span');
      ans.id = 't3-ans-' + i;
      ans.className = 't3-ans';
      ans.textContent = displayed;

      row.appendChild(expr);
      row.appendChild(sep);
      row.appendChild(ans);

      if (phase === 1) {
        row.addEventListener('click',      () => handleRowClick(i));
        row.addEventListener('mouseenter', () => { row.classList.add('t3-hover'); setGaze(i + 2); setPlank(i, 'ggreen'); });
        row.addEventListener('mouseleave', () => { row.classList.remove('t3-hover'); setGaze(targetRow + 2); setPlank(i, 'gfull'); });
      }

      elRows.appendChild(row);
    });
  }

  // ─── Input Handlers ──────────────────────────────────────────────────────────

  function handleRowClick(i) {
    if (phase !== 1) return;

    if (i === targetRow) {
      // Cancel any running hint flash (VB6: TshFlash.Enabled=False, FlashNom=0)
      clearInterval(hintFlashId); hintFlashId = null;
      phase1Errors = 0;
      phase = 2;
      typedSoFar = '';
      const ans = document.getElementById('t3-ans-' + targetRow);
      if (ans) { ans.textContent = '_'; ans.className = 't3-ans t3-typing'; }
      setPlank(targetRow, 'gtran');  // VB6: gtran shown when typing begins
      // Remove click listeners
      document.querySelectorAll('.t3-row').forEach(r => {
        const clone = r.cloneNode(true);
        r.parentNode.replaceChild(clone, r);
        clone.addEventListener('mouseenter', () => clone.classList.add('t3-hover'));
        clone.addEventListener('mouseleave', () => clone.classList.remove('t3-hover'));
      });
      setGaze(targetRow + 2);
      AudioMgr.playAnim('Tovk.wav');
    } else {
      addPenalty();
      phase1Errors++;
      // VB6 TshFlash: after 2+ wrong phase-1 clicks, flash target row gfull↔gtran
      if (phase1Errors > 1 && !hintFlashId) {
        let flashCount = 0;
        hintFlashId = setInterval(() => {
          setPlank(targetRow, flashCount % 2 === 0 ? 'gtran' : 'gfull');
          flashCount++;
          if (flashCount >= 5) { clearInterval(hintFlashId); hintFlashId = null; setPlank(targetRow, 'gfull'); }
        }, 220);
      }
      playWrongAnim();
    }
  }

  function handleKey(e) {
    if (phase !== 2) return;
    const ch = keyToChar(e.keyCode, e.shiftKey);
    if (ch === null) return;
    e.preventDefault();

    const expected = realAnswer[typedSoFar.length];
    if (!expected) return;

    if (ch === expected) {
      typedSoFar += ch;
      const ans = document.getElementById('t3-ans-' + targetRow);
      if (typedSoFar.length >= realAnswer.length) {
        if (ans) { ans.textContent = realAnswer; ans.className = 't3-ans t3-correct'; }
        setPlank(targetRow, 'gfull');  // VB6: gfull restored when typing completes
        AudioMgr.playAnim('Tovk.wav');
        completeScene();
      } else {
        if (ans) ans.textContent = typedSoFar + '_';
        AudioMgr.playAnim('Tovk.wav');
      }
    } else {
      addPenalty();
      // VB6 De=99: after 2+ wrong keys show expected next char in red at cursor
      if (sceneErrors >= 2) {
        const hintAns = document.getElementById('t3-ans-' + targetRow);
        if (hintAns) {
          hintAns.innerHTML = typedSoFar + '<span class="t3-hint-char">' + expected + '</span>';
        }
      }
      playWrongAnim();
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

  // ─── Scene Completion ────────────────────────────────────────────────────────

  function completeScene() {
    eggs[sceneIdx] = sceneErrors > 2 ? 3 : sceneErrors;
    renderEggs();
    const isLast = sceneIdx + 1 >= 8;
    if (isLast) {
      AudioMgr.playAnim('4tov.wav');
      startAnim('tov4');
      startChicksAnim();
      if (penalty < 30) AudioMgr.playAnim('soff.wav');
    } else {
      playCorrectAnim();
    }
    setTimeout(() => {
      if (!isLast) {
        startScene(sceneIdx + 1);
      } else {
        finish();
      }
    }, 1000);
  }

  function finish() {
    stopTimer();
    stopAnim();
    const tov = eggs.filter(e => e === 0).length;
    const be  = eggs.filter(e => e === 1 || e === 2).length;
    const ra  = eggs.filter(e => e >= 3).length;
    if (onComplete) onComplete(100 - penalty, { tov, be, ra }, eggs);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function addPenalty() {
    penalty = Math.min(60, penalty + 1);
    sceneErrors++;
    const el = document.getElementById('game-penalty');
    if (el) el.textContent = penalty;
  }

  function renderEggs() {
    const el = document.getElementById('game-eggs');
    if (!el) return;
    el.innerHTML = '';
    eggs.forEach((status, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      if (row >= EGG_ROWS.length) return;
      const div = document.createElement('div');
      div.className = 'egg-sprite';
      div.style.backgroundImage = "url('../assets/menu/CSmall2.png')";
      div.style.left = EGG_COLS[col] + 'px';
      div.style.top  = EGG_ROWS[row] + 'px';
      const key = status < 0 ? '-1' : status === 0 ? '0' : status <= 2 ? String(status) : 'bad';
      div.style.backgroundPositionX = EGG_BGX[key] + 'px';
      div.dataset.status = key;
      el.appendChild(div);
    });
  }

  function setGaze(rowIdx) {
    const img = document.getElementById('char-img');
    if (img) img.src = `./assets/anim/Stati${Math.max(0, Math.min(7, rowIdx))}.png`;
  }

  function playCorrectAnim() {
    const v = ['tov1','tov2','tov3'][Math.floor(Math.random() * 3)];
    const w = { tov1: '1tov.wav', tov2: '2tov.wav', tov3: '3tov.wav' }[v];
    AudioMgr.playAnim(w);
    startAnim(v);
  }

  function playWrongAnim() {
    AudioMgr.playAnim('1ra.wav');
    startAnim('ra1');
  }

  function startAnim(type) {
    stopAnim();
    const frames = ANIM_SEQUENCES[type];
    if (!frames) { setGaze(targetRow + 2); return; }
    animFrame = 0;
    const charImg = document.getElementById('char-img');
    animInterval = setInterval(() => {
      if (charImg && frames[animFrame]) {
        charImg.src = `./assets/anim/${frames[animFrame].replace('.bmp', '.png')}`;
      }
      animFrame++;
      if (animFrame >= frames.length) { stopAnim(); setGaze(targetRow + 2); }
    }, 80);
  }

  function stopAnim() {
    clearInterval(animInterval);
    animInterval = null;
  }

  function startChicksAnim() {
    stopChicksAnim();
    eggFlip = false;
    chicksInterval = setInterval(() => {
      eggFlip = !eggFlip;
      const el = document.getElementById('game-eggs');
      if (!el) return;
      el.querySelectorAll('.egg-sprite').forEach(div => {
        const s = div.dataset.status;
        if (s === '0' || s === '1' || s === '2') {
          div.style.backgroundPositionX = CHICK_BGX[Math.floor(Math.random() * 3)] + 'px';
          div.style.backgroundPositionY = eggFlip ? '-45px' : '0px';
        }
      });
    }, 100);
  }

  function stopChicksAnim() {
    clearInterval(chicksInterval);
    chicksInterval = null;
  }

  function startTimer() {
    timerInterval = setInterval(() => {
      timerVal++;
      const el = document.getElementById('game-timer');
      if (el) {
        const m = Math.floor(timerVal / 60);
        const s = timerVal % 60;
        el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }

  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

  function resizeVP() {
    const vp = document.getElementById('game-viewport');
    if (!vp) return;
    const outer = vp.parentElement;
    const scale = Math.min(outer.clientWidth / 800, outer.clientHeight / 600);
    vp.style.transform = `scale(${scale})`;
    vp.style.left = Math.max(0, (outer.clientWidth  - 800 * scale) / 2) + 'px';
    vp.style.top  = Math.max(0, (outer.clientHeight - 600 * scale) / 2) + 'px';
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { init, destroy };
})();
