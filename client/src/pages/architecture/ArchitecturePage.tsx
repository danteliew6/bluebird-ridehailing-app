import { Card, CardContent, Badge } from '@databricks/appkit-ui/react';
import type { ReactNode } from 'react';

function Stage({ n, title, sub, items, tone = 'blue' }: { n: string; title: string; sub: string; items: string[]; tone?: 'blue' | 'gold' | 'slate' }) {
  const ring =
    tone === 'gold' ? 'border-amber-400/60' : tone === 'slate' ? 'border-slate-400/50' : 'border-primary/50';
  return (
    <div className={`flex-1 min-w-[150px] rounded-lg border ${ring} bg-card p-3 shadow-sm`}>
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">{n}</span>
        <span className="font-semibold text-sm text-foreground">{title}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      <ul className="mt-2 space-y-1">
        {items.map((it) => (
          <li key={it} className="text-xs text-foreground/80 flex gap-1"><span className="text-primary">•</span>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function Arrow() {
  return <div className="hidden md:flex items-center text-primary/60 text-xl shrink-0" aria-hidden>→</div>;
}

function Consumer({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4">
        <div className="text-2xl">{icon}</div>
        <div className="font-semibold text-sm mt-1 text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function Band({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-accent/40 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">{label}</div>
      <div className="text-xs text-foreground/80">{children}</div>
    </div>
  );
}

export function ArchitecturePage() {
  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">End-to-End Architecture</h2>
          <p className="text-sm text-muted-foreground">
            How Bluebird data flows on one governed Lakehouse — ingest → cleanse → govern → serve.
          </p>
        </div>
        <Badge variant="secondary">One platform · Unity Catalog governed</Badge>
      </div>

      {/* Pipeline flow */}
      <Card className="shadow-sm">
        <CardContent className="pt-5">
          <div className="flex flex-col md:flex-row md:items-stretch gap-2">
            <Stage n="1" title="Sources" sub="Ingest" tone="slate"
              items={['BigQuery warehouse', 'Trip / app events', 'Vehicle telematics']} />
            <Arrow />
            <Stage n="2" title="Bronze" sub="Raw landing"
              items={['trip_events_bronze', 'Schema-on-read', '~9% dirty rows']} />
            <Arrow />
            <Stage n="3" title="Lakeflow DQ" sub="Cleanse + monitor" tone="gold"
              items={['6 expectations', 'Quarantine table', 'Pipeline metrics']} />
            <Arrow />
            <Stage n="4" title="Silver → Gold" sub="Conformed star"
              items={['trips_curated_gold', 'dim_/fact_ model', 'Metric views']} />
            <Arrow />
            <Stage n="5" title="Consume" sub="Self-service + AI" tone="gold"
              items={['Genie · AI/BI', 'AutoML · App', 'Governed everywhere']} />
          </div>
        </CardContent>
      </Card>

      {/* Governance band spanning the flow */}
      <Band label="Unity Catalog — governance across every layer">
        Column masks on PII (name / phone / NIK) · attribute-based row filters (city scoping) ·
        end-to-end lineage bronze→gold→dashboard · tags &amp; audit · one permission model for BI, AI and apps.
      </Band>

      {/* Consumers */}
      <div>
        <div className="text-sm font-semibold text-foreground mb-2">Serving layer — the payoff</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Consumer icon="💬" title="Genie" sub="NL analytics (EN/Bahasa)" />
          <Consumer icon="📊" title="AI/BI Dashboards" sub="Governed self-service BI" />
          <Consumer icon="🤖" title="AutoML + Serving" sub="Maintenance + demand forecast" />
          <Consumer icon="🚕" title="This App" sub="White-labeled ops cockpit" />
        </div>
      </div>

      {/* Competitive framing */}
      <Card className="shadow-sm">
        <CardContent className="pt-5">
          <div className="text-sm font-semibold text-foreground mb-2">Replaces a fragmented stack</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-md border bg-card p-3">
              <div className="font-semibold text-muted-foreground">Before</div>
              <div className="mt-1 text-foreground/80">BigQuery warehouse · QuickSuite BI · self-built OSS pipelines, monitoring, governance &amp; MLflow — stitched together.</div>
            </div>
            <div className="rounded-md border bg-card p-3">
              <div className="font-semibold text-muted-foreground">The gap</div>
              <div className="mt-1 text-foreground/80">Governance &amp; pipeline monitoring rebuilt on OSS; dirty data blocks self-service analytics.</div>
            </div>
            <div className="rounded-md border border-primary/50 bg-accent/40 p-3">
              <div className="font-semibold text-primary">After — Databricks</div>
              <div className="mt-1 text-foreground/80">One governed Lakehouse: managed pipelines + DQ, Unity Catalog governance, Genie, AI/BI, AutoML and apps — BigQuery stays as a source via federation.</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
