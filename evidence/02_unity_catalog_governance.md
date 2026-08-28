# Stage 2 — Unity Catalog governance (execution evidence)

PII is tagged, masked, and row-filtered in Unity Catalog via
`governance/apply_governance.py`. Policies are enforced for every consumer
(SQL, dashboard, Genie, app); a privileged allowlist (`bb_is_privileged()`)
bypasses them for admins. Run 2026-08-28.

## PII column tags (`bb_pii`)

```
$ …query "SELECT table_name, column_name, tag_name, tag_value
          FROM …information_schema.column_tags
          WHERE table_schema='bluebird_ride_hailing' AND tag_name='bb_pii'"
```

| table | column | tag | value |
|---|---|---|---|
| dim_customer | customer_name | bb_pii | name |
| dim_customer | email | bb_pii | email |
| dim_customer | phone | bb_pii | phone |
| dim_driver | driver_name | bb_pii | name |
| dim_driver | nik | bb_pii | national_id |
| dim_driver | phone | bb_pii | phone |

## Bound column masks

```
$ …query "SELECT table_name, column_name, mask_name
          FROM …information_schema.column_masks WHERE table_schema='bluebird_ride_hailing'"
```

| table | column | mask |
|---|---|---|
| dim_customer | customer_name | bb_mask_str |
| dim_customer | email | bb_mask_str |
| dim_customer | phone | bb_mask_str |
| dim_driver | driver_name | bb_mask_str |
| dim_driver | nik | **bb_mask_full** |
| dim_driver | phone | bb_mask_str |

## Row filter (city-scoped ABAC)

```
$ …query "SELECT table_name, filter_name, target_columns
          FROM …information_schema.row_filters WHERE table_schema='bluebird_ride_hailing'"
[ { "table_name":"fact_trip", "filter_name":"…bb_city_filter", "target_columns":"city" } ]
```

`fact_trip` rows are filtered by `city` so a Jakarta Ops user sees only Jakarta,
a National Analyst sees all.

## Masking logic (what a NON-privileged user receives)

```
$ …query "DESCRIBE FUNCTION EXTENDED …bb_mask_str"
Comment:  Partial mask: privileged sees clear, others see bullets + last 2 chars
Body:     CASE WHEN …bb_is_privileged() THEN v  ELSE  '••••' || right(v, 2)  END
```

The app's **Data Access** page demonstrates these masks and the row filter live
across the Admin / National Analyst / Jakarta Ops / Bali Ops personas.

> Note: Unity Catalog fine-grained masks/filters are **not** propagated to the
> Lakebase synced/served tables (Stage 3). That is by design here — only
> non-sensitive aggregated operational state is served from Lakebase; all PII
> stays governed on the UC + Genie path.
