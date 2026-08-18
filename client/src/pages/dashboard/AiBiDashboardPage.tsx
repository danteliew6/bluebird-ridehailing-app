import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  useAnalyticsQuery,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { NavLink } from 'react-router';
import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

const WORKSPACE_HOST = 'https://fevm-dante-classic-stable.cloud.databricks.com';
const DASHBOARD_ID = '01f19a346c681fab81bcfcbdc0542f67';
const WORKSPACE_ID = '7474647641788932';
const EMBED_URL = `${WORKSPACE_HOST}/embed/dashboardsv3/${DASHBOARD_ID}?o=${WORKSPACE_ID}`;

interface Persona { key: string; email: string; label: string; scope: string; }
const PERSONAS: Persona[] = [
  { key: 'admin', email: 'dante.liew@databricks.com', label: 'Admin', scope: 'All cities · clear PII' },
  { key: 'analyst', email: 'analyst.national@bluebird.co.id', label: 'National Analyst', scope: 'All cities · masked PII' },
  { key: 'jakarta', email: 'jakarta.ops@bluebird.co.id', label: 'Jakarta Ops', scope: 'Jakarta only · masked PII' },
  { key: 'bali', email: 'bali.ops@bluebird.co.id', label: 'Bali Ops', scope: 'Denpasar only · masked PII' },
];

// Preview of the governed slice each identity sees — the same UC policy that the
// embedded dashboard, native charts and Genie all resolve against.
function GovernancePreview() {
  const [personaKey, setPersonaKey] = useState('jakarta');
  const persona = PERSONAS.find((p) => p.key === personaKey)!;
  const params = useMemo(() => ({ persona: sql.string(persona.email) }), [persona.email]);
  const summary = useAnalyticsQuery('persona_summary', params);
  const s = summary.data?.[0];
  const piiClear = String(s?.pii_visible) === 'true';

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div className="font-semibold text-foreground">Governed data access — consistent across every surface</div>
        </div>
        <p className="text-sm text-muted-foreground">
          The embedded AI/BI dashboard above, the white-labeled{' '}
          <NavLink to="/overview" className="text-primary underline underline-offset-2">Operations</NavLink>{' '}
          charts and{' '}
          <NavLink to="/ask" className="text-primary underline underline-offset-2">Ask Bluebird</NavLink>{' '}
          all read the same governed gold. Unity Catalog resolves column masks and city row-filters
          against the signed-in identity — so each user sees only their slice, no matter which surface
          they use. Pick a persona to preview what they&apos;d see.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {PERSONAS.map((p) => {
            const active = p.key === personaKey;
            return (
              <button key={p.key} onClick={() => setPersonaKey(p.key)}
                className={`text-left rounded-lg border p-2.5 transition-colors ${
                  active ? 'border-primary bg-accent ring-1 ring-primary' : 'bg-card hover:bg-muted'
                }`}>
                <div className="font-semibold text-sm text-foreground">{p.label}</div>
                <div className="text-[11px] mt-0.5 text-primary">{p.scope}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {summary.loading || !s ? (
            ['a', 'b', 'c'].map((x) => <Skeleton key={x} className="h-20 w-full" />)
          ) : (
            <>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">PII (RBAC)</div>
                <div className={`text-xl font-bold mt-1 ${piiClear ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {piiClear ? 'Clear' : 'Masked'}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cities (ABAC)</div>
                <div className="text-xl font-bold mt-1 text-foreground">{s.visible_cities} / 5</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Trips visible</div>
                <div className="text-xl font-bold mt-1 text-foreground">{Number(s.visible_trips).toLocaleString()}</div>
              </div>
            </>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Full side-by-side of masked columns &amp; filtered rows on the{' '}
          <NavLink to="/access" className="text-primary underline underline-offset-2">Data Access</NavLink> page.
        </p>
      </CardContent>
    </Card>
  );
}

export function AiBiDashboardPage() {
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI/BI Dashboard (embedded)</h2>
          <p className="text-sm text-muted-foreground">
            The same governed metrics as a managed Databricks AI/BI dashboard — embedded live,
            with native Databricks chrome, cross-filtering and “Ask Genie”.
          </p>
        </div>
        <Badge variant="secondary">Lakeview · embedded iframe</Badge>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          <strong>Two ways to surface the same data.</strong> This is the managed AI/BI dashboard
          embedded as-is (Databricks chrome, zero front-end code). The{' '}
          <NavLink to="/overview" className="text-primary underline underline-offset-2">Operations</NavLink>{' '}
          page renders the same governed metrics as fully white-labeled native charts. Same Unity
          Catalog source, two delivery styles — pick per audience.
        </AlertDescription>
      </Alert>

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <iframe
            title="Bluebird Ops AI/BI dashboard"
            src={EMBED_URL}
            className="w-full"
            style={{ height: 'min(1100px, 82vh)', border: 'none' }}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        If the embed prompts for sign-in, open it directly:{' '}
        <a href={`${WORKSPACE_HOST}/dashboardsv3/${DASHBOARD_ID}/published?o=${WORKSPACE_ID}`}
           target="_blank" rel="noopener noreferrer"
           className="text-primary underline underline-offset-2">open in Databricks →</a>
      </p>

      <GovernancePreview />
    </div>
  );
}
