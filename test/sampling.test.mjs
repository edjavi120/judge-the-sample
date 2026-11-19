// Automated correctness checks for src/sampling.js (run: npm test).
// These check the software, not the investigation: no results are reported.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  makeRng, parseCsv, trueMean, srsIndices, systematicDesign, systematicSample,
  systematicRowsFromStart, strataOf, proportionalAllocation, stratifiedSample,
  stratifiedEstimate, repeatedSampling, summarize, makePopulation, modifyPopulation, drawSample,
} from "../src/sampling.js";

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("data parses: 1,338 rows, numeric target", () => {
  const rows = parseCsv(readFileSync(new URL("../data/healthcare_costs.csv", import.meta.url), "utf8"), "charges");
  assert.equal(rows.length, 1338);
  assert.ok(rows.every((r) => Number.isFinite(r.charges)));
});

test("same seed reproduces the same sequence and samples", () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.deepEqual(srsIndices(1338, 100, makeRng(7)), srsIndices(1338, 100, makeRng(7)));
});

test("SRS: exactly n distinct rows within range for n = 1, 10, 100, N", () => {
  for (const n of [1, 10, 100, 1338]) {
    const idx = srsIndices(1338, n, makeRng(n));
    assert.equal(idx.length, n);
    assert.equal(new Set(idx).size, n);
    assert.ok(idx.every((i) => i >= 0 && i < 1338));
  }
});

test("SRS is uniform on a tiny population (each row ~ n/N)", () => {
  const counts = [0, 0, 0, 0, 0];
  const rng = makeRng(1);
  for (let i = 0; i < 50000; i++) for (const j of srsIndices(5, 2, rng)) counts[j]++;
  for (const c of counts) close(c / 50000, 0.4, 0.03);
});

test("systematic: n distinct rows within 1..N, whole and fractional designs", () => {
  for (const [N, n] of [[1338, 1], [1338, 2], [1338, 10], [1338, 100], [1338, 1337], [1338, 1338], [10, 3], [7, 7]]) {
    for (let s = 0; s < 200; s++) {
      const { rows } = systematicSample(N, n, makeRng(s + 1));
      assert.equal(rows.length, n);
      assert.equal(new Set(rows).size, n);
      assert.ok(rows.every((r) => r >= 1 && r <= N));
    }
  }
  assert.equal(systematicDesign(1338, 2).whole, true);
  assert.equal(systematicDesign(1338, 100).whole, false);
});

test("systematic whole interval follows r, r+k, r+2k", () => {
  assert.deepEqual(systematicRowsFromStart(12, 3, 2), [2, 6, 10]);
});

test("systematic fractional: every row has inclusion probability n/N", () => {
  const N = 10, n = 3, counts = Array(N + 1).fill(0), rng = makeRng(3), R = 60000;
  for (let i = 0; i < R; i++) for (const r of systematicSample(N, n, rng).rows) counts[r]++;
  for (let r = 1; r <= N; r++) close(counts[r] / R, n / N, 0.04);
});

test("exact enumeration lists each start once (k results, no seed)", () => {
  const pop = makePopulation(Array.from({ length: 12 }, (_, i) => ({ y: i + 1 })), "y", "t");
  const res = repeatedSampling(pop, { method: "systematic", n: 3, reps: 100, seed: 1 });
  assert.equal(res.kind, "exact");
  assert.equal(res.count, 4);
  // unbiased by construction for whole-number interval
  close(res.bias, 0);
});

test("allocation: whole numbers, total n, >=1, <= stratum size", () => {
  const sizes = [417, 257, 279, 385];
  for (const n of [4, 5, 10, 37, 100, 1000, 1338]) {
    const a = proportionalAllocation(sizes, n);
    assert.ok(a.ok);
    assert.equal(a.alloc.reduce((x, y) => x + y, 0), n);
    a.alloc.forEach((v, h) => { assert.ok(Number.isInteger(v) && v >= 1 && v <= sizes[h]); });
  }
  assert.equal(proportionalAllocation(sizes, 3).ok, false);
  assert.deepEqual(proportionalAllocation([50, 30, 20], 10).alloc, [5, 3, 2]);
});

test("stratified estimate is population-weighted; weights sum to 1", () => {
  const rows = [
    ...Array.from({ length: 90 }, () => ({ g: "a", y: 1 })),
    ...Array.from({ length: 10 }, () => ({ g: "b", y: 100 })),
  ];
  const pop = makePopulation(rows, "y", "t");
  const strata = strataOf(pop.rows, "g");
  const s = stratifiedSample(strata, 4, makeRng(1), 100); // alloc forced to [3,1]: not proportional
  close(s.parts.reduce((a, p) => a + p.weight, 0), 1);
  close(stratifiedEstimate(pop.values, s.parts), 0.9 * 1 + 0.1 * 100); // equals the true mean here
  assert.equal(new Set(s.idx).size, 4);
});

test("bias, SD, RMSE: RMSE^2 = bias^2 + SD^2", () => {
  const est = [1, 2, 3, 10, 4.5];
  const s = summarize(est, 3);
  close(s.rmse ** 2, s.bias ** 2 + s.sd ** 2, 1e-12);
});

test("repeated sampling reproducible with the same seed", () => {
  const rows = parseCsv(readFileSync(new URL("../data/healthcare_costs.csv", import.meta.url), "utf8"), "charges");
  const pop = makePopulation(rows, "charges", "baseline");
  for (const method of ["srs", "systematic", "stratified"]) {
    const a = repeatedSampling(pop, { method, n: 100, reps: 100, seed: 5, stratCol: "smoker" });
    const b = repeatedSampling(pop, { method, n: 100, reps: 100, seed: 5, stratCol: "smoker" });
    assert.deepEqual(a.estimates, b.estimates);
    assert.equal(a.count, 100);
  }
});

test("modified copy never changes the baseline; reorder keeps the true mean", () => {
  const rows = parseCsv(readFileSync(new URL("../data/healthcare_costs.csv", import.meta.url), "utf8"), "charges");
  const before = JSON.stringify(rows);
  const m = modifyPopulation(rows, "charges", { order: { column: "age", dir: "asc" } });
  assert.equal(JSON.stringify(rows), before);
  close(trueMean(m.rows.map((r) => r.charges)), trueMean(rows.map((r) => r.charges)));
  const f = modifyPopulation(rows, "charges", { filter: { column: "region", value: "northeast", mode: "remove" } });
  assert.equal(f.rows.length, 1338 - 324);
});

test("stratified with n < number of strata reports a message, not a silent change", () => {
  const rows = parseCsv(readFileSync(new URL("../data/healthcare_costs.csv", import.meta.url), "utf8"), "charges");
  const pop = makePopulation(rows, "charges", "baseline");
  const s = drawSample(pop, "stratified", 1, makeRng(1), "region");
  assert.equal(s.ok, false);
});
