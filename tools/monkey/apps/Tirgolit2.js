// Tirgolit (decimals, product t2): login, every tab, every unit × all 7 games
// played correctly (+1 deliberate mistake each), data check, teacher screens,
// regression probes, random monkey. Shared logic: apps/tirgolit/.
const F = require('./tirgolit/flow');
const extra = require('./tirgolit/extra');

module.exports = {
  async run(ctx) {
    const log = m => console.log(m);
    await F.login(ctx, 't2');
    const levels = await F.tabsAndData(ctx, 't2');
    await F.playAll(ctx, 't2', levels, log);
    if (!process.env.TIRGOLIT_NOEXTRA) await extra.all(ctx, 't2', log);
  },
};
