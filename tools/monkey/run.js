#!/usr/bin/env node
// Monkey runner — drives every Tekoa app through headless Chromium and writes
// a per-app report (errors, 404s, broken images, stuck screens, app-specific
// findings) plus screenshots under tools/monkey/runs/<stamp>/<app>/.
//
//   node tools/monkey/run.js                 # every app in apps/
//   node tools/monkey/run.js Brahot Hemed    # just these
//   node tools/monkey/run.js --seed 7 --quick Brahot
//   node tools/monkey/run.js --headed Brahot # watch it (needs a display)
//
// Exit code is 1 when any app produced an error-severity finding.
// Each app driver lives in apps/<id>.js — see apps/README.md for the ctx API.
const fs = require('fs');
const path = require('path');
const { serve, launch, instrument } = require('./lib');
const { makeCtx } = require('./ctx');

const argv = process.argv.slice(2);
const opt = { seed: 1, quick: false, headed: false, out: null, apps: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--seed') opt.seed = +argv[++i];
  else if (a === '--quick') opt.quick = true;
  else if (a === '--headed') opt.headed = true;
  else if (a === '--out') opt.out = argv[++i];
  else opt.apps.push(a);
}

const APPS_DIR = path.join(__dirname, 'apps');
const all = fs.readdirSync(APPS_DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
const pick = opt.apps.length ? opt.apps : all;
for (const a of pick) if (!all.includes(a)) { console.error(`no driver apps/${a}.js (have: ${all.join(', ')})`); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = opt.out || path.join(__dirname, 'runs', stamp);

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await launch({ headed: opt.headed });
  let anyErr = false;
  const summary = [];
  for (const id of pick) {
    const driver = require(path.join(APPS_DIR, id + '.js'));
    const dir = path.join(runDir, id);
    fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
    const context = await browser.createBrowserContext();   // fresh localStorage per app
    const page = await context.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    const log = {};
    instrument(page, log);
    const ctx = makeCtx({ page, log, base, dir, seed: opt.seed, quick: opt.quick, id });
    const t0 = Date.now();
    let crashed = null;
    try {
      await driver.run(ctx);
    } catch (e) {
      crashed = e;
      ctx.finding('error', 'driver crashed', String(e && e.stack || e));
      await ctx.shot('crash').catch(() => {});
    }
    const report = ctx.finish({ ms: Date.now() - t0 });
    await context.close().catch(() => {});
    const errs = report.findings.filter(f => f.severity === 'error').length;
    const warns = report.findings.filter(f => f.severity === 'warn').length;
    anyErr = anyErr || errs > 0;
    summary.push({ id, errs, warns, steps: report.steps.length, ms: report.ms, crashed: !!crashed });
    console.log(`${errs ? 'FAIL' : 'ok  '} ${id.padEnd(18)} steps=${String(report.steps.length).padStart(3)} errors=${errs} warns=${warns} ${(report.ms / 1000).toFixed(0)}s  → ${path.relative(process.cwd(), dir)}/report.md`);
  }
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  srv.close();
  process.exit(anyErr ? 1 : 0);
})().catch(e => { console.error(e); process.exit(3); });
