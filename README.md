# Judge the Sample: my sampling app (healthcare costs)

App link: https://YOUR-USERNAME.github.io/judge-the-sample/

**Central question:** Which sampling method would you trust for this population, at what sample size, and with what limits?

- **Scenario:** healthcare costs
- **Data file:** `data/healthcare_costs.csv` (source, licence and provenance in `data/README.md`)
- **Seed(s) used for my evidence** (exact enumeration needs no seed): 20261119 (app default)

## Run it on your computer

```bash
bash run_app.sh
```

Run it in a Bash terminal (macOS/Linux Terminal, or Git Bash/WSL on Windows) inside this folder.
Open the address it prints (usually http://localhost:5173/). Stop it with Ctrl+C. Needs Node.js 20+.

Automated correctness checks for the sampling module: `npm test`.

## What's here

| File | What it is |
|---|---|
| `src/sampling.js` | The one shared sampling module: true mean, simple random, systematic (whole and fractional interval), stratified (proportional allocation, population-weighted estimate), repeated sampling (Monte Carlo or exact enumeration), bias / SD / RMSE, modified population copies. Every display calls it. |
| `src/App.jsx`, `src/charts.jsx` | The app: population view, method explorer, method and sample-size experiments, challenge controls. |
| `test/sampling.test.mjs` | Automated checks (sampling invariants, reproducibility, allocation totals, estimator formulas, exact enumeration). |
| `DECISIONS.md` | My own decisions, results table, findings, challenge hypothesis and interpretation. |
| `data/` | The population and its data dictionary. |
| `.github/workflows/deploy.yml` | Builds the app and publishes it to GitHub Pages on every push to `main`. |
| `run_app.sh` | Starts the app locally. |
