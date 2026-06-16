// User management using localStorage
const Users = (() => {
  const STORAGE_KEY = 'tirgolit_users';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function list() {
    return Object.keys(load());
  }

  function create(name) {
    name = name.trim();
    if (!name) throw new Error('שם ריק');
    const data = load();
    if (data[name]) throw new Error('שם קיים');
    data[name] = { scores: {} };
    save(data);
    return name;
  }

  function remove(name) {
    const data = load();
    delete data[name];
    save(data);
  }

  function getScore(user, unitId) {
    const data = load();
    return data[user]?.scores?.[unitId] ?? 0;
  }

  function setScore(user, unitId, score) {
    const data = load();
    if (!data[user]) data[user] = { scores: {} };
    const prev = data[user].scores[unitId] ?? 0;
    if (score > prev) {
      data[user].scores[unitId] = score;
      save(data);
    }
  }

  function getSlotScore(user, unitId, slot) {
    const data = load();
    return data[user]?.scores?.[unitId + '_s' + slot] ?? 0;
  }

  function setSlotScore(user, unitId, slot, score) {
    const data = load();
    if (!data[user]) data[user] = { scores: {} };
    const product = currentProduct(user);   // 't1' or 't2'
    // Two-level storage: legacy keys (game UI reads these) + product-
    // namespaced keys (Tekoa progress + this user's current sub-game
    // get the de-mixed copy). Without the prefix, replaying unit 5 in
    // T2 would clobber the T1 score for unit 5.
    const key       = unitId + '_s' + slot;
    const keyProd   = product + '/' + unitId + '_s' + slot;
    const unitKey   = unitId;
    const unitProd  = product + '/' + unitId;
    data[user].scores[key]      = Math.max(data[user].scores[key]      ?? 0, score);
    data[user].scores[unitKey]  = Math.max(data[user].scores[unitKey]  ?? 0, score);
    data[user].scores[keyProd]  = Math.max(data[user].scores[keyProd]  ?? 0, score);
    data[user].scores[unitProd] = Math.max(data[user].scores[unitProd] ?? 0, score);
    save(data);
    // ---- bridge to Tekoa.Progress ----
    pushToTekoa(user);
  }

  // Which sub-game is the user currently playing? app.js sets
  // localStorage["tirgolit_product_<user>"] = "t1" | "t2" when the
  // product is picked; default to t1.
  function currentProduct(user) {
    if (window.UNITS_DATA && typeof UNITS_DATA_T2 !== "undefined"
        && window.UNITS_DATA === UNITS_DATA_T2) return "t2";
    const v = localStorage.getItem("tirgolit_product_" + user);
    return v === "t2" ? "t2" : "t1";
  }

  function unitCount(product) {
    const d = product === "t2"
      ? (typeof UNITS_DATA_T2 !== "undefined" ? UNITS_DATA_T2 : null)
      : (typeof UNITS_DATA_T1 !== "undefined" ? UNITS_DATA_T1 : null);
    if (!d || !d.units) return 0;
    return Object.keys(d.units).length;
  }

  // Push the user's progress into Tekoa.Progress, one activity per UNIT
  // (lesson). A unit counts as "completed" once at least 2 of its 7
  // slots have non-zero scores — matches the original IntUnScore which
  // returns 0 unless 2+ slots have been played. Score = top-2 average
  // (same metric the original surfaces).
  function pushToTekoa(user) {
    const P = window.Tekoa && window.Tekoa.Progress;
    if (!P || !user) return;
    const data   = load();
    const scores = (data[user] && data[user].scores) || {};
    for (const product of ["t1", "t2"]) {
      const appId  = product === "t2" ? "Tirgolit2" : "Tirgolit";
      const prefix = product + "/";
      // Group slot scores by unit id under this product.
      const slotsByUnit = {};
      for (const k in scores) {
        if (!k.startsWith(prefix)) continue;
        const m = k.slice(prefix.length).match(/^(\d+)_s(\d+)$/);
        if (!m) continue;
        const unitId = m[1];
        const sc = scores[k] || 0;
        if (sc <= 0) continue;
        (slotsByUnit[unitId] = slotsByUnit[unitId] || []).push(sc);
      }
      for (const unitId in slotsByUnit) {
        const played = slotsByUnit[unitId].slice().sort((a, b) => b - a);
        if (played.length < 2) continue;     // matches IntUnScore threshold
        const avg = Math.round((played[0] + played[1]) / 2);
        P.setScore(appId, unitId, { correct: avg, total: 100, slotsPlayed: played.length });
      }
      const total = unitCount(product);
      if (total > 0) P.setTotal(appId, total);
    }
  }

  function getAverageScore(user) {
    const data = load();
    const scores = Object.values(data[user]?.scores || {}).filter(s => s > 0);
    if (!scores.length) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  // VB6 IntUnScore: average of top-2 slot scores across all slots (0-6).
  // Returns 0 if fewer than 2 slots have been played (matches VB6 "If ScrS(0)=0 Then IntUnScore=0").
  function getTopTwoAvg(user, unitId) {
    const data = load();
    const played = [];
    for (let s = 0; s < 7; s++) {
      const sc = data[user]?.scores?.[unitId + '_s' + s] ?? 0;
      if (sc > 0) played.push(sc);
    }
    played.sort((a, b) => b - a);
    if (played.length < 2) return 0;
    return Math.round((played[0] + played[1]) / 2);
  }

  function clearScores(name) {
    const data = load();
    if (data[name]) { data[name].scores = {}; save(data); }
  }

  // Push totals (without scores) so the breakdown can show
  // "0/N פעילויות" instead of "?". Called at module-load time so even
  // a user who never finishes a slot has the denominators populated.
  function publishTotals() {
    const P = window.Tekoa && window.Tekoa.Progress;
    if (!P) return;
    const t1 = unitCount("t1");
    const t2 = unitCount("t2");
    if (t1 > 0) P.setTotal("Tirgolit",  t1);
    if (t2 > 0) P.setTotal("Tirgolit2", t2);
  }
  publishTotals();

  return { list, create, remove, getScore, setScore, getAverageScore, getSlotScore, setSlotScore, getTopTwoAvg, clearScores, publishTotals };
})();
