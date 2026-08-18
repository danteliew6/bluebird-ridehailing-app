import {
  useGenieChat,
  GenieChatMessageList,
  GenieChatInput,
  Badge,
  Button,
  Alert,
  AlertDescription,
} from '@databricks/appkit-ui/react';
import { RotateCcw, Sparkles } from 'lucide-react';

const SUGGESTIONS = [
  'Revenue by city over the last 30 days',
  'Which fleet brand has the highest cancellation rate?',
  'Top 10 pickup zones in Jakarta',
  'Berapa rata-rata tarif per kota bulan ini?',
];

export function AskBluebirdPage() {
  const { messages, status, sendMessage, reset } = useGenieChat({ alias: 'default' });
  const busy = status === 'streaming' || status === 'loading-history';
  const empty = messages.length === 0;

  return (
    <div className="space-y-4 w-full max-w-4xl mx-auto">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bb-header text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground leading-tight">Ask Bluebird</h2>
            <p className="text-sm text-muted-foreground">Natural-language analytics · English or Bahasa Indonesia</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">AI/BI Genie · governed</Badge>
          {!empty && (
            <Button variant="ghost" size="sm" onClick={() => reset()} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> New chat
            </Button>
          )}
        </div>
      </div>

      {/* chat surface */}
      <div className="border rounded-xl bg-card shadow-sm flex flex-col h-[min(620px,70vh)] overflow-hidden">
        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-foreground">Ask about your ride-hailing operations</div>
              <div className="text-sm text-muted-foreground">Try one of these, or type your own question below.</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={busy}
                  className="text-left text-sm rounded-lg border bg-background hover:bg-accent hover:border-primary/50 transition-colors p-3 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <GenieChatMessageList messages={messages} status={status} />
          </div>
        )}
        <div className="border-t p-3">
          <GenieChatInput onSend={sendMessage} placeholder="Ask a question about trips, revenue, fleet…" />
        </div>
      </div>

      {status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">Something went wrong reaching Genie. Try rephrasing or start a new chat.</AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertDescription className="text-xs">
          AI-generated — verify against source data. Every query runs through Unity Catalog, so PII
          column masks and city row-filters are enforced on the results you see.
        </AlertDescription>
      </Alert>
    </div>
  );
}
