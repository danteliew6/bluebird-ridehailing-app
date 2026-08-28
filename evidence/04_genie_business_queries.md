# Stage 4 — Genie Room natural-language queries (execution evidence)

The Genie space **"Bluebird Data Assistant"** (`01f19a33de0a1111ab1e0302d7c0b8c7`,
EN + Bahasa Indonesia; config `genie/genie_agent.json`) answers business
questions over `fact_trip`, `trips_curated_gold`, `dim_zone`, `fact_vehicle_health`.
Below are two representative questions run as SQL against the same governed
tables (run 2026-08-28). Governance still applies to Genie answers.

## Q1 — "Revenue and completed trips by city over the last 30 days"

| city | completed_trips | revenue_idr |
|---|---|---|
| Jakarta | 41,516 | 2,444,618,500 |
| Surabaya | 11,603 | 704,270,500 |
| Bandung | 9,360 | 568,328,500 |
| Denpasar | 7,787 | 478,769,000 |
| Medan | 6,225 | 385,843,000 |

Jakarta is ~63% of revenue — the concentration that makes its evening-peak
failures so costly.

## Q2 — "No-driver rate & surge for the Jakarta evening peak (17–20h), last 30 days"

| hour | trips | no_driver_rate | avg_surge |
|---|---|---|---|
| 17 | 871 | 0.243 | 2.15 |
| 18 | 856 | 0.216 | 2.15 |
| 19 | 670 | 0.222 | 2.15 |
| 20 | 494 | 0.194 | 2.14 |

The evening-peak driver shortage is real and quantified: **~1 in 4** Jakarta ride
requests find **no driver** at 17:00, with surge pinned at **2.15×** — the core
customer problem the platform is built to catch and act on.

> These are the exact sample questions wired into the Genie space; the app's
> "Ask Bluebird" page runs them through the Genie Conversation API and can also
> launch the native embedded Genie room.
