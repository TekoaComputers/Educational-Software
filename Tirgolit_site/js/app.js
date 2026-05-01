// Main app - navigation & screen management
const App = (() => {
  let currentUser = null;
  let currentUnit = null;
  let currentUnitId = null;
  let gameKind = 1;
  let gameBg = 1;      // tirgol background (1 or 2), independent of kind
  let currentSlot = 0; // GList slot that was played
  let selectedTabIndex = 0;
  let selectedUnitId = null;
  let chicksAnimInterval = null; // score-screen egg animation

  // GList: slot → [kind, bg] for Tirgol1, {t:'t2',kind} for Tirgol2, or string key
  const GLIST_SLOTS = [
    [2, 2],          // 0: Tirgol1 kind=2, bg=tirgol2.bmp
    {t:'t2',kind:1}, // 1: Tirgol2 sequential typing kind=1
    {t:'t2',kind:2}, // 2: Tirgol2 sequential typing kind=2
    [1, 1],          // 3: Tirgol1 kind=1, bg=tirgol1.bmp
    't3',            // 4: Tirgol3
    'war',           // 5: WarG
    'krav',          // 6: Krav
  ];
  // Runtime y-top of each GameGo row (GList 72dpi, FixDpi→twips/15)
  const GLIST_ROW_TOPS = [81, 143, 204, 267, 330, 426, 507];
  // VB6 BitBlt srcY into Zeva image: GameGo(i).Top - 79 at runtime 96dpi (twips÷15)
  const BADGE_SRC_Y = [2, 64, 125, 188, 251, 347];

  let glistUnitId = null;
  let glistUnit = null;
  let glistUnitName = null;

  // ─── Initialization ───────────────────────────────────────────────────────

  function init() {
    window.addEventListener('resize', resizeViewports);
    resizeViewports();
    initLoginScreen();
    initScrollbarDrag();
    showScreen('login');
    renderLogin();
  }

  function initLoginScreen() {
    const vid = document.getElementById('login-video');
    const staticImg = document.getElementById('login-movie-static');
    if (vid) {
      vid.addEventListener('ended', () => {
        vid.style.display = 'none';
        staticImg.style.display = 'block';
      });
      staticImg.addEventListener('click', () => {
        staticImg.style.display = 'none';
        vid.style.display = 'block';
        vid.currentTime = 0;
        vid.play();
      });
      vid.addEventListener('click', () => {
        vid.currentTime = 0;
        vid.play();
      });
    }

    // Button hover states using data-norm / data-hover / data-down attributes
    // Covers login (.lbtn), units (.ubtn), and game (.gbtn) buttons
    document.querySelectorAll('.lbtn, .ubtn, .gbtn, .sbtn').forEach(btn => {
      const norm  = btn.dataset.norm;
      const hover = btn.dataset.hover;
      const down  = btn.dataset.down;
      if (!hover) return;
      btn.addEventListener('mouseenter', () => { btn.src = hover; });
      btn.addEventListener('mouseleave', () => { btn.src = norm; });
      if (down) {
        btn.addEventListener('mousedown', () => { btn.src = down; });
        btn.addEventListener('mouseup',   () => { btn.src = hover; });
      }
    });
  }

  function resizeViewport(id) {
    const vp = document.getElementById(id);
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

  function resizeViewports() {
    resizeViewport('login-viewport');
    resizeViewport('units-viewport');
    resizeViewport('game-viewport');
    resizeViewport('score-viewport');
    resizeViewport('war-vp');
    resizeViewport('krav-vp');
  }

  function resizeLoginViewport() { resizeViewport('login-viewport'); }

  function clearGameDOM() {
    ['game-rows', 'game-planks', 'game-eggs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    const charImg = document.getElementById('char-img');
    if (charImg) charImg.src = './assets/anim/Stati.png';
  }

  function showScreen(name) {
    if (name === 'game') clearGameDOM();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('active');
    if (name === 'login') resizeViewport('login-viewport');
    if (name === 'units') resizeViewport('units-viewport');
    if (name === 'game')  resizeViewport('game-viewport');
    if (name === 'score') resizeViewport('score-viewport');
    if (name === 'war')   resizeViewport('war-vp');
    if (name === 'krav')  resizeViewport('krav-vp');
  }

  // ─── Login Screen ─────────────────────────────────────────────────────────

  function renderLogin() {
    const listEl = document.getElementById('user-list');
    listEl.innerHTML = '';

    Users.list().forEach(name => {
      const item = document.createElement('div');
      item.className = 'login-uitem';
      item.dataset.name = name;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;

      const delBtn = document.createElement('span');
      delBtn.className = 'login-uitem-del';
      delBtn.textContent = '×';
      delBtn.title = 'מחק משתמש';

      item.appendChild(nameSpan);
      item.appendChild(delBtn);

      item.addEventListener('click', e => {
        if (e.target === delBtn) {
          if (confirm(`למחוק את "${name}"?`)) {
            Users.remove(name);
            renderLogin();
          }
          return;
        }
        const input = document.getElementById('login-input');
        input.value = name;
        input.focus();
        setActiveListItem(name);
      });

      item.addEventListener('dblclick', e => {
        if (e.target === delBtn) return;
        loginEnter(name);
      });

      listEl.appendChild(item);
    });
  }

  function setActiveListItem(name) {
    document.querySelectorAll('.login-uitem').forEach(el => {
      el.classList.toggle('active', el.dataset.name === name);
    });
  }

  function loginEnter(name) {
    name = (name || '').trim();
    if (!name) return;
    if (!Users.list().includes(name)) {
      try { Users.create(name); } catch(e) { alert(e.message); return; }
    }
    currentUser = name;
    document.getElementById('login-input').value = '';
    showUnits();
  }

  function appLogin_inputChange(val) {
    setActiveListItem(val.trim());
  }

  function appLogin_inputKey(e) {
    if (e.key === 'Enter') { loginEnter(document.getElementById('login-input').value); return; }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = Array.from(document.querySelectorAll('.login-uitem'));
      const selIdx = items.findIndex(i => i.classList.contains('active'));
      const nextIdx = e.key === 'ArrowDown'
        ? Math.min(selIdx + 1, items.length - 1)
        : Math.max(selIdx - 1, 0);
      if (items[nextIdx]) {
        const n = items[nextIdx].dataset.name;
        document.getElementById('login-input').value = n;
        setActiveListItem(n);
        items[nextIdx].scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function appLogin_start() {
    loginEnter(document.getElementById('login-input').value);
  }

  function appLogin_exit() {
    if (!confirm('לצאת מהתוכנית?')) return;
    if (document.referrer) {
      window.location.href = document.referrer;
    } else {
      window.close();
    }
  }

  // ─── Unit Selection Screen ────────────────────────────────────────────────

  function showUnits() {
    const uname = document.getElementById('units-username');
    uname.textContent = currentUser;
    uname.classList.remove('u-username-anim');
    void uname.offsetWidth; // force reflow to restart animation
    uname.classList.add('u-username-anim');

    showScreen('units');
    selectedUnitId = null;
    selectTab(0);
  }

  function selectTab(tabIdx) {
    selectedTabIndex = tabIdx;
    selectedUnitId = null;
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`u-tab-${i}`);
      if (el) el.classList.toggle('selected', i === tabIdx);
    }
    renderUnitList(tabIdx);
  }

  function renderUnitList(tabIdx) {
    const listEl = document.getElementById('u-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    listEl.onscroll = updateScrollThumb;

    let levelItems = [];
    const level = UNITS_DATA.levels[tabIdx];
    if (level) {
      level.units.forEach(uid => {
        levelItems.push({
          uid,
          name: level.unitNames?.[String(uid)] || UNITS_DATA.units[String(uid)]?.title || ''
        });
      });
    }

    levelItems.forEach(({ uid, name }, i) => {
      const unit = UNITS_DATA.units[String(uid)];
      if (!unit) return;
      // VB6 UnitFrm: IntUnScore = avg of top-2 slot scores; IntScColor = same 3-tier thresholds as GList
      const score = Users.getTopTwoAvg(currentUser, uid);

      const row = document.createElement('div');
      row.className = 'u-row';
      row.dataset.uid = uid;

      const scoreEl = document.createElement('div');
      scoreEl.className = 'u-score-cell';
      scoreEl.textContent = score > 0 ? score : '';
      scoreEl.style.color = score >= 86 ? 'rgb(0,100,0)' : score >= 67 ? 'rgb(100,100,0)' : score > 0 ? 'rgb(100,0,0)' : 'rgb(160,160,160)';

      const nameEl = document.createElement('div');
      nameEl.className = 'u-name-cell';
      nameEl.textContent = (i + 1) + ') ' + name;

      row.appendChild(scoreEl);
      row.appendChild(nameEl);

      row.addEventListener('click', () => {
        listEl.querySelectorAll('.u-row.u-row-sel').forEach(r => r.classList.remove('u-row-sel'));
        row.classList.add('u-row-sel');
        selectedUnitId = uid;
      });

      row.addEventListener('dblclick', () => openGList(uid, unit, name));

      listEl.appendChild(row);
    });

    // Update custom scrollbar thumb after list content changes
    requestAnimationFrame(updateScrollThumb);
  }

  function playSelected() {
    if (!selectedUnitId) return;
    const uid = selectedUnitId;
    const unit = UNITS_DATA.units[String(uid)];
    if (!unit) return;
    const level = UNITS_DATA.levels[selectedTabIndex];
    const name = level?.unitNames?.[String(uid)] || unit.title;
    openGList(uid, unit, name);
  }

  function openGList(uid, unit, unitName) {
    glistUnitId  = uid;
    glistUnit    = unit;
    glistUnitName = unitName;

    const screen = document.getElementById('glist-screen');
    if (!screen) return;

    // Username
    const unEl = document.getElementById('glist-username');
    if (unEl) unEl.textContent = currentUser;

    // Unit name (shrink font for long names — VB6: Fs=32 default, 24 if >16, 20 if >23)
    const nameEl = document.getElementById('glist-unitname');
    if (nameEl) {
      nameEl.textContent = unitName;
      const len = unitName.length;
      nameEl.style.fontSize = len > 23 ? '27px' : len > 16 ? '32px' : '43px';
    }

    // VB6 GList TheS: average of top-2 slot scores (0-5). 0 if fewer than 2 games played.
    const bestScore = Users.getTopTwoAvg(currentUser, uid);
    const scoreEl = document.getElementById('glist-bestscore');
    if (scoreEl) {
      scoreEl.textContent = (bestScore > 0 ? bestScore : '') + ' : ציון מוביל';
      // VB6 TheS color: Case 0=blue, 1-66=red, 67-85=yellow, 86+=green (first-match thresholds)
      scoreEl.style.color = bestScore >= 86 ? 'rgb(0,100,0)'
                          : bestScore >= 67 ? 'rgb(100,100,0)'
                          : bestScore > 0   ? 'rgb(100,0,0)'
                          : 'rgb(0,0,100)';
    }

    // Badges and score numbers for rows 0-5
    // VB6 Form_Paint thresholds (first-match): ≤66=Zeva3/red, 67-85=Zeva2/yellow, ≥86=Zeva1/green
    for (let i = 0; i < 6; i++) {
      const sc      = Users.getSlotScore(currentUser, uid, i);
      const badgeEl = document.getElementById('glist-badge-' + i);
      const numEl   = document.getElementById('glist-snum-' + i);
      const srcY    = BADGE_SRC_Y[i];

      if (sc > 0) {
        const zevaNum = sc >= 86 ? 1 : sc >= 67 ? 2 : 3; // 1=Zeva(0)/green, 3=Zeva(2)/red
        badgeEl.style.backgroundImage    = `url('assets/menu/Zeva${zevaNum}.jpg')`;
        badgeEl.style.backgroundPosition = `0px -${srcY}px`;
        badgeEl.style.display = 'block';
        numEl.textContent   = sc;
        numEl.style.color   = sc >= 86 ? 'rgb(0,100,0)' : sc >= 67 ? 'rgb(100,100,0)' : 'rgb(100,0,0)';
        numEl.style.display = 'block';
      } else {
        badgeEl.style.backgroundImage = '';
        badgeEl.style.display = 'none';
        numEl.textContent   = '';
        numEl.style.display = 'none';
      }
    }

    // Reset icon (VB6 Form_Load: icon0.bmp initially)
    const iconEl = document.getElementById('glist-icon');
    if (iconEl) iconEl.src = 'assets/menu/Icon0.bmp';

    showScreen('units');
    screen.style.display = 'block';

    // Persistent selection state (VB6 Rlast, starts at 0)
    let rlast = 0;
    const rowEls = [];

    function applyRowBg(rowIdx, type) {
      const el = rowEls[rowIdx];
      if (!el) return;
      const top  = GLIST_ROW_TOPS[rowIdx];
      const bgX  = (rowIdx === 6) ? 17 : 14; // VB6: dest480-src103=117-103=14 for rows 0-5
      const bgY  = -(top - 78);
      const img  = type === 'hover'    ? "url('assets/menu/list3.jpg')"
                 : type === 'selected' ? "url('assets/menu/list2.jpg')"
                 : '';
      el.style.backgroundImage    = img;
      el.style.backgroundSize     = '395px 492px';
      el.style.backgroundPosition = img ? `${bgX}px ${bgY}px` : '';
    }

    // Wire hover per row (replace with clones to drop stale listeners)
    GLIST_ROW_TOPS.forEach((rowTop, i) => {
      const rowEl = document.getElementById('glist-row-' + i);
      if (!rowEl) return;
      const clone = rowEl.cloneNode(true);
      rowEl.parentNode.replaceChild(clone, rowEl);
      rowEls[i] = clone;

      clone.addEventListener('click', () => appGList_select(i));
      clone.addEventListener('mouseenter', () => {
        if (rlast !== i) applyRowBg(rlast, ''); // clear old persistent highlight
        applyRowBg(i, 'hover');
        rlast = i;
        if (iconEl) iconEl.src = `assets/menu/Icon${i + 1}.bmp`;
      });
      clone.addEventListener('mouseleave', () => {
        // Settle to persistent selection (VB6 Timer1 → list2.jpg on Rlast).
        // Only update if rlast is still this row (mouseleave fires before next mouseenter).
        if (i === rlast) applyRowBg(i, 'selected');
      });
    });

    // Show initial selection on row 0 (VB6 Form_Paint with Rlast=0)
    applyRowBg(0, 'selected');

  }

  function appGList_exit() {
    const screen = document.getElementById('glist-screen');
    if (screen) screen.style.display = 'none';
    renderUnitList(selectedTabIndex);
  }

  function appGList_select(slot) {
    const def = GLIST_SLOTS[slot];
    if (!def) return;
    appGList_exit();
    if (Array.isArray(def)) {
      const [kind, bg] = def;
      startGame(glistUnitId, glistUnit, kind, bg, slot);
    } else if (def && def.t === 't2') {
      startGameT2(glistUnitId, glistUnit, def.kind, slot);
    } else if (def === 't3') {
      startGameT3(glistUnitId, glistUnit, slot);
    } else if (def === 'war') {
      startGameWar(glistUnitId, glistUnit, slot);
    } else if (def === 'krav') {
      startGameKrav(glistUnitId, glistUnit, slot);
    }
  }

  // ─── Game Screen ──────────────────────────────────────────────────────────

  function startGame(uid, unit, kind, bg, slot) {
    currentUnitId = uid;
    currentUnit   = unit;
    gameKind      = kind;
    gameBg        = bg   ?? kind; // default: bg matches kind
    currentSlot   = slot ?? (kind === 1 ? 3 : 0);

    // Apply background class (independent of game-kind class)
    const gameVp = document.getElementById('game-viewport');
    if (gameVp) {
      gameVp.classList.remove('bg-t2', 'bg-t3');
      gameVp.classList.toggle('kind-2', kind === 2);
      gameVp.classList.toggle('bg-2',   gameBg === 2);
    }

    document.getElementById('game-unit-title').textContent = unit.title;
    showScreen('game');

    AudioMgr.playAnim(`Tirgol${gameBg}Q${kind}.wav`);

    Game.init(unit, kind, (score, stats, eggs) => {
      showScore(score, unit, stats, eggs);
    });
  }

  // ─── Tirgol2 (sequential typing, rows 1 and 2) ───────────────────────────

  function startGameT2(uid, unit, kind, slot) {
    currentUnitId = uid;
    currentUnit   = unit;
    gameKind      = kind;
    gameBg        = 't2';
    currentSlot   = slot ?? (kind === 1 ? 1 : 2);

    const gameVp = document.getElementById('game-viewport');
    if (gameVp) {
      gameVp.className = 'game-viewport bg-t2';
    }

    document.getElementById('game-unit-title').textContent = unit.title;
    showScreen('game');

    AudioMgr.playAnim(`Tirgol2Q${kind}.wav`);

    GameT2.init(unit, kind, (score, stats, eggs) => {
      showScore(score, unit, stats, eggs);
    });
  }

  function exitGame() {
    Game.destroy();
    if (typeof GameT2  !== 'undefined') GameT2.destroy();
    if (typeof GameT3  !== 'undefined') GameT3.destroy();
    if (typeof GameWar !== 'undefined') GameWar.destroy();
    if (typeof GameKrav!== 'undefined') GameKrav.destroy();
    // VB6: game Form_Unload → Set Hidid = GList → GList becomes visible
    if (glistUnitId && glistUnit) {
      openGList(glistUnitId, glistUnit, glistUnitName);
    } else {
      showUnits();
    }
  }

  // ─── Tirgol3 (GameKind=1, row 4) ─────────────────────────────────────────

  function startGameT3(uid, unit, slot) {
    currentUnitId = uid;
    currentUnit   = unit;
    gameKind      = 1;
    gameBg        = 1;
    currentSlot   = slot ?? 4;

    const gameVp = document.getElementById('game-viewport');
    if (gameVp) {
      gameVp.classList.remove('kind-2', 'bg-2');
    }

    document.getElementById('game-unit-title').textContent = unit.title;
    showScreen('game');

    GameT3.init(unit, (score, stats, eggs) => {
      showScore(score, unit, stats, eggs);
    });
  }

  // ─── WarG (row 5) ──────────────────────────────────────────────────────────

  function startGameWar(uid, unit, slot) {
    currentUnitId = uid;
    currentUnit   = unit;
    gameKind      = 1;
    gameBg        = 1;
    currentSlot   = slot ?? 5;

    showScreen('war');

    GameWar.init(unit, (score, stats, eggs) => {
      showScore(score, unit, stats, eggs);
    });
  }

  // ─── Krav (row 6) ──────────────────────────────────────────────────────────

  function startGameKrav(uid, unit, slot) {
    currentUnitId = uid;
    currentUnit   = unit;
    gameKind      = 1;
    gameBg        = 1;
    currentSlot   = slot ?? 6;

    showScreen('krav');

    GameKrav.init(unit, (score, stats, eggs) => {
      showScore(score, unit, stats, eggs);
    });
  }

  // ─── Score Screen ─────────────────────────────────────────────────────────

  function showScore(score, unit, stats, eggs) {
    score = Math.max(0, Math.round(score));
    Users.setSlotScore(currentUser, currentUnitId, currentSlot, score);

    // Stop any previous score animations
    stopScoreAnims();

    // VB6 rating thresholds (ScoreControl.ctl Info sub)
    let rating, ratingColor, sound;
    if (score > 95) {
      rating = 'מצויין';    ratingColor = '#00FF00'; sound = 'xexelent.wav';
    } else if (score > 84) {
      rating = 'טוב מאוד'; ratingColor = '#00FF00'; sound = 'xvgood.wav';
    } else if (score > 75) {
      rating = 'טוב';       ratingColor = '#C0C0FF'; sound = 'xgood.wav';
    } else if (score > 65) {
      rating = 'כמעט טוב'; ratingColor = '#C00000'; sound = 'xallmost.wav';
    } else {
      rating = 'נסה שוב';  ratingColor = '#C00000'; sound = 'xtry.wav';
    }

    // Apply background to score viewport
    const vp = document.getElementById('score-viewport');
    if (vp) {
      vp.classList.toggle('kind-2', gameKind === 2);
      vp.classList.toggle('bg-2',   gameBg   === 2);
      vp.classList.toggle('bg-t2',  gameBg   === 't2');
    }

    document.getElementById('sc-username').textContent = currentUser || '';
    document.getElementById('sc-number').textContent   = score;

    const ratingEl = document.getElementById('sc-rating');
    ratingEl.textContent  = rating;
    ratingEl.style.color  = ratingColor;

    if (stats) {
      document.getElementById('sc-tov').textContent = stats.tov;
      document.getElementById('sc-be').textContent  = stats.be;
      document.getElementById('sc-ra').textContent  = stats.ra;
    }

    // Render egg sprites and start chick animation (VB6 EggD_Timer)
    if (eggs) renderScoreEggs(eggs);

    AudioMgr.playMenu(sound);
    showScreen('score');

    // Start pie chart animation after screen is shown (VB6 Timer1 on UserControl_Show)
    if (stats) animatePieChart(stats.tov, stats.be, stats.ra);
  }

  // ─── Score egg rendering & chick animation ────────────────────────────────

  // EGG_COLS / EGG_ROWS_PX / EGG_BGX mirror game.js layout constants
  const SCORE_EGG_COLS   = [18, 57, 96, 134];
  const SCORE_EGG_ROWS   = [131, 181, 226, 273, 321, 369, 414, 462];
  // CSmall.bmp bg-x at scale 273×135: chick columns 4/5/6 = -156/-195/-234px
  const CHICK_BGX = [-156, -195, -234];
  const SCORE_EGG_BGX = { '-1': 0, '0': -156, '1': -117, '2': -117, 'bad': -78 };

  function renderScoreEggs(eggs) {
    const container = document.getElementById('score-eggs');
    if (!container) return;
    container.innerHTML = '';

    eggs.forEach((status, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      if (row >= SCORE_EGG_ROWS.length) return;

      const div = document.createElement('div');
      div.className = 'egg-sprite';
      div.style.left = SCORE_EGG_COLS[col] + 'px';
      div.style.top  = SCORE_EGG_ROWS[row]  + 'px';

      const key = status === -1 ? '-1' : status === 0 ? '0' : status === 1 ? '1' : status === 2 ? '2' : 'bad';
      div.style.backgroundPositionX = SCORE_EGG_BGX[key] + 'px';
      div.style.backgroundPositionY = '0px';
      div.dataset.status = key;
      container.appendChild(div);
    });

    // VB6 EggD_Timer: 100ms, alternates row 0/1 of CSmall for hatched eggs,
    // random column each tick (columns 4, 5, or 6 = x=-156/-195/-234px)
    let eggFlip = false;
    chicksAnimInterval = setInterval(() => {
      eggFlip = !eggFlip;
      container.querySelectorAll('.egg-sprite').forEach(div => {
        const s = div.dataset.status;
        if (s === '0' || s === '1' || s === '2') {
          const rx = CHICK_BGX[Math.floor(Math.random() * 3)];
          div.style.backgroundPositionX = rx + 'px';
          div.style.backgroundPositionY = eggFlip ? '-45px' : '0px';
        }
      });
    }, 100);
  }

  // ─── Pie chart animation (VB6 Timer1 in ScoreControl) ────────────────────
  // VB6 Circle center at internal (345,238) = 1:1 CSS px in panel.
  // Canvas 80×80 at (305,198), center at canvas (40,40).
  // VB6: ro+=2 per 50ms up to 50 → maxR=50, growth=2px/frame.
  function animatePieChart(tov, be, ra) {
    const canvas = document.getElementById('score-pie');
    if (!canvas) return;
    const total = tov + be + ra;
    if (total === 0) return;

    const ctx = canvas.getContext('2d');
    const cx = 55, cy = 55;
    const maxR = 50;
    const tovA = (tov / total) * Math.PI * 2;
    const beA  = (be  / total) * Math.PI * 2;
    let r = 0;

    function frame() {
      r = Math.min(r + 2, maxR);
      const t = r / maxR; // 0→1

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (tov > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, 0, tovA);
        ctx.closePath();
        ctx.fillStyle = `rgb(${Math.round(t*150)},${Math.round(200+t*50)},${Math.round(t*150)})`;
        ctx.fill();
      }
      if (be > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, tovA, tovA + beA);
        ctx.closePath();
        ctx.fillStyle = `rgb(255,255,${Math.round(t*150)})`;
        ctx.fill();
      }
      if (ra > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, tovA + beA, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = `rgb(255,${Math.round(t*150)},${Math.round(t*50)})`;
        ctx.fill();
      }

      if (r < maxR) setTimeout(frame, 50);
    }

    frame();
  }

  function stopScoreAnims() {
    clearInterval(chicksAnimInterval);
    chicksAnimInterval = null;
    const canvas = document.getElementById('score-pie');
    if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    const eggs = document.getElementById('score-eggs');
    if (eggs) eggs.innerHTML = '';
  }

  function replayGame() {
    stopScoreAnims();
    if (currentSlot === 1 || currentSlot === 2) startGameT2(currentUnitId, currentUnit, gameKind, currentSlot);
    else if (currentSlot === 4) startGameT3(currentUnitId, currentUnit, currentSlot);
    else if (currentSlot === 5) startGameWar(currentUnitId, currentUnit, currentSlot);
    else if (currentSlot === 6) startGameKrav(currentUnitId, currentUnit, currentSlot);
    else startGame(currentUnitId, currentUnit, gameKind, gameBg, currentSlot);
  }

  function backToGList() {
    stopScoreAnims();
    // VB6 ScoreC_Ex → Unload game form → Set Hidid = GList → GList becomes visible
    Game.destroy();
    if (typeof GameT2  !== 'undefined') GameT2.destroy();
    if (typeof GameT3  !== 'undefined') GameT3.destroy();
    if (typeof GameWar !== 'undefined') GameWar.destroy();
    if (typeof GameKrav!== 'undefined') GameKrav.destroy();
    if (glistUnitId && glistUnit) {
      openGList(glistUnitId, glistUnit, glistUnitName);
    } else {
      showScreen('units');
      renderUnitList(selectedTabIndex);
    }
  }

  // ─── Key handlers ──────────────────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const glist = document.getElementById('glist-screen');
      if (glist && glist.style.display !== 'none') { appGList_exit(); return; }
      const active = document.querySelector('.screen.active');
      if (active?.id === 'screen-game')  exitGame();
      else if (active?.id === 'screen-war')  exitGame();
      else if (active?.id === 'screen-krav') exitGame();
      else if (active?.id === 'screen-units') showScreen('login');
      else if (active?.id === 'screen-score') backToGList();
    }
  });

  // ─── Scrollbar for unit list ──────────────────────────────────────────────

  const SCROLL_THUMB_H = 30;
  const SCROLL_TRACK_H = 240;

  function updateScrollThumb() {
    const list  = document.getElementById('u-list');
    const thumb = document.getElementById('u-scrollbar-thumb');
    if (!list || !thumb) return;
    const maxScroll = list.scrollHeight - list.clientHeight;
    if (maxScroll <= 0) { thumb.style.display = 'none'; return; }
    const thumbTop = Math.round((list.scrollTop / maxScroll) * (SCROLL_TRACK_H - SCROLL_THUMB_H));
    thumb.style.display = 'block';
    thumb.style.top     = thumbTop + 'px';
  }

  function getUnitsVpScale() {
    const vp = document.getElementById('units-viewport');
    if (!vp) return 1;
    const m = vp.style.transform.match(/scale\(([^)]+)\)/);
    return m ? parseFloat(m[1]) : 1;
  }

  function initScrollbarDrag() {
    const thumb = document.getElementById('u-scrollbar-thumb');
    if (!thumb) return;
    thumb.addEventListener('mousedown', e => {
      e.preventDefault();
      const list = document.getElementById('u-list');
      if (!list) return;
      const startY = e.clientY;
      const startScrollTop = list.scrollTop;
      const maxScroll = list.scrollHeight - list.clientHeight;
      if (maxScroll <= 0) return;
      thumb.classList.add('dragging');

      function onMove(e) {
        const scale = getUnitsVpScale();
        const deltaViewport = (e.clientY - startY) / scale;
        const deltaScroll = deltaViewport * (maxScroll / (SCROLL_TRACK_H - SCROLL_THUMB_H));
        list.scrollTop = Math.max(0, Math.min(maxScroll, startScrollTop + deltaScroll));
        updateScrollThumb();
      }

      function onUp() {
        thumb.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function appUnits_scrollUp() {
    const list = document.getElementById('u-list');
    if (list) { list.scrollTop -= 26; updateScrollThumb(); }
  }

  function appUnits_scrollDn() {
    const list = document.getElementById('u-list');
    if (list) { list.scrollTop += 26; updateScrollThumb(); }
  }

  // Expose event handlers to HTML onclick
  window.appLogin_start = appLogin_start;
  window.appLogin_exit = appLogin_exit;
  window.appLogin_inputChange = appLogin_inputChange;
  window.appLogin_inputKey = appLogin_inputKey;
  window.appUnits_back = () => showScreen('login');
  window.appUnits_selectTab = selectTab;
  window.appUnits_play = playSelected;
  window.appUnits_scrollUp = appUnits_scrollUp;
  window.appUnits_scrollDn = appUnits_scrollDn;
  window.appGame_exit = exitGame;
  window.appScore_replay = replayGame;
  window.appScore_units = backToGList;
  window.appGList_exit = appGList_exit;
  window.appGList_select = appGList_select;

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
