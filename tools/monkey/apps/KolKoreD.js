// KolKoreD — shared Kesem walker + Kol Kore Sst checks (../kolkore.js):
// Icon_s page-flip rama toggle, rama-2 +65 px shift / hidden btnIcon(11)
// (its slot repeats 23.MAS, so it is unreachable on purpose),
// gameNumber 6/8 → Games3 aliasing.
module.exports = require('../kolkore').kolkore('KolKoreD', {
  slots: (r, sl) => sl.map((_, i) => i).filter(i => sl[i].n > 0 && !(r === 2 && i === 11)),
});
