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
  { key: 'engine_temp_c', label: 'Engine Temp (°C)', def: 95, risk: (v: number) => (v >= 112 ? 2 : v >= 104 ? 1 : 0) },
  { key: 'brake_wear_pct', label: 'Brake Wear (%)', def: 60, risk: (v: number) => (v >= 85 ? 2 : v >= 70 ? 1 : 0) },
  { key: 'battery_v', label: 'Battery (V)', def: 12.1, risk: (v: number) => (v <= 11.2 ? 2 : v <= 11.8 ? 1 : 0) },
  { key: 'km_since_service', label: 'Km Since Service', def: 9000, risk: (v: number) => (v >= 12000 ? 2 : v >= 8000 ? 1 : 0) },
  { key: 'dtc_count', label: 'Fault Codes', def: 2, risk: (v: number) => (v >= 3 ? 2 : v >= 1 ? 1 : 0) },
  { key: 'anomaly_score', label: 'Anomaly Score', def: 0.55, risk: (v: number) => (v >= 0.7 ? 2 : v >= 0.4 ? 1 : 0) },
  { key: 'vehicle_age', label: 'Vehicle Age (yrs)', def: 8, risk: (v: number) => (v >= 10 ? 2 : v >= 6 ? 1 : 0) },
] as const;

function extractRisk(data: unknown): number | null {
  const preds = (data as { predictions?: unknown })?.predictions;
  if (!Array.isArray(preds) || preds.length === 0) return null;
  const arr: unknown[] = preds;
  const first = arr[0];
  if (typeof first === 'number') return first;
  if (first && typeof first === 'object' && 'service_risk_7d' in first) {
    const v = (first as { service_risk_7d: unknown }).service_risk_7d;
    return typeof v === 'number' ? v : Number(v);
  }
  return null;
}

function severity(risk: number) {
  if (risk >= 0.85) return { label: 'Critical', color: '#DC2626', bar: 'bg-red-600', text: 'text-red-600' };
  if (risk >= 0.6) return { label: 'High', color: '#EA580C', bar: 'bg-orange-500', text: 'text-orange-600' };
  if (risk >= 0.3) return { label: 'Moderate', color: '#F2B705', bar: 'bg-amber-500', text: 'text-amber-600' };
  return { label: 'Low', color: '#16A34A', bar: 'bg-emerald-600', text: 'text-emerald-600' };
}

const CHIP = ['bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-red-100 text-red-700'];
const CHIP_LABEL = ['normal', 'watch', 'alert'];

function WhatIf() {
  const [vals, setVals] = useState<Record<string, number>>(
    Object.fromEntries(FEATURES.map((f) => [f.key, f.def])),
  );
  const { invoke, loading, error } = useServingInvoke({});
  const [risk, setRisk] = useState<number | null>(null);

  function run() {
    void invoke({ dataframe_records: [vals] }).then((res) => {
      const r = extractRisk(res);
      if (r !== null) setRisk(r);
    });
  }

  const sev = risk !== null ? severity(risk) : null;
  const pct = risk !== null ? Math.round(risk * 100) : 0;

  return (
    <Card className="shadow-sm">
      <CardHeader><CardTitle>Live Maintenance Prediction (what-if)</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Scores a single vehicle reading against the served model (endpoint <code>bluebird-maintenance</code>) —
          returns the probability it needs service within 7 days.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FEATURES.map((f) => {
            const r = f.risk(vals[f.key]);
            return (
              <div key={f.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CHIP[r]}`}>{CHIP_LABEL[r]}</span>
                </div>
                <Input id={f.key} type="number" step="any" value={vals[f.key]}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: parseFloat(e.target.value) }))} />
              </div>
            );
          })}
        </div>

        <Button onClick={run} disabled={loading}>{loading ? 'Scoring…' : 'Predict service risk'}</Button>
        {error && <div className="text-destructive text-sm">Error: {error}</div>}

        {risk !== null && sev && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">7-day service risk</div>
                <div className={`text-4xl font-bold ${sev.text}`}>{pct}%</div>
              </div>
              <div className="text-right">
                <Badge variant={risk >= 0.5 ? 'destructive' : 'secondary'}>
                  {risk >= 0.5 ? '⚠ Schedule maintenance' : '✓ No action needed'}
                </Badge>
                <div className={`text-sm font-semibold mt-1 ${sev.text}`}>{sev.label} risk</div>
              </div>
            </div>
            {/* gauge */}
            <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${sev.bar} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Low</span><span>Moderate</span><span>High</span><span>Critical</span>
            </div>
          </div>
        )}
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

      {error && <div className="text-destructive bg-destructive/10 p-3 rounded-md">Error: {error}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading || !k ? (
          ['a', 'b', 'c', 'd'].map((x) => <Skeleton key={x} className="h-24 w-full" />)
        ) : (
          <>
            <Kpi label="Fleet Size" value={k.fleet_size.toLocaleString()} />
            <Kpi label="At Risk (7d)" value={k.at_risk_7d.toLocaleString()} hint="risk ≥ 50%" />
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
