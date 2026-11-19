import { useMemo, useState } from "react";
import csvText from "../data/healthcare_costs.csv?raw";
import {
  parseCsv, makePopulation, trueMean, makeRng, drawSample, repeatedSampling,
  systematicDesign, strataOf, proportionalAllocation, modifyPopulation,
} from "./sampling.js";
import { PopulationPlot, EstimateHistogram } from "./charts.jsx";

const TARGET = "charges";
const GROUP_COLUMNS = ["smoker", "region", "age_band", "sex", "children"];
const ORDER_COLUMNS = ["row_id", "age", "bmi", "children", "charges", "smoker", "region", "age_band", "sex"];
const METHOD_NAMES = { srs: "Simple random", systematic: "Systematic (random start)", stratified: "Stratified" };
const fmt$ = (v) => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt$2 = (v) => { const r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); };

const BASE_ROWS = parseCsv(csvText, TARGET);

function Num({ label, value, onChange, min = 1, max, step = 1, width = 90 }) {
  return (
    <label className="ctl">
      {label}
      <input type="number" value={value} min={min} max={max} step={step} style={{ width }}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
    </label>
  );
}

function Sel({ label, value, onChange, options }) {
  return (
    <label className="ctl">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
}

function RepsNote() {
  return (
    <p className="note">
      100 repetitions usually reveal the main pattern; 1,000 give smoother distributions and more stable bias, SD and RMSE.
      Neither guarantees stable results, and 100 repetitions cannot reliably separate small differences between methods.
      Rerun with a different seed to check whether your conclusions hold.
    </p>
  );
}

function selectionRule(method, N, n, stratCol) {
  if (method === "srs") return `Pick ${n} different rows completely at random from all ${N.toLocaleString()} rows (without replacement). Every set of ${n} rows is equally likely.`;
  if (method === "systematic") {
    const d = systematicDesign(N, n);
    return d.whole
      ? `Interval k = N/n = ${d.k} (a whole number). Pick a random start r from 1 to ${d.k}, then take rows r, r+${d.k}, r+${2 * d.k}, … in file order (${n} rows).`
      : `Interval k = N/n = ${d.k.toFixed(3)} (not a whole number), so the fractional-interval design is used: random start u in (0, k], rows ⌈u + j·k⌉ for j = 0…${n - 1}, in file order. Every row still has the same chance n/N of being picked.`;
  }
  return `Split the rows into groups by "${stratCol}", give each group a share of the ${n} rows in proportion to its size (largest-remainder rounding, at least 1 per group), take a simple random sample inside each group, then combine the group means weighted by each group's share of the population (N_h / N).`;
}

// ----- one repeated-sampling result, fully labelled -----
function ResultCard({ res, settings, domain }) {
  if (!res) return null;
  if (!res.ok) return <div className="card warn">{settings.title}: {res.reason}</div>;
  return (
    <div className="card">
      <EstimateHistogram estimates={res.estimates} mu={res.mu} domain={domain} title={settings.title} />
      <table className="stats">
        <tbody>
          <tr><td>Population</td><td>{settings.population}</td></tr>
          <tr><td>Method</td><td>{METHOD_NAMES[settings.method]}{settings.method === "stratified" ? ` by ${settings.stratCol} (proportional allocation)` : ""}</td></tr>
          <tr><td>Sample size n</td><td>{settings.n}</td></tr>
          <tr><td>Result type</td><td><b>{res.kind}</b> — {res.kind === "exact" ? `all ${res.count} possible starts (no seed)` : `${res.count} repetitions, seed ${settings.seed}`}</td></tr>
          <tr><td>True mean (this population)</td><td>{fmt$(res.mu)}</td></tr>
          <tr><td>Mean of estimates</td><td>{fmt$(res.meanEstimate)}</td></tr>
          <tr><td>Bias</td><td>{fmt$2(res.bias)}</td></tr>
          <tr><td>SD of estimates</td><td>{fmt$(res.sd)}</td></tr>
          <tr><td>RMSE</td><td>{fmt$(res.rmse)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function sharedDomain(results) {
  const all = results.filter((r) => r && r.ok).flatMap((r) => [...r.estimates, r.mu]);
  if (!all.length) return undefined;
  let lo = Infinity, hi = -Infinity;
  for (const v of all) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.03 || 1;
  return [lo - pad, hi + pad];
}

// ================= Tabs =================
function PopulationTab({ pop, mu }) {
  return (
    <section>
      <h2>1. The population</h2>
      <p>
        <b>Scenario: healthcare costs.</b> One row is one person (a beneficiary record) in the public <i>insurance.csv</i> teaching
        dataset. The target is <b>charges</b>, the individual medical costs billed, in US dollars. The whole file is the finite
        population: <b>N = {pop.values.length.toLocaleString()}</b> people. It is not all patients or all insurance claims.
      </p>
      <div className="kpis">
        <div><span>Population size N</span><b>{pop.values.length.toLocaleString()}</b></div>
        <div><span>True mean charges</span><b>{fmt$(mu)}</b></div>
        <div><span>Smallest / largest</span><b>{fmt$(Math.min(...pop.values))} / {fmt$(Math.max(...pop.values))}</b></div>
      </div>
      <PopulationPlot pop={pop} mu={mu} />
      <p className="note">
        <b>Row order:</b> rows are in the order of the source file (row_id 1–1,338). This order has no documented meaning and is
        <b> not</b> a time sequence, so systematic sampling here means taking every k-th row of an unordered list, which is different
        from sampling a chronological record.
      </p>
      <p className="note">
        Source: insurance.csv from Brett Lantz, <i>Machine Learning with R</i> (Packt), mirrored in the stedy/Machine-Learning-with-R-datasets
        GitHub repository; simulated by its author from US Census Bureau statistics. Unchanged except for the added row_id and age_band columns.
        Group columns available for stratifying: smoker, region, age_band, sex, children.
      </p>
    </section>
  );
}

function ExploreTab({ pop, mu }) {
  const N = pop.values.length;
  const [method, setMethod] = useState("srs");
  const [n, setN] = useState(100);
  const [seed, setSeed] = useState(20261119);
  const [stratCol, setStratCol] = useState("smoker");
  const valid = Number.isInteger(n) && n >= 1 && n <= N;
  const sample = useMemo(() => (valid ? drawSample(pop, method, n, makeRng(seed), stratCol) : null), [pop, method, n, seed, stratCol, valid]);
  const selected = useMemo(() => new Set(sample && sample.ok ? sample.idx : []), [sample]);
  const strata = method === "stratified" ? strataOf(pop.rows, stratCol) : null;
  const alloc = strata && valid ? proportionalAllocation(strata.map((s) => s.size), n) : null;
  return (
    <section>
      <h2>2. Explore the three sampling methods</h2>
      <div className="controls">
        <Sel label="Method" value={method} onChange={setMethod} options={Object.entries(METHOD_NAMES).map(([value, label]) => ({ value, label }))} />
        <Num label="Sample size n" value={n} onChange={setN} max={N} />
        <Num label="Seed" value={seed} onChange={setSeed} min={0} width={120} />
        <button onClick={() => setSeed((s) => (Number(s) || 0) + 1)}>Draw another sample (seed + 1)</button>
        {method === "stratified" && <Sel label="Stratify by" value={stratCol} onChange={setStratCol} options={GROUP_COLUMNS} />}
      </div>
      {!valid && <p className="warn">n must be a whole number from 1 to {N.toLocaleString()}.</p>}
      {valid && (
        <>
          <p className="rule"><b>Selection rule:</b> {selectionRule(method, N, n, stratCol)}</p>
          {method === "systematic" && sample?.ok && (
            <p className="note">Design for N = {N.toLocaleString()}, n = {n}: <b>{sample.design.label}</b>. Random start = {sample.design.whole ? sample.start : sample.start.toFixed(4)}. First rows: {sample.rows.slice(0, 8).join(", ")}{n > 8 ? ", …" : ""}</p>
          )}
          {method === "stratified" && alloc && (alloc.ok ? (
            <table className="alloc">
              <thead><tr><th>{stratCol}</th><th>Group size N_h</th><th>Weight N_h/N</th><th>Rows sampled n_h</th>{sample?.ok && <th>Sample mean in group</th>}</tr></thead>
              <tbody>
                {strata.map((s, h) => (
                  <tr key={s.name}><td>{s.name}</td><td>{s.size}</td><td>{(s.size / N).toFixed(3)}</td><td>{alloc.alloc[h]}</td>
                    {sample?.ok && <td>{fmt$(sample.parts[h].idx.reduce((a, i) => a + pop.values[i], 0) / sample.parts[h].idx.length)}</td>}</tr>
                ))}
                <tr className="tot"><td>Total</td><td>{N}</td><td>1.000</td><td>{alloc.alloc.reduce((a, b) => a + b, 0)}</td>{sample?.ok && <td></td>}</tr>
              </tbody>
            </table>
          ) : <p className="warn">{alloc.reason} Stratified sampling needs at least one row per group. Choose a larger n or a column with fewer groups.</p>)}
          {sample?.ok && (
            <>
              <div className="kpis">
                <div><span>Single-sample estimate (seed {seed})</span><b className="est">{fmt$(sample.estimate)}</b></div>
                <div><span>True mean (all {N.toLocaleString()} rows)</span><b className="true">{fmt$(mu)}</b></div>
                <div><span>Error of this one sample</span><b>{fmt$2(sample.estimate - mu)}</b></div>
              </div>
              <PopulationPlot pop={pop} selected={selected} mu={mu} estimate={sample.estimate} />
              <p className="note">Grey dots: every row in the population. Orange dots: the {n} sampled rows. This is ONE sample; judge methods on repeated sampling (tab 3).</p>
            </>
          )}
        </>
      )}
    </section>
  );
}

function CompareTab({ pop }) {
  const [seed, setSeed] = useState(20261119);
  const [reps, setReps] = useState(100);
  const [stratCol, setStratCol] = useState("smoker");
  const [expA, setExpA] = useState(null);
  const [expB, setExpB] = useState(null);
  const runA = () => {
    const s = { seed, reps, stratCol, population: pop.label };
    setExpA(["srs", "systematic", "stratified"].map((method) => ({
      settings: { ...s, method, n: 100, title: `${METHOD_NAMES[method]}, n = 100` },
      res: repeatedSampling(pop, { method, n: 100, reps, seed, stratCol }),
    })));
  };
  const runB = () => {
    const s = { seed, reps, population: pop.label, method: "srs" };
    setExpB([1, 10, 100].map((n) => ({
      settings: { ...s, n, title: `Simple random, n = ${n}` },
      res: repeatedSampling(pop, { method: "srs", n, reps, seed }),
    })));
  };
  const domA = expA && sharedDomain(expA.map((e) => e.res));
  const domB = expB && sharedDomain(expB.map((e) => e.res));
  return (
    <section>
      <h2>3. Compare methods and sample size (baseline population)</h2>
      <div className="controls">
        <Num label="Seed" value={seed} onChange={setSeed} min={0} width={120} />
        <Sel label="Repetitions" value={String(reps)} onChange={(v) => setReps(Number(v))} options={["100", "250", "500", "1000"]} />
        <Sel label="Stratify by (experiment A)" value={stratCol} onChange={setStratCol} options={GROUP_COLUMNS} />
      </div>
      <p className="note">Sample size n (rows in one sample) and repetitions (how many separate samples are drawn) are separate settings. Each sample is drawn without replacement; a row can appear again in a later repetition.</p>
      <RepsNote />
      <h3>Experiment A — three methods at n = 100</h3>
      <button className="primary" onClick={runA}>Run experiment A</button>
      {expA && <p className="note">Current result: seed {expA[0].settings.seed}, {expA[0].settings.reps} repetitions, stratified by {expA[0].settings.stratCol}. Re-running replaces this result. All three panels share one x-axis.</p>}
      <div className="grid3">{expA && expA.map((e) => <ResultCard key={e.settings.title} {...e} domain={domA} />)}</div>
      <h3>Experiment B — simple random sampling at n = 1, 10 and 100</h3>
      <button className="primary" onClick={runB}>Run experiment B</button>
      {expB && <p className="note">Current result: seed {expB[0].settings.seed}, {expB[0].settings.reps} repetitions. The n = 100 panel uses the same seed and settings as experiment A's simple random result, so it matches it. All three panels share one x-axis.</p>}
      <div className="grid3">{expB && expB.map((e) => <ResultCard key={e.settings.title} {...e} domain={domB} />)}</div>
    </section>
  );
}

function ChallengeTab({ base }) {
  const [hyp, setHyp] = useState("");
  const [hypDate, setHypDate] = useState("");
  const [orderCol, setOrderCol] = useState("");
  const [orderDir, setOrderDir] = useState("asc");
  const [filterCol, setFilterCol] = useState("");
  const [filterVal, setFilterVal] = useState("");
  const [filterMode, setFilterMode] = useState("remove");
  const [scaleCol, setScaleCol] = useState("");
  const [scaleVal, setScaleVal] = useState("");
  const [factor, setFactor] = useState(1);
  const [m1, setM1] = useState("systematic");
  const [m2, setM2] = useState("srs");
  const [strat1, setStrat1] = useState("smoker");
  const [strat2, setStrat2] = useState("smoker");
  const [n, setN] = useState(100);
  const [reps, setReps] = useState(100);
  const [seed, setSeed] = useState(20261119);
  const [results, setResults] = useState(null);

  const valuesOf = (col) => (col ? [...new Set(base.rows.map((r) => String(r[col])))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : []);
  const ops = {
    order: orderCol ? { column: orderCol, dir: orderDir } : null,
    filter: filterCol && filterVal !== "" ? { column: filterCol, value: filterVal, mode: filterMode } : null,
    scale: scaleCol && scaleVal !== "" ? { column: scaleCol, value: scaleVal, factor } : null,
  };
  const mod = useMemo(() => modifyPopulation(base.rows, TARGET, ops), [base, JSON.stringify(ops)]); // eslint-disable-line
  const modPop = useMemo(() => makePopulation(mod.rows, TARGET, "MODIFIED copy"), [mod]);
  const muMod = modPop.values.length ? trueMean(modPop.values) : NaN;
  const nValid = Number.isInteger(n) && n >= 1 && n <= Math.min(base.values.length, modPop.values.length);

  const run = () => {
    const out = [];
    for (const [pop, plabel] of [[base, "BASELINE"], [modPop, "MODIFIED copy (" + mod.description + ")"]]) {
      for (const [method, sc] of [[m1, strat1], [m2, strat2]]) {
        out.push({
          settings: { title: `${METHOD_NAMES[method]} — ${pop === base ? "baseline" : "modified"}`, population: plabel, method, n, seed, stratCol: sc },
          res: repeatedSampling(pop, { method, n, reps, seed, stratCol: sc }),
        });
      }
    }
    setResults(out);
  };
  const dom = results && sharedDomain(results.map((r) => r.res));

  return (
    <section>
      <h2>4. Challenge a method</h2>
      <div className="card">
        <h3>Your hypothesis (write this yourself before building or running anything)</h3>
        <label className="ctl">Date written <input type="date" value={hypDate} onChange={(e) => setHypDate(e.target.value)} /></label>
        <textarea rows={4} value={hyp} onChange={(e) => setHyp(e.target.value)} placeholder="My hypothesis, and what result would contradict it…" />
        {hyp && <p className="note">Displayed unchanged{hypDate ? ` (written ${hypDate})` : ""}: “{hyp}”</p>}
      </div>

      <h3>Build a labelled modified copy of the population</h3>
      <p className="note">The baseline file is never changed. Each change below applies to a copy; the copy's true mean is recalculated from its own rows. Reordering the same rows leaves the true mean unchanged; removing rows or changing values can change it.</p>
      <div className="controls">
        <Sel label="Reorder rows by" value={orderCol} onChange={setOrderCol} options={[{ value: "", label: "(keep file order)" }, ...ORDER_COLUMNS]} />
        <Sel label="Direction" value={orderDir} onChange={setOrderDir} options={[{ value: "asc", label: "ascending" }, { value: "desc", label: "descending" }]} />
      </div>
      <div className="controls">
        <Sel label="Keep/remove rows where" value={filterCol} onChange={(v) => { setFilterCol(v); setFilterVal(""); }} options={[{ value: "", label: "(no filter)" }, ...GROUP_COLUMNS]} />
        <Sel label="equals" value={filterVal} onChange={setFilterVal} options={[{ value: "", label: "—" }, ...valuesOf(filterCol)]} />
        <Sel label="Action" value={filterMode} onChange={setFilterMode} options={[{ value: "remove", label: "remove those rows" }, { value: "keep", label: "keep only those rows" }]} />
      </div>
      <div className="controls">
        <Sel label="Multiply charges where" value={scaleCol} onChange={(v) => { setScaleCol(v); setScaleVal(""); }} options={[{ value: "", label: "(no change)" }, ...GROUP_COLUMNS]} />
        <Sel label="equals" value={scaleVal} onChange={setScaleVal} options={[{ value: "", label: "—" }, ...valuesOf(scaleCol)]} />
        <Num label="by factor" value={factor} onChange={setFactor} min={0} step={0.1} />
      </div>
      <div className="kpis">
        <div><span>Baseline: N / true mean</span><b>{base.values.length.toLocaleString()} / {fmt$(trueMean(base.values))}</b></div>
        <div><span>Modified copy: N / true mean</span><b>{modPop.values.length.toLocaleString()} / {modPop.values.length ? fmt$(muMod) : "—"}</b></div>
        <div><span>Modified copy</span><b className="small">{mod.description}</b></div>
      </div>
      {modPop.values.length > 0 && <PopulationPlot pop={modPop} mu={muMod} height={240} />}

      <h3>Compare two methods on baseline vs modified (same n)</h3>
      <div className="controls">
        <Sel label="Your chosen method" value={m1} onChange={setM1} options={Object.entries(METHOD_NAMES).map(([value, label]) => ({ value, label }))} />
        {m1 === "stratified" && <Sel label="stratify by" value={strat1} onChange={setStrat1} options={GROUP_COLUMNS} />}
        <Sel label="Alternative / correction" value={m2} onChange={setM2} options={Object.entries(METHOD_NAMES).map(([value, label]) => ({ value, label }))} />
        {m2 === "stratified" && <Sel label="stratify by" value={strat2} onChange={setStrat2} options={GROUP_COLUMNS} />}
      </div>
      <div className="controls">
        <Num label="Sample size n (all four)" value={n} onChange={setN} />
        <Sel label="Repetitions" value={String(reps)} onChange={(v) => setReps(Number(v))} options={["100", "250", "500", "1000"]} />
        <Num label="Seed" value={seed} onChange={setSeed} min={0} width={120} />
        <button className="primary" disabled={!nValid || modPop.values.length === 0} onClick={run}>Run the four comparisons</button>
      </div>
      {!nValid && <p className="warn">n must be a whole number from 1 to the size of the smaller population.</p>}
      {results && <p className="note">Current result: n = {results[0].settings.n}, seed {results[0].settings.seed}. Each panel is compared with the true mean of the population it was drawn from. Re-running replaces this result. Baseline and modified results are never pooled.</p>}
      <div className="grid2">{results && results.map((r) => <ResultCard key={r.settings.title} {...r} domain={dom} />)}</div>
      <RepsNote />
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState(0);
  const base = useMemo(() => makePopulation(BASE_ROWS, TARGET, "BASELINE (healthcare_costs.csv, all 1,338 rows)"), []);
  const mu = useMemo(() => trueMean(base.values), [base]);
  const tabs = ["1. Population", "2. Explore methods", "3. Compare & sample size", "4. Challenge"];
  return (
    <div className="app">
      <header>
        <h1>Judge the Sample: healthcare costs</h1>
        <p className="q">Which sampling method would you trust for this population, at what sample size, and with what limits?</p>
        <nav>{tabs.map((t, i) => <button key={t} className={i === tab ? "on" : ""} onClick={() => setTab(i)}>{t}</button>)}</nav>
      </header>
      <main>
        {tab === 0 && <PopulationTab pop={base} mu={mu} />}
        {tab === 1 && <ExploreTab pop={base} mu={mu} />}
        {tab === 2 && <CompareTab pop={base} />}
        {tab === 3 && <ChallengeTab base={base} />}
      </main>
      <footer>All sampling runs in your browser from the 1,338-row file. Results are reproducible: the same seed and settings always give the same samples.</footer>
    </div>
  );
}
