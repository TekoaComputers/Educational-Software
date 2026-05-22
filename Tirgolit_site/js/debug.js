// Tirgolit debug instrumentation.
// ON by default. Disable with `?debug=0` in the URL or `TDebug.enable(false)` in DevTools.
// While enabled, every category below logs to the console AND to a ring buffer.
// Run `TDebug.copy()` to copy the last 500 events to the clipboard for sharing.
window.TDebug = (() => {
  const MAX_BUF = 500;
  const buf = [];

  const params = new URLSearchParams(location.search);
  const stored = localStorage.getItem('tirgolit_debug');
  let enabled;
  if (params.get('debug') === '0')      enabled = false;
  else if (params.get('debug') === '1') enabled = true;
  else if (stored === '0')              enabled = false;
  else                                  enabled = true;  // default ON

  const STYLES = {
    screen: 'color:#06c;font-weight:bold',
    button: 'color:#080',
    click:  'color:#888',
    key:    'color:#a60',
    game:   'color:#909',
    sketch: 'color:#069',
    asset:  'color:#a00',
    state:  'color:#444',
  };

  function ts() {
    const d = new Date();
    return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function fmt(v) {
    if (v === undefined) return '';
    try { return ' ' + JSON.stringify(v); } catch { return ' ' + String(v); }
  }

  function log(cat, msg, data) {
    if (!enabled) return;
    const line = `[${ts()}] [${cat}] ${msg}${fmt(data)}`;
    buf.push(line);
    if (buf.length > MAX_BUF) buf.shift();
    const style = STYLES[cat] || 'color:#444';
    console.log('%c' + line, style);
  }

  function dump() { return buf.join('\n'); }

  function copy() {
    const text = dump();
    if (!text) { console.log('TDebug: buffer empty'); return 0; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        () => console.log(`TDebug: copied ${buf.length} lines to clipboard`),
        () => { console.log(text); console.log('TDebug: clipboard blocked — text printed above'); }
      );
    } else {
      console.log(text);
      console.log('TDebug: clipboard unavailable on file:// — text printed above');
    }
    return buf.length;
  }

  function enable(on = true) {
    enabled = !!on;
    try { localStorage.setItem('tirgolit_debug', enabled ? '1' : '0'); } catch {}
    console.log('TDebug ' + (enabled ? 'enabled' : 'disabled'));
  }

  function clear() { buf.length = 0; console.log('TDebug: cleared'); }

  // Auto-instrument all bubble-phase clicks: useful for finding which control
  // was hit when the resulting behavior is wrong.
  document.addEventListener('click', (e) => {
    if (!enabled) return;
    const t = e.target;
    const onclickAncestor = t.closest('[onclick]');
    const handler = onclickAncestor?.getAttribute('onclick') || '';
    const handlerShort = handler.length > 60 ? handler.slice(0, 57) + '...' : handler;
    log('click', `${t.tagName}#${t.id || ''}.${t.className || ''}`, {
      handler: handlerShort,
      x: e.clientX, y: e.clientY,
    });
  }, true);

  // Auto-instrument keydowns on the document.
  document.addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (e.repeat) return;
    log('key', `keydown`, {
      key: e.key, code: e.code, kc: e.keyCode,
      target: e.target?.tagName + (e.target?.id ? '#' + e.target.id : ''),
    });
  }, true);

  // Surface uncaught errors and unhandled promise rejections.
  window.addEventListener('error', (e) => {
    log('asset', 'window.error', { msg: e.message, src: e.filename, line: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    log('asset', 'unhandledrejection', { reason: String(e.reason) });
  });

  if (enabled) {
    console.log('%cTDebug ON — copy logs with TDebug.copy()', 'color:#06c;font-weight:bold');
  }

  return { log, dump, copy, enable, clear, get enabled() { return enabled; } };
})();
