// KolKoreB — shared Kesem walker + Kol Kore Sst checks (../kolkore.js).
// Two-step Sst: btnIcon(c) picks activity c (0..6), star(0)/star(1) start
// slot c / c+7; btnLamp(0/1) show the score of the star pane's slot.
const PICK = '.frm-ctrl--btnIcon';

async function pick(k, c) {
  const i = await k.eval((sel, ix) => [...document.querySelectorAll(sel)].findIndex(e => +e.dataset.index === ix), PICK, c);
  if (i < 0) return false;
  await k.tap(PICK, i, 250);
  const ok = await k.ctx.waitFor(ix => window.__kesemSession.kkb_cHos === ix, 2000, c);
  k.ctx.check(ok, 'KolKoreB pick did not select', `btnIcon[${c}] → cHos=${await k.eval(() => window.__kesemSession.kkb_cHos)}`);
  // star previews = first-stage picture of slot c / c+7
  const st = await k.eval(ix => {
    const s = window.__kesemSession;
    const sl = s.paths.ramas[String(s.rama)].slots;
    return [0, 1].map(j => {
      const slot = sl[ix + j * 7];
      const pic = slot && slot.stages && slot.stages[0] ? slot.stages[0].pic.toLowerCase().replace(/\.bmp$/, '.png') : null;
      const img = document.querySelector(`.frm-ctrl--star[data-index="${j}"] img.frm-img`);
      return { pic, src: img ? img.getAttribute('src') || '' : '' };
    });
  }, c);
  for (const [j, x] of st.entries()) {
    k.ctx.check(x.pic ? x.src.replace(/\.(png|webp)$/, '.png').endsWith('/bmp/' + x.pic) : !x.src, 'star preview wrong', `cHos ${c} star[${j}]: ${x.src} (slot pic ${x.pic})`);
  }
  return true;
}

module.exports = require('../kolkore').kolkore('KolKoreB', {
  patch(k) {
    k.lampIndex = i => (i >= 7 ? 1 : 0);
    k.visiblePaths = async () => {
      const vis = await k.eval(sel => [...document.querySelectorAll(sel)].filter(e => getComputedStyle(e).display !== 'none').map(e => +e.dataset.index), PICK);
      const out = [];
      for (const c of vis) out.push(c, c + 7);
      return out.sort((a, b) => a - b);
    };
    k.enterPath = async i => {
      if (!(await pick(k, i % 7))) return false;
      await k.tap('.frm-ctrl--star', await k.eval(j => [...document.querySelectorAll('.frm-ctrl--star')].findIndex(e => +e.dataset.index === j), i >= 7 ? 1 : 0), 400);
      return true;
    };
  },
});
