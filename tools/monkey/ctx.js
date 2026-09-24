// The `ctx` object every app driver receives. Keeps drivers short: they
// describe *where* to go (levels, games); ctx handles evidence collection.
const fs = require('fs');
const path = require('path');

// Mulberry32 — seeded so a failing run replays with the same --seed.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// In-page: every visible element a user could plausibly click. Heuristic —
// cursor:pointer, native controls, onclick attrs, [data-*] hotspots. Returns
// centre points so clicks go through the real hit-test (overlays included).
function pageClickables(selector, avoid) {
  const out = [];
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) return out;
  const vw = innerWidth, vh = innerHeight;
  for (const el of root.querySelectorAll('*')) {
    if (avoid && el.closest(avoid)) continue;
    if (el.closest('.__tk_fb__,[data-tekoa-noise],#feedback-fab')) continue;   // feedback widget
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || +cs.opacity === 0) continue;
    const tag = el.tagName;
    const clicky = cs.cursor === 'pointer' || tag === 'BUTTON' || tag === 'A' ||
      (tag === 'INPUT' && /button|submit|radio|checkbox/.test(el.type)) ||
      el.hasAttribute('onclick') || el.getAttribute('role') === 'button';
    if (!clicky) continue;
    // cursor is inherited — a child of a clickable isn't a separate target.
    const par = el.parentElement;
    if (par && tag !== 'BUTTON' && tag !== 'INPUT' && getComputedStyle(par).cursor === 'pointer' && cs.cursor === 'pointer') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
    if (x < 0 || y < 0 || x > vw || y > vh) continue;
    // Only keep it if it is actually the top-most thing at its centre.
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
    const label = (window.Tekoa && Tekoa.elLabel) ? Tekoa.elLabel(el) : tag;
    out.push({ x, y, label, href: tag === 'A' ? el.href : null });
  }
  return out;
}

// In-page: images that failed to decode + elements whose CSS background
// image failed (checked against a preloaded Image). Returns labels.
async function pageBrokenImages() {
  const bad = [];
  for (const img of document.images) {
    if (!img.getAttribute('src')) continue;
    const cs = getComputedStyle(img);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (img.complete && img.naturalWidth === 0) bad.push('img ' + img.currentSrc);
  }
  const seen = new Set();
  const checks = [];
  for (const el of document.querySelectorAll('*')) {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none') continue;
    for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) {
      const u = m[1];
      if (u.startsWith('data:') || seen.has(u)) continue;
      seen.add(u);
      checks.push(new Promise(res => {
        const i = new Image();
        i.onload = () => res(null);
        i.onerror = () => res('bg ' + u);
        i.src = u;
        setTimeout(() => res(null), 4000);
      }));
    }
  }
  for (const r of await Promise.all(checks)) if (r) bad.push(r);
  return bad;
}

// In-page fingerprint of "what the user sees": trace screen + visible text +
// visible image sources. Used for stuck detection.
function pageFingerprint() {
  const scr = window.Tekoa && Tekoa.getScreen ? Tekoa.getScreen() : '';
  const parts = [location.hash, scr];
  for (const el of document.querySelectorAll('img,canvas,video')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) parts.push((el.currentSrc || el.tagName) + '@' + (r.left | 0) + ',' + (r.top | 0));
  }
  parts.push((document.body.innerText || '').slice(0, 2000));
  let h = 0; const s = parts.join('|');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function makeCtx({ page, log, base, dir, seed, quick, id }) {
  const rand = rng(seed);
  const findings = [];
  const steps = [];
  let shotN = 0;
  let stepName = 'boot';
  // Error cursors so each step reports only what happened during it.
  let cur = { errors: 0, console: 0, failed: 0 };

  function finding(severity, title, detail, extra) {
    const f = { severity, step: stepName, title, detail: detail || '', ...(extra || {}) };
    // Collapse exact duplicates (same title+detail) into a count.
    const dup = findings.find(x => x.title === f.title && x.detail === f.detail && x.severity === f.severity);
    if (dup) { dup.count = (dup.count || 1) + 1; if (!dup.steps.includes(stepName)) dup.steps.push(stepName); return dup; }
    f.steps = [stepName];
    findings.push(f);
    return f;
  }

  // Flush page errors / console errors / failed loads since the last flush
  // into findings, attributed to the current step.
  function flush() {
    for (const e of log.errors.slice(cur.errors)) finding('error', 'uncaught exception', e.msg.split('\n').slice(0, 4).join('\n'));
    for (const c of log.console.slice(cur.console)) {
      if (c.type === 'dialog') finding('info', 'dialog', c.text);
      else if (c.type === 'error') finding('error', 'console.error', c.text.slice(0, 400));
      else finding('warn', 'console.warn', c.text.slice(0, 400));
    }
    for (const f of log.failed.slice(cur.failed)) {
      const rel = f.url.replace(base, '');
      finding(/\.(png|webp|bmp|gif|jpg)$/i.test(rel) ? 'error' : 'warn', 'failed load', `${f.why} ${rel}`);
    }
    cur = { errors: log.errors.length, console: log.console.length, failed: log.failed.length };
  }

  const ctx = {
    id, page, log, base, quick, rand,
    sleep,
    url: p => base + p,
    pick: arr => arr[Math.floor(rand() * arr.length)],

    /** Mark the start of a named step (e.g. "rama1/game3/unit2"). */
    step(name) { flush(); stepName = name; steps.push({ name, t: Date.now() }); },

    async goto(p, waitMs = 800) {
      await page.goto(base + p, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(waitMs);
    },

    /** Screenshot into shots/NN-<label>.png; returns the relative path. */
    async shot(label) {
      const f = `shots/${String(++shotN).padStart(3, '0')}-${String(label || stepName).replace(/[^\w.-]+/g, '_').slice(0, 60)}.png`;
      await page.screenshot({ path: path.join(dir, f) });
      return f;
    },

    finding,
    /** Record a failed expectation (does not throw). */
    check(cond, title, detail, severity = 'error') { if (!cond) finding(severity, title, detail); return !!cond; },

    /** Evaluate in page. */
    eval: (fn, ...args) => page.evaluate(fn, ...args),

    /** Visible, top-most clickable elements (optionally inside `within`). */
    clickables: (within, avoid) => page.evaluate(pageClickables, within || null, avoid || null),

    async click(x, y, wait = 350) { await page.mouse.click(x, y); await sleep(wait); },

    /** Click the element matching selector at its centre (real mouse event). */
    async clickSel(sel, wait = 400) {
      const box = await page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }).catch(() => null);
      if (!box || !box.w) { finding('error', 'missing control', `selector not visible: ${sel}`); return false; }
      await ctx.click(box.x, box.y, wait);
      return true;
    },

    /** Wait until fn (in-page) returns truthy, or timeout → false. */
    async waitFor(fn, timeout = 8000, arg) {
      try { await page.waitForFunction(fn, { timeout, polling: 150 }, arg); return true; } catch { return false; }
    },

    fingerprint: () => page.evaluate(pageFingerprint),

    /** Scan for broken <img> / CSS backgrounds → error findings. */
    async checkImages() {
      const bad = await page.evaluate(pageBrokenImages);
      for (const b of bad) finding('error', 'missing texture', b.replace(base, ''));
      return bad;
    },

    /** Trace lines ([app/screen] verb …) emitted since index `from`. */
    traceSince: from => log.trace.slice(from),
    traceLen: () => log.trace.length,

    /**
     * Random monkey: `n` clicks on random visible clickables (plus a few
     * random-coordinate taps). Flags a stuck state when `stuckAfter`
     * consecutive clicks leave the fingerprint unchanged AND no clickables
     * remain. `avoid` = CSS selector whose subtree is never clicked (e.g.
     * the exit button, so the monkey stays inside the level).
     */
    async monkey({ n = 30, within = null, avoid = null, wait = 300, randomTapRate = 0.1, stopWhen = null } = {}) {
      let noClick = 0;
      const clicked = [];
      for (let i = 0; i < n; i++) {
        if (stopWhen && await page.evaluate(stopWhen).catch(() => false)) break;
        const cs = await ctx.clickables(within, avoid).catch(() => []);
        if (!cs.length) {
          if (++noClick >= 6) { finding('warn', 'no clickables', `nothing clickable for ${noClick} polls`); await ctx.shot('no-clickables'); break; }
          await sleep(500); continue;
        }
        noClick = 0;
        if (rand() < randomTapRate) {
          const vp = page.viewport();
          await ctx.click(Math.floor(rand() * vp.width), Math.floor(rand() * vp.height), wait);
          continue;
        }
        const c = ctx.pick(cs);
        if (c.href && !c.href.startsWith(base)) continue;          // never leave the site
        clicked.push(c.label);
        await ctx.click(c.x, c.y, wait);
      }
      return clicked;
    },

    /** Detect a dead screen: nothing changes over `ms` of clicking around. */
    async assertAlive(label, ms = 3000) {
      const a = await ctx.fingerprint();
      await sleep(ms);
      const b = await ctx.fingerprint();
      const cs = await ctx.clickables();
      if (a === b && !cs.length) { finding('error', 'stuck', `${label}: no change in ${ms}ms and nothing clickable`); await ctx.shot('stuck'); return false; }
      return true;
    },

    finish(meta) {
      flush();
      const report = { app: id, seed, ...meta, steps, findings, traceTail: log.trace.slice(-200) };
      fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
      const md = [`# Monkey report — ${id}`, '', `seed ${seed} · ${steps.length} steps · ${(meta.ms / 1000).toFixed(1)}s`, ''];
      for (const sev of ['error', 'warn', 'info']) {
        const fs_ = findings.filter(f => f.severity === sev);
        if (!fs_.length) continue;
        md.push(`## ${sev} (${fs_.length})`, '');
        for (const f of fs_) md.push(`- **${f.title}**${f.count ? ` ×${f.count}` : ''} — ${f.detail.split('\n')[0]}  \n  steps: ${f.steps.slice(0, 6).join(', ')}${f.steps.length > 6 ? ' …' : ''}`);
        md.push('');
      }
      md.push('## steps', '', ...steps.map(s => `- ${s.name}`));
      fs.writeFileSync(path.join(dir, 'report.md'), md.join('\n') + '\n');
      return report;
    },
  };
  return ctx;
}

module.exports = { makeCtx, rng };
