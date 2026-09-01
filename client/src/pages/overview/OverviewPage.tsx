import {
  BarChart,
  LineChart,
  DonutChart,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
  Input,
} from '@databricks/appkit-ui/react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Database } from 'lucide-react';
import { useLakebase } from '../../lib/useLakebase';

interface ZoneRow {
  pickup_zone: string;
  city: string;
  zone_type: string;
  trips: number;
  revenue_m_idr: number;
  avg_surge: number;
}

// Top pickup zones — plain table fed from Lakebase (DataTable only supports a warehouse queryKey).
function TopZonesTable() {
  const { data } = useLakebase<ZoneRow>('/api/lakebase/top-zones');
  const [q, setQ] = useState('');
  const rows = useMemo(
    () => (data ?? []).filter((r) => r.pickup_zone?.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  return (
    <>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter zones..." className="mb-3 max-w-xs" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Pickup Zone</th>
              <th className="py-2 pr-3">City</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Trips</th>
              <th className="py-2 pr-3">Revenue (M IDR)</th>
              <th className="py-2">Avg Surge</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 15).map((r) => (
              <tr key={`${r.pickup_zone}-${r.city}`} className="border-b border-border/50">
                <td className="py-1.5 pr-3 font-medium">{r.pickup_zone}</td>
                <td className="py-1.5 pr-3">{r.city}</td>
                <td className="py-1.5 pr-3">{r.zone_type}</td>
                <td className="py-1.5 pr-3">{Number(r.trips).toLocaleString()}</td>
                <td className="py-1.5 pr-3">{Number(r.revenue_m_idr).toLocaleString()}</td>
                <td className="py-1.5">{Number(r.avg_surge).toFixed(2)}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
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

interface OverviewKpis {
  revenue_bn_idr: number;
  completed_trips: number;
  cancellation_rate: number;
  no_driver_rate: number;
  avg_surge: number;
  avg_rating: number;
}

export function OverviewPage() {
  // All served from Lakebase Postgres (was the SQL warehouse) — sub-second reads.
  const { data: kpiRows, loading, error } = useLakebase<OverviewKpis>('/api/lakebase/overview-kpis');
  const revenue = useLakebase('/api/lakebase/revenue-by-day');
  const byCity = useLakebase('/api/lakebase/trips-by-city');
  const outcome = useLakebase('/api/lakebase/outcome-mix');
  const noDriver = useLakebase('/api/lakebase/nodriver-by-hour');
  const k = kpiRows?.[0];

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Operations Overview</h2>
          <p className="text-sm text-muted-foreground">
            Live ride-hailing KPIs across Indonesia · last 30 days
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Database className="h-3 w-3" /> Served from Lakebase
        </Badge>
      </div>

      {/* KPI row */}
      {error && <div className="text-destructive bg-destructive/10 p-3 rounded-md">Error: {error}</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading || !k ? (
          ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => <Skeleton key={s} className="h-24 w-full" />)
        ) : (
          <>
            <KpiCard label="Revenue (30d)" value={`Rp ${k.revenue_bn_idr} B`} hint="completed fares" />
            <KpiCard label="Completed Trips" value={Number(k.completed_trips).toLocaleString()} />
            <KpiCard label="Cancellation" value={`${(k.cancellation_rate * 100).toFixed(1)}%`} />
            <KpiCard label="No-Driver Rate" value={`${(k.no_driver_rate * 100).toFixed(1)}%`} hint="driver shortage" />
            <KpiCard label="Avg Surge" value={`${k.avg_surge}×`} />
            <KpiCard label="Avg Rating" value={`${k.avg_rating} ★`} />
          </>
        )}
      </div>

      {/* charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Daily Revenue (Bn IDR)</CardTitle></CardHeader>
          <CardContent>
            <LineChart data={revenue.data ?? []} xKey="day" yKey="revenue_bn_idr" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Trips by City</CardTitle></CardHeader>
          <CardContent>
            <BarChart data={byCity.data ?? []} xKey="city" yKey="trips" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Trip Outcome Mix</CardTitle></CardHeader>
          <CardContent>
            <DonutChart data={outcome.data ?? []} xKey="status" yKey="trips" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Jakarta No-Driver Rate by Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart data={noDriver.data ?? []} xKey="hour_of_day" yKey="no_driver_rate" height={280} />
            <p className="text-xs text-muted-foreground mt-2">
              Evening peak (17:00–20:00) spikes — the current driver-shortage hotspot.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader><CardTitle>Top Pickup Zones</CardTitle></CardHeader>
        <CardContent>
          <TopZonesTable />
        </CardContent>
      </Card>
    </div>
  );
}
