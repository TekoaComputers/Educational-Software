// Nivim (hemed_nivim_site) — every unit × every game-menu sign (+ hatamaplus
// route): correct play-through with one injected mistake, data oracle,
// score checks, chaos pass. Shared logic: ../hemednivim.js.
//   HND_UNITS=37,5 node run.js Nivim     # only these unit ids
//   HND_SLOTS=1,7  node run.js Nivim     # only these menu slots (9 = hatamaplus)
module.exports = require('../hemednivim').makeDriver('Nivim');
