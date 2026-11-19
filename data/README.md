# Data: healthcare costs (`healthcare_costs.csv`)

PUBLIC TEACHING DATASET, simulated by its original author. Copied from the course starter
(Judge the Sample, https://snsie.github.io/sampling-activity/); left unchanged.

- **One row:** one person (a beneficiary record). **Rows:** 1,338.
- **Target:** `charges` (US dollars).
- **Population:** The 1,338 people in this file. It is a teaching dataset, not a representative sample of current claims.
- **Row order:** The order of the source file. row_id is added; the order has no documented meaning and is not a time sequence.
- **Provenance:** The insurance.csv teaching dataset distributed with Brett Lantz's book *Machine Learning with R* (Packt), as mirrored in the stedy/Machine-Learning-with-R-datasets GitHub repository. The book describes it as hypothetical (simulated) data created using US Census Bureau demographic statistics. Unchanged except for the added row_id and age_band columns.
- **Source:** https://raw.githubusercontent.com/stedy/Machine-Learning-with-R-datasets/master/insurance.csv
- **SHA-256:** `d51bc2b911e7d636d232ee6e9fb94b0c0e9bbad2d898894d9938afb7fa2bbbbd` (matches the course starter's file)

| Column | Meaning | Units / values |
|---|---|---|
| `row_id` | Row number in the source file, 1-1,338 (added) | id |
| `age` | Age of the primary beneficiary | years |
| `age_band` | Age group derived from age (added) | 18-29, 30-39, 40-49, 50-64 |
| `sex` | Recorded sex | female, male |
| `bmi` | Body mass index | kg/m² |
| `children` | Number of dependants covered | count |
| `smoker` | Smoker | yes, no |
| `region` | US region of residence | northeast, northwest, southeast, southwest |
| `charges` | Individual medical costs billed | US dollars |

Group sizes: `age_band` 18-29 417, 30-39 257, 40-49 279, 50-64 385; `region` northeast 324,
northwest 325, southeast 364, southwest 325; `smoker` no 1,064, yes 274; `sex` female 662, male 676.
