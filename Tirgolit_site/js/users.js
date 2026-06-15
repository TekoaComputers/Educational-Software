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
    const key = unitId + '_s' + slot;
    data[user].scores[key] = Math.max(data[user].scores[key] ?? 0, score);
    data[user].scores[unitId] = Math.max(data[user].scores[unitId] ?? 0, score);
    save(data);
    // ---- bridge to Tekoa.Progress ----
    pushToTekoa(user);
  }

  // Push the current user's scores into the cross-app Tekoa.Progress
  // store so the root catalog battery + progress.html see Tirgolit too.
  // Best-effort: silent if the helper isn't loaded.
  function pushToTekoa(user) {
    const P = window.Tekoa && window.Tekoa.Progress;
    if (!P || !user) return;
    const data = load();
    const scores = (data[user] && data[user].scores) || {};
    let visited = 0;
    for (const k in scores) {
      // Only count slot-level scores (unit_sN). Unit aggregates would
      // double-count.
      if (!/_s\d+$/.test(k)) continue;
      if ((scores[k] || 0) > 0) {
        visited++;
        P.setScore("Tirgolit", k, scores[k]);
      }
    }
    // Total is unknown until the game data is loaded. Best effort: use
    // the count of distinct units × 7 slots. window.UNITS / window.data
    // varies by page; if either is present, use it.
    const units = (window.UNITS && window.UNITS.length)
        || (window.DATA && window.DATA.length) || 0;
    if (units > 0) P.setTotal("Tirgolit", units * 7);
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

  return { list, create, remove, getScore, setScore, getAverageScore, getSlotScore, setSlotScore, getTopTwoAvg, clearScores };
})();
