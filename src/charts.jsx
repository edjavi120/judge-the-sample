// Hand-drawn SVG charts (no charting library). They only DISPLAY numbers that come
// from src/sampling.js; they never compute an estimator.

const fmt$ = (v) => "$" + Math.round(v).toLocaleString("en-US");

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(t);
  return ticks;
}

// Population view: every row of the population in file order (x) against its charge (y).
// Sampled rows are highlighted; horizontal lines show the TRUE mean and the SAMPLE estimate.
export function PopulationPlot({ pop, selected, mu, estimate, height = 300 }) {
  const W = 900, H = height, L = 70, R = 150, T = 16, B = 40;
  const N = pop.values.length;
  const ymax = Math.max(...pop.values) * 1.03;
  const x = (i) => L + ((i + 0.5) / N) * (W - L - R);
  const y = (v) => T + (1 - v / ymax) * (H - T - B);
  const sel = selected || new Set();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Population plot">
      {niceTicks(0, ymax).map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" className="tick">{fmt$(t)}</text>
        </g>
      ))}
      {pop.values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={sel.has(i) ? 0 : 1.6} className="dot-pop" />
      ))}
      {pop.values.map((v, i) => (sel.has(i) ? <circle key={"s" + i} cx={x(i)} cy={y(v)} r={3.6} className="dot-sel" /> : null))}
      <line x1={L} x2={W - R} y1={y(mu)} y2={y(mu)} className="line-true" />
      <text x={W - R + 6} y={y(mu) + 4} className="lab-true">True mean {fmt$(mu)}</text>
      {estimate != null && (
        <>
          <line x1={L} x2={W - R} y1={y(estimate)} y2={y(estimate)} className="line-est" />
          <text x={W - R + 6} y={y(estimate) + (estimate > mu ? -6 : 16)} className="lab-est">Sample estimate {fmt$(estimate)}</text>
        </>
      )}
      <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" className="axis">Row order in the file (row 1 to {N.toLocaleString()}) — not a time order</text>
      <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="axis">Charges (US $)</text>
    </svg>
  );
}

// Distribution of estimates from repeated sampling, with the labelled true mean.
export function EstimateHistogram({ estimates, mu, domain, title, height = 190 }) {
  const W = 440, H = height, L = 46, R = 12, T = 22, B = 34;
  const [lo, hi] = domain || [Math.min(...estimates, mu), Math.max(...estimates, mu)];
  const bins = 30;
  const w = (hi - lo) / bins || 1;
  const counts = Array(bins).fill(0);
  for (const e of estimates) counts[Math.min(bins - 1, Math.max(0, Math.floor((e - lo) / w)))]++;
  const cmax = Math.max(...counts, 1);
  const x = (v) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
  const y = (c) => T + (1 - c / cmax) * (H - T - B);
  const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={title}>
      <text x={L} y={14} className="ctitle">{title}</text>
      {counts.map((c, i) => (
        <rect key={i} x={x(lo + i * w) + 0.5} width={Math.max(0, x(lo + (i + 1) * w) - x(lo + i * w) - 1)} y={y(c)} height={H - B - y(c)} className="bar" />
      ))}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="grid" />
      {niceTicks(lo, hi, 4).map((t) => (
        <text key={t} x={x(t)} y={H - B + 14} textAnchor="middle" className="tick">{fmt$(t)}</text>
      ))}
      <line x1={x(mu)} x2={x(mu)} y1={T} y2={H - B} className="line-true" />
      <text x={x(mu) + 4} y={T + 10} className="lab-true">True mean</text>
      <line x1={x(mean)} x2={x(mean)} y1={T + 14} y2={H - B} className="line-est" />
      <text x={W - R} y={14} textAnchor="end" className="lab-est">- - mean of estimates</text>
      <text x={W / 2} y={H - 4} textAnchor="middle" className="axis">Estimated mean charges (US $)</text>
    </svg>
  );
}
