import {
  useGenieChat,
  GenieChatMessageList,
  GenieChatInput,
  Badge,
  Button,
  Alert,
  AlertDescription,
} from '@databricks/appkit-ui/react';
import { RotateCcw, Sparkles, MessageSquare, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

const SUGGESTIONS = [
  'Revenue by city over the last 30 days',
  'Which fleet brand has the highest cancellation rate?',
  'Top 10 pickup zones in Jakarta',
  'Berapa rata-rata tarif per kota bulan ini?',
];

// Native Databricks Genie space (same space that powers the white-labeled chat).
const WORKSPACE_HOST = 'https://fevm-dante-classic-stable.cloud.databricks.com';
const GENIE_SPACE_ID = '01f19a33de0a1111ab1e0302d7c0b8c7';
const WORKSPACE_ID = '7474647641788932';
const GENIE_URL = `${WORKSPACE_HOST}/genie/rooms/${GENIE_SPACE_ID}?o=${WORKSPACE_ID}`;

type Mode = 'native' | 'embedded';

export function AskBluebirdPage() {
  const { messages, status, sendMessage, reset } = useGenieChat({ alias: 'default' });
  const busy = status === 'streaming' || status === 'loading-history';
  const empty = messages.length === 0;
  const [mode, setMode] = useState<Mode>('native');

  // Deep-link: /ask?q=... (e.g. from a Command Center alert) auto-asks the question once.
  const [searchParams, setSearchParams] = useSearchParams();
  const seeded = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect --
     One-shot deep-link seeding: on mount, if ?q= is present (e.g. from a Command Center
     alert) switch to native mode, ask the question once, then clear the param. The ref
     guard makes this fire exactly once, not a cascading render loop. */
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !seeded.current) {
      seeded.current = true;
      setMode('native');
      sendMessage(q);
      searchParams.delete('q');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, sendMessage, setSearchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
          {mode === 'native' && !empty && (
            <Button variant="ghost" size="sm" onClick={() => reset()} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> New chat
            </Button>
          )}
        </div>
      </div>

      {/* delivery-style toggle */}
      <div className="inline-flex rounded-lg border bg-card p-1 shadow-sm">
        <button
          onClick={() => setMode('native')}
          className={`flex items-center gap-1.5 text-sm rounded-md px-3 py-1.5 transition-colors ${
            mode === 'native' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> White-labeled chat
        </button>
        <button
          onClick={() => setMode('embedded')}
          className={`flex items-center gap-1.5 text-sm rounded-md px-3 py-1.5 transition-colors ${
            mode === 'embedded' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Databricks Genie (embedded)
        </button>
      </div>

      {mode === 'native' ? (
        <>
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
              <GenieChatMessageList messages={messages} status={status} />
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
        </>
      ) : (
        <>
          <Alert>
            <AlertDescription className="text-xs">
              <strong>Same Genie space, two delivery styles.</strong> The white-labeled chat embeds
              this exact governed Genie space <em>inside</em> the app via the Conversation API — no
              Databricks chrome. This tab opens the native Databricks Genie experience for the same
              space so you can compare the raw product against the branded surface.
            </AlertDescription>
          </Alert>

          <div className="border rounded-xl bg-card shadow-sm p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[340px]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bb-header text-white shadow-sm">
              <Sparkles className="h-7 w-7" />
            </div>
            <div>
              <div className="font-semibold text-lg text-foreground">Bluebird Data Assistant · Databricks Genie</div>
              <p className="text-sm text-muted-foreground max-w-md mt-1">
                Opens the native Genie space in full Databricks chrome. (This workspace doesn&apos;t serve
                the <code>/embed/genie</code> route yet, so the raw product opens in a new tab rather than an iframe.)
              </p>
            </div>
            <a href={GENIE_URL} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 rounded-md bb-header text-white px-4 py-2 text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">
              Open Databricks Genie <ExternalLink className="h-4 w-4" />
            </a>
            <p className="text-xs text-muted-foreground max-w-md">
              Prefer it in-app? The{' '}
              <button onClick={() => setMode('native')} className="text-primary underline underline-offset-2">
                white-labeled chat
              </button>{' '}
              runs the same governed space natively — same Unity Catalog masks &amp; row-filters enforced.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
