import {
  useAnalyticsQuery,
  BarChart,
  DataTable,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Badge,
  Alert,
  AlertDescription,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface Persona {
  key: string;
  email: string;
  label: string;
  role: string;
  scope: string;
}

const PERSONAS: Persona[] = [
  { key: 'admin', email: 'dante.liew@databricks.com', label: 'Admin', role: 'Platform admin', scope: 'All cities · clear PII' },
  { key: 'analyst', email: 'analyst.national@bluebird.co.id', label: 'National Analyst', role: 'HQ analytics', scope: 'All cities · masked PII' },
  { key: 'jakarta', email: 'jakarta.ops@bluebird.co.id', label: 'Jakarta Ops', role: 'Regional ops', scope: 'Jakarta only · masked PII' },
  { key: 'bali', email: 'bali.ops@bluebird.co.id', label: 'Bali Ops', role: 'Regional ops', scope: 'Denpasar only · masked PII' },
];

function StatCard({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-foreground';
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export function DataAccessPage() {
  const [personaKey, setPersonaKey] = useState('jakarta');
  const persona = PERSONAS.find((p) => p.key === personaKey)!;
  const params = useMemo(() => ({ persona: sql.string(persona.email) }), [persona.email]);

  const who = useAnalyticsQuery('whoami', {});
  const summary = useAnalyticsQuery('persona_summary', params);
  const s = summary.data?.[0];
  // analytics serializes booleans as strings ("true"/"false") — coerce explicitly
  const piiClear = String(s?.pii_visible) === 'true';
  const allCities = s?.allowed_city === 'ALL';

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Governed Data Access — RBAC + ABAC</h2>
          <p className="text-sm text-muted-foreground">
            One dataset, four identities. Unity Catalog enforces column masks (RBAC) and
            row-level city scoping (ABAC) — switch persona to see the same tables change.
          </p>
        </div>
        <Badge variant="secondary">Unity Catalog · column masks + row filter</Badge>
      </div>

      {/* persona switcher */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {PERSONAS.map((p) => {
          const active = p.key === personaKey;
          return (
            <button
              key={p.key}
              onClick={() => setPersonaKey(p.key)}
              className={`text-left rounded-lg border p-3 transition-colors ${
                active ? 'border-primary bg-accent ring-1 ring-primary' : 'bg-card hover:bg-muted'
              }`}
            >
              <div className="font-semibold text-sm text-foreground">{p.label}</div>
              <div className="text-xs text-muted-foreground">{p.role}</div>
              <div className="text-xs mt-1 text-primary">{p.scope}</div>
            </button>
          );
        })}
      </div>

      {/* access summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summary.loading || !s ? (
          ['a', 'b', 'c', 'd'].map((x) => <Skeleton key={x} className="h-24 w-full" />)
        ) : (
          <>
            <StatCard label="Identity" value={persona.label} />
            <StatCard label="PII Visible (RBAC)" value={piiClear ? 'Clear' : 'Masked'} tone={piiClear ? 'good' : 'warn'} />
            <StatCard label="Cities Visible (ABAC)" value={`${s.visible_cities} / 5`} />
            <StatCard label="Trips Visible" value={Number(s.visible_trips).toLocaleString()} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RBAC: PII masking */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Driver PII — column masks (RBAC)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {persona.label} {piiClear ? 'is privileged → sees clear name / phone / NIK.' : 'sees partially-masked name & phone, fully-redacted NIK.'}
            </p>
            <DataTable queryKey="persona_drivers" parameters={params} filterColumn="driver_id" filterPlaceholder="Filter driver…" pageSize={6} />
          </CardContent>
        </Card>

        {/* ABAC: row scoping */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Trips by City — row filter (ABAC)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {persona.label} {allCities ? 'sees every city.' : `is scoped to ${s?.allowed_city} — other cities are filtered out entirely.`}
            </p>
            <BarChart queryKey="persona_trips_by_city" parameters={params} xKey="city" yKey="trips" height={260} />
          </CardContent>
        </Card>
      </div>

      <Alert>
        <AlertDescription className="text-xs space-y-1">
          <div>
            <strong>How it works.</strong> The same Unity Catalog tables (<code>dim_driver</code>,
            <code> fact_trip</code>) carry a column mask on name/phone/NIK and a row filter on city.
            Both resolve against the caller&apos;s identity via <code>current_user()</code> — no per-persona
            copies of the data. This app runs as <code>{who.data?.[0]?.identity ?? '…'}</code>; the
            switcher above simulates each persona&apos;s governed view so you can compare them side-by-side.
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
