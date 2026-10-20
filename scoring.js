/* FoodScope AI v0.2 — experimental nutritional profile estimation.
 * Not Nutri-Score, not medically validated and NOT % health benefit.
 * Nutrition values are per 100g/ml as reported by Open Food Facts.
 */
(function (root) {
  'use strict';
  const MAPPING = Object.freeze({ a: 90, b: 70, c: 50, d: 30, e: 10 });
  const WEIGHTS = Object.freeze({ sugars: 23, salt: 23, saturated: 23, fiber: 16, protein: 15 });
  const LIMITS = Object.freeze({ sugars: 100, salt: 100, saturated: 100, fiber: 100, protein: 100, fat: 100, carbs: 100, energy: 900 });
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const numeric = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const curve = (v, points) => {
    if (v <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (v <= points[i][0]) {
        const [x0, y0] = points[i - 1]; const [x1, y1] = points[i];
        return y0 + (y1 - y0) * (v - x0) / (x1 - x0);
      }
    }
    return points.at(-1)[1];
  };
  const CURVES = Object.freeze({
    sugars: [[0, 100], [2, 96], [5, 78], [10, 50], [20, 15], [30, 0]],
    salt: [[0, 100], [0.3, 82], [1, 48], [2, 12], [3, 0]],
    saturated: [[0, 100], [1.5, 90], [3, 75], [5, 53], [10, 18], [15, 0]],
    fiber: [[0, 15], [1, 33], [3, 67], [6, 94], [8, 100]],
    protein: [[0, 20], [3, 42], [5, 62], [10, 85], [17, 100]]
  });
  function analyze(record) {
    const n = record?.nutrition || {};
    const grade = String(record?.grade || '').toLowerCase();
    const indicators = {};
    const flags = [];
    const relevantText = [record?.name, record?.allNames, record?.ingredients, record?.categories].filter(Boolean).join(' ').toLowerCase();
    const fat = numeric(n.fat), carbs = numeric(n.carbs), saturated = numeric(n.saturated), sugars = numeric(n.sugars), salt = numeric(n.salt), protein = numeric(n.protein);
    const suspiciousSalt = salt === 0 && (
      /(salted|salty|сол[её]н|მარილიან|соль|salt\b|მარილი)/i.test(relevantText) ||
      (fat !== null && fat >= 15 && protein !== null && protein >= 8 && /(peanut|nuts?\b|groundnut|арахис|орех|თხილ|არაქის)/i.test(relevantText))
    );
    if (suspiciousSalt) flags.push('checkZeroSalt');
    if (fat !== null && saturated !== null && saturated > fat + 0.5) flags.push('fatInconsistent');
    if (carbs !== null && sugars !== null && sugars > carbs + 0.5) flags.push('sugarInconsistent');
    if ([fat, carbs, protein].every(x => x !== null) && fat + carbs + protein > 110) flags.push('macroInconsistent');
    for (const key of Object.keys(WEIGHTS)) {
      const value = numeric(n[key]);
      if (value === null) continue;
      if (value < 0 || value > LIMITS[key]) { flags.push('invalidValue'); continue; }
      if (key === 'salt' && suspiciousSalt) continue;
      if (key === 'saturated' && flags.includes('fatInconsistent')) continue;
      if (key === 'sugars' && flags.includes('sugarInconsistent')) continue;
      indicators[key] = { value, subscore: Math.round(curve(value, CURVES[key])), weight: WEIGHTS[key] };
    }
    const found = Object.keys(indicators);
    const coreCount = found.filter(x => ['sugars', 'salt', 'saturated'].includes(x)).length;
    const enough = found.length >= 4 && coreCount >= 2 && !flags.includes('macroInconsistent');
    const coverage = found.length;
    if (grade in MAPPING) return { score: MAPPING[grade], kind: 'mapped', grade, flags, indicators, coverage };
    if (!enough) return { score: null, kind: 'missing', grade: null, flags, indicators, coverage };
    const divisor = found.reduce((a, key) => a + WEIGHTS[key], 0);
    const value = found.reduce((a, key) => a + indicators[key].subscore * WEIGHTS[key], 0) / divisor;
    return { score: clamp(Math.round(value), 0, 100), kind: 'estimated', grade: null, flags, indicators, coverage };
  }
  const api = Object.freeze({ analyze, MAPPING, WEIGHTS });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FoodScopeScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
