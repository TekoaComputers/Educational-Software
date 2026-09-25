// Independent answer checker for Tirgolit question data. Returns null when the
// stored answer is right for the expression, else a human-readable reason.
// Accepted answer forms (all present in the original .unt data):
//   plain number            "6*7" = "42"
//   rounded / truncated     "1/3" = "0.333"   (3 decimals, VB6 Format)
//   rounding exercise       "12.45823" = "12.458"
//   quotient(remainder)     "7/2" = "3(1)"
//   equivalent expression   "2*3" = "3+3"      (multiplication-as-addition units)
function num(expr) {
  let e = String(expr).replace(/[xX×]/g, '*').replace(/[÷:]/g, '/').replace(/\s+/g, '');
  if (!/^[\d+\-*/().]+$/.test(e)) return { err: 'non-arithmetic characters' };
  if (e.split(/[+\-*/()]/).some(t => (t.match(/\./g) || []).length > 1)) return { err: 'has a number with two decimal points' };
  const leading0 = /(^|[^\d.])0\d/.test(e);
  e = e.replace(/(^|[^\d.])0+(\d)/g, '$1$2');           // "00.48" → "0.48", "007" → "7"
  let v;
  try { v = Function('"use strict";return (' + e + ')')(); } catch { return { err: 'does not parse' }; }
  if (typeof v !== 'number' || !isFinite(v)) return { err: 'evaluates to ' + v + ' (division by zero?)' };
  return { v, leading0 };
}

function checkQ(expr, answer) {
  const E = num(expr);
  if (E.err) return `expression "${expr}" ${E.err}`;
  const a = String(answer).trim();
  const rem = /^(\d+)\((\d+)\)$/.exec(a);
  if (rem) {
    const m = /^(\d+)[/:÷](\d+)$/.exec(String(expr).replace(/\s+/g, ''));
    if (!m) return `remainder answer "${a}" for non-division "${expr}"`;
    const q = Math.floor(+m[1] / +m[2]), r = +m[1] % +m[2];
    return (q === +rem[1] && r === +rem[2]) ? null : `"${expr}" = ${q}(${r}), data says ${a}`;
  }
  const A = num(a);
  if (A.err) return `answer "${a}" ${A.err}`;
  // Decimal answers may be rounded/truncated to 3 places; a bare number is a
  // rounding exercise ("0.9999999" = "1").
  const bare = /^[\d.]+$/.test(String(expr).trim());
  const tol = bare ? 5e-4 + 1e-9 : /^-?\d+$/.test(a) ? 1e-9 : 1e-3 + 1e-9;
  if (Math.abs(E.v - A.v) > tol) return `"${expr}" = ${+E.v.toFixed(6)}, data says ${a}`;
  if (E.leading0) return `expression "${expr}" has a malformed leading zero`;
  return null;
}

module.exports = { checkQ, num };
