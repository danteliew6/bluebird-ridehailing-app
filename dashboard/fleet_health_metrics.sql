CREATE OR REPLACE VIEW dante_classic_stable_catalog.bluebird_ride_hailing.bluebird_fleet_health_metrics
WITH METRICS
LANGUAGE YAML
AS $$
  version: 1.1
  source: dante_classic_stable_catalog.bluebird_ride_hailing.fact_vehicle_health
  comment: "Governed fleet-health KPIs for Bluebird predictive maintenance."
  dimensions:
    - name: Reading Date
      expr: "to_date(reading_date)"
    - name: Fleet Brand
      expr: "fleet_brand"
    - name: Vehicle
      expr: "vehicle_id"
  measures:
    - name: Readings
      expr: "COUNT(1)"
    - name: Avg Anomaly Score
      expr: "AVG(anomaly_score)"
    - name: Service Needed Rate
      expr: "SUM(needs_service_flag) / NULLIF(COUNT(1), 0)"
    - name: Vehicles Needing Service
      expr: "COUNT(DISTINCT CASE WHEN needs_service_flag = 1 THEN vehicle_id END)"
    - name: Avg Brake Wear Pct
      expr: "AVG(brake_wear_pct)"
    - name: Avg Battery V
      expr: "AVG(battery_v)"
    - name: Fleet Size
      expr: "COUNT(DISTINCT vehicle_id)"
$$
