CREATE OR REPLACE VIEW dante_classic_stable_catalog.bluebird_ride_hailing.bluebird_trip_metrics
WITH METRICS
LANGUAGE YAML
AS $$
  version: 1.1
  source: dante_classic_stable_catalog.bluebird_ride_hailing.fact_trip
  comment: "Governed ride-hailing KPIs for Bluebird — revenue, demand, reliability and pricing."
  dimensions:
    - name: Trip Date
      expr: "to_date(request_ts)"
    - name: Trip Month
      expr: "date_trunc('MONTH', request_ts)"
    - name: Hour of Day
      expr: "hour(request_ts)"
    - name: Is Peak Hour
      expr: "(hour(request_ts) BETWEEN 6 AND 9 OR hour(request_ts) BETWEEN 17 AND 20)"
    - name: City
      expr: "city"
    - name: Fleet Brand
      expr: "fleet_brand"
    - name: Service Type
      expr: "service_type"
    - name: Payment Method
      expr: "payment_method"
    - name: Trip Status
      expr: "status"
    - name: Pickup Zone
      expr: "pickup_zone_id"
  measures:
    - name: Total Trips
      expr: "COUNT(1)"
    - name: Completed Trips
      expr: "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"
    - name: Cancelled Trips
      expr: "SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)"
    - name: No Driver Trips
      expr: "SUM(CASE WHEN status = 'no_driver' THEN 1 ELSE 0 END)"
    - name: Total Revenue IDR
      expr: "SUM(fare_idr)"
    - name: Avg Fare IDR
      expr: "SUM(fare_idr) / NULLIF(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)"
    - name: Cancellation Rate
      expr: "SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) / NULLIF(COUNT(1), 0)"
    - name: No Driver Rate
      expr: "SUM(CASE WHEN status = 'no_driver' THEN 1 ELSE 0 END) / NULLIF(COUNT(1), 0)"
    - name: Completion Rate
      expr: "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / NULLIF(COUNT(1), 0)"
    - name: Avg Surge
      expr: "AVG(surge_multiplier)"
    - name: Avg Wait Min
      expr: "AVG(wait_time_min)"
    - name: Avg Rating
      expr: "AVG(rating)"
    - name: Avg Distance Km
      expr: "AVG(CASE WHEN status = 'completed' THEN distance_km END)"
    - name: Unique Customers
      expr: "COUNT(DISTINCT customer_id)"
    - name: Unique Drivers
      expr: "COUNT(DISTINCT driver_id)"
$$
