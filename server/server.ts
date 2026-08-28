import { createApp, analytics, genie, server, serving, lakebase } from '@databricks/appkit';

createApp({
  plugins: [
    analytics(),
    genie(),
    server(),
    serving(),
    lakebase(),
  ],
  // Operational-serving reads: the curated gold layer is loaded into Lakebase
  // Postgres (see lakebase/load_serving_tables.sh). These routes serve live-ops
  // state to the app at OLTP latency instead of re-aggregating on the warehouse.
  async onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      // Fleet service worklist — ML risk scores served from Lakebase.
      app.get('/api/lakebase/vehicle-worklist', async (_req, res) => {
        try {
          const { rows } = await appkit.lakebase.query(
            `SELECT vehicle_id, fleet_brand,
                    ROUND(service_risk_7d * 100)::int AS risk_pct,
                    ROUND(anomaly_score::numeric, 3)  AS anomaly_score,
                    ROUND(brake_wear_pct::numeric, 1) AS brake_wear_pct,
                    ROUND(battery_v::numeric, 2)      AS battery_v,
                    ROUND(km_since_service)::bigint   AS km_since_service,
                    needs_service_now
             FROM public.gold_vehicle_predictions
             WHERE service_risk_7d >= 0.5
             ORDER BY service_risk_7d DESC
             LIMIT 50`,
          );
          res.json(rows);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // Command Center — live per-zone demand + supply gap, served from Lakebase.
      app.get('/api/lakebase/zone-live', async (_req, res) => {
        try {
          const { rows } = await appkit.lakebase.query(
            `SELECT zone_id, area_name, city, zone_type, lat, lng,
                    hour_of_day, demand, no_driver_rate, avg_surge
             FROM public.gold_zone_live
             ORDER BY city, hour_of_day`,
          );
          res.json(rows);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // Command Center — live per-city x hour operational signals, served from Lakebase.
      app.get('/api/lakebase/city-hourly', async (_req, res) => {
        try {
          const { rows } = await appkit.lakebase.query(
            `SELECT city, hour_of_day, trips, completed,
                    no_driver_rate, cancel_rate, avg_surge, avg_wait_min
             FROM public.gold_city_hourly
             ORDER BY city, hour_of_day`,
          );
          res.json(rows);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });
    });
  },
}).catch(console.error);
