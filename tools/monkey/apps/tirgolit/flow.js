// Product-level walk: login → product → every tab → every unit × game →
// chaos / regression probes → random monkey.
const C = require('./common');
const { checkQ } = require('./math');
const { sleep, app, clickSel, text, until } = C;

const USER = 'קוף';

async function login(ctx, product) {
  ctx.step('login');
  await C.installShims(ctx.page);
  await ctx.goto('Tirgolit_site/index.html?debug=0', 1200);
  await ctx.checkImages();
  await ctx.shot('login');
  // Empty name must not log in.
  await clickSel(ctx, '.lbtn-ok', 200);
  ctx.check(await ctx.eval(() => document.getElementById('product-overlay').style.display === 'none'), 'empty name logged in', '');
  await ctx.page.focus('#login-input');
  await ctx.page.keyboard.type(USER);
  await clickSel(ctx, '.lbtn-ok', 300);
  ctx.check(await ctx.eval(() => document.getElementById('product-overlay').style.display === 'flex'), 'product chooser not shown after login', '');
  await ctx.shot('product');
  await clickSel(ctx, `.product-card-${product}`, 400);
  const a = await app(ctx);
  ctx.check(a.screen === 'units' && a.product === product && a.user === USER, 'did not reach units', JSON.stringify(a));
}

// Every tab lists exactly its units; every question in them is right.
async function tabsAndData(ctx, P) {
  const levels = await ctx.eval(() => UNITS_DATA.levels.map(l => ({ name: l.name, units: l.units.map(String) })));
  const units = await ctx.eval(() => UNITS_DATA.units);
  for (let tab = 0; tab < 4; tab++) {
    ctx.step(`${P}/tab${tab}`);
    await clickSel(ctx, `#u-tab-${tab}`, 200);
    const rows = await ctx.eval(() => [...document.querySelectorAll('#u-list .u-row')].map(r => r.dataset.uid));
    const want = levels[tab] ? levels[tab].units : [];
    ctx.check(JSON.stringify(rows) === JSON.stringify(want), 'unit list mismatch', `tab ${tab}: ${rows.length} rows vs ${want.length} units`);
    await ctx.checkImages();
    await ctx.shot(`${P}-tab${tab}`);
    // scroll to the bottom so a screenshot shows the tail + scrollbar
    for (let i = 0; i < 3; i++) await clickSel(ctx, '.u-scroll-dn', 30);
    await ctx.shot(`${P}-tab${tab}-scrolled`);
  }
  ctx.step(`${P}/data`);
  for (const [uid, u] of Object.entries(units)) {
    if (!u.questions.length) ctx.finding('error', 'unit has no questions', `${P} ${uid}`);
    u.questions.forEach((q, i) => {
      const bad = checkQ(q.expr, q.answer);
      if (bad) ctx.finding('error', 'bad question in data', `${P} unit ${uid} "${u.title}" q${i + 1}: ${bad}`);
    });
  }
  return levels;
}

function pickUnits(ctx, levels, P) {
  const spec = process.env.TIRGOLIT_UNITS || (ctx.quick ? 'sample' : 'all');
  const out = [];
  levels.forEach((l, tab) => l.units.forEach((uid, i) => {
    let keep = spec === 'all';
    if (spec === 'sample') keep = i === 0 || i === l.units.length - 1;
    else if (spec !== 'all') keep = spec.split(',').includes(uid);
    if (keep) out.push({ tab, uid });
  }));
  // special-character units (+ * ( ) - answers) always go in the sample
  const special = P === 't1' ? ['21', '22', '79', '80', '94'] : ['45', '56', '59', '87', '89'];
  if (spec === 'sample') for (const uid of special) {
    const tab = levels.findIndex(l => l.units.includes(uid));
    if (tab >= 0 && !out.find(o => o.uid === uid)) out.push({ tab, uid });
  }
  return out;
}

async function playAll(ctx, P, levels, log) {
  const slots = (process.env.TIRGOLIT_SLOTS || '0,1,2,3,4,5,6').split(',').map(Number);
  const list = pickUnits(ctx, levels, P);
  log(`${P}: ${list.length} units × ${slots.length} games`);
  const shotDone = new Set();
  for (const { tab, uid } of list) {
    ctx.step(`${P}/unit${uid}`);
    if (!await C.openUnit(ctx, tab, uid)) continue;
    if (!shotDone.has('glist-' + tab)) { shotDone.add('glist-' + tab); await ctx.checkImages(); await ctx.shot(`${P}-glist-u${uid}`); }
    let scored = 0;
    for (const slot of slots) {
      ctx.step(`${P}/unit${uid}/${C.SLOT_NAMES[slot]}`);
      const shots = !shotDone.has('slot' + slot);
      shotDone.add('slot' + slot);
      if (await C.playSlot(ctx, P, tab, uid, slot, { shots, log })) scored++;
      const a = await app(ctx);
      if (!a.glist) { ctx.finding('error', 'lost GList after game', `on ${a.screen}`); await ctx.shot('lost-glist'); await recover(ctx); if (!await C.openUnit(ctx, tab, uid)) break; }
    }
    // Unit best score = average of the top-2 slot scores (VB6 IntUnScore: 0 until 2 games played).
    if (scored >= 2) {
      const best = await text(ctx, '#glist-bestscore');
      ctx.check(/\d/.test(best || ''), 'unit best score missing after playing', `${P} unit ${uid}: "${best}"`);
    }
    await clickSel(ctx, '.glist-exit', 150);
  }
}

async function recover(ctx) {
  for (let i = 0; i < 3; i++) {
    const a = await app(ctx);
    for (const ov of ['#tmsg-overlay', '#sketch-overlay', '#lesson-editor', '#bank-editor']) {
      if (await ctx.eval(s => { const e = document.querySelector(s); return e && e.style.display !== 'none'; }, ov)) {
        const close = { '#tmsg-overlay': '#tmsg-ok', '#sketch-overlay': '#sketch-btn-close', '#lesson-editor': '#led-goout', '#bank-editor': '.bed-gbtn' }[ov];
        await clickSel(ctx, close, 150);
      }
    }
    if (a.screen === 'login' || a.screen === 'usermgmt') return;
    if (a.screen === 'units') { if (a.glist) await clickSel(ctx, '.glist-exit', 150); return; }
    if (a.screen === 'score') await clickSel(ctx, '.sc-exit-btn', 250);
    else await C.bailOut(ctx, 'recover');
  }
}

module.exports = { login, tabsAndData, playAll, recover, USER };
