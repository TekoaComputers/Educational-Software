// KolKoreA — shared Kesem walker + Kol Kore Sst checks (../kolkore.js).
// Rama 1 shows only btnIcon 0..4; its .MAS lists 15 paths, 5..14 are never
// reachable from the Sst (applyKolKoreARamaLayout hides them).
module.exports = require('../kolkore').kolkore('KolKoreA', {
  slots: (r, sl) => sl.map((_, i) => i).filter(i => sl[i].n > 0 && (r !== 1 || i < 5)),
});
