// HatamaPlus — GameHatamaPlus.frm is a 48-line stub: only CmdExit + CmdHelp,
// no game logic. The .frm even still declares `VB_Name = "GameAmerican"`
// (it was scaffolded but never developed in the original Hemed release).
// Per the GameMenu slot mapping (slot 8 in CmdPlus1_Click → Hatama) and the
// fact that the original ships no separate engine for HatamaPlus, we run
// the regular Match game and persist the score under the "hatamaplus" key
// so the game-menu shows it as a separately-tracked slot.
window.HND = window.HND || {};

HND.startHatamaPlus = function (root, app, unit, onComplete) {
    HND.log("hatamaplus → match (stub .frm, no own engine)");
    // Match saves the score itself — under "hatamaplus", not "match" (it
    // used to save twice: once to match / a stale slot key, once here).
    return HND.startMatch(root, app, unit, onComplete,
                          { progressKey: "hatamaplus", routeId: "hatamaplus" });
};
