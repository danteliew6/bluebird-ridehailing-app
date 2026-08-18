import {
  useAnalyticsQuery,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
  DataTable,
  BarChart,
} from '@databricks/appkit-ui/react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Activity,
  AlertTriangle,
  Play,
  Pause,
  Zap,
  Clock,
  MapPin,
  ShieldAlert,
  CheckCircle2,
  MessageSquare,
  Car,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirror the generated analytics result shapes)
// ---------------------------------------------------------------------------
interface HourlyCityRow {
  city: string;
  hour_of_day: number;
  trips: number;
  completed: number;
  no_driver_rate: number;
  cancel_rate: number;
  avg_surge: number;
  avg_wait_min: number;
}
interface ZoneRow {
  zone_id: string;
  area_name: string;
  city: string;
  zone_type: string;
  lat: number;
  lng: number;
  hour_of_day: number;
  demand: number;
  no_driver_rate: number;
  avg_surge: number;
}
type Tone = 'ok' | 'warn' | 'crit';

// ---------------------------------------------------------------------------
// Threshold helpers — the "when does an ops screen light up" logic.
// ---------------------------------------------------------------------------
const N = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const toneNoDriver = (v: number): Tone => (v >= 0.15 ? 'crit' : v >= 0.08 ? 'warn' : 'ok');
const toneSurge = (v: number): Tone => (v >= 1.8 ? 'crit' : v >= 1.4 ? 'warn' : 'ok');
const toneCancel = (v: number): Tone => (v >= 0.13 ? 'crit' : v >= 0.09 ? 'warn' : 'ok');
const toneWait = (v: number): Tone => (v >= 10 ? 'crit' : v >= 6 ? 'warn' : 'ok');

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  crit: 'text-red-600 dark:text-red-400',
};
const TONE_BORDER: Record<Tone, string> = {
  ok: 'border-l-emerald-500',
  warn: 'border-l-amber-500',
  crit: 'border-l-red-500',
};
const TONE_DOT: Record<Tone, string> = { ok: '#10b981', warn: '#f59e0b', crit: '#dc2626' };

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Supply-gap color ramp for the map (by no-driver rate).
function gapColor(v: number): string {
  if (v >= 0.18) return '#dc2626';
  if (v >= 0.12) return '#f97316';
  if (v >= 0.06) return '#f59e0b';
  return '#10b981';
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------
function StatTile({
  label, value, tone, delta, hint,
}: { label: string; value: string; tone: Tone; delta?: string; hint?: string }) {
  return (
    <Card className={`shadow-sm border-l-4 ${TONE_BORDER[tone]}`}>
      <CardContent className="pt-4 pb-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${TONE_TEXT[tone]}`}>{value}</div>
        {delta && <div className="text-xs text-muted-foreground mt-0.5">{delta}</div>}
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The live zone map — projects lat/lng into an SVG viewbox.
// ---------------------------------------------------------------------------
function ZoneMap({
  zones, selectedId, onSelect,
}: { zones: ZoneRow[]; selectedId: string | null; onSelect: (z: ZoneRow | null) => void }) {
  const W = 400, H = 300, PAD = 34;
  const proj = useMemo(() => {
    if (zones.length === 0) return null;
    const lats = zones.map((z) => N(z.lat)), lngs = zones.map((z) => N(z.lng));
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const dLat = maxLat - minLat || 1, dLng = maxLng - minLng || 1;
    const maxDemand = Math.max(...zones.map((z) => N(z.demand)), 1);
    return { minLat, maxLat, minLng, maxLng, dLat, dLng, maxDemand };
  }, [zones]);

  if (!proj) return <div className="text-sm text-muted-foreground p-6 text-center">No zone activity in this window.</div>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 340 }} role="img" aria-label="Live zone demand map">
      <rect x={0} y={0} width={W} height={H} rx={10} className="fill-muted/40" />
      {zones.map((z) => {
        const cx = PAD + ((N(z.lng) - proj.minLng) / proj.dLng) * (W - 2 * PAD);
        const cy = PAD + (1 - (N(z.lat) - proj.minLat) / proj.dLat) * (H - 2 * PAD);
        const r = 6 + Math.sqrt(N(z.demand) / proj.maxDemand) * 20;
        const col = gapColor(N(z.no_driver_rate));
        const isSel = z.zone_id === selectedId;
        const critical = N(z.no_driver_rate) >= 0.15;
        return (
          <g key={z.zone_id} onClick={() => onSelect(isSel ? null : z)} style={{ cursor: 'pointer' }}>
            <circle
              cx={cx} cy={cy} r={r}
              fill={col} fillOpacity={0.35}
              stroke={col} strokeWidth={isSel ? 3 : 1.5}
              className={critical ? 'animate-pulse' : ''}
            />
            <circle cx={cx} cy={cy} r={2.5} fill={col} />
            <title>{`${z.area_name} · demand ${N(z.demand)} · no-driver ${fmtPct(N(z.no_driver_rate))} · surge ${N(z.avg_surge)}×`}</title>
            {(isSel || critical) && (
              <text x={cx} y={cy - r - 3} textAnchor="middle" className="fill-foreground" style={{ fontSize: 9, fontWeight: 600 }}>
                {z.area_name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function CommandCenterPage() {
  const navigate = useNavigate();
  const hourly = useAnalyticsQuery('cc_hourly_city', {});
  const zonesQ = useAnalyticsQuery('cc_zone_live', {});
  const brandRiskQ = useAnalyticsQuery('risk_by_brand', {});

  const [simHour, setSimHour] = useState(18); // open on the evening-peak incident
  const [playing, setPlaying] = useState(true);
  const [city, setCity] = useState('Jakarta');
  const [selZone, setSelZone] = useState<ZoneRow | null>(null);

  // advance the simulated clock
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setSimHour((h) => (h + 1) % 24), 3600);
    return () => clearInterval(t);
  }, [playing]);

  const rows = useMemo(() => (hourly.data ?? []) as HourlyCityRow[], [hourly.data]);
  const zoneRows = useMemo(() => (zonesQ.data ?? []) as ZoneRow[], [zonesQ.data]);

  const cities = useMemo(
    () => Array.from(new Set(zoneRows.map((z) => z.city))).sort(),
    [zoneRows],
  );

  // network aggregate per hour (trip-weighted) — for KPIs, timeline and baseline
  const byHour = useMemo(() => {
    const acc: Record<number, { trips: number; completed: number; ndrW: number; cxlW: number; surgeW: number; waitW: number }> = {};
    for (let h = 0; h < 24; h++) acc[h] = { trips: 0, completed: 0, ndrW: 0, cxlW: 0, surgeW: 0, waitW: 0 };
    for (const r of rows) {
      const w = N(r.trips), a = acc[r.hour_of_day];
      if (!a) continue;
      a.trips += w;
      a.completed += N(r.completed);
      a.ndrW += N(r.no_driver_rate) * w;
      a.cxlW += N(r.cancel_rate) * w;
      a.surgeW += N(r.avg_surge) * w;
      a.waitW += N(r.avg_wait_min) * w;
    }
    return Array.from({ length: 24 }, (_, h) => {
      const a = acc[h], t = a.trips || 1;
      return {
        hour: h, trips: a.trips, completed: a.completed,
        no_driver_rate: a.ndrW / t, cancel_rate: a.cxlW / t,
        avg_surge: a.surgeW / t, avg_wait_min: a.waitW / t,
      };
    });
  }, [rows]);

  const cur = byHour[simHour];
  const baseline = useMemo(() => {
    const tot = byHour.reduce((s, x) => s + x.trips, 0) || 1;
    return {
      no_driver_rate: byHour.reduce((s, x) => s + x.no_driver_rate * x.trips, 0) / tot,
      avg_surge: byHour.reduce((s, x) => s + x.avg_surge * x.trips, 0) / tot,
    };
  }, [byHour]);

  // per-city breakdown at the current hour (worst city first)
  // NOTE: analytics serializes numerics as strings at runtime — coerce hour_of_day with N()
  // before comparing, or "3" === 3 fails and these filters silently return nothing.
  const cityAtHour = useMemo(
    () => rows.filter((r) => N(r.hour_of_day) === simHour).sort((a, b) => N(b.no_driver_rate) - N(a.no_driver_rate)),
    [rows, simHour],
  );
  const worstCity = cityAtHour[0];

  // zones for the map (selected city + current hour)
  const mapZones = useMemo(
    () => zoneRows.filter((z) => z.city === city && N(z.hour_of_day) === simHour).sort((a, b) => N(b.demand) - N(a.demand)),
    [zoneRows, city, simHour],
  );
  const hotZones = useMemo(
    () => zoneRows.filter((z) => N(z.hour_of_day) === simHour).sort((a, b) => N(b.no_driver_rate) - N(a.no_driver_rate)).slice(0, 3),
    [zoneRows, simHour],
  );

  // fleet risk — total flagged (≥50% 7-day risk) is uncapped via risk_by_brand;
  // vehicles_at_risk is LIMIT 50 so it only feeds the table + the ≥85% "critical" subset.
  const brandRisk = useMemo(() => (brandRiskQ.data ?? []) as { fleet_brand: string; at_risk_7d: number }[], [brandRiskQ.data]);
  const fleetTotal = brandRisk.reduce((s, b) => s + N(b.at_risk_7d), 0);
  const worstBrand = [...brandRisk].sort((a, b) => N(b.at_risk_7d) - N(a.at_risk_7d))[0]?.fleet_brand;

  // simulated wall-clock
  const now = new Date();
  const clock = `${DAYS[now.getDay()]} ${now.getDate()} Aug 2026 · ${String(simHour).padStart(2, '0')}:00 WIB`;

  const loading = hourly.loading || zonesQ.loading;
  const err = hourly.error || zonesQ.error;

  // ---- alert feed (derived) ----
  interface Alert { id: string; sev: Tone; icon: ReactNode; title: string; detail: string; action: string; ask?: string; }
  const alerts: Alert[] = [];
  if (cur) {
    const dNdr = cur.no_driver_rate - baseline.no_driver_rate;
    if (toneNoDriver(cur.no_driver_rate) === 'crit' && worstCity) {
      alerts.push({
        id: 'shortage', sev: 'crit', icon: <ShieldAlert className="h-4 w-4" />,
        title: `Driver shortage — ${worstCity.city}`,
        detail: `No-driver rate ${fmtPct(cur.no_driver_rate)} network-wide (▲${(dNdr * 100).toFixed(0)}pts vs typical), surge ${cur.avg_surge.toFixed(2)}×. Hotspots: ${hotZones.map((z) => z.area_name).join(', ')}.`,
        action: 'Reposition idle drivers to hotspot zones and trigger evening-peak incentives.',
        ask: `Why is the no-driver rate so high in ${worstCity.city} during the evening peak?`,
      });
    }
    if (toneSurge(cur.avg_surge) !== 'ok') {
      alerts.push({
        id: 'surge', sev: toneSurge(cur.avg_surge), icon: <Zap className="h-4 w-4" />,
        title: `Elevated surge pricing`,
        detail: `Average surge ${cur.avg_surge.toFixed(2)}× across the network at ${String(simHour).padStart(2, '0')}:00 — demand is outrunning available supply.`,
        action: 'Monitor rider cancellations; cap surge if churn risk rises.',
        ask: 'Which cities have the highest surge multiplier this hour?',
      });
    }
    if (toneCancel(cur.cancel_rate) !== 'ok') {
      alerts.push({
        id: 'cxl', sev: toneCancel(cur.cancel_rate), icon: <AlertTriangle className="h-4 w-4" />,
        title: `Cancellations climbing`,
        detail: `Cancellation rate ${fmtPct(cur.cancel_rate)} with average wait ${cur.avg_wait_min.toFixed(1)} min — riders are abandoning long waits.`,
        action: 'Prioritise matching in high-wait zones; notify riders of ETAs.',
      });
    }
  }
  if (fleetTotal > 0) {
    alerts.push({
      id: 'fleet', sev: 'crit', icon: <Car className="h-4 w-4" />,
      title: `${fleetTotal} vehicles flagged for service`,
      detail: `${fleetTotal} vehicles predicted ≥50% likely to need service within 7 days${worstBrand ? ` — most concentrated in ${worstBrand}` : ''}. The highest-risk units are already at 85%+ (see the watch list).`,
      action: 'Pull the highest-risk vehicles for preventive maintenance before they fail in service.',
      ask: 'Which fleet brand has the most vehicles predicted to need service?',
    });
  }
  const overall: Tone = alerts.some((a) => a.sev === 'crit') ? 'crit' : alerts.some((a) => a.sev === 'warn') ? 'warn' : 'ok';
  const hasShortage = alerts.some((a) => a.id === 'shortage');
  const headline =
    overall === 'crit'
      ? hasShortage ? 'ELEVATED — active driver-shortage incident' : 'ELEVATED — incidents require attention'
      : overall === 'warn' ? 'WATCH — network under pressure' : 'NOMINAL — all systems healthy';

  const HOUR_LABELS = [0, 6, 12, 18, 23];

  return (
    <div className="space-y-5 w-full max-w-7xl mx-auto">
      {/* header + sim clock controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bb-header text-white shadow-sm">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground leading-tight">Live Operations Command Center</h2>
            <p className="text-sm text-muted-foreground">Real-time network health across Indonesia · recent 30 days</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground bg-card border rounded-md px-2.5 py-1.5 shadow-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {clock}
          </div>
          <Button variant={playing ? 'secondary' : 'default'} size="sm" onClick={() => setPlaying((p) => !p)} className="gap-1">
            {playing ? <><Pause className="h-3.5 w-3.5" /> Live</> : <><Play className="h-3.5 w-3.5" /> Paused</>}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setSimHour(18); setPlaying(false); }}>Jump to peak</Button>
        </div>
      </div>

      {err && <div className="text-destructive bg-destructive/10 p-3 rounded-md text-sm">Error loading operations feed: {err}</div>}

      {/* status banner */}
      {!loading && cur && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-3 border-l-4 ${TONE_BORDER[overall]} ${
          overall === 'crit' ? 'bg-red-500/10' : overall === 'warn' ? 'bg-amber-500/10' : 'bg-emerald-500/10'
        }`}>
          {overall === 'ok' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className={`h-5 w-5 ${TONE_TEXT[overall]}`} />}
          <div className={`font-semibold ${TONE_TEXT[overall]}`}>{headline}</div>
          <div className="text-sm text-muted-foreground ml-auto">{alerts.length} active alert{alerts.length === 1 ? '' : 's'}</div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading || !cur ? (
          ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => <Skeleton key={s} className="h-24 w-full" />)
        ) : (
          <>
            <StatTile label="No-Driver Rate" value={fmtPct(cur.no_driver_rate)} tone={toneNoDriver(cur.no_driver_rate)}
              delta={`${cur.no_driver_rate >= baseline.no_driver_rate ? '▲' : '▼'} vs ${fmtPct(baseline.no_driver_rate)} typical`} />
            <StatTile label="Avg Surge" value={`${cur.avg_surge.toFixed(2)}×`} tone={toneSurge(cur.avg_surge)}
              delta={`baseline ${baseline.avg_surge.toFixed(2)}×`} />
            <StatTile label="Cancellations" value={fmtPct(cur.cancel_rate)} tone={toneCancel(cur.cancel_rate)} />
            <StatTile label="Avg Wait" value={`${cur.avg_wait_min.toFixed(1)} min`} tone={toneWait(cur.avg_wait_min)} />
            <StatTile label="Trips This Hour" value={cur.trips.toLocaleString()} tone="ok" hint={`${cur.completed.toLocaleString()} completed`} />
            <StatTile label="Fleet At Risk" value={`${fleetTotal}`} tone={fleetTotal ? 'crit' : 'ok'} hint="≥50% service risk / 7d" />
          </>
        )}
      </div>

      {/* 24-hour timeline / scrubber */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            24-Hour Network Timeline
            <span className="text-xs font-normal text-muted-foreground">· no-driver rate by hour · click to scrub</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-14 w-full" /> : (
            <>
              <div className="flex gap-1">
                {byHour.map((h) => {
                  const t = toneNoDriver(h.no_driver_rate);
                  const active = h.hour === simHour;
                  return (
                    <button
                      key={h.hour}
                      onClick={() => { setSimHour(h.hour); setPlaying(false); }}
                      title={`${String(h.hour).padStart(2, '0')}:00 · no-driver ${fmtPct(h.no_driver_rate)}`}
                      className={`flex-1 rounded-sm transition-all ${active ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'hover:opacity-80'}`}
                      style={{ height: 40, backgroundColor: TONE_DOT[t], opacity: active ? 1 : 0.55 }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                {HOUR_LABELS.map((h) => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* map + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* live map */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Live Demand Map</CardTitle>
              <div className="flex gap-1 flex-wrap">
                {cities.map((c) => (
                  <button key={c} onClick={() => { setCity(c); setSelZone(null); }}
                    className={`text-xs rounded-md px-2 py-1 border transition-colors ${c === city ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:border-primary/50'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[300px] w-full" /> : (
              <>
                <ZoneMap zones={mapZones} selectedId={selZone?.zone_id ?? null} onSelect={setSelZone} />
                <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#10b981' }} /> healthy</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f59e0b' }} /> tight</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f97316' }} /> strained</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#dc2626' }} /> shortage</span>
                    <span className="ml-1">· bubble size = demand</span>
                  </div>
                  {selZone && (
                    <div className="text-xs text-foreground/80">
                      <span className="font-semibold">{selZone.area_name}</span> ({selZone.zone_type}) · demand {N(selZone.demand)} · no-driver {fmtPct(N(selZone.no_driver_rate))} · surge {N(selZone.avg_surge)}×
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* alert feed */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Alert Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 max-h-[420px] overflow-y-auto">
            {loading ? <Skeleton className="h-40 w-full" /> : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <div className="text-sm font-medium text-foreground">No active incidents</div>
                <div className="text-xs text-muted-foreground">Network operating within normal thresholds this hour.</div>
              </div>
            ) : alerts.map((a) => (
              <div key={a.id} className={`rounded-lg border border-l-4 ${TONE_BORDER[a.sev]} bg-card p-3`}>
                <div className={`flex items-center gap-2 font-semibold text-sm ${TONE_TEXT[a.sev]}`}>
                  {a.icon} {a.title}
                </div>
                <p className="text-xs text-foreground/80 mt-1">{a.detail}</p>
                <div className="text-xs mt-2 flex items-start gap-1.5">
                  <span className="text-muted-foreground shrink-0">▶ Recommended:</span>
                  <span className="text-foreground/90">{a.action}</span>
                </div>
                {a.ask && (
                  <Button variant="ghost" size="sm" className="mt-2 h-7 gap-1 text-primary"
                    onClick={() => { void navigate(`/ask?q=${encodeURIComponent(a.ask!)}`); }}>
                    <MessageSquare className="h-3.5 w-3.5" /> Ask Bluebird
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* city breakdown + fleet watch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base">City Health · {String(simHour).padStart(2, '0')}:00</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <div className="space-y-2">
                {cityAtHour.map((c) => {
                  const t = toneNoDriver(N(c.no_driver_rate));
                  return (
                    <div key={c.city} className="flex items-center gap-3">
                      <div className="w-24 text-sm font-medium text-foreground shrink-0">{c.city}</div>
                      <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${Math.min(N(c.no_driver_rate) * 100 * 3, 100)}%`, backgroundColor: TONE_DOT[t] }} />
                      </div>
                      <div className={`w-14 text-right text-sm font-semibold ${TONE_TEXT[t]}`}>{fmtPct(N(c.no_driver_rate))}</div>
                      <div className="w-16 text-right text-xs text-muted-foreground">{N(c.avg_surge).toFixed(2)}× surge</div>
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground pt-1">No-driver rate by city (bar scaled ×3 for contrast).</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4 text-primary" /> Fleet Health Watch</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart queryKey="risk_by_brand" parameters={{}} xKey="fleet_brand" yKey="at_risk_7d" height={130} orientation="horizontal" />
            <div className="mt-2">
              <DataTable queryKey="vehicles_at_risk" parameters={{}} filterColumn="vehicle_id" filterPlaceholder="Filter vehicle…" pageSize={5} />
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Simulated live view over the last 30 days of governed <span className="font-mono">trips_curated_gold</span> · fleet risk from the served AutoML model · all data Unity Catalog governed.
      </p>
    </div>
  );
}
