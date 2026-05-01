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

  return { list, create, remove, getScore, setScore, getAverageScore, getSlotScore, setSlotScore, getTopTwoAvg };
})();
