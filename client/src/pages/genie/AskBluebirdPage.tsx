import { GenieChat, Alert, AlertDescription, Badge } from '@databricks/appkit-ui/react';

export function AskBluebirdPage() {
  return (
    <div className="space-y-4 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Ask Bluebird</h2>
          <p className="text-sm text-muted-foreground">
            Natural-language analytics over ride-hailing operations — ask in English or Bahasa Indonesia.
          </p>
        </div>
        <Badge variant="secondary">AI/BI Genie · governed data</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div className="rounded-md border bg-card p-2">“Revenue by city over the last 30 days”</div>
        <div className="rounded-md border bg-card p-2">“Which fleet brand has the highest cancellation rate?”</div>
        <div className="rounded-md border bg-card p-2">“Berapa rata-rata tarif per kota?”</div>
      </div>

      <div className="h-[min(600px,68vh)] border rounded-lg overflow-hidden bg-card">
        <GenieChat alias="default" />
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          AI-generated answers — always verify against the underlying data. Queries run through
          Unity Catalog, so column masks (PII) and row-level policies are enforced on every result.
        </AlertDescription>
      </Alert>
    </div>
  );
}
