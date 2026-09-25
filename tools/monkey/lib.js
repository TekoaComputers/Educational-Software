// Shared harness: static server + headless Chromium + per-page error capture.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '../..');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp',
  '.jpg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.mp3':'audio/mpeg',
  '.wav':'audio/wav', '.mp4':'video/mp4', '.mid':'audio/midi', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.txt':'text/plain' };

function serve(port = 0) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { rsp.writeHead(404); return rsp.end('404'); }
        const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
        const range = req.headers.range;           // media elements need ranges
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          const start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : st.size - 1;
          rsp.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
          return fs.createReadStream(f, { start, end }).pipe(rsp);
        }
        rsp.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(f).pipe(rsp);
      });
    });
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}

async function launch({ headed = false } = {}) {
  return puppeteer.launch({
    executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
    headless: !headed,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio',
           '--no-first-run', '--disable-gpu', '--window-size=1024,768',
           // Fake mic/camera + auto-accept the permission prompt so
           // getUserMedia record flows (Kesem Games3 hak) can be driven.
           '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
}

// Attach collectors to a page; returns the log object that fills as it runs.
function instrument(page, log) {
  log.errors = log.errors || []; log.console = log.console || [];
  log.failed = log.failed || []; log.trace = log.trace || [];
  page.on('pageerror', e => log.errors.push({ t: Date.now(), msg: String(e && e.stack || e) }));
  // Renderer crash (OOM, …): the driver's next call fails with "detached
  // Frame" — record the real cause.
  page.on('error', e => log.errors.push({ t: Date.now(), msg: 'page crashed: ' + String(e && e.message || e) }));
  page.on('console', m => {
    const text = m.text();
    if (/^\[[^\]]+\/[^\]]*\] /.test(text)) log.trace.push(text);
    if (m.type() === 'error' || m.type() === 'warning')
      log.console.push({ type: m.type(), text, loc: m.location() && m.location().url });
  });
  page.on('requestfailed', r => {
    const why = r.failure() && r.failure().errorText;
    // ERR_ABORTED = the page cancelled the load (navigation, prefetch, media
    // swap) — not a missing resource. Real 404s arrive via 'response'.
    if (why === 'net::ERR_ABORTED') return;
    log.failed.push({ url: r.url(), why });
  });
  page.on('response', r => { if (r.status() >= 400) log.failed.push({ url: r.url(), why: 'HTTP ' + r.status() }); });
  page.on('dialog', d => { log.console.push({ type: 'dialog', text: d.type() + ': ' + d.message() }); d.accept().catch(() => {}); });
}

module.exports = { ROOT, serve, launch, instrument };
