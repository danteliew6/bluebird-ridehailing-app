/* eslint-disable react-hooks/set-state-in-effect --
   This diagram measures the laid-out DOM to draw SVG connectors, then commits the
   computed paths to state — via a layout effect and async resize/observer callbacks
   (which run outside React's commit phase, where setState is expected). */
import { Card, CardContent, Badge, Button } from '@databricks/appkit-ui/react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { LAYERS, EDGES, CATEGORIES, GOVERNANCE } from './archConfig';
import type { ArchNode, CategoryKey } from './archConfig';

interface EdgePath {
  from: string;
  to: string;
  d: string;
  label?: string;
}

const NODE_BY_ID: Record<string, ArchNode> = Object.fromEntries(
  LAYERS.flatMap((l) => l.nodes).map((n) => [n.id, n]),
);

export function ArchitecturePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [paths, setPaths] = useState<EdgePath[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showGov, setShowGov] = useState(true);

  const setNodeRef = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  const recompute = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const cr = cont.getBoundingClientRect();
    const next: EdgePath[] = [];
    for (const e of EDGES) {
      const a = nodeRefs.current.get(e.from);
      const b = nodeRefs.current.get(e.to);
      if (!a || !b) continue;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const x1 = ar.right - cr.left;
      const y1 = ar.top - cr.top + ar.height / 2;
      const x2 = br.left - cr.left;
      const y2 = br.top - cr.top + br.height / 2;
      const dx = Math.max(28, (x2 - x1) / 2);
      next.push({ from: e.from, to: e.to, label: e.label, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` });
    }
    setPaths(next);
  }, []);

  useLayoutEffect(() => {
    recompute();
    const cont = containerRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(cont);
    window.addEventListener('resize', recompute);
    // recompute once more after fonts/layout settle
    const t = setTimeout(recompute, 200);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
      clearTimeout(t);
    };
  }, [recompute]);

  const selNode = selected ? NODE_BY_ID[selected] : null;
  const isEdgeActive = (e: EdgePath) => selected != null && (e.from === selected || e.to === selected);
  const isNodeDimmed = (id: string) =>
    selected != null && id !== selected && !EDGES.some((e) => (e.from === selected && e.to === id) || (e.to === selected && e.from === id));

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">End-to-End Architecture</h2>
          <p className="text-sm text-muted-foreground">
            Ingest → cleanse → govern → serve on one Lakehouse. Click any component to inspect it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={showGov ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowGov((v) => !v)}>
            {showGov ? 'Hide' : 'Show'} governance
          </Button>
          {selected && <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Clear selection</Button>}
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.keys(CATEGORIES) as CategoryKey[]).map((k) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORIES[k].color }} />
            {CATEGORIES[k].label}
          </div>
        ))}
      </div>

      {/* diagram */}
      <Card className="shadow-sm">
        <CardContent className="pt-5 overflow-x-auto">
          <div ref={containerRef} className="relative min-w-[900px]">
            {/* connectors */}
            <svg className="absolute inset-0 h-full w-full pointer-events-none" style={{ overflow: 'visible' }} aria-hidden>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" className="text-primary/50" />
                </marker>
                <marker id="arrow-active" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" className="text-primary" />
                </marker>
              </defs>
              {paths.map((e) => {
                const active = isEdgeActive(e);
                return (
                  <path
                    key={`${e.from}-${e.to}`}
                    d={e.d}
                    fill="none"
                    strokeWidth={active ? 2.5 : 1.5}
                    className={active ? 'text-primary' : 'text-primary/30'}
                    stroke="currentColor"
                    markerEnd={active ? 'url(#arrow-active)' : 'url(#arrow)'}
                    strokeDasharray={selected && !active ? '4 4' : undefined}
                  />
                );
              })}
            </svg>

            {/* columns */}
            <div className="relative grid grid-cols-4 gap-x-10">
              {LAYERS.map((layer) => (
                <div key={layer.id} className="flex flex-col gap-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{layer.title}</div>
                  {layer.nodes.map((n) => {
                    const cat = CATEGORIES[n.category];
                    const active = selected === n.id;
                    return (
                      <button
                        key={n.id}
                        ref={setNodeRef(n.id)}
                        onClick={() => setSelected(active ? null : n.id)}
                        className={`relative z-10 text-left rounded-lg border bg-card p-3 shadow-sm transition-all ${
                          active ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'
                        } ${isNodeDimmed(n.id) ? 'opacity-45' : ''}`}
                        style={{ borderTopColor: cat.color, borderTopWidth: 3 }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl leading-none">{n.icon}</span>
                          <span className="font-semibold text-sm text-foreground">{n.title}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">{n.sub}</div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* governance band */}
            {showGov && (
              <div className="relative z-10 mt-6 rounded-lg border border-dashed p-3"
                   style={{ borderColor: CATEGORIES.govern.color, backgroundColor: `${CATEGORIES.govern.color}12` }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: CATEGORIES.govern.color }}>
                  {GOVERNANCE.title}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {GOVERNANCE.points.map((p) => (
                    <span key={p} className="text-xs text-foreground/80">• {p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* inspector */}
      {selNode ? (
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{selNode.icon}</span>
              <div>
                <div className="font-semibold text-foreground">{selNode.title}</div>
                <div className="text-xs" style={{ color: CATEGORIES[selNode.category].color }}>
                  {CATEGORIES[selNode.category].label} · {selNode.sub}
                </div>
              </div>
              <Badge variant="secondary" className="ml-auto">Unity Catalog governed</Badge>
            </div>
            <p className="text-sm text-foreground/80 mt-3">{selNode.detail}</p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground text-center">Select a component above to see what it does and how it fits the flow.</p>
      )}

      {/* competitive framing */}
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
            <div className="rounded-md border p-3" style={{ borderColor: CATEGORIES.serve.color }}>
              <div className="font-semibold" style={{ color: CATEGORIES.serve.color }}>After — Databricks</div>
              <div className="mt-1 text-foreground/80">One governed Lakehouse: managed pipelines + DQ, Unity Catalog governance, Genie, AI/BI, AutoML and apps — BigQuery stays as a source via federation.</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
