// Shared sampling module. Every display calls these functions, so a chart can never
// silently change an estimator. Pure functions, no React, no DOM.

// ---------- Random numbers ----------
// mulberry32: small, fast, seedable PRNG. Same seed -> same sequence.
export function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0, 1)
  };
}

// ---------- Data ----------
export function parseCsv(text, target) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(",");
  return lines.map((line, i) => {
    const vals = line.split(",");
    const row = Object.fromEntries(cols.map((c, j) => [c, vals[j]]));
    row[target] = Number(row[target]);
    row.__pos = i + 1; // 1-based position in the current row order
    return row;
  });
}

export function trueMean(values) {
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function sampleMean(values, idx) {
  let s = 0;
  for (const i of idx) s += values[i];
  return s / idx.length;
}

// ---------- Simple random sampling ----------
// n distinct row indices (0-based), without replacement; every n-set equally likely
// (partial Fisher-Yates shuffle).
export function srsIndices(N, n, rng) {
  if (!(n >= 1 && n <= N)) throw new Error(`n must be between 1 and N (${N})`);
  const pool = Array.from({ length: N }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (N - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// ---------- Systematic sampling ----------
export function systematicDesign(N, n) {
  if (!(n >= 1 && n <= N)) throw new Error(`n must be between 1 and N (${N})`);
  const whole = N % n === 0;
  return { whole, k: N / n, label: whole ? "whole-number interval" : "fractional interval" };
}

// Rows (1-based) for a given start. Whole: start r in 1..k, rows r + j*k.
// Fractional: start u in (0, k], rows ceil(u + j*k), guarded against rounding.
export function systematicRowsFromStart(N, n, start) {
  const { whole, k } = systematicDesign(N, n);
  const rows = [];
  for (let j = 0; j < n; j++) {
    let r;
    if (whole) r = start + j * k;
    else {
      const x = start + j * k;
      r = Math.ceil(x - 1e-9 * Math.max(1, x)); // tiny guard so 3.0000000001 -> 3
      if (r < 1) r = 1;
      if (r > N) r = N;
    }
    rows.push(r);
  }
  return rows;
}

export function systematicSample(N, n, rng) {
  const { whole, k } = systematicDesign(N, n);
  const start = whole ? 1 + Math.floor(rng() * k) : k * (1 - rng()); // u in (0, k]
  const rows = systematicRowsFromStart(N, n, start);
  return { start, rows, idx: rows.map((r) => r - 1) };
}

// ---------- Stratified sampling ----------
export function strataOf(rows, column) {
  const map = new Map();
  rows.forEach((r, i) => {
    const key = String(r[column]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([name, idx]) => ({ name, idx, size: idx.length }));
}

// Proportional allocation, largest-remainder rounding, >= 1 per stratum, <= stratum size,
// integers summing exactly to n. Returns { ok:false, reason } when impossible.
export function proportionalAllocation(sizes, n) {
  const H = sizes.length;
  const N = sizes.reduce((a, b) => a + b, 0);
  if (n < H) return { ok: false, reason: `n = ${n} is smaller than the number of strata (${H}).` };
  if (n > N) return { ok: false, reason: `n = ${n} is larger than the population (${N}).` };
  const quota = sizes.map((s) => (n * s) / N);
  const alloc = quota.map((q, h) => Math.min(sizes[h], Math.max(1, Math.floor(q))));
  const rem = (h) => quota[h] - Math.floor(quota[h]);
  let total = alloc.reduce((a, b) => a + b, 0);
  while (total < n) {
    let best = -1;
    for (let h = 0; h < H; h++) {
      if (alloc[h] >= sizes[h]) continue;
      if (best < 0 || quota[h] - alloc[h] > quota[best] - alloc[best] ||
        (quota[h] - alloc[h] === quota[best] - alloc[best] && rem(h) > rem(best))) best = h;
    }
    alloc[best]++;
    total++;
  }
  while (total > n) {
    let best = -1;
    for (let h = 0; h < H; h++) {
      if (alloc[h] <= 1) continue;
      if (best < 0 || alloc[h] - quota[h] > alloc[best] - quota[best]) best = h;
    }
    alloc[best]--;
    total--;
  }
  return { ok: true, alloc };
}

export function stratifiedSample(strata, n, rng, N) {
  const a = proportionalAllocation(strata.map((s) => s.size), n);
  if (!a.ok) return { ok: false, reason: a.reason };
  const idx = [];
  const parts = strata.map((s, h) => {
    const pick = srsIndices(s.size, a.alloc[h], rng).map((j) => s.idx[j]);
    idx.push(...pick);
    return { name: s.name, size: s.size, n: a.alloc[h], weight: s.size / N, idx: pick };
  });
  return { ok: true, idx, parts };
}

// Population-weighted stratified estimate: sum over h of (N_h / N) * sample mean in h.
export function stratifiedEstimate(values, parts) {
  return parts.reduce((acc, p) => acc + p.weight * sampleMean(values, p.idx), 0);
}

// ---------- One sample, any method ----------
export function drawSample(pop, method, n, rng, stratCol) {
  const N = pop.values.length;
  if (method === "srs") {
    const idx = srsIndices(N, n, rng);
    return { ok: true, idx, estimate: sampleMean(pop.values, idx) };
  }
  if (method === "systematic") {
    const s = systematicSample(N, n, rng);
    return { ok: true, ...s, estimate: sampleMean(pop.values, s.idx), design: systematicDesign(N, n) };
  }
  if (method === "stratified") {
    const strata = strataOf(pop.rows, stratCol);
    const s = stratifiedSample(strata, n, rng, N);
    if (!s.ok) return s;
    return { ok: true, ...s, estimate: stratifiedEstimate(pop.values, s.parts) };
  }
  throw new Error("unknown method " + method);
}

// ---------- Repeated sampling ----------
export function summarize(estimates, mu) {
  const R = estimates.length;
  const mean = trueMean(estimates);
  let ss = 0, se = 0;
  for (const e of estimates) { ss += (e - mean) ** 2; se += (e - mu) ** 2; }
  const sd = Math.sqrt(ss / R); // divide by R so RMSE^2 = bias^2 + SD^2 exactly
  return { count: R, meanEstimate: mean, bias: mean - mu, sd, rmse: Math.sqrt(se / R) };
}

// Exact enumeration is used for systematic sampling with a whole-number interval;
// Monte Carlo (seeded) for everything else.
export function repeatedSampling(pop, { method, n, reps, seed, stratCol }) {
  const N = pop.values.length;
  const mu = trueMean(pop.values);
  if (method === "systematic" && systematicDesign(N, n).whole) {
    const k = N / n;
    const estimates = [];
    for (let r = 1; r <= k; r++) {
      estimates.push(sampleMean(pop.values, systematicRowsFromStart(N, n, r).map((x) => x - 1)));
    }
    return { ok: true, kind: "exact", estimates, mu, ...summarize(estimates, mu) };
  }
  const rng = makeRng(seed);
  const estimates = [];
  for (let i = 0; i < reps; i++) {
    const s = drawSample(pop, method, n, rng, stratCol);
    if (!s.ok) return s;
    estimates.push(s.estimate);
  }
  return { ok: true, kind: "Monte Carlo", estimates, mu, ...summarize(estimates, mu) };
}

// ---------- Populations ----------
export function makePopulation(rows, target, label) {
  const rs = rows.map((r, i) => ({ ...r, __pos: i + 1 }));
  return { rows: rs, values: rs.map((r) => r[target]), label };
}

// Build a labelled modified COPY of the baseline. The baseline is never changed.
// ops: { order: {column, dir} | null, filter: {column, value, mode:'keep'|'remove'} | null,
//        scale: {column, value, factor} | null }
export function modifyPopulation(baseRows, target, ops) {
  let rows = baseRows.map((r) => ({ ...r }));
  const desc = [];
  if (ops.filter && ops.filter.column) {
    const { column, value, mode } = ops.filter;
    rows = rows.filter((r) => (String(r[column]) === String(value)) === (mode === "keep"));
    desc.push(`${mode} ${column} = ${value}`);
  }
  if (ops.scale && ops.scale.column && Number(ops.scale.factor) !== 1) {
    const { column, value, factor } = ops.scale;
    rows = rows.map((r) => (String(r[column]) === String(value) ? { ...r, [target]: r[target] * Number(factor) } : r));
    desc.push(`${target} x${factor} where ${column} = ${value}`);
  }
  if (ops.order && ops.order.column) {
    const { column, dir } = ops.order;
    const num = rows.every((r) => r[column] !== "" && !isNaN(Number(r[column])));
    const s = dir === "desc" ? -1 : 1;
    rows = rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const x = num ? Number(a.r[column]) - Number(b.r[column]) : String(a.r[column]).localeCompare(String(b.r[column]));
        return x !== 0 ? s * x : a.i - b.i; // stable
      })
      .map((o) => o.r);
    desc.push(`rows sorted by ${column} (${dir === "desc" ? "descending" : "ascending"})`);
  }
  return { rows, description: desc.length ? desc.join("; ") : "no changes (same as baseline)" };
}
