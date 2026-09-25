// Yeled — shared Kesem walker (see ../kesem.js). No CmdExit/CmdMashal on
// Yeled's Sst: btnSeret(2) is the exit (Ezia), btnSeret(0/1) are videos.
module.exports = {
  run: ctx => require('../kesem').runApp(ctx, 'Yeled', { exitSel: '.frm-ctrl--btnSeret[data-index="2"]' }),
};
