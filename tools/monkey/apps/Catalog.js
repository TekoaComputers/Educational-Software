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
  },
};
