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
  let glistKeyHandler = null;  // keyboard handler registered by openGList, removed by appGList_exit

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
    document.querySelectorAll('.lbtn, .ubtn, .gbtn, .sbtn, .mmbtn').forEach(btn => {
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
    resizeViewport('usermgmt-viewport');
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
    if (name === 'login')    resizeViewport('login-viewport');
    if (name === 'units')    resizeViewport('units-viewport');
    if (name === 'game')     resizeViewport('game-viewport');
    if (name === 'score')    resizeViewport('score-viewport');
    if (name === 'war')      resizeViewport('war-vp');
    if (name === 'krav')     resizeViewport('krav-vp');
    if (name === 'usermgmt') resizeViewport('usermgmt-viewport');
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

      item.addEventListener('click', async e => {
        if (e.target === delBtn) {
          const ok = await showTMsg(`למחוק את "${name}"?`, true);
          if (ok) { Users.remove(name); renderLogin(); }
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

  async function loginEnter(name) {
    name = (name || '').trim();
    if (!name) return;
    if (!Users.list().includes(name)) {
      try { Users.create(name); } catch(e) { await showTMsg(e.message); return; }
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
    const overlay = document.getElementById('login-exit-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function appLoginExit_yes() {
    if (document.referrer) {
      window.location.href = document.referrer;
    } else {
      window.close();
    }
  }

  function appLoginExit_no() {
    const overlay = document.getElementById('login-exit-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function appLogin_ques() {
    AudioMgr.play('./assets/menu/KNISA.wav');
  }

  function appLogin_help() {
    const overlay = document.getElementById('login-help-overlay');
    const vid = document.getElementById('login-help-video');
    if (!overlay) return;
    overlay.style.display = 'block';
    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(() => {});
      vid.onended = () => appLogin_help_close();
    }
  }

  function appLogin_help_close() {
    const overlay = document.getElementById('login-help-overlay');
    const vid = document.getElementById('login-help-video');
    if (vid) { vid.pause(); vid.onended = null; }
    if (overlay) overlay.style.display = 'none';
  }

  function appLogin_manual() {
    const overlay = document.getElementById('login-manual-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function appLogin_manual_close() {
    const overlay = document.getElementById('login-manual-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function checkAdminPass() {
    const stored = localStorage.getItem('tirgolit_admin_pass') ?? '777';
    if (!stored) return true;
    const entered = await showTInput('הכנס סיסמת מורה', '');
    if (entered === null) return false;
    if (entered.trim() !== stored) { await showTMsg('סיסמא שגויה'); return false; }
    return true;
  }

  async function appAdmin_unm() {
    if (!await checkAdminPass()) return;
    if (!Users.list().includes('מורה')) {
      try { Users.create('מורה'); } catch(e) {}
    }
    loginEnter('מורה');
  }

  async function appAdmin_usm() {
    if (!await checkAdminPass()) return;
    showUserMgmt();
  }

  // ─── User Management Screen (VB6 UserFrm) ────────────────────────────────

  function showUserMgmt() {
    showScreen('usermgmt');
    renderUserMgmt();
  }

  function renderUserMgmt() {
    const listEl = document.getElementById('um-list');
    const scoreEl = document.getElementById('um-slist');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (scoreEl) scoreEl.innerHTML = '';

    Users.list().forEach(name => {
      const item = document.createElement('div');
      item.className = 'um-uitem';
      item.dataset.name = name;
      item.textContent = name;
      item.addEventListener('click', () => {
        listEl.querySelectorAll('.um-uitem').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      listEl.appendChild(item);

      if (scoreEl) {
        const scores = Object.entries(
          JSON.parse(localStorage.getItem('tirgolit_users') || '{}')[name]?.scores || {}
        ).filter(([k, v]) => !k.includes('_s') && v > 0);
        const count = scores.length;
        const avg = count > 0 ? Math.round(scores.reduce((s, [, v]) => s + v, 0) / count) : 0;
        const si = document.createElement('div');
        si.className = 'um-sitem';
        if (avg > 0) {
          si.textContent = avg + ' (' + count + ')';
          si.style.color = avg >= 86 ? 'rgb(0,100,0)' : avg >= 67 ? 'rgb(100,100,0)' : 'rgb(100,0,0)';
        }
        scoreEl.appendChild(si);
      }
    });
  }

  function getSelectedUser() {
    const el = document.querySelector('#um-list .um-uitem.active');
    return el ? el.dataset.name : null;
  }

  function appUserMgmt_back() {
    renderLogin();
    showScreen('login');
  }

  async function appUserMgmt_add() {
    const name = await showTInput('הכנס שם תלמיד', '');
    if (name === null || !name.trim()) return;
    try {
      Users.create(name.trim());
      renderUserMgmt();
    } catch(e) {
      await showTMsg(e.message);
    }
  }

  async function appUserMgmt_delete() {
    const name = getSelectedUser();
    if (!name) { await showTMsg('בחר תלמיד מהרשימה'); return; }
    const ok = await showTMsg(`למחוק את "${name}"?`, true);
    if (!ok) return;
    Users.remove(name);
    renderUserMgmt();
  }

  async function appUserMgmt_resetScores() {
    const name = getSelectedUser();
    if (!name) { await showTMsg('בחר תלמיד מהרשימה'); return; }
    const ok = await showTMsg(`למחוק את תוצאות "${name}"?`, true);
    if (!ok) return;
    Users.clearScores(name);
    renderUserMgmt();
  }

  async function appUserMgmt_changePass() {
    const newPass = await showTInput('הכנס סיסמה חדשה', '');
    if (newPass === null) return;
    localStorage.setItem('tirgolit_admin_pass', newPass.trim());
    await showTMsg('הסיסמה עודכנה');
  }

  function appUserMgmt_selectAll() {
    document.querySelectorAll('#um-list .um-uitem').forEach(el => el.classList.add('active'));
  }

  function appUserMgmt_clearAll() {
    document.querySelectorAll('#um-list .um-uitem').forEach(el => el.classList.remove('active'));
  }

  async function appUserMgmt_detail() {
    const name = getSelectedUser();
    if (!name) { await showTMsg('בחר תלמיד מהרשימה'); return; }
    const data = JSON.parse(localStorage.getItem('tirgolit_users') || '{}');
    const scores = Object.entries(data[name]?.scores || {})
      .filter(([k, v]) => !k.includes('_s') && v > 0)
      .sort(([, a], [, b]) => b - a);
    if (!scores.length) { await showTMsg('אין נתוני ציונים עבור ' + name); return; }
    const avg = Math.round(scores.reduce((s, [, v]) => s + v, 0) / scores.length);
    await showTMsg(name + '\nממוצע: ' + avg + ' (' + scores.length + ' שיעורים)');
  }

  function appUserMgmt_ques() {
    const overlay = document.getElementById('um-minhal-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function appUserMgmt_ques_close() {
    const overlay = document.getElementById('um-minhal-overlay');
    if (overlay) overlay.style.display = 'none';
  }


  // ─── Unit Selection Screen ────────────────────────────────────────────────

  function showUnits() {
    const uname = document.getElementById('units-username');
    uname.textContent = currentUser;
    uname.classList.remove('u-username-anim');
    void uname.offsetWidth; // force reflow to restart animation
    uname.classList.add('u-username-anim');

    const editp = document.getElementById('u-editp');
    if (editp) editp.style.display = currentUser === 'מורה' ? 'block' : 'none';

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
    // VB6 BtnRama_Click: Distor(2) and Distor(3) only enabled on tab 3 (שיעורים נוספים)
    const editp = document.getElementById('u-editp');
    if (editp) {
      editp.classList.toggle('tab3', tabIdx === 3);
      const onTab3 = tabIdx === 3;
      ['u-ep-delete', 'u-ep-rename', 'u-ep-edit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('disabled', !onTab3);
      });
    }
    clearTip();
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

    const hiddenUnits = JSON.parse(localStorage.getItem('tirgolit_hidden_units') || '{}');
    const customNames = JSON.parse(localStorage.getItem('tirgolit_unit_names') || '{}');
    let rowNum = 0;
    levelItems.forEach(({ uid, name }) => {
      if (hiddenUnits[String(uid)]) return;
      const unit = UNITS_DATA.units[String(uid)];
      if (!unit) return;
      rowNum++;
      const displayName = customNames[String(uid)] || name;
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
      nameEl.textContent = rowNum + ') ' + displayName;

      row.appendChild(scoreEl);
      row.appendChild(nameEl);

      row.addEventListener('click', () => {
        listEl.querySelectorAll('.u-row.u-row-sel').forEach(r => r.classList.remove('u-row-sel'));
        row.classList.add('u-row-sel');
        selectedUnitId = uid;
        showTip(uid);
      });

      row.addEventListener('dblclick', () => openGList(uid, unit, displayName));

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
    const customNames = JSON.parse(localStorage.getItem('tirgolit_unit_names') || '{}');
    const level = UNITS_DATA.levels[selectedTabIndex];
    const name = customNames[String(uid)] || level?.unitNames?.[String(uid)] || unit.title;
    openGList(uid, unit, name);
  }

  function showTip(uid) {
    const tipEl = document.getElementById('u-tip');
    if (!tipEl) return;
    const tips = (typeof UNIT_TIPS !== 'undefined' && UNIT_TIPS[String(uid)]) || [];
    tipEl.innerHTML = tips.map(t => `<span>${t}</span>`).join('');
  }

  function clearTip() {
    const tipEl = document.getElementById('u-tip');
    if (tipEl) tipEl.innerHTML = '';
  }

  async function appUnits_rename() {
    if (!selectedUnitId) { await showTMsg('בחר יחידה מהרשימה'); return; }
    const customNames = JSON.parse(localStorage.getItem('tirgolit_unit_names') || '{}');
    const level = UNITS_DATA.levels[selectedTabIndex];
    const current = customNames[String(selectedUnitId)] || level?.unitNames?.[String(selectedUnitId)] || '';
    const newName = await showTInput('שינוי שם השיעור:', current);
    if (newName === null || !newName.trim()) return;
    customNames[String(selectedUnitId)] = newName.trim();
    localStorage.setItem('tirgolit_unit_names', JSON.stringify(customNames));
    renderUnitList(selectedTabIndex);
  }

  async function appUnits_deleteUnit() {
    if (!selectedUnitId) { await showTMsg('בחר יחידה מהרשימה'); return; }
    const level = UNITS_DATA.levels[selectedTabIndex];
    const name = level?.unitNames?.[String(selectedUnitId)] || String(selectedUnitId);
    const ok = await showTMsg(`למחוק את השיעור "${name}"?`, true);
    if (!ok) return;
    const hidden = JSON.parse(localStorage.getItem('tirgolit_hidden_units') || '{}');
    hidden[String(selectedUnitId)] = true;
    localStorage.setItem('tirgolit_hidden_units', JSON.stringify(hidden));
    selectedUnitId = null;
    clearTip();
    renderUnitList(selectedTabIndex);
  }

  async function appUnits_editLesson() {
    await showTMsg('עורך השיעורים אינו זמין בגרסת האינטרנט');
  }

  async function appUnits_newLesson() {
    await showTMsg('עורך השיעורים אינו זמין בגרסת האינטרנט');
  }

  async function appUnits_editDict() {
    await showTMsg('עורך המאגר אינו זמין בגרסת האינטרנט');
  }

  function appUnits_lamoreh() {
    const overlay = document.getElementById('units-lamoreh-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function appUnits_lamoreh_close() {
    const overlay = document.getElementById('units-lamoreh-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function openGList(uid, unit, unitName) {
    // Remove any stale keyboard handler from a previous call
    if (glistKeyHandler) { window.removeEventListener('keydown', glistKeyHandler); glistKeyHandler = null; }

    glistUnitId   = uid;
    glistUnit     = unit;
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
      scoreEl.style.color = bestScore >= 86 ? 'rgb(0,100,0)'
                          : bestScore >= 67 ? 'rgb(100,100,0)'
                          : bestScore > 0   ? 'rgb(100,0,0)'
                          : 'rgb(0,0,100)';
    }

    // Badges and score numbers for rows 0-5
    for (let i = 0; i < 6; i++) {
      const sc      = Users.getSlotScore(currentUser, uid, i);
      const badgeEl = document.getElementById('glist-badge-' + i);
      const numEl   = document.getElementById('glist-snum-' + i);
      const srcY    = BADGE_SRC_Y[i];
      if (sc > 0) {
        const zevaNum = sc >= 86 ? 1 : sc >= 67 ? 2 : 3;
        badgeEl.style.backgroundImage    = `url('assets/menu/Zeva${zevaNum}.jpg')`;
        badgeEl.style.backgroundPosition = `0px -${srcY}px`;
        badgeEl.style.display = 'block';
        numEl.textContent  = sc;
        numEl.style.color  = sc >= 86 ? 'rgb(0,100,0)' : sc >= 67 ? 'rgb(100,100,0)' : 'rgb(100,0,0)';
        numEl.style.display = 'block';
      } else {
        badgeEl.style.backgroundImage = '';
        badgeEl.style.display = 'none';
        numEl.textContent  = '';
        numEl.style.display = 'none';
      }
    }

    const iconEl = document.getElementById('glist-icon');
    if (iconEl) iconEl.src = 'assets/menu/Icon0.bmp';

    showScreen('units');
    screen.style.display = 'block';

    // ── Row highlight state ───────────────────────────────────────────────────
    let hoverRow   = -1;   // currently highlighted row (mouse or keyboard)
    let pulseTimer = null; // VB6 Timer1 (70ms) settle pulse
    const hlEls = [];

    // VB6 BitBlt: rows 0-5 dest x=480 src x=103; row 6 dest x=377 src x=0; srcY=Top-78
    function applyRowBg(rowIdx, type) {
      const hlEl = hlEls[rowIdx];
      if (!hlEl) return;
      const top  = GLIST_ROW_TOPS[rowIdx];
      const srcX = rowIdx === 6 ? 0 : 103;
      const srcY = top - 78;
      const img  = type === 'hover'    ? "url('assets/menu/list3.jpg')"
                 : type === 'selected' ? "url('assets/menu/list2.jpg')"
                 : type === 'leaving'  ? "url('assets/menu/list1.jpg')"
                 : '';
      hlEl.style.backgroundImage    = img;
      hlEl.style.backgroundPosition = img ? `${-srcX}px ${-srcY}px` : '';
    }

    // VB6 GameGo_MouseMove + Timer1: immediate list3 → 70ms settle → list2;
    // previous row flashes list1 then clears (VB6 Eggp2 flash).
    function setHover(i) {
      if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = null; }
      const prev = hoverRow;
      hoverRow = i;

      if (prev !== -1 && prev !== i) {
        applyRowBg(prev, 'leaving');
        setTimeout(() => { if (hoverRow !== prev) applyRowBg(prev, ''); }, 70);
      }

      if (i === -1) { if (iconEl) iconEl.src = 'assets/menu/Icon0.bmp'; return; }

      applyRowBg(i, 'hover');
      if (iconEl) iconEl.src = `assets/menu/Icon${i + 1}.bmp`;
      pulseTimer = setTimeout(() => {
        pulseTimer = null;
        if (hoverRow === i) applyRowBg(i, 'selected');
      }, 70);
    }

    // Cache highlight elements and wire row events
    GLIST_ROW_TOPS.forEach((rowTop, i) => {
      const rowEl = document.getElementById('glist-row-' + i);
      if (!rowEl) return;
      const clone = rowEl.cloneNode(true);
      rowEl.parentNode.replaceChild(clone, rowEl);
      hlEls[i] = document.getElementById('glist-hl-' + i);

      clone.addEventListener('click',      () => appGList_select(i));
      clone.addEventListener('mouseenter', () => setHover(i));
      clone.addEventListener('mouseleave', () => setHover(-1));
      // VB6 GameGo_MouseDown/Up: swap between pressed (Yadq) and idle (Yadq2) cursor
      clone.addEventListener('mousedown',  () => { clone.style.cursor = "url('assets/menu/Yadq.cur'), pointer"; });
      clone.addEventListener('mouseup',    () => { clone.style.cursor = "url('assets/menu/Yadq2.cur'), pointer"; });
      clone.addEventListener('mouseleave', () => { clone.style.cursor = "url('assets/menu/Yadq2.cur'), pointer"; }, true);
    });

    // ── Keyboard navigation (VB6 Form_KeyDown / Form_KeyUp) ──────────────────
    glistKeyHandler = (e) => {
      if (!screen || screen.style.display === 'none') return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHover(hoverRow <= 0 ? 6 : hoverRow - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHover(hoverRow < 0 || hoverRow >= 6 ? 0 : hoverRow + 1);
      } else if (e.key === 'Enter' && hoverRow !== -1) {
        appGList_select(hoverRow);
      } else if (e.key === 'F1') {
        e.preventDefault();
        appGList_ques();
      } else if ((e.key === 'Q' || e.key === 'q') && e.shiftKey) {
        // VB6 Form_KeyUp debug: randomise slot scores 1-3 (range 40-99)
        for (let s = 1; s <= 3; s++) {
          Users.setSlotScore(currentUser, glistUnitId, s, Math.floor(Math.random() * 60) + 40);
        }
        window.removeEventListener('keydown', glistKeyHandler);
        glistKeyHandler = null;
        openGList(glistUnitId, glistUnit, glistUnitName);
      }
    };
    window.addEventListener('keydown', glistKeyHandler);
  }

  function appGList_exit() {
    if (glistKeyHandler) { window.removeEventListener('keydown', glistKeyHandler); glistKeyHandler = null; }
    const screen = document.getElementById('glist-screen');
    if (screen) screen.style.display = 'none';
    renderUnitList(selectedTabIndex);
  }

  function appGList_ques() {
    AudioMgr.play('./assets/menu/glist.wav');
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
    lastGameStart = () => startGame(uid, unit, kind, bg, slot);
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
    lastGameStart = () => startGameT2(uid, unit, kind, slot);
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

  // ─── MMenu pause menu (VB6 MMenu custom control) ─────────────────────────

  let lastGameStart = null;

  function mmenuHide() {
    ['mmenu-game', 'mmenu-war', 'mmenu-krav'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  function appGame_mmenu_show() {
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const map = { 'screen-game': 'mmenu-game', 'screen-war': 'mmenu-war', 'screen-krav': 'mmenu-krav' };
    const el = document.getElementById(map[active.id]);
    if (el) el.style.display = 'block';
  }

  function appGame_mmenu_continue() {
    mmenuHide();
  }

  function appGame_mmenu_exit() {
    mmenuHide();
    exitGame();
  }

  function appGame_mmenu_restart() {
    mmenuHide();
    if (typeof Game    !== 'undefined') try { Game.destroy();     } catch(e) {}
    if (typeof GameT2  !== 'undefined') try { GameT2.destroy();   } catch(e) {}
    if (typeof GameT3  !== 'undefined') try { GameT3.destroy();   } catch(e) {}
    if (typeof GameWar !== 'undefined') try { GameWar.destroy();  } catch(e) {}
    if (typeof GameKrav!== 'undefined') try { GameKrav.destroy(); } catch(e) {}
    if (lastGameStart) lastGameStart();
  }

  // ─── Tirgol3 (GameKind=1, row 4) ─────────────────────────────────────────

  function startGameT3(uid, unit, slot) {
    lastGameStart = () => startGameT3(uid, unit, slot);
    currentUnitId = uid;
    currentUnit   = unit;
    gameKind      = 1;
    gameBg        = 't3';
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
    lastGameStart = () => startGameWar(uid, unit, slot);
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
    lastGameStart = () => startGameKrav(uid, unit, slot);
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
      vp.classList.toggle('bg-t3',  gameBg   === 't3');
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

    const eggRows = (gameBg === 't3') ? [342, 420] : SCORE_EGG_ROWS;

    eggs.forEach((status, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      if (row >= eggRows.length) return;

      const div = document.createElement('div');
      div.className = 'egg-sprite';
      div.style.left = SCORE_EGG_COLS[col] + 'px';
      div.style.top  = eggRows[row]  + 'px';

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

  // ─── TMsg/TInput dialog (VB6 MsgForm.frm) ────────────────────────────────

  let _tmsgResolve = null;

  function showTMsg(text, hasCancel = false) {
    return new Promise(resolve => {
      _tmsgResolve = resolve;
      const overlay   = document.getElementById('tmsg-overlay');
      const textEl    = document.getElementById('tmsg-text');
      const inputEl   = document.getElementById('tmsg-input');
      const okBtn     = document.getElementById('tmsg-ok');
      const cancelBtn = document.getElementById('tmsg-cancel');
      textEl.textContent = text;
      inputEl.style.display = 'none';
      if (hasCancel) {
        okBtn.style.left     = '168px';
        okBtn.style.top      = '117px';
        cancelBtn.style.left = '30px';
        cancelBtn.style.top  = '117px';
        cancelBtn.style.display = 'block';
      } else {
        okBtn.style.left = '100px';
        okBtn.style.top  = '132px';
        cancelBtn.style.display = 'none';
      }
      overlay.style.display = 'flex';
    });
  }

  function showTInput(text, defaultVal) {
    return new Promise(resolve => {
      _tmsgResolve = resolve;
      const overlay   = document.getElementById('tmsg-overlay');
      const textEl    = document.getElementById('tmsg-text');
      const inputEl   = document.getElementById('tmsg-input');
      const okBtn     = document.getElementById('tmsg-ok');
      const cancelBtn = document.getElementById('tmsg-cancel');
      textEl.textContent = text;
      inputEl.style.display = 'block';
      inputEl.value = defaultVal || '';
      okBtn.style.left     = '168px';
      okBtn.style.top      = '132px';
      cancelBtn.style.left = '30px';
      cancelBtn.style.top  = '132px';
      cancelBtn.style.display = 'block';
      overlay.style.display = 'flex';
      setTimeout(() => inputEl.focus(), 10);
    });
  }

  function _tmsgClose(result) {
    const overlay = document.getElementById('tmsg-overlay');
    if (overlay) overlay.style.display = 'none';
    if (_tmsgResolve) { _tmsgResolve(result); _tmsgResolve = null; }
  }

  function appTMsg_ok() {
    const inputEl = document.getElementById('tmsg-input');
    if (inputEl && inputEl.style.display !== 'none') {
      _tmsgClose(inputEl.value);
    } else {
      _tmsgClose(true);
    }
  }

  function appTMsg_cancel() { _tmsgClose(null); }

  // ─── Key handlers ──────────────────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    const tmsg = document.getElementById('tmsg-overlay');
    if (tmsg && tmsg.style.display !== 'none') {
      if (e.key === 'Escape') { e.preventDefault(); appTMsg_cancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); appTMsg_ok(); }
      return;
    }
    if (e.key === 'Enter') {
      const active = document.querySelector('.screen.active');
      if (active?.id === 'screen-units') {
        const glist = document.getElementById('glist-screen');
        if (!glist || glist.style.display === 'none') { playSelected(); return; }
      }
    }
    if (e.key === 'Escape') {
      const ulamoreh = document.getElementById('units-lamoreh-overlay');
      if (ulamoreh && ulamoreh.style.display !== 'none') { appUnits_lamoreh_close(); return; }
      const manual = document.getElementById('login-manual-overlay');
      if (manual && manual.style.display !== 'none') { appLogin_manual_close(); return; }
      const help = document.getElementById('login-help-overlay');
      if (help && help.style.display !== 'none') { appLogin_help_close(); return; }
      const exitDlg = document.getElementById('login-exit-overlay');
      if (exitDlg && exitDlg.style.display !== 'none') { appLoginExit_no(); return; }
      const minhal = document.getElementById('um-minhal-overlay');
      if (minhal && minhal.style.display !== 'none') { appUserMgmt_ques_close(); return; }
      const glist = document.getElementById('glist-screen');
      if (glist && glist.style.display !== 'none') { appGList_exit(); return; }
      const active = document.querySelector('.screen.active');
      // In game screens: Esc shows MMenu (like VB6 Form_KeyUp → goOut_Click → MMenu1.Visible=True)
      if (active?.id === 'screen-game' || active?.id === 'screen-war' || active?.id === 'screen-krav') {
        const mmenuVisible = ['mmenu-game','mmenu-war','mmenu-krav'].some(id => {
          const el = document.getElementById(id);
          return el && el.style.display !== 'none';
        });
        if (mmenuVisible) appGame_mmenu_continue(); else appGame_mmenu_show();
        return;
      }
      if (active?.id === 'screen-login')    appLogin_exit();
      else if (active?.id === 'screen-units')    { renderLogin(); showScreen('login'); }
      else if (active?.id === 'screen-score')    backToGList();
      else if (active?.id === 'screen-usermgmt') appUserMgmt_back();
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

  function appUnits_ques() {
    AudioMgr.play('./assets/menu/yehida.wav');
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
  window.appLoginExit_yes = appLoginExit_yes;
  window.appLoginExit_no = appLoginExit_no;
  window.appLogin_inputChange = appLogin_inputChange;
  window.appLogin_inputKey = appLogin_inputKey;
  window.appLogin_ques = appLogin_ques;
  window.appLogin_help = appLogin_help;
  window.appLogin_help_close = appLogin_help_close;
  window.appLogin_manual = appLogin_manual;
  window.appLogin_manual_close = appLogin_manual_close;
  window.appAdmin_unm = appAdmin_unm;
  window.appAdmin_usm = appAdmin_usm;
  window.appUnits_back = () => { renderLogin(); showScreen('login'); };
  window.appUnits_selectTab = selectTab;
  window.appUnits_play = playSelected;
  window.appUnits_ques = appUnits_ques;
  window.appUnits_rename = appUnits_rename;
  window.appUnits_deleteUnit = appUnits_deleteUnit;
  window.appUnits_editLesson = appUnits_editLesson;
  window.appUnits_newLesson = appUnits_newLesson;
  window.appUnits_editDict = appUnits_editDict;
  window.appUnits_lamoreh = appUnits_lamoreh;
  window.appUnits_lamoreh_close = appUnits_lamoreh_close;
  window.appUnits_scrollUp = appUnits_scrollUp;
  window.appUnits_scrollDn = appUnits_scrollDn;
  window.appGame_exit = exitGame;
  window.appGame_mmenu_show = appGame_mmenu_show;
  window.appGame_mmenu_continue = appGame_mmenu_continue;
  window.appGame_mmenu_exit = appGame_mmenu_exit;
  window.appGame_mmenu_restart = appGame_mmenu_restart;
  window.appScore_replay = replayGame;
  window.appScore_units = backToGList;
  window.appGList_exit = appGList_exit;
  window.appGList_select = appGList_select;
  window.appGList_ques = appGList_ques;
  window.appUserMgmt_back = appUserMgmt_back;
  window.appUserMgmt_add = appUserMgmt_add;
  window.appUserMgmt_delete = appUserMgmt_delete;
  window.appUserMgmt_resetScores = appUserMgmt_resetScores;
  window.appUserMgmt_changePass = appUserMgmt_changePass;
  window.appUserMgmt_selectAll = appUserMgmt_selectAll;
  window.appUserMgmt_clearAll = appUserMgmt_clearAll;
  window.appUserMgmt_detail = appUserMgmt_detail;
  window.appUserMgmt_ques = appUserMgmt_ques;
  window.appUserMgmt_ques_close = appUserMgmt_ques_close;
  window.appTMsg_ok = appTMsg_ok;
  window.appTMsg_cancel = appTMsg_cancel;

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
