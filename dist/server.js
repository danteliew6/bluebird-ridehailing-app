import { analytics, createApp, genie, lakebase, server, serving } from "@databricks/appkit";
import { z } from "zod";

//#region server/server.ts
const ServiceOrderInput = z.object({
	vehicle_id: z.string().min(1).max(64),
	fleet_brand: z.string().max(64).optional(),
	risk_pct: z.number().int().min(0).max(100).optional(),
	action: z.enum([
		"schedule_service",
		"dispatch_inspection",
		"dismiss"
	]),
	note: z.string().max(500).optional()
});
createApp({
	plugins: [
		analytics(),
		genie(),
		server(),
		serving(),
		lakebase()
	],
	async onPluginsReady(appkit) {
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
			app.post("/api/ops/service-orders", async (req, res) => {
				const parsed = ServiceOrderInput.safeParse(req.body);
				if (!parsed.success) {
					res.status(400).json({
						error: "Invalid input",
						details: parsed.error.issues
					});
					return;
				}
				const o = parsed.data;
				const createdBy = req.header("x-forwarded-email") ?? "local-dev";
				try {
					const { rows } = await appkit.lakebase.query(`INSERT INTO ops.service_orders (vehicle_id, fleet_brand, risk_pct, action, note, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, vehicle_id, fleet_brand, risk_pct, action, note, created_by, created_at`, [
						o.vehicle_id,
						o.fleet_brand ?? null,
						o.risk_pct ?? null,
						o.action,
						o.note ?? null,
						createdBy
					]);
					res.status(201).json(rows[0]);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
			app.get("/api/ops/service-orders", async (_req, res) => {
				try {
					const { rows } = await appkit.lakebase.query(`SELECT id, vehicle_id, fleet_brand, risk_pct, action, note, created_by, created_at
             FROM ops.service_orders ORDER BY created_at DESC LIMIT 100`);
					res.json(rows);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
			app.get("/api/lakebase/vehicle-worklist", async (_req, res) => {
				try {
					const { rows } = await appkit.lakebase.query(`SELECT vehicle_id, fleet_brand,
                    ROUND(service_risk_7d * 100)::int AS risk_pct,
                    ROUND(brake_wear_pct::numeric, 1) AS brake_wear_pct,
                    ROUND(battery_v::numeric, 2)      AS battery_v,
                    ROUND(km_since_service)::bigint   AS km_since_service,
                    needs_service_now
             FROM public.gold_vehicle_predictions
             WHERE service_risk_7d >= 0.5
             ORDER BY service_risk_7d DESC
             LIMIT 50`);
					res.json(rows);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
			app.get("/api/lakebase/zone-live", async (_req, res) => {
				try {
					const { rows } = await appkit.lakebase.query(`SELECT zone_id, area_name, city, zone_type, lat, lng,
                    hour_of_day, demand, no_driver_rate, avg_surge
             FROM public.gold_zone_live
             ORDER BY city, hour_of_day`);
					res.json(rows);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
			app.get("/api/lakebase/city-hourly", async (_req, res) => {
				try {
					const { rows } = await appkit.lakebase.query(`SELECT city, hour_of_day, trips, completed,
                    no_driver_rate, cancel_rate, avg_surge, avg_wait_min
             FROM public.gold_city_hourly
             ORDER BY city, hour_of_day`);
					res.json(rows);
				} catch (e) {
					res.status(500).json({ error: String(e) });
				}
			});
		});
	}
}).catch(console.error);

//#endregion
export {  };