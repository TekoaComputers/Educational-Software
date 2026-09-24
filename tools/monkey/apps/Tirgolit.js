// Tirgolit (integers, product t1): login, every tab, every unit × all 7 games
// played correctly (+1 deliberate mistake each), data check, teacher screens,
// regression probes, random monkey. Shared logic: apps/tirgolit/.
const F = require('./tirgolit/flow');
const extra = require('./tirgolit/extra');

module.exports = {
  async run(ctx) {
    const log = m => console.log(m);
    await F.login(ctx, 't1');
    const levels = await F.tabsAndData(ctx, 't1');
    await F.playAll(ctx, 't1', levels, log);
    if (!process.env.TIRGOLIT_NOEXTRA) await extra.all(ctx, 't1', log);
  },
};
