// Game logic - Tirgol matching game
const Game = (() => {
  // State
  let unit = null;
  let gameKind = 1;   // 1 = expr shown, answer is target; 2 = answer shown, expr is target
  let allPairs = [];  // all shuffled pairs for this session
  let eggs = [];      // per-pair status: -1=unanswered, 0=correct, 1-2=wrong x times, 3+=bad
  let sceneIndex = 0; // current scene (group of 8)
  let scenePairs = [];// pairs for current scene (8 items)
  let matched = [];   // matched flags for current scene (bool[8])
  let currentTarget = null; // {pairIdx, value} current target to find
  let matchedCount = 0;
  let penalty = 0;
  let wrongStreak = 0;// wrong answers on current target
  let timerVal = 0;
  let timerInterval = null;
  let hintTimeout = null;
  let onComplete = null;

  // DOM refs
  let elRows, elPlanks, elTargetVal, elProgress, elPenalty, elTimer, elEggs;
  let charAnim;

  // Plank state per scene row: null | 'gtran' | 'gfull'
  let rowPlanks = [];

  // Keyboard focus row (arrow-key navigation, VB6 Form_KeyUp)
  let keyFocusRow = 0;
  let keyHandler = null;

  // Animation state
  let animInterval = null;
  let animFrame = 0;
  let chicksInterval = null;
  let eggFlip = false;
  const CHICK_BGX = [-156, -195, -234];
  const ANIM_SEQUENCES = {
    start: ['Start1.bmp','Start2.bmp','Start3.bmp','Start4.bmp','Start5.bmp'],
    tov1: ['1Tov1.bmp','1Tov2.bmp','1Tov3.bmp','1Tov4.bmp','1Tov5.bmp','1Tov6.bmp','1Tov7.bmp','1Tov8.bmp','1Tov9.bmp','1Tov10.bmp','1Tov11.bmp','1Tov12.bmp','1Tov13.bmp'],
    tov2: ['2Tov1.bmp','2Tov2.bmp','2Tov3.bmp','2Tov4.bmp','2Tov5.bmp','2Tov6.bmp','2Tov7.bmp','2Tov8.bmp','2Tov9.bmp','2Tov10.bmp','2Tov11.bmp'],
    tov3: ['3Tov1.bmp','3Tov2.bmp','3Tov3.bmp','3Tov4.bmp','3Tov5.bmp','3Tov6.bmp','3Tov7.bmp','3Tov8.bmp','3Tov9.bmp','3Tov10.bmp'],
    tov4: ['4Tov1.bmp','4Tov2.bmp','4Tov3.bmp','4Tov4.bmp','4Tov5.bmp','4Tov6.bmp','4Tov7.bmp','4Tov8.bmp','4Tov9.bmp','4Tov10.bmp','4Tov11.bmp','4Tov12.bmp','4Tov13.bmp'],
    ra1:  ['1ra1.bmp','1ra2.bmp','1ra3.bmp','1ra4.bmp','1ra5.bmp','1ra6.bmp'],
  };
  const TOV_VARIANTS = ['tov1','tov2','tov3'];

  // Layout constants (pixel positions within the 800×600 viewport)
  // Row positions from VB6 Shel/Tesh label tops: frm_twips/10 × 0.667
  const ROW_TOPS  = [137, 183, 232, 278, 324, 371, 417, 467];
  const ROW_LEFT  = 203;
  const ROW_WIDTH = 461;
  const ROW_H     = 44;

  // Egg sprite positions on fence (4 cols × 8 rows = 32 max)
  // Cols from Egg.Left twips/10×0.673; rows from Egg.Top twips/10×0.667
  const EGG_COLS     = [18, 57, 96, 134];
  const EGG_ROWS_PX  = [131, 181, 226, 273, 321, 369, 414, 462];

  // CSmall.bmp bg-x per egg status (bg-size 273×135, scale 0.78)
  // col 0=unanswered, col 2=broken(bad), col 4=chick(0wrong), col 5=chick(1), col 6=chick(2)
  const EGG_BGX = { '-1': 0, '0': -156, '1': -117, '2': -117, 'bad': -78 };

  // ─── Public API ────────────────────────────────────────────────────────────

  function init(unitData, kind, completeCb) {
    destroy(); // clean up any previous session
    unit = unitData;
    gameKind = kind;
    onComplete = completeCb;
    penalty = 0;
    timerVal = 0;
    matchedCount = 0;

    // Build full randomized pair list (round up to multiple of 8)
    const qs = [...unit.questions];
    shuffle(qs);
    while (qs.length % 8 !== 0) {
      qs.push(qs[Math.floor(Math.random() * unit.questions.length)]);
    }
    allPairs = qs;
    eggs = allPairs.map(() => -1);

    // Mark kind on viewport for background and target-bar CSS
    const vp = document.getElementById('game-viewport');
    if (vp) vp.classList.toggle('kind-2', kind === 2);

    // Grab DOM refs
    elRows      = document.getElementById('game-rows');
    elPlanks    = document.getElementById('game-planks');
    elTargetVal = document.getElementById('game-target-value');
    elProgress  = document.getElementById('game-progress');
    elPenalty   = document.getElementById('game-penalty');
    elTimer     = document.getElementById('game-timer');
    elEggs      = document.getElementById('game-eggs');
    charAnim    = document.getElementById('char-img');

    renderEggs();
    updatePenalty();
    updateProgress();

    // Fit viewport to window
    window.addEventListener('resize', resizeViewport);
    resizeViewport();

    // Keyboard navigation (VB6 Form_KeyUp: arrow keys + Enter)
    keyHandler = e => handleGameKey(e);
    window.addEventListener('keydown', keyHandler);

    // Start intro animation then kick off scene
    startAnim('start');
    AudioMgr.playAnim(`Tirgol1Q${gameKind}.wav`);
    setTimeout(() => {
      goToScene(0);
      startTimer();
    }, 1600);
  }

  function destroy() {
    stopTimer();
    stopAnim();
    stopChicksAnim();
    clearTimeout(hintTimeout);
    window.removeEventListener('resize', resizeViewport);
    if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
  }

  // ─── Viewport Scaling ───────────────────────────────────────────────────

  function resizeViewport() {
    const vp = document.getElementById('game-viewport');
    if (!vp) return;
    const outer = vp.parentElement;
    const availW = outer.clientWidth;
    const availH = outer.clientHeight;
    const scale = Math.min(availW / 800, availH / 600);
    const scaledW = 800 * scale;
    const scaledH = 600 * scale;
    vp.style.transform = `scale(${scale})`;
    vp.style.left = Math.max(0, (availW - scaledW) / 2) + 'px';
    vp.style.top  = Math.max(0, (availH - scaledH) / 2) + 'px';
  }

  // ─── Scene Management ───────────────────────────────────────────────────

  function goToScene(idx) {
    sceneIndex = idx;
    scenePairs = allPairs.slice(idx * 8, (idx + 1) * 8);
    matched = scenePairs.map(() => false);
    rowPlanks = new Array(scenePairs.length).fill(null);
    wrongStreak = 0;
    keyFocusRow = 0;
    if (elPlanks) elPlanks.innerHTML = '';
    clearHint();
    renderRows();
    pickNextTarget();
  }

  function pickNextTarget() {
    const unmatched = scenePairs
      .map((p, i) => ({ p, i, globalIdx: sceneIndex * 8 + i }))
      .filter(({ i }) => !matched[i]);

    if (unmatched.length === 0) {
      const totalScenes = Math.ceil(allPairs.length / 8);
      if (sceneIndex + 1 < totalScenes) {
        setTimeout(() => goToScene(sceneIndex + 1), 500);
      } else {
        stopTimer();
        stopAnim();
        startChicksAnim();
        if (penalty < 30) AudioMgr.playAnim('soff.wav');
        setTimeout(() => {
          if (onComplete) {
            const tov = eggs.filter(e => e === 0).length;
            const be  = eggs.filter(e => e === 1 || e === 2).length;
            const ra  = eggs.filter(e => e >= 3).length;
            onComplete(100 - penalty, { tov, be, ra }, [...eggs]);
          }
        }, 800);
      }
      return;
    }

    const pick = unmatched[Math.floor(Math.random() * unmatched.length)];
    currentTarget = {
      sceneRow: pick.i,
      globalIdx: pick.globalIdx,
      // kind=2 shows "expr =" in target bar (VB6: TshP = Str1 = "expr   =   ")
      value: gameKind === 1 ? pick.p.answer : pick.p.expr + ' =',
      matchAnswer: pick.p.answer,
    };
    wrongStreak = 0;
    updateTargetDisplay();
    clearHint();
    keyFocusRow = -1;
  }

  // ─── Row Rendering ──────────────────────────────────────────────────────

  // Set plank type for a row: null=none, 'gtran'=hover, 'gfull'=matched
  // VB6 GFull (both kinds): BitBlt(208, top-8, 440, 46, GFull, 0, top-125)
  // VB6 GTran kind=1:        BitBlt(509, top-4, 136, 42, GTran, 301, top-121) right half
  // VB6 GTran kind=2:        BitBlt(208, top-4, 320, 42, GTran, 0,   top-121) left half
  function setPlank(rowIdx, type) {
    rowPlanks[rowIdx] = type;
    if (!elPlanks) return;
    let el = elPlanks.querySelector(`[data-plank-row="${rowIdx}"]`);
    if (!type) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.dataset.plankRow = rowIdx;
      elPlanks.appendChild(el);
    }
    el.className = type + '-plank';
    if (type === 'gtran') {
      // GTran: top-4, h=42, bgY offset uses +16 from Tesh(0).Top(137) → 121
      const bgY = 121 - ROW_TOPS[rowIdx];
      el.style.top    = (ROW_TOPS[rowIdx] - 4) + 'px';
      el.style.height = '42px';
      if (gameKind === 1) {
        el.style.left  = '509px';
        el.style.width = '136px';
        el.style.backgroundPosition = `-301px ${bgY}px`;
      } else {
        el.style.left  = '208px';
        el.style.width = '320px';
        el.style.backgroundPosition = `0 ${bgY}px`;
      }
    } else {
      // GFull: top-8, h=46, bgY offset uses +12 from Tesh(0).Top(137) → 125
      el.style.top    = (ROW_TOPS[rowIdx] - 8) + 'px';
      el.style.height = '46px';
      el.style.left   = '208px';
      el.style.width  = '440px';
      el.style.backgroundPosition = `0 ${125 - ROW_TOPS[rowIdx]}px`;
    }
  }

  function renderRows() {
    elRows.innerHTML = '';
    scenePairs.forEach((pair, i) => {
      const row = document.createElement('div');
      row.className = 'q-row';
      row.dataset.idx = i;
      row.style.top    = ROW_TOPS[i] + 'px';
      row.style.height = ROW_H + 'px';
      if (matched[i]) {
        row.classList.add('matched');
        setPlank(i, 'gfull');
      }

      const exprSpan = document.createElement('span');
      exprSpan.id = `row-expr-${i}`;
      exprSpan.className = 'row-expr';

      const ansSpan = document.createElement('span');
      ansSpan.id = `row-ans-${i}`;

      if (gameKind === 1) {
        // kind=1: left shows "expr =", right shows answer (hidden until match)
        exprSpan.textContent = pair.expr + ' =';
        ansSpan.className = 'row-answer' + (matched[i] ? ' revealed' : ' hidden');
        ansSpan.textContent = pair.answer;
      } else {
        // kind=2: left EMPTY (expr revealed on match), right shows answer (always visible)
        exprSpan.textContent = matched[i] ? pair.expr + ' =' : '';
        if (matched[i]) exprSpan.classList.add('revealed');
        ansSpan.className = 'row-answer' + (matched[i] ? ' revealed' : '');
        ansSpan.textContent = pair.answer;
      }

      row.appendChild(exprSpan);
      row.appendChild(ansSpan);

      if (!matched[i]) {
        row.addEventListener('click', () => handleRowClick(i));
        row.addEventListener('mouseenter', () => handleRowHover(i, true));
        row.addEventListener('mouseleave', () => handleRowHover(i, false));
        row.addEventListener('touchstart', () => handleRowClick(i), { passive: true });
      }

      elRows.appendChild(row);
    });
  }

  function handleRowHover(rowIdx, entering) {
    if (matched[rowIdx]) return;
    if (gameKind === 1) {
      // kind=1: preview answer in right span
      const ansEl = document.getElementById(`row-ans-${rowIdx}`);
      if (!ansEl) return;
      if (entering) {
        ansEl.textContent = currentTarget ? currentTarget.value : '';
        ansEl.className = 'row-answer preview';
        if (!animInterval) setGaze(rowIdx);
        setPlank(rowIdx, 'gtran');
      } else {
        ansEl.textContent = '';
        ansEl.className = 'row-answer hidden';
        if (!animInterval && charAnim) charAnim.src = './assets/anim/Stati.png';
        setPlank(rowIdx, null);
      }
    } else {
      // kind=2: preview expression in left span (right span always shows answer)
      const exprEl = document.getElementById(`row-expr-${rowIdx}`);
      if (!exprEl) return;
      if (entering) {
        // value already includes ' =' suffix
        exprEl.textContent = currentTarget ? currentTarget.value : '';
        exprEl.className = 'row-expr preview';
        if (!animInterval) setGaze(rowIdx);
        setPlank(rowIdx, 'gtran');
      } else {
        exprEl.textContent = '';
        exprEl.className = 'row-expr';
        if (!animInterval && charAnim) charAnim.src = './assets/anim/Stati.png';
        setPlank(rowIdx, null);
      }
    }
  }

  function handleRowClick(rowIdx) {
    if (!currentTarget || matched[rowIdx]) return;
    clearHint();

    const pair = scenePairs[rowIdx];
    const isCorrect = rowIdx === currentTarget.sceneRow ||
      pair.answer === currentTarget.matchAnswer;

    if (isCorrect) {
      matched[rowIdx] = true;
      eggs[sceneIndex * 8 + rowIdx] = wrongStreak > 2 ? 3 : wrongStreak;
      matchedCount++;

      const row = elRows.querySelector(`[data-idx="${rowIdx}"]`);
      if (row) {
        row.classList.add('matched');
        row.classList.remove('focused', 'key-focused');
        setPlank(rowIdx, 'gfull');
      }
      if (gameKind === 1) {
        const ansEl = document.getElementById(`row-ans-${rowIdx}`);
        if (ansEl) { ansEl.textContent = currentTarget.value; ansEl.className = 'row-answer revealed'; }
      } else {
        // kind=2: reveal expression in left span; right span (answer) already visible
        // value already contains ' =' suffix
        const exprEl = document.getElementById(`row-expr-${rowIdx}`);
        if (exprEl) { exprEl.textContent = currentTarget.value; exprEl.className = 'row-expr revealed'; }
        const ansEl = document.getElementById(`row-ans-${rowIdx}`);
        if (ansEl) ansEl.className = 'row-answer revealed';
      }

      renderEggs();
      const sceneAllMatched = matched.every(m => m);
      const totalScenes = Math.ceil(allPairs.length / 8);
      const moreScenes  = sceneIndex + 1 < totalScenes;
      if (sceneAllMatched && moreScenes) {
        // VB6: AniK=4 when last Q of a scene is answered and more scenes remain
        AudioMgr.playAnim('4tov.wav');
        startAnim('tov4');
      } else {
        playCorrectAnim();
      }
      setTimeout(pickNextTarget, 400);
    } else {
      penalty += Math.max(1, Math.round(5 - allPairs.length / 8));
      if (penalty > 60) penalty = 60;
      wrongStreak++;
      updatePenalty();

      const row = elRows.querySelector(`[data-idx="${rowIdx}"]`);
      if (row) {
        row.classList.add('wrong-flash');
        setTimeout(() => row.classList.remove('wrong-flash'), 450);
      }

      playWrongAnim();

      if (wrongStreak >= 3) showHint();
    }

    updateProgress();
  }

  // ─── Keyboard Navigation (VB6 Form_KeyUp: arrows + Enter) ──────────────

  function handleGameKey(e) {
    if (!currentTarget || animInterval) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateRow(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateRow(1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleRowClick(keyFocusRow);
    }
  }

  function navigateRow(dir) {
    const count = scenePairs.length;
    let next = keyFocusRow;
    for (let i = 0; i < count; i++) {
      next = (next + dir + count) % count;
      if (!matched[next]) break;
    }
    setKeyFocus(next);
    setGaze(next);
  }

  function setKeyFocus(rowIdx) {
    if (elRows) {
      elRows.querySelectorAll('.key-focused').forEach(r => r.classList.remove('key-focused'));
      const row = elRows.querySelector(`[data-idx="${rowIdx}"]`);
      if (row && !matched[rowIdx]) row.classList.add('key-focused');
    }
    keyFocusRow = rowIdx;
  }

  // ─── Target Display ─────────────────────────────────────────────────────

  function updateTargetDisplay() {
    if (elTargetVal) {
      elTargetVal.textContent = currentTarget ? currentTarget.value : '';
    }
    for (let i = 0; i < scenePairs.length; i++) {
      if (matched[i]) continue;
      if (gameKind === 1) {
        const ansEl = document.getElementById(`row-ans-${i}`);
        if (ansEl && !ansEl.classList.contains('preview')) ansEl.className = 'row-answer hidden';
      } else {
        const exprEl = document.getElementById(`row-expr-${i}`);
        if (exprEl && !exprEl.classList.contains('preview')) { exprEl.textContent = ''; exprEl.className = 'row-expr'; }
      }
    }
  }

  // ─── Hint ────────────────────────────────────────────────────────────────

  function showHint() {
    if (!currentTarget) return;
    const row = elRows.querySelector(`[data-idx="${currentTarget.sceneRow}"]`);
    if (row) row.classList.add('hint-flash');
  }

  function clearHint() {
    if (hintTimeout) { clearTimeout(hintTimeout); hintTimeout = null; }
    elRows?.querySelectorAll('.hint-flash').forEach(r => r.classList.remove('hint-flash'));
  }

  // ─── Progress & Penalty ─────────────────────────────────────────────────

  function updateProgress() {
    if (elProgress) {
      const total = allPairs.length;
      const done  = eggs.filter(e => e >= 0).length;
      elProgress.textContent = `${done} / ${total}`;
    }
  }

  function updatePenalty() {
    if (elPenalty) elPenalty.textContent = penalty;
  }

  // ─── Egg Sprites (CSmall.bmp, 4×8 grid on fence) ────────────────────────

  function renderEggs() {
    if (!elEggs) return;
    elEggs.innerHTML = '';
    eggs.forEach((status, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      if (row >= EGG_ROWS_PX.length) return; // max 32 in display

      const div = document.createElement('div');
      div.className = 'egg-sprite';
      div.style.left = EGG_COLS[col] + 'px';
      div.style.top  = EGG_ROWS_PX[row] + 'px';

      let key;
      if (status === -1) key = '-1';
      else if (status === 0) key = '0';
      else if (status === 1) key = '1';
      else if (status === 2) key = '2';
      else key = 'bad';

      div.style.backgroundPositionX = EGG_BGX[key] + 'px';
      div.dataset.status = key;
      elEggs.appendChild(div);
    });
  }

  // ─── Timer ───────────────────────────────────────────────────────────────

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
  }

  // ─── Character Animation & Gaze ──────────────────────────────────────────

  // Point the rooster at a specific plank row (0-7)
  function setGaze(rowIdx) {
    if (charAnim) {
      const n = Math.max(0, Math.min(7, rowIdx ?? 0));
      charAnim.src = `./assets/anim/Stati${n}.png`;
    }
  }

  function startAnim(type) {
    stopAnim();
    const frames = ANIM_SEQUENCES[type];
    if (!frames) {
      if (charAnim) charAnim.src = './assets/anim/Stati.png';
      return;
    }
    animFrame = 0;
    const interval = type === 'start' ? 150 : 80;

    // Derive PNG filename from BMP frame name
    function frameSrc(bmp) {
      return `./assets/anim/${bmp.replace('.bmp', '.png')}`;
    }

    animInterval = setInterval(() => {
      if (charAnim && frames[animFrame]) {
        charAnim.src = frameSrc(frames[animFrame]);
      }
      animFrame++;
      if (animFrame >= frames.length) {
        stopAnim();
        if (charAnim) charAnim.src = './assets/anim/Stati.png';
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

  // ─── Utilities ───────────────────────────────────────────────────────────

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function getScore() {
    return Math.max(0, 100 - penalty);
  }

  return { init, destroy, getScore };
})();
