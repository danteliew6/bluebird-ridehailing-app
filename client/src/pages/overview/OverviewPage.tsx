import {
  useAnalyticsQuery,
  BarChart,
  LineChart,
  DonutChart,
  DataTable,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
} from '@databricks/appkit-ui/react';
import type { ReactNode } from 'react';

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

export function OverviewPage() {
  const { data, loading, error } = useAnalyticsQuery('kpi_overview', {});
  const k = data?.[0];

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Operations Overview</h2>
          <p className="text-sm text-muted-foreground">
            Live ride-hailing KPIs across Indonesia · last 30 days
          </p>
        </div>
        <Badge variant="secondary">Source: governed gold · trips_curated_gold</Badge>
      </div>

      {/* KPI row */}
      {error && <div className="text-destructive bg-destructive/10 p-3 rounded-md">Error: {error}</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading || !k ? (
          ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => <Skeleton key={s} className="h-24 w-full" />)
        ) : (
          <>
            <KpiCard label="Revenue (30d)" value={`Rp ${k.revenue_bn_idr} B`} hint="completed fares" />
            <KpiCard label="Completed Trips" value={k.completed_trips.toLocaleString()} />
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
            <LineChart queryKey="revenue_by_day" parameters={{}} xKey="day" yKey="revenue_bn_idr" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Trips by City</CardTitle></CardHeader>
          <CardContent>
            <BarChart queryKey="trips_by_city" parameters={{}} xKey="city" yKey="trips" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Trip Outcome Mix</CardTitle></CardHeader>
          <CardContent>
            <DonutChart queryKey="outcome_mix" parameters={{}} xKey="status" yKey="trips" height={280} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Jakarta No-Driver Rate by Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart queryKey="nodriver_by_hour" parameters={{}} xKey="hour_of_day" yKey="no_driver_rate" height={280} />
            <p className="text-xs text-muted-foreground mt-2">
              Evening peak (17:00–20:00) spikes — the current driver-shortage hotspot.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader><CardTitle>Top Pickup Zones</CardTitle></CardHeader>
        <CardContent>
          <DataTable queryKey="top_zones" parameters={{}} filterColumn="pickup_zone" filterPlaceholder="Filter zones..." pageSize={8} />
        </CardContent>
      </Card>
    </div>
  );
}
