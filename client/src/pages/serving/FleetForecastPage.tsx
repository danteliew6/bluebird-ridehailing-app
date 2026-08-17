import {
  useAnalyticsQuery,
  useServingInvoke,
  LineChart,
  BarChart,
  DataTable,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
  Button,
  Label,
  Input,
} from '@databricks/appkit-ui/react';
import type { ReactNode } from 'react';
import { useState } from 'react';

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1 text-foreground">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

const FEATURES = [
  { key: 'engine_temp_c', label: 'Engine Temp (°C)', def: 95 },
  { key: 'brake_wear_pct', label: 'Brake Wear (%)', def: 60 },
  { key: 'battery_v', label: 'Battery (V)', def: 12.1 },
  { key: 'km_since_service', label: 'Km Since Service', def: 9000 },
  { key: 'dtc_count', label: 'Fault Codes', def: 2 },
  { key: 'anomaly_score', label: 'Anomaly Score', def: 0.55 },
  { key: 'vehicle_age', label: 'Vehicle Age (yrs)', def: 8 },
] as const;

function WhatIf() {
  const [vals, setVals] = useState<Record<string, number>>(
    Object.fromEntries(FEATURES.map((f) => [f.key, f.def])),
  );
  const { invoke, loading, error } = useServingInvoke({});
  const [pred, setPred] = useState<number | null>(null);

  function run() {
    void invoke({ dataframe_records: [vals] }).then((res) => {
      const p = (res as { predictions?: number[] })?.predictions?.[0];
      if (p !== undefined) setPred(p);
    });
  }

  return (
    <Card className="shadow-sm">
      <CardHeader><CardTitle>Live Maintenance Prediction (what-if)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Scores a single vehicle reading against the served model (endpoint <code>bluebird-maintenance</code>) —
          predicts whether it will need service within 7 days.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FEATURES.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
              <Input
                id={f.key}
                type="number"
                step="any"
                value={vals[f.key]}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: parseFloat(e.target.value) }))}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={loading}>{loading ? 'Scoring…' : 'Predict'}</Button>
          {pred !== null && (
            <Badge variant={pred === 1 ? 'destructive' : 'secondary'}>
              {pred === 1 ? '⚠ Needs service within 7 days' : '✓ Healthy'}
            </Badge>
          )}
        </div>
        {error && <div className="text-destructive text-sm">Error: {error}</div>}
      </CardContent>
    </Card>
  );
}

export function FleetForecastPage() {
  const { data, loading, error } = useAnalyticsQuery('kpi_fleet', {});
  const k = data?.[0];

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Fleet Health & Demand Forecast</h2>
        <p className="text-sm text-muted-foreground">
          AutoML predictive maintenance + 7-day demand forecast · powered by MLflow on Databricks
        </p>
      </div>

      {/* forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Forecasted Demand — Next 7 Days</CardTitle></CardHeader>
          <CardContent>
            <LineChart queryKey="forecast_by_day" parameters={{}} xKey="day" yKey="forecast_trips" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Forecasted Demand by City (7d)</CardTitle></CardHeader>
          <CardContent>
            <BarChart queryKey="forecast_by_city" parameters={{}} xKey="city" yKey="forecast_trips" height={280} />
          </CardContent>
        </Card>
      </div>

      {/* fleet KPIs */}
      {error && <div className="text-destructive bg-destructive/10 p-3 rounded-md">Error: {error}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading || !k ? (
          ['a', 'b', 'c', 'd'].map((s) => <Skeleton key={s} className="h-24 w-full" />)
        ) : (
          <>
            <Kpi label="Fleet Size" value={k.fleet_size.toLocaleString()} />
            <Kpi label="At Risk (7d)" value={k.at_risk_7d.toLocaleString()} hint="predicted to need service" />
            <Kpi label="Need Service Now" value={k.need_now.toLocaleString()} />
            <Kpi label="Avg Anomaly" value={k.avg_anomaly} hint="≥ 0.7 actionable" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm lg:col-span-1">
          <CardHeader><CardTitle>At-Risk Vehicles by Fleet Brand</CardTitle></CardHeader>
          <CardContent>
            <BarChart queryKey="risk_by_brand" parameters={{}} xKey="fleet_brand" yKey="at_risk_7d" height={300} orientation="horizontal" />
          </CardContent>
        </Card>
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader><CardTitle>Vehicles Predicted to Need Service (7d)</CardTitle></CardHeader>
          <CardContent>
            <DataTable queryKey="vehicles_at_risk" parameters={{}} filterColumn="vehicle_id" filterPlaceholder="Filter vehicle…" pageSize={8} />
          </CardContent>
        </Card>
      </div>

      <WhatIf />
    </div>
  );
}
