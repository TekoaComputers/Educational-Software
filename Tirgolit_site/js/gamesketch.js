const SketchTool = (() => {
  const CS    = 25;   // cell size px
  const COLS  = 16;   // CurrX: 0..15
  const ROWS  = 14;   // CurrY: 0..13
  const SXY_X = 4;    // sxy.Left  (60 twips / 15 twips-per-px)
  const SXY_Y = 45;   // sxy.Top   (675 twips / 15)

  let canvas, ctx;
  let charSheet = null, bgImg = null;
  let sheetReady = false, bgReady = false;

  // XY[col][row].CharId[6] — mirrors VB6 XY(20,20) As CharXY
  let XY;
  let CurrX = 0, CurrY = 0, CurrId = 19;
  let GoNext = -1;       // -1=RTL (Hebrew default), 1=LTR
  let CheckChar = false; // true only during auto-populate
  let LastAct  = -1;

  /* ── data init ─────────────────────────────────────────────── */

  function makeXY() {
    const a = [];
    for (let c = 0; c <= 20; c++) {
      a[c] = [];
      for (let r = 0; r <= 20; r++)
        a[c][r] = { CharId: new Array(6).fill(-1) };
    }
    return a;
  }

  /* ── init ───────────────────────────────────────────────────── */

  function init() {
    canvas = document.getElementById('sketch-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width  = COLS * CS;
    canvas.height = ROWS * CS;

    charSheet = new Image();
    charSheet.onload = () => { sheetReady = true; tryRender(); };
    charSheet.src = './assets/menu/Sketch.png';

    bgImg = new Image();
    bgImg.onload = () => { bgReady = true; tryRender(); };
    bgImg.src = './assets/menu/Sketchb.jpg';

    XY = makeXY();
    attachKeys();
    attachMouse();
  }

  function tryRender() { if (sheetReady && bgReady) render(); }

  /* ── drawing primitives ─────────────────────────────────────── */

  // Restore a 25×25 cell's background from Sketchb.jpg
  function paintBg(cx, cy) {
    if (!bgReady) return;
    ctx.drawImage(bgImg, SXY_X + cx * CS, SXY_Y + cy * CS, CS, CS,
                         cx * CS,          cy * CS,          CS, CS);
  }

  // Draw one sprite frame (1-indexed; 0 = skip).  Sketch.png is transparent.
  function maskB(cx, cy, frameNum) {
    if (frameNum <= 0 || !sheetReady) return;
    ctx.drawImage(charSheet, (frameNum - 1) * CS, 0, CS, CS,
                              cx * CS,             cy * CS, CS, CS);
  }

  // Mirrors VB6 PaintCurr
  function paintCurr() {
    if (CurrX < 0) CurrX = 0;
    paintBg(CurrX, CurrY);
    if (CurrId > 12 && CurrId < 16) {
      // . (13) → slot 1, / (14) → slot 2, _ (15) → slot 3
      XY[CurrX][CurrY].CharId[CurrId - 12] = CurrId;
      // no cursor drawn for these special chars
    } else {
      if (CurrId !== 19) XY[CurrX][CurrY].CharId[0] = CurrId;
      maskB(CurrX, CurrY, 20);  // cursor frame (CharId 19 → frame 20)
    }
    for (let i = 0; i < 6; i++)
      maskB(CurrX, CurrY, XY[CurrX][CurrY].CharId[i] + 1);
  }

  // Mirrors VB6 PaintLast
  function paintLast(lx, ly) {
    paintBg(lx, ly);
    for (let i = 0; i < 6; i++)
      maskB(lx, ly, XY[lx][ly].CharId[i] + 1);
  }

  // Full repaint (mirrors VB6 Form_Paint)
  function render() {
    if (!ctx || !bgReady) return;
    ctx.drawImage(bgImg, SXY_X, SXY_Y, COLS * CS, ROWS * CS,
                         0,     0,      COLS * CS, ROWS * CS);
    for (let c = 0; c <= 15; c++)
      for (let r = 0; r <= 13; r++) {
        const cell = XY[c][r];
        for (let i = 0; i < 6; i++)
          if (cell.CharId[i] >= 0) { paintLast(c, r); break; }
      }
    paintCurr();
  }

  /* ── key handler (mirrors VB6 Form_KeyUp) ───────────────────── */

  function handleKeyCode(keyCode) {
    if (window.TDebug) TDebug.log('sketch', 'key', {
      vk: keyCode, x: CurrX, y: CurrY, dir: GoNext, checkChar: CheckChar,
    });
    const Lastxx = CurrX;
    let Lastx = CurrX, Lasty = CurrY;
    let NumPress = false, movePress = false, checkPoint = false;

    if (keyCode === 27) { hide(); return; }
    if (keyCode === 16) { toggleDir(); return; }

    // Digits
    if      (keyCode >= 96  && keyCode <= 105) { CurrId = keyCode - 96; checkPoint = true; NumPress = true; }
    else if (keyCode >= 48  && keyCode <= 57)  { CurrId = keyCode - 48; checkPoint = true; NumPress = true; }
    // Operators
    else if (keyCode === 187) { CurrId = 18; LastAct = CurrId; NumPress = true; }  // =
    else if (keyCode === 107) { CurrId = 10; LastAct = CurrId; NumPress = true; }  // +
    else if (keyCode === 109) { CurrId = 11; LastAct = CurrId; NumPress = true; }  // -
    else if (keyCode === 106) { CurrId = 12; LastAct = CurrId; NumPress = true; }  // *
    else if (keyCode === 110 || keyCode === 190 || keyCode === 191) {
                               CurrId = 13; checkPoint = true;  NumPress = true; }  // .
    else if (keyCode === 111) { CurrId = 14; LastAct = CurrId; NumPress = true; }  // /
    else if (keyCode === 76)  { CurrId = 15; LastAct = CurrId; NumPress = true; }  // L=underline
    else if (keyCode === 66)  { CurrId = 22; LastAct = CurrId; NumPress = true; }  // B
    // Navigation
    else if (keyCode === 38) { if (CurrY > 0)  CurrY--;       movePress = true; }
    else if (keyCode === 40) { if (CurrY < 13) CurrY++;       movePress = true; }
    else if (keyCode === 37) { if (CurrX > 0)  CurrX--;       movePress = true; }
    else if (keyCode === 39) { if (CurrX < 15) CurrX++;       movePress = true; }
    else if (keyCode === 13) { if (CurrY < 13) CurrY++; CurrX = 1; movePress = true; }
    else if (keyCode === 8) {
      // Backspace: erase current cell, move cursor left
      for (let i = 0; i < 6; i++) XY[CurrX][CurrY].CharId[i] = -1;
      paintLast(CurrX, CurrY);
      if (CurrX > 0) CurrX--;
      movePress = true;
    }
    else if (keyCode === 32) {
      // Space: erase current cell, move right
      for (let i = 0; i < 6; i++) XY[CurrX][CurrY].CharId[i] = -1;
      paintLast(CurrX, CurrY);
      if (CurrX < 15) CurrX++;
      movePress = true;
    }
    else if (keyCode === 46) {
      // Delete: erase current cell, stay
      for (let i = 0; i < 6; i++) XY[CurrX][CurrY].CharId[i] = -1;
      paintLast(CurrX, CurrY);
      movePress = true;
    }

    if (movePress) {
      CurrId = 19;
      paintLast(Lastx, Lasty);
      paintCurr();
      return;
    }

    if (!NumPress) return;

    /* ── NumPress: place character ──────────────────────────── */

    // Remove duplicate decimal point on same row
    if (CurrId === 13) {
      const pk = findPoint(CurrY);
      if (pk > 0 && XY[pk][CurrY].CharId[1] === 13) {
        XY[pk][CurrY].CharId[1] = -1;
        paintLast(pk, CurrY);
      }
    }

    // '=' key — complex repositioning for fraction / operator rows
    if (CurrId === 18) {
      outer: for (let i = 0; i <= CurrX; i++) {
        if (XY[CurrX - i][CurrY].CharId[2] === 14) {
          CurrY++;  CurrX = CurrX - i;
          break;
        }
        if (CurrY === 0) break;
        const ch = XY[CurrX - i][CurrY - 1].CharId[0];
        if (ch === 10 || ch === 11 || ch === 12) {
          const qii = i;
          for (let ii = i; ii <= CurrX; ii++) {
            i = ii;
            if (XY[CurrX - ii][CurrY].CharId[0] < 0) {
              XY[CurrX - qii][CurrY - 1].CharId[0] = -1;
              XY[CurrX - ii ][CurrY - 1].CharId[0] = ch;
              break;
            }
          }
          for (let ii = CurrX - i + 1; ii <= 20; ii++) {
            if (XY[ii][CurrY].CharId[0] < 0 && XY[ii][CurrY - 1].CharId[0] < 0) {
              CurrY++;  CurrX = ii - 1;
              break outer;
            }
            XY[ii][CurrY].CharId[3] = 15;
            paintLast(ii, CurrY);
          }
          break;
        }
      }
    }

    // Position adjustments for . / = and operators
    if (CurrId === 13 || CurrId === 14 || CurrId === 18) {
      CurrX += CheckChar ? -1 : 0;  // VB6: CurrX + CheckChar (True=-1)
    } else if (CurrId === 10 || CurrId === 11 || CurrId === 12 || CurrId === 22) {
      paintLast(Lastx, Lasty);
      // Scan left to find first empty cell after existing content
      while (true) {
        if (CurrX < 1) break;
        CurrX--;
        if (XY[CurrX][CurrY].CharId[0] < 0) {
          if (XY[CurrX + 1][CurrY].CharId[0] === 22 || XY[CurrX + 1][CurrY].CharId[0] < 0)
            CurrX++;
          if (XY[CurrX][CurrY].CharId[0] === 22 && CurrId === 22) {
            XY[CurrX][CurrY].CharId[0] = -1;
            CurrId = 19;
          }
          break;
        }
      }
      Lastx = CurrX;  Lasty = CurrY;
    }

    // Fraction bar: draw underlines in row above for occupied cells in current row
    if (CurrId === 14 && CurrY > 0) {
      for (let i = 0; i <= CurrX; i++) {
        if (XY[CurrX - i][CurrY].CharId[0] < 0) break;
        XY[CurrX - i][CurrY - 1].CharId[3] = 15;
        paintLast(CurrX - i, CurrY - 1);
      }
    }

    if (CurrId !== 18) paintCurr();

    // Auto-advance cursor after placing character
    if (CurrId === 10 || CurrId === 11 || CurrId === 12) {
      // Operators: scan right to find end of content, then move to next row
      for (let i = CurrX; i <= 20; i++) {
        if (XY[i][CurrY].CharId[0] < 0) { CurrX = i - 1; break; }
      }
      CurrY++;
    } else {
      let foundH = false;
      for (let i = CurrX; i <= 20; i++) {
        if (!XY[i] || !XY[i][CurrY + 1]) break;
        if (XY[i][CurrY + 1].CharId[2] === 14) {
          foundH = true;  CurrX++;  break;
        }
      }
      if (!foundH && !(CurrId === 13 && !CheckChar)) CurrX += GoNext;
    }

    if (CurrX > 15) { CurrX = 0; CurrY++; }

    paintLast(Lastx, Lasty);
    CurrId = 19;
    paintCurr();

    /* ── CheckPoint: align decimal points between rows (mirrors VB6) ── */
    if (checkPoint) {
      let currD = -1, currU = -1, startD = 0;
      currD = findPoint(CurrY);

      if (CheckChar) {
        for (let i = 1; i <= CurrX; i++) {
          if (XY[CurrX - i][CurrY].CharId[0] < 0) {
            startD = CurrX - i + 1;
            break;
          } else {
            const savedX = CurrX;
            CurrX = CurrX - i;
            if (currU === -1) currU = findPoint(CurrY - 1);
            CurrX = savedX;
          }
        }
      }

      if (currU === currD || currU === -1) return;

      // Copy phrase to temp, clear source
      const tempXY = [];
      for (let i = 0; i <= 20; i++)
        tempXY[i] = { CharId: new Array(6).fill(-1) };
      let endD = 20;
      for (let i = startD; i <= 20; i++) {
        if (XY[i][CurrY].CharId[0] < 0) { endD = i - 1; break; }
        for (let ii = 0; ii < 6; ii++) {
          tempXY[i].CharId[ii] = XY[i][CurrY].CharId[ii];
          XY[i][CurrY].CharId[ii] = -1;
        }
      }

      // Write back shifted by (currU - currD)
      const shift = currU - currD;
      for (let i = startD; i <= endD; i++) {
        const dest = i + shift;
        if (dest >= 0 && dest <= 20)
          for (let ii = 0; ii < 6; ii++)
            XY[dest][CurrY].CharId[ii] = tempXY[i].CharId[ii];
      }

      for (let i = 0; i <= 20; i++) paintLast(i, CurrY);
      CurrX = endD + shift + 1;
      CurrId = 19;
      paintCurr();
    }

    /* ── B key: restore cursor to pre-operator position ── */
    if (LastAct === 22) {
      CurrId = 19;
      paintLast(CurrX, CurrY);
      CurrX = Lastxx;
      paintCurr();
    }
  }

  /* ── FindPoint (mirrors VB6) ────────────────────────────────── */

  function findPoint(lineTo) {
    if (LastAct === 12) {
      let firstPoint = 0;
      for (let i = 0; i < CurrX; i++) {
        if (XY[CurrX - i][lineTo].CharId[0] < 0) firstPoint = CurrX - i - 1;
        else break;
      }
      for (let i = Math.max(0, firstPoint - 1); i <= 20; i++)
        if (XY[i][lineTo].CharId[0] < 0) return i - 1;
      return -1;
    }
    if (CurrX < 1 || XY[CurrX - 1][lineTo].CharId[0] < 0) return -1;
    for (let i = 1; i <= CurrX; i++) {
      if (XY[CurrX - i][lineTo].CharId[0] < 0) break;
      if (XY[CurrX - i][lineTo].CharId[1] === 13 || XY[CurrX - i][lineTo].CharId[2] === 14)
        return CurrX - i;
    }
    for (let i = CurrX - 1; i <= 20; i++) {
      const c = XY[i][lineTo];
      if (!c) break;
      if (c.CharId[0] < 0 || c.CharId[1] === 13 || c.CharId[2] === 14) {
        let fp = i - 1;
        if (c.CharId[1] === 13 || c.CharId[2] === 14) fp++;
        return fp;
      }
    }
    return -1;
  }

  /* ── public methods ─────────────────────────────────────────── */

  function toggleDir() {
    GoNext = -GoNext;
    const img = document.getElementById('sketch-dir-img');
    if (img) img.src = GoNext === 1 ? './assets/menu/SketchS2.png'
                                    : './assets/menu/SketchS0.png';
    render();
  }

  function show(expression) {
    if (window.TDebug) TDebug.log('sketch', 'show', { expression });
    if (!canvas) init();
    const ov = document.getElementById('sketch-overlay');
    if (!ov) return;
    ov.style.display = 'flex';

    // Reorder expression for better visual layout:
    // if left operand is shorter than right, swap them (VB6 ShowSketch logic)
    let str = (expression || '').replace(/ /g, '');
    const plusPos = str.indexOf('+');
    if (plusPos > 1) {
      const eqPos = str.indexOf('=');
      if (eqPos > plusPos) {
        const left  = str.substring(0, plusPos);
        const right = str.substring(plusPos + 1, eqPos);
        const rest  = str.substring(eqPos);
        if (left.length + 1 < right.length) str = right + '+' + left + rest;
      }
    }

    // Show expression text in Qtext area
    const exEl = document.getElementById('sketch-expr');
    if (exEl) exEl.textContent = expression || '';

    // Reset grid; start LTR at (4,1) as VB6 ShowSketch does
    XY = makeXY();
    GoNext = 1;
    CurrX = 4;  CurrY = 1;
    CurrId = 19;
    LastAct = -1;

    const dimg = document.getElementById('sketch-dir-img');
    if (dimg) dimg.src = './assets/menu/SketchS2.png';

    if (bgReady) render();

    // Auto-populate chars (CheckChar=true mirrors VB6 CheckChar=True)
    if (str) {
      const MAP = {
        '0':96, '1':97, '2':98, '3':99, '4':100, '5':101,
        '6':102,'7':103,'8':104,'9':105,
        '*':106,'+':107,'-':109,'.':110,'/':111,'=':187
      };
      CheckChar = true;
      for (let i = 0; i < str.length; i++) {
        const kc = MAP[str[i]];
        if (kc !== undefined) handleKeyCode(kc);
      }
      CheckChar = false;
    }

    // Switch to RTL for user typing
    GoNext = -1;
    if (dimg) dimg.src = './assets/menu/SketchS0.png';

    // Final full repaint to ensure all auto-populated chars display correctly
    if (bgReady && sheetReady) render();
    canvas.focus();
  }

  function hide() {
    const ov = document.getElementById('sketch-overlay');
    if (ov) ov.style.display = 'none';
  }

  function reset() {
    // CmdCls_Click equivalent: clear grid, keep cursor position
    XY = makeXY();
    CurrId = 19;
    render();
  }

  /* ── event attachment ───────────────────────────────────────── */

  function attachKeys() {
    const HANDLED = new Set([
      8,13,16,27,32,37,38,39,40,46,
      48,49,50,51,52,53,54,55,56,57,
      66,76,
      96,97,98,99,100,101,102,103,104,105,
      106,107,109,110,111,187,190,191
    ]);
    document.addEventListener('keydown', (e) => {
      const ov = document.getElementById('sketch-overlay');
      if (!ov || ov.style.display === 'none') return;
      const k = e.keyCode || e.which;
      if (HANDLED.has(k)) { e.preventDefault(); e.stopPropagation(); handleKeyCode(k); }
    });
  }

  function attachMouse() {
    canvas.addEventListener('mousedown',   (e) => { handleMouse(e); canvas.focus(); });
    canvas.addEventListener('mousemove',   (e) => { if (e.buttons) handleMouse(e); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function handleMouse(e) {
    const r  = canvas.getBoundingClientRect();
    let cx = Math.floor((e.clientX - r.left) * (canvas.width  / r.width)  / CS);
    let cy = Math.floor((e.clientY - r.top)  * (canvas.height / r.height) / CS);
    cx = Math.max(0, Math.min(COLS - 1, cx));
    cy = Math.max(0, Math.min(ROWS - 1, cy));
    paintLast(CurrX, CurrY);
    CurrX = cx;  CurrY = cy;
    if (e.button === 2 || (e.buttons & 2)) {
      for (let i = 0; i < 6; i++) XY[CurrX][CurrY].CharId[i] = -1;
      paintLast(CurrX, CurrY);
    }
    CurrId = 19;
    paintCurr();
  }

  // Called from keyboard panel: vkCode is the VB6 KeyBrd Index (= VK keycode)
  function keyClick(vkCode) {
    handleKeyCode(vkCode);
    if (canvas) canvas.focus();
  }

  return { init, show, hide, reset, toggleDir, keyClick };
})();

window.SketchTool      = SketchTool;
window.sketchClose     = () => SketchTool.hide();
window.sketchClear     = () => SketchTool.reset();
window.sketchToggleDir = () => SketchTool.toggleDir();
window.sketchKeyClick  = (id) => SketchTool.keyClick(id);
