// On-screen virtual keyboard for touch devices (no physical keyboard).
// Auto-shows on coarse-pointer devices when a game screen is active. A small
// toggle button at the bottom-right lets the user force it on/off regardless.
// Each key dispatches a synthetic `keydown` on `document` with `key`, `code`,
// `keyCode`, and `which` set, so all game handlers receive it identically.
(() => {
  // Treat as "needs virtual keyboard" if ANY pointer is coarse (phone, tablet,
  // touch-laptop). The user can still dismiss it with the ✕ button.
  function isTouchOnly() {
    if (!window.matchMedia) return false;
    if (window.matchMedia('(any-pointer: coarse)').matches) return true;
    // Fallback for older browsers.
    return 'ontouchstart' in window && (navigator.maxTouchPoints || 0) > 0;
  }

  const GAME_SCREENS = new Set(['screen-game', 'screen-war', 'screen-krav']);

  // Each key entry: {label, key, code, keyCode}
  const KEYS = [
    { label: '7', key: '7', code: 'Digit7', kc: 55 },
    { label: '8', key: '8', code: 'Digit8', kc: 56 },
    { label: '9', key: '9', code: 'Digit9', kc: 57 },
    { label: '4', key: '4', code: 'Digit4', kc: 52 },
    { label: '5', key: '5', code: 'Digit5', kc: 53 },
    { label: '6', key: '6', code: 'Digit6', kc: 54 },
    { label: '1', key: '1', code: 'Digit1', kc: 49 },
    { label: '2', key: '2', code: 'Digit2', kc: 50 },
    { label: '3', key: '3', code: 'Digit3', kc: 51 },
    { label: '.', key: '.', code: 'Period', kc: 190 },
    { label: '0', key: '0', code: 'Digit0', kc: 48 },
    { label: '⌫', key: 'Backspace', code: 'Backspace', kc: 8 },
    { label: '↑', key: 'ArrowUp',   code: 'ArrowUp',   kc: 38, cls: 'vk-arrow' },
    { label: '↓', key: 'ArrowDown', code: 'ArrowDown', kc: 40, cls: 'vk-arrow' },
  ];

  function dispatchKey(spec) {
    const e = new KeyboardEvent('keydown', {
      key: spec.key, code: spec.code,
      bubbles: true, cancelable: true,
    });
    // keyCode/which are read-only on standard events but most game handlers
    // here read them; defineProperty makes them visible to those handlers.
    Object.defineProperty(e, 'keyCode', { get: () => spec.kc });
    Object.defineProperty(e, 'which',   { get: () => spec.kc });
    document.dispatchEvent(e);
    if (window.TDebug) TDebug.log('key', 'vkeyboard', { key: spec.key, kc: spec.kc });
  }

  function injectStyles() {
    if (document.getElementById('vk-styles')) return;
    const s = document.createElement('style');
    s.id = 'vk-styles';
    s.textContent = `
      #vk-panel {
        position: fixed; right: 12px; bottom: 56px;
        display: none; grid-template-columns: repeat(3, 48px);
        gap: 4px; padding: 24px 8px 8px 8px;  /* extra top padding for the close button */
        background: rgba(20, 20, 30, 0.78);
        border-radius: 10px;
        z-index: 2147483640;
        /* Force LTR so the grid flows 7-8-9 left-to-right (parent html has dir=rtl). */
        direction: ltr;
        user-select: none; -webkit-user-select: none;
        touch-action: manipulation;
      }
      #vk-panel.vk-open { display: grid; }
      .vk-key {
        width: 48px; height: 44px;
        font: bold 20px 'Frank Ruhl Libre', sans-serif;
        color: #fff;
        background: linear-gradient(#3a4a6a, #1f2a44);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 6px;
        text-align: center; line-height: 44px;
        cursor: pointer;
      }
      .vk-key:active { background: linear-gradient(#1f2a44, #3a4a6a); }
      .vk-arrow { background: linear-gradient(#553a6a, #2a1f44); }
      #vk-close {
        position: absolute; top: 2px; right: 4px;
        width: 20px; height: 20px;
        font: bold 14px sans-serif; color: #fff;
        background: transparent; border: none;
        cursor: pointer; opacity: 0.7;
      }
      #vk-close:hover, #vk-close:active { opacity: 1; }
      #vk-toggle {
        position: fixed; right: 12px; bottom: 56px;
        width: 44px; height: 44px;
        font: bold 22px sans-serif; color: #fff;
        background: rgba(20, 20, 30, 0.78);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 22px;
        cursor: pointer; z-index: 2147483640;
        display: none; align-items: center; justify-content: center;
      }
      /* Show the floating toggle only when on a game screen AND panel is closed. */
      #vk-toggle.vk-show { display: flex; }
      #vk-panel.vk-open ~ #vk-toggle { display: none; }
    `;
    document.head.appendChild(s);
  }

  function buildPanel() {
    if (document.getElementById('vk-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'vk-panel';

    // Close button (small ✕ in the panel's top-right) — replaces the floating
    // toggle while the panel is open so it doesn't sit on top of a key.
    const close = document.createElement('button');
    close.id = 'vk-close';
    close.type = 'button';
    close.textContent = '✕';
    close.title = 'Hide virtual keyboard';
    close.addEventListener('click', () => {
      panel.classList.remove('vk-open');
      try { localStorage.setItem('tirgolit_vk_open', '0'); } catch {}
    });
    panel.appendChild(close);

    KEYS.forEach(k => {
      const b = document.createElement('div');
      b.className = 'vk-key' + (k.cls ? ' ' + k.cls : '');
      b.textContent = k.label;
      // pointerdown fires before focus changes, which is what we want.
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        dispatchKey(k);
      });
      panel.appendChild(b);
    });
    document.body.appendChild(panel);

    const toggle = document.createElement('button');
    toggle.id = 'vk-toggle';
    toggle.type = 'button';
    toggle.textContent = '⌨';
    toggle.title = 'Show/hide virtual keyboard';
    toggle.addEventListener('click', () => {
      const open = panel.classList.toggle('vk-open');
      try { localStorage.setItem('tirgolit_vk_open', open ? '1' : '0'); } catch {}
    });
    document.body.appendChild(toggle);
  }

  function gameScreenActive() {
    for (const id of GAME_SCREENS) {
      const el = document.getElementById(id);
      if (el && el.classList.contains('active')) return true;
    }
    return false;
  }

  function syncVisibility() {
    const panel  = document.getElementById('vk-panel');
    const toggle = document.getElementById('vk-toggle');
    if (!panel || !toggle) return;
    const onGameScreen = gameScreenActive();
    toggle.classList.toggle('vk-show', onGameScreen);
    if (!onGameScreen) { panel.classList.remove('vk-open'); return; }

    // Decide default open state: stored pref wins; otherwise auto-open on touch.
    let stored;
    try { stored = localStorage.getItem('tirgolit_vk_open'); } catch {}
    const wantOpen = stored === '1' || (stored === null && isTouchOnly());
    panel.classList.toggle('vk-open', wantOpen);
  }

  function init() {
    injectStyles();
    buildPanel();
    syncVisibility();
    // Watch for screen-class changes so we show/hide as the user navigates.
    const mo = new MutationObserver(syncVisibility);
    document.querySelectorAll('.screen').forEach(s => {
      mo.observe(s, { attributes: true, attributeFilter: ['class'] });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.VKeyboard = { isTouchOnly, syncVisibility };
})();
