// Landing page + progress page: every catalog link resolves, images load,
// and the progress page renders with an empty and a non-empty store.
module.exports = {
  async run(ctx) {
    ctx.step('catalog');
    await ctx.goto('index.html');
    await ctx.checkImages();
    await ctx.shot('catalog');
    const links = await ctx.eval(() => [...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => !/^(https?:|mailto:|#)/.test(h)));
    for (const href of [...new Set(links)]) {
      const file = href.split('#')[0].split('?')[0];
      const ok = await ctx.eval(async u => (await fetch(u, { method: 'HEAD' })).ok, file);
      ctx.check(ok, 'broken catalog link', href);
    }

    ctx.step('progress-empty');
    await ctx.goto('progress.html');
    await ctx.checkImages();
    await ctx.shot('progress-empty');
    await ctx.monkey({ n: 15 });
    await ctx.assertAlive('progress page', 1000);

    // Populate progress the way real play does: visit a few Makhela
    // screens and finish a Mikraot dictionary step (its Tozaot record is
    // synced into Tekoa.Progress), then check the summary + per-app pages.
    ctx.step('progress-populate');
    await ctx.goto('makhela_site/index.html#/songs', 1000);
    for (const h of ['#/instruments', '#/settings', '#/']) { await ctx.eval(h => { location.hash = h; }, h); await ctx.sleep(600); }
    await ctx.goto('Mikraot_site/index.html#/maslul/1', 800);
    await ctx.eval(() => {
      localStorage.setItem('mikraot:tozaot', JSON.stringify({ 1: { 0: { 3: 8, 5: 9, done: 1 } }, 4: { 2: { 11: 6 } } }));
      if (window.MK && MK.syncTekoaProgress) MK.syncTekoaProgress();
    });
    await ctx.sleep(500);
    const stored = await ctx.eval(() => (JSON.parse(localStorage.getItem('tekoa:progress') || '{}').apps || {}));
    ctx.check(stored.Makhela && Object.keys(stored.Makhela.activities || {}).length >= 3, 'Makhela visits not recorded in progress', JSON.stringify(stored.Makhela || null).slice(0, 200));
    ctx.check(stored.Mikraot && Object.keys(stored.Mikraot.activities || {}).length === 2, 'Mikraot Tozaot not synced into progress', JSON.stringify(stored.Mikraot || null).slice(0, 200));

    ctx.step('progress-populated');
    await ctx.goto('progress.html');
    await ctx.checkImages();
    await ctx.shot('progress-populated');
    const pcts = await ctx.eval(() => [...document.querySelectorAll('.summary-card')].map(c => c.innerText.replace(/\s+/g, ' ').slice(0, 60)));
    ctx.check(pcts.some(t => /[1-9]\d*%/.test(t)), 'summary shows no progress after playing', pcts.join(' | '));
    for (const app of ['Makhela', 'Mikraot']) {
      ctx.step('progress-app/' + app);
      await ctx.goto('progress.html?app=' + app);
      await ctx.checkImages();
      await ctx.shot('progress-' + app);
      const txt = await ctx.eval(() => document.body.innerText);
      ctx.check(!/עדיין אין פעילויות/.test(txt), 'per-app page claims no activity after playing', app);
      ctx.check(!/NaN|undefined/.test(txt), 'per-app page renders NaN/undefined', app);
      await ctx.monkey({ n: 10, avoid: 'a[href*="_site"],a[href$="index.html"],.actions button' });
    }
    ctx.step('progress-reset');
    await ctx.goto('progress.html?app=Makhela');
    await ctx.clickSel('.actions button', 1500);        // confirm() is auto-accepted
    const after = await ctx.eval(() => (JSON.parse(localStorage.getItem('tekoa:progress') || '{}').apps || {}));
    ctx.check(!after.Makhela || !Object.keys(after.Makhela.activities || {}).length, 'reset did not clear the app', JSON.stringify(after.Makhela || null).slice(0, 200));
    ctx.check(after.Mikraot && Object.keys(after.Mikraot.activities || {}).length === 2, 'reset of one app touched another app', JSON.stringify(after.Mikraot || null).slice(0, 200));
    await ctx.checkImages();
    await ctx.assertAlive('progress after reset', 800);
  },
};
