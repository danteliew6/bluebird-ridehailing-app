import {
  useServingInvoke,
  LineChart,
  BarChart,
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
import { useEffect, useMemo, useState } from 'react';
import { Database } from 'lucide-react';
import { useLakebase } from '../../lib/useLakebase';

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

interface WorklistRow {
  vehicle_id: string;
  fleet_brand: string;
  risk_pct: number;
  brake_wear_pct: number;
  battery_v: number;
  km_since_service: number;
  needs_service_now: number;
}

interface ServiceOrder {
  id: string;
  vehicle_id: string;
  fleet_brand: string | null;
  risk_pct: number | null;
  action: string;
  note: string | null;
  created_by: string;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  schedule_service: 'Service scheduled',
  dispatch_inspection: 'Inspection dispatched',
  dismiss: 'Dismissed',
};

// Fleet service worklist — reads at OLTP latency from Lakebase Postgres
// (public.gold_vehicle_predictions), and WRITES ops decisions back to Lakebase
// (ops.service_orders) so acting on a vehicle persists as an operational record.
function LakebaseWorklist() {
  const [rows, setRows] = useState<WorklistRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadOrders = () =>
    fetch('/api/ops/service-orders')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setOrders(d as ServiceOrder[]); })
      .catch(() => { /* non-fatal */ });

  useEffect(() => {
    let alive = true;
    fetch('/api/lakebase/vehicle-worklist')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d)) setRows(d as WorklistRow[]);
        else setErr('No data');
      })
      .catch((e) => { if (alive) setErr(String(e)); });
    void loadOrders();
    return () => { alive = false; };
  }, []);

  const scheduledIds = useMemo(
    () => new Set(orders.filter((o) => o.action === 'schedule_service').map((o) => o.vehicle_id)),
    [orders],
  );

  async function act(row: WorklistRow, action: 'schedule_service' | 'dispatch_inspection') {
    setBusyId(row.vehicle_id);
    try {
      const res = await fetch('/api/ops/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id: row.vehicle_id,
          fleet_brand: row.fleet_brand,
          risk_pct: Number(row.risk_pct),
          action,
        }),
      });
      if (res.ok) await loadOrders();
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => r.vehicle_id.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  );

  return (
    <Card className="shadow-sm lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Vehicles Predicted to Need Service (7d)</CardTitle>
          <Badge variant="secondary" className="gap-1 shrink-0">
            <Database className="h-3 w-3" /> Lakebase read + write-back
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {err && <div className="text-destructive text-sm">Error: {err}</div>}
        {!rows && !err && <Skeleton className="h-64 w-full" />}
        {rows && (
          <>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter vehicle…"
              className="mb-3 max-w-xs"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Vehicle</th>
                    <th className="py-2 pr-3">Brand</th>
                    <th className="py-2 pr-3">7d Risk</th>
                    <th className="py-2 pr-3">Brake %</th>
                    <th className="py-2 pr-3">Battery V</th>
                    <th className="py-2 pr-3">Km/Svc</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 12).map((r) => {
                    const sev = severity(Number(r.risk_pct) / 100);
                    const done = scheduledIds.has(r.vehicle_id);
                    return (
                      <tr key={r.vehicle_id} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 font-mono text-xs">{r.vehicle_id}</td>
                        <td className="py-1.5 pr-3">{r.fleet_brand}</td>
                        <td className={`py-1.5 pr-3 font-semibold ${sev.text}`}>{Number(r.risk_pct)}%</td>
                        <td className="py-1.5 pr-3">{Number(r.brake_wear_pct).toFixed(0)}</td>
                        <td className="py-1.5 pr-3">{Number(r.battery_v).toFixed(1)}</td>
                        <td className="py-1.5 pr-3">{Number(r.km_since_service).toLocaleString()}</td>
                        <td className="py-1.5">
                          {done ? (
                            <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">✓ Scheduled</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === r.vehicle_id}
                              onClick={() => { void act(r, 'schedule_service'); }}
                            >
                              {busyId === r.vehicle_id ? '…' : 'Schedule service'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {filtered.length} vehicles at ≥50% risk · read from Lakebase Postgres · actions persist to Lakebase
            </div>

            {orders.length > 0 && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Recent operational actions (written to Lakebase)
                </div>
                <ul className="space-y-1 text-xs">
                  {orders.slice(0, 5).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-mono">{o.vehicle_id}</span>
                        {o.fleet_brand ? ` · ${o.fleet_brand}` : ''} · {ACTION_LABEL[o.action] ?? o.action}
                        {o.risk_pct != null ? ` (${o.risk_pct}% risk)` : ''}
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {o.created_by} · {new Date(o.created_at).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface FleetKpis {
  fleet_size: number;
  at_risk_7d: number;
  need_now: number;
  avg_anomaly: number;
}

export function FleetForecastPage() {
  // All served from Lakebase Postgres (was the SQL warehouse).
  const { data, loading, error } = useLakebase<FleetKpis>('/api/lakebase/fleet-kpis');
  const forecastDay = useLakebase('/api/lakebase/forecast-by-day');
  const forecastCity = useLakebase('/api/lakebase/forecast-by-city');
  const riskByBrand = useLakebase('/api/lakebase/risk-by-brand');
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
            <LineChart data={forecastDay.data ?? []} xKey="day" yKey="forecast_trips" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Forecasted Demand by City (7d)</CardTitle></CardHeader>
          <CardContent>
            <BarChart data={forecastCity.data ?? []} xKey="city" yKey="forecast_trips" height={280} />
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
            <BarChart data={riskByBrand.data ?? []} xKey="fleet_brand" yKey="at_risk_7d" height={300} orientation="horizontal" />
          </CardContent>
        </Card>
        <LakebaseWorklist />
      </div>

      <WhatIf />
    </div>
  );
}
