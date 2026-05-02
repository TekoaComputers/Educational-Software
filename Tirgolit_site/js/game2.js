// Tirgol2: sequential typing game (VB6 Tirgol2.frm)
// kind=1: show expr, user types the answer char-by-char
// kind=2: show answer, user types a number found within the expression
const GameT2 = (() => {
  // State
  let unit = null;
  let gameKind = 1;
  let allPairs = [];
  let eggs = [];
  let sceneIndex = 0;
  let scenePairs = [];
  let tshNom = 0;      // current active row index (0-7)
  let tshP = '';       // string the user must type for current row
  let staStr = 0;      // 1-based start position of tshP in the expression (kind=2)
  let typedCount = 0;  // chars typed correctly so far (index into tshP)
  let taot = 0;        // wrong keypresses on current row
  let deMode = false;  // hint mode after 3+ wrong (VB6 De=99)
  let matched = [];    // matched flags per scene row
  let penalty = 0;
  let timerVal = 0;
  let timerInterval = null;
  let onComplete = null;
  let animInterval = null;
  let animFrame = 0;
  let chicksInterval = null;
  let eggFlip = false;
  let keyHandler = null;
  let blocked = false; // block input during animation

  // DOM refs
  let elRows, elPlanks, elTargetVal, elPenalty, elTimer, elEggs, charAnim;

  const ROW_TOPS = [137, 183, 232, 278, 324, 371, 417, 467];
  const ROW_LEFT = 173;
  const ROW_H    = 44;

  const EGG_COLS    = [18, 57, 96, 134];
  const EGG_ROWS_PX = [131, 181, 226, 273, 321, 369, 414, 462];
  const EGG_BGX     = { '-1': 0, '0': -156, '1': -117, '2': -117, 'bad': -78 };
  const CHICK_BGX   = [-156, -195, -234];

  const ANIM_SEQUENCES = {
    start: ['Start1.bmp','Start2.bmp','Start3.bmp','Start4.bmp','Start5.bmp'],
    tov1:  ['1Tov1.bmp','1Tov2.bmp','1Tov3.bmp','1Tov4.bmp','1Tov5.bmp','1Tov6.bmp','1Tov7.bmp','1Tov8.bmp','1Tov9.bmp','1Tov10.bmp','1Tov11.bmp','1Tov12.bmp','1Tov13.bmp'],
    tov2:  ['2Tov1.bmp','2Tov2.bmp','2Tov3.bmp','2Tov4.bmp','2Tov5.bmp','2Tov6.bmp','2Tov7.bmp','2Tov8.bmp','2Tov9.bmp','2Tov10.bmp','2Tov11.bmp'],
    tov3:  ['3Tov1.bmp','3Tov2.bmp','3Tov3.bmp','3Tov4.bmp','3Tov5.bmp','3Tov6.bmp','3Tov7.bmp','3Tov8.bmp','3Tov9.bmp','3Tov10.bmp'],
    tov4:  ['4Tov1.bmp','4Tov2.bmp','4Tov3.bmp','4Tov4.bmp','4Tov5.bmp','4Tov6.bmp','4Tov7.bmp','4Tov8.bmp','4Tov9.bmp','4Tov10.bmp','4Tov11.bmp','4Tov12.bmp','4Tov13.bmp'],
    ra1:   ['1ra1.bmp','1ra2.bmp','1ra3.bmp','1ra4.bmp','1ra5.bmp','1ra6.bmp'],
  };
  const TOV_VARIANTS = ['tov1','tov2','tov3'];

  // ─── Public API ──────────────────────────────────────────────────────────────

  function init(unitData, kind, completeCb) {
    destroy();
    unit = unitData;
    gameKind = kind;
    onComplete = completeCb;
    penalty = 0;
    timerVal = 0;

    const qs = [...unit.questions];
    shuffle(qs);
    while (qs.length % 8 !== 0) {
      qs.push(qs[Math.floor(Math.random() * unit.questions.length)]);
    }
    allPairs = qs;
    eggs = allPairs.map(() => -1);

    elRows      = document.getElementById('game-rows');
    elPlanks    = document.getElementById('game-planks');
    elTargetVal = document.getElementById('game-target-value');
    elPenalty   = document.getElementById('game-penalty');
    elTimer     = document.getElementById('game-timer');
    elEggs      = document.getElementById('game-eggs');
    charAnim    = document.getElementById('char-img');

    renderEggs();
    updatePenalty();
    if (elTargetVal) elTargetVal.textContent = '';

    window.addEventListener('resize', resizeViewport);
    resizeViewport();

    keyHandler = e => handleKey(e);
    window.addEventListener('keydown', keyHandler);

    startAnim('start');
    AudioMgr.playAnim(`Tirgol2Q${gameKind}.wav`);
    setTimeout(() => {
      goToScene(0);
      startTimer();
    }, 1600);
  }

  function destroy() {
    stopTimer();
    stopAnim();
    stopChicksAnim();
    window.removeEventListener('resize', resizeViewport);
    if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
    blocked = false;
  }

  // ─── Viewport Scaling ────────────────────────────────────────────────────────

  function resizeViewport() {
    const vp = document.getElementById('game-viewport');
    if (!vp) return;
    const outer = vp.parentElement;
    const scale = Math.min(outer.clientWidth / 800, outer.clientHeight / 600);
    const scaledW = 800 * scale, scaledH = 600 * scale;
    vp.style.transform = `scale(${scale})`;
    vp.style.left = Math.max(0, (outer.clientWidth  - scaledW) / 2) + 'px';
    vp.style.top  = Math.max(0, (outer.clientHeight - scaledH) / 2) + 'px';
  }

  // ─── Scene Management ────────────────────────────────────────────────────────

  function goToScene(idx) {
    sceneIndex = idx;
    const start = idx * 8;
    scenePairs = allPairs.slice(start, start + 8);
    matched    = scenePairs.map(() => false);
    tshNom     = 0;

    if (elRows)   elRows.innerHTML   = '';
    if (elPlanks) elPlanks.innerHTML = '';

    initRow(0);
    renderScene();
  }

  // Set up tshP/staStr/typedCount for the given row
  function initRow(rowIdx) {
    tshNom     = rowIdx;
    typedCount = 0;
    taot       = 0;
    deMode     = false;

    const pair = scenePairs[rowIdx];
    if (gameKind === 1) {
      tshP   = pair.answer;
      staStr = 0;
    } else {
      intshp(pair.expr);
    }

    // Brief question-mark pose before showing cursor (VB6: qStart animation)
    stopAnim();
    if (charAnim) charAnim.src = './assets/anim/qStart6.png';
    setTimeout(() => setGaze(tshNom), 500);
  }

  // ─── intshp: find numeric substrings in expr, pick one (VB6 Intshp) ─────────
  // Sets tshP (the number string) and staStr (1-based position in expr)
  function intshp(str) {
    const chunks = [];
    let i = 0;
    while (i < str.length) {
      if (/\d/.test(str[i]) || (str[i] === '-' && i + 1 < str.length && /\d/.test(str[i+1]))) {
        let start = i;
        if (str[i] === '-') i++;
        while (i < str.length && /\d/.test(str[i])) i++;
        chunks.push({ s: str.slice(start, i), pos: start + 1 }); // pos is 1-based
      } else {
        i++;
      }
    }
    if (chunks.length === 0) {
      // fallback: use the whole answer if no number found in expr
      tshP   = scenePairs[tshNom].answer;
      staStr = 0;
      return;
    }
    const pick = chunks[Math.floor(Math.random() * chunks.length)];
    tshP   = pick.s;
    staStr = pick.pos;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  function renderScene() {
    if (!elRows || !elPlanks) return;
    elRows.innerHTML   = '';
    elPlanks.innerHTML = '';

    // Rows 0..tshNom are visible; rows above tshNom not shown (VB6 RefAll)
    for (let i = 0; i <= tshNom; i++) {
      renderRow(i);
    }
  }

  function renderRow(i) {
    if (!elRows) return;
    let el = elRows.querySelector(`[data-idx="${i}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 't2-row';
      el.dataset.idx = i;
      el.style.top    = ROW_TOPS[i] + 'px';
      el.style.left   = ROW_LEFT + 'px';
      el.style.height = ROW_H + 'px';
      el.style.width  = '521px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      elRows.appendChild(el);
    }

    const pair = scenePairs[i];
    const exprSpan = document.createElement('span');
    exprSpan.className = 't2-expr';
    exprSpan.id = `t2-expr-${i}`;

    const ansSpan = document.createElement('span');
    ansSpan.className = 't2-ans';
    ansSpan.id = `t2-ans-${i}`;

    el.innerHTML = '';
    el.appendChild(exprSpan);
    el.appendChild(ansSpan);

    if (matched[i]) {
      el.classList.add('matched');
      setPlank(i, 'gfull');
      // Show completed: "expr =" on left, answer on right
      exprSpan.textContent = pair.expr + ' =';
      ansSpan.textContent  = pair.answer;
      return;
    }

    if (i === tshNom) {
      setPlank(i, 'gtran-full');
      updateTypingDisplay();
    } else {
      // Previously matched rows are handled above; rows before tshNom that aren't
      // matched yet shouldn't appear — but guard anyway
      setPlank(i, 'gfull');
      exprSpan.textContent = pair.expr + ' =';
      ansSpan.textContent  = pair.answer;
    }
  }

  // Rebuild the active row's text content to show typed + hint/cursor
  function updateTypingDisplay() {
    const pair    = scenePairs[tshNom];
    const exprEl  = document.getElementById(`t2-expr-${tshNom}`);
    const ansEl   = document.getElementById(`t2-ans-${tshNom}`);
    if (!exprEl || !ansEl) return;

    const typed   = tshP.slice(0, typedCount);
    const remaining = tshP.slice(typedCount);

    if (gameKind === 1) {
      // expr fixed on left, user types the answer on right
      exprEl.textContent = pair.expr + ' =';
      ansEl.innerHTML    = buildTypingHTML(typed, remaining);
    } else {
      // user types a number embedded in the expression; answer shown on right
      const expr  = pair.expr;
      const pos0  = staStr - 1; // 0-based start of tshP in expr
      const left  = expr.slice(0, pos0);
      const right = expr.slice(pos0 + tshP.length);
      exprEl.innerHTML = escapeHTML(left) + buildTypingHTML(typed, remaining) + escapeHTML(right) + ' =';
      ansEl.textContent = pair.answer;
    }
  }

  function buildTypingHTML(typed, remaining) {
    let html = '<span style="color:#ffd54f">' + escapeHTML(typed) + '</span>';
    if (deMode && remaining.length > 0) {
      // hint: first remaining char bold, rest in red
      html += '<span class="t2-hint">' + escapeHTML(remaining) + '</span>';
    } else {
      html += '<span class="t2-cursor"></span>';
    }
    return html;
  }

  function escapeHTML(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─── Keyboard Input ──────────────────────────────────────────────────────────

  function handleKey(e) {
    if (blocked) return;
    // Only process printable key values for typing
    const ch = getCharFromKey(e);
    if (!ch) return;
    e.preventDefault();

    const expected = tshP[typedCount];
    if (ch === expected) {
      typedCount++;
      updateTypingDisplay();
      if (typedCount >= tshP.length) {
        rowComplete(tshNom);
      }
    } else {
      // Wrong key
      penalty += Math.max(1, Math.round(5 - allPairs.length / 8));
      if (penalty > 60) penalty = 60;
      taot++;
      if (taot >= 3) deMode = true;
      updatePenalty();
      flashRow(tshNom);
      playWrongAnim();
    }
  }

  // Extract the typed character from a keydown event
  function getCharFromKey(e) {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape' ||
        e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
        e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' ||
        e.key === 'CapsLock' || e.key === 'Meta') {
      return null;
    }
    if (e.key === 'Decimal' || e.key === '.') return '.';
    if (e.key === 'Subtract' || e.key === '-') return '-';
    if (e.key === 'Multiply' || e.key === '*') return '*';
    if (e.key === 'Divide'   || e.key === '/') return '/';
    if (e.key === 'Add'      || e.key === '+') return '+';
    if (e.key.length === 1) return e.key;
    // Numpad digits
    if (e.code && e.code.startsWith('Numpad') && e.key >= '0' && e.key <= '9') return e.key;
    return null;
  }

  // ─── Row Complete ────────────────────────────────────────────────────────────

  function rowComplete(rowIdx) {
    blocked = true;
    matched[rowIdx] = true;

    // Record egg status based on wrong count for this row
    const globalIdx = sceneIndex * 8 + rowIdx;
    const status = taot === 0 ? 0 : taot === 1 ? 1 : taot === 2 ? 2 : 'bad';
    if (globalIdx < eggs.length) eggs[globalIdx] = status;
    renderEggs();

    // Update row display to matched state
    const pair = scenePairs[rowIdx];
    const el = elRows?.querySelector(`[data-idx="${rowIdx}"]`);
    if (el) {
      el.classList.add('matched');
      el.innerHTML = '';
      const exprSpan = document.createElement('span');
      exprSpan.className = 't2-expr';
      exprSpan.textContent = pair.expr + ' =';
      const ansSpan = document.createElement('span');
      ansSpan.className = 't2-ans';
      ansSpan.textContent = pair.answer;
      el.appendChild(exprSpan);
      el.appendChild(ansSpan);
    }
    setPlank(rowIdx, 'gfull');

    const isLastRow = rowIdx + 1 >= scenePairs.length;
    const nextScene = sceneIndex + 1;
    const moreScenes = nextScene * 8 < allPairs.length;
    if (isLastRow && moreScenes) {
      AudioMgr.playAnim('4tov.wav');
      startAnim('tov4');
    } else {
      playCorrectAnim();
    }

    setTimeout(() => {
      blocked = false;
      const nextRow = rowIdx + 1;
      if (nextRow < scenePairs.length) {
        initRow(nextRow);
        // Append new row to scene
        renderRow(nextRow);
      } else {
        // Scene complete — advance to next scene or end
        if (moreScenes) {
          goToScene(nextScene);
        } else {
          endGame();
        }
      }
    }, 900);
  }

  function endGame() {
    stopTimer();
    startChicksAnim();
    if (penalty < 30) AudioMgr.playAnim('soff.wav');
    const tov = eggs.filter(e => e === 0).length;
    const be  = eggs.filter(e => e === 1 || e === 2).length;
    const ra  = eggs.filter(e => e === 'bad').length;
    const score = Math.max(0, 100 - penalty);
    if (onComplete) onComplete(score, { tov, be, ra }, eggs);
  }

  // ─── Planks ───────────────────────────────────────────────────────────────────

  function setPlank(rowIdx, type) {
    if (!elPlanks) return;
    let el = elPlanks.querySelector(`[data-plank-row="${rowIdx}"]`);
    if (!type) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.dataset.plankRow = rowIdx;
      elPlanks.appendChild(el);
    }

    if (type === 'gfull') {
      el.className = 'gfull-plank';
      el.style.top    = (ROW_TOPS[rowIdx] - 8) + 'px';
      el.style.height = '46px';
      el.style.left   = '208px';
      el.style.width  = '440px';
      el.style.backgroundPosition = `0 ${125 - ROW_TOPS[rowIdx]}px`;
    } else {
      // gtran-full: full-width GTran plank for active typing row
      el.className = 'gtran-plank';
      el.style.top    = (ROW_TOPS[rowIdx] - 4) + 'px';
      el.style.height = '42px';
      el.style.left   = '208px';
      el.style.width  = '440px';
      el.style.backgroundPosition = `0 ${121 - ROW_TOPS[rowIdx]}px`;
    }
  }

  // ─── Egg Sprites ─────────────────────────────────────────────────────────────

  function renderEggs() {
    if (!elEggs) return;
    elEggs.innerHTML = '';
    eggs.forEach((status, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      if (row >= EGG_ROWS_PX.length) return;
      const div = document.createElement('div');
      div.className = 'egg-sprite';
      div.style.left = EGG_COLS[col] + 'px';
      div.style.top  = EGG_ROWS_PX[row] + 'px';
      const key = status === -1 ? '-1' : status === 0 ? '0' : status === 1 ? '1' : status === 2 ? '2' : 'bad';
      div.style.backgroundPositionX = EGG_BGX[key] + 'px';
      div.dataset.status = key;
      elEggs.appendChild(div);
    });
  }

  // ─── Timer ───────────────────────────────────────────────────────────────────

  function startTimer() {
    timerInterval = setInterval(() => {
      timerVal++;
      if (elTimer) {
        const m = Math.floor(timerVal / 60);
        const s = timerVal % 60;
        elTimer.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ─── Character Animation & Gaze ──────────────────────────────────────────────

  // In Tirgol2 the rooster always looks at the current active row (tshNom)
  function setGaze(rowIdx) {
    if (charAnim) {
      const n = Math.max(0, Math.min(7, rowIdx ?? 0));
      charAnim.src = `./assets/anim/Stati${n}.png`;
    }
  }

  function startAnim(type) {
    stopAnim();
    const frames = ANIM_SEQUENCES[type];
    if (!frames) { setGaze(tshNom); return; }
    animFrame = 0;
    const interval = type === 'start' ? 150 : 80;

    animInterval = setInterval(() => {
      if (charAnim && frames[animFrame]) {
        charAnim.src = `./assets/anim/${frames[animFrame].replace('.bmp', '.png')}`;
      }
      animFrame++;
      if (animFrame >= frames.length) {
        stopAnim();
        setGaze(tshNom); // always return to look at active row
      }
    }, interval);
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
      if (!elEggs) return;
      elEggs.querySelectorAll('.egg-sprite').forEach(div => {
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

  function playCorrectAnim() {
    const variant = TOV_VARIANTS[Math.floor(Math.random() * TOV_VARIANTS.length)];
    const wavMap = { tov1: '1tov.wav', tov2: '2tov.wav', tov3: '3tov.wav' };
    AudioMgr.playAnim(wavMap[variant] || '1tov.wav');
    startAnim(variant);
  }

  function playWrongAnim() {
    AudioMgr.playAnim('1ra.wav');
    startAnim('ra1');
  }

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function flashRow(rowIdx) {
    const el = elRows?.querySelector(`[data-idx="${rowIdx}"]`);
    if (!el) return;
    el.classList.remove('wrong-flash');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('wrong-flash');
    setTimeout(() => el.classList.remove('wrong-flash'), 400);
  }

  function updatePenalty() {
    if (elPenalty) elPenalty.textContent = penalty;
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { init, destroy };
})();
