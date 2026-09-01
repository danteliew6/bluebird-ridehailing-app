import { createApp, analytics, genie, server, serving, lakebase } from '@databricks/appkit';
import { z } from 'zod';

// Write-back payload: an ops decision on an at-risk vehicle.
const ServiceOrderInput = z.object({
  vehicle_id: z.string().min(1).max(64),
  fleet_brand: z.string().max(64).optional(),
  risk_pct: z.number().int().min(0).max(100).optional(),
  action: z.enum(['schedule_service', 'dispatch_inspection', 'dismiss']),
  note: z.string().max(500).optional(),
});

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
  // Write-back: ops decisions persist to an app-owned schema (ops.service_orders)
  // — reads come from public.gold_* (read-only, SP granted SELECT); writes go to
  // a separate schema the service principal creates and owns.
  async onPluginsReady(appkit) {
    // Schema init — runs once at startup; the app SP creates and owns `ops`.
    await appkit.lakebase.query(`
      CREATE SCHEMA IF NOT EXISTS ops;
      CREATE TABLE IF NOT EXISTS ops.service_orders (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id  TEXT NOT NULL,
        fleet_brand TEXT,
        risk_pct    INTEGER,
        action      TEXT NOT NULL,
        note        TEXT,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_service_orders_created_at
        ON ops.service_orders (created_at DESC);
    `);

    appkit.server.extend((app) => {
      // --- Write-back: record an operational decision on a vehicle ---
      app.post('/api/ops/service-orders', async (req, res) => {
        const parsed = ServiceOrderInput.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
          return;
        }
        const o = parsed.data;
        const createdBy = req.header('x-forwarded-email') ?? 'local-dev';
        try {
          const { rows } = await appkit.lakebase.query(
            `INSERT INTO ops.service_orders (vehicle_id, fleet_brand, risk_pct, action, note, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, vehicle_id, fleet_brand, risk_pct, action, note, created_by, created_at`,
            [o.vehicle_id, o.fleet_brand ?? null, o.risk_pct ?? null, o.action, o.note ?? null, createdBy],
          );
          res.status(201).json(rows[0]);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // --- Read-back: recent operational decisions (proves persistence) ---
      app.get('/api/ops/service-orders', async (_req, res) => {
        try {
          const { rows } = await appkit.lakebase.query(
            `SELECT id, vehicle_id, fleet_brand, risk_pct, action, note, created_by, created_at
             FROM ops.service_orders ORDER BY created_at DESC LIMIT 100`,
          );
          res.json(rows);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // Fleet service worklist — ML risk scores served from Lakebase.
      app.get('/api/lakebase/vehicle-worklist', async (_req, res) => {
        try {
          const { rows } = await appkit.lakebase.query(
            `SELECT vehicle_id, fleet_brand,
                    ROUND(service_risk_7d * 100)::int AS risk_pct,
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

      // --- Overview + Fleet analytics, served from Lakebase (formerly SQL warehouse) ---
      // Numeric columns are cast to ::int / ::float8 so node-postgres returns JS numbers
      // (bigint/numeric would arrive as strings). Reads are sub-second vs warehouse cold starts.
      const lbGet = (path: string, sql: string) =>
        app.get(path, async (_req, res) => {
          try {
            const { rows } = await appkit.lakebase.query(sql);
            res.json(rows);
          } catch (e) {
            res.status(500).json({ error: String(e) });
          }
        });

      // Overview (from public.gold_trips_serving)
      lbGet('/api/lakebase/overview-kpis', `
        SELECT ROUND((SUM(fare_idr)/1e9)::numeric, 2)::float8                          AS revenue_bn_idr,
               SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)::int                AS completed_trips,
               ROUND(AVG(CASE WHEN status='cancelled' THEN 1.0 ELSE 0 END)::numeric,4)::float8 AS cancellation_rate,
               ROUND(AVG(CASE WHEN status='no_driver' THEN 1.0 ELSE 0 END)::numeric,4)::float8 AS no_driver_rate,
               ROUND(AVG(surge_multiplier)::numeric, 2)::float8                        AS avg_surge,
               ROUND(AVG(rating)::numeric, 2)::float8                                  AS avg_rating
        FROM public.gold_trips_serving
        WHERE request_ts >= NOW() - INTERVAL '30 days'`);
      lbGet('/api/lakebase/trips-by-city', `
        SELECT city, COUNT(*)::int AS trips FROM public.gold_trips_serving GROUP BY 1 ORDER BY 2 DESC`);
      lbGet('/api/lakebase/revenue-by-day', `
        SELECT to_char(date_trunc('day', request_ts), 'YYYY-MM-DD') AS day,
               ROUND((SUM(fare_idr)/1e9)::numeric, 3)::float8 AS revenue_bn_idr
        FROM public.gold_trips_serving
        WHERE request_ts >= NOW() - INTERVAL '30 days' GROUP BY 1 ORDER BY 1`);
      lbGet('/api/lakebase/top-zones', `
        SELECT pickup_area_name AS pickup_zone, city, pickup_zone_type AS zone_type,
               COUNT(*)::int AS trips,
               ROUND((SUM(fare_idr)/1e6)::numeric, 1)::float8 AS revenue_m_idr,
               ROUND(AVG(surge_multiplier)::numeric, 2)::float8 AS avg_surge
        FROM public.gold_trips_serving
        GROUP BY 1, 2, 3 ORDER BY trips DESC LIMIT 15`);
      lbGet('/api/lakebase/outcome-mix', `
        SELECT status, COUNT(*)::int AS trips FROM public.gold_trips_serving GROUP BY 1 ORDER BY 2 DESC`);
      lbGet('/api/lakebase/nodriver-by-hour', `
        SELECT EXTRACT(HOUR FROM request_ts)::int AS hour_of_day,
               ROUND(AVG(CASE WHEN status='no_driver' THEN 1.0 ELSE 0 END)::numeric, 4)::float8 AS no_driver_rate
        FROM public.gold_trips_serving WHERE city='Jakarta' GROUP BY 1 ORDER BY 1`);

      // Fleet (from public.gold_vehicle_predictions + public.gold_demand_forecast)
      lbGet('/api/lakebase/fleet-kpis', `
        SELECT COUNT(*)::int AS fleet_size,
               SUM(CASE WHEN service_risk_7d >= 0.5 THEN 1 ELSE 0 END)::int AS at_risk_7d,
               SUM(needs_service_now)::int AS need_now,
               ROUND(AVG(anomaly_score)::numeric, 3)::float8 AS avg_anomaly
        FROM public.gold_vehicle_predictions`);
      lbGet('/api/lakebase/risk-by-brand', `
        SELECT fleet_brand, SUM(CASE WHEN service_risk_7d >= 0.5 THEN 1 ELSE 0 END)::int AS at_risk_7d
        FROM public.gold_vehicle_predictions GROUP BY 1 ORDER BY 2 DESC`);
      lbGet('/api/lakebase/forecast-by-day', `
        SELECT to_char(date_trunc('day', forecast_ts), 'YYYY-MM-DD') AS day,
               SUM(trips_forecast)::int AS forecast_trips
        FROM public.gold_demand_forecast GROUP BY 1 ORDER BY 1`);
      lbGet('/api/lakebase/forecast-by-city', `
        SELECT city, SUM(trips_forecast)::int AS forecast_trips
        FROM public.gold_demand_forecast GROUP BY 1 ORDER BY 2 DESC`);
    });
  },
}).catch(console.error);
