/* eslint-disable react-hooks/set-state-in-effect --
   This diagram measures the laid-out DOM to draw SVG connectors, then commits the
   computed paths to state — via a layout effect and async resize/observer callbacks
   (which run outside React's commit phase, where setState is expected). */
import { Card, CardContent, Badge, Button } from '@databricks/appkit-ui/react';
import { ArrowRight } from 'lucide-react';
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
      // node centers relative to the container
      const acx = ar.left - cr.left + ar.width / 2;
      const acy = ar.top - cr.top + ar.height / 2;
      const bcx = br.left - cr.left + br.width / 2;
      const bcy = br.top - cr.top + br.height / 2;
      const dx = bcx - acx;
      const dy = bcy - acy;

      // Pick anchors from geometry so same-column (vertical) hops connect
      // bottom→top and cross-column hops connect right/left→left/right —
      // otherwise a same-column edge curls backward.
      let x1: number, y1: number, x2: number, y2: number;
      let c1x: number, c1y: number, c2x: number, c2y: number;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const dir = dx >= 0 ? 1 : -1; // 1 = B is to the right
        x1 = dir > 0 ? ar.right - cr.left : ar.left - cr.left;
        y1 = acy;
        x2 = dir > 0 ? br.left - cr.left : br.right - cr.left;
        y2 = bcy;
        const off = Math.max(24, Math.abs(x2 - x1) / 2);
        c1x = x1 + dir * off; c1y = y1; c2x = x2 - dir * off; c2y = y2;
      } else {
        const dir = dy >= 0 ? 1 : -1; // 1 = B is below
        x1 = acx;
        y1 = dir > 0 ? ar.bottom - cr.top : ar.top - cr.top;
        x2 = bcx;
        y2 = dir > 0 ? br.top - cr.top : br.bottom - cr.top;
        const off = Math.max(18, Math.abs(y2 - y1) / 2);
        c1x = x1; c1y = y1 + dir * off; c2x = x2; c2y = y2 - dir * off;
      }
      next.push({ from: e.from, to: e.to, label: e.label, d: `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}` });
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

      {/* competitive framing — before → after, graphical */}
      <Card className="shadow-sm">
        <CardContent className="pt-5">
          <div className="text-sm font-semibold text-foreground mb-4">One governed platform replaces a fragmented stack</div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
            {/* BEFORE */}
            <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Before · 6 disconnected systems
              </div>
              <div className="flex flex-wrap gap-2">
                {['BigQuery', 'QuickSuite BI', 'Amazon Q', 'OSS pipelines', 'OSS MLflow', 'OSS monitoring', 'OSS governance'].map((t) => (
                  <span key={t} className="text-[11px] rounded-md border border-muted-foreground/30 bg-card px-2 py-1 text-muted-foreground line-through decoration-red-400/70">
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-red-500/80 mt-3">Stitched together · governance &amp; monitoring rebuilt on OSS</div>
            </div>

            {/* ARROW */}
            <div className="flex md:flex-col items-center justify-center gap-1 text-primary">
              <ArrowRight className="h-7 w-7 rotate-90 md:rotate-0" />
              <span className="text-[11px] font-semibold">Databricks</span>
            </div>

            {/* AFTER */}
            <div className="rounded-lg border-2 p-4" style={{ borderColor: CATEGORIES.serve.color, backgroundColor: `${CATEGORIES.serve.color}0F` }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: CATEGORIES.serve.color }}>
                After · one governed Lakehouse
              </div>
              <div className="flex flex-wrap gap-2">
                {['Lakeflow + DQ', 'Unity Catalog', 'Genie', 'AI/BI', 'AutoML + Serving', 'Databricks Apps'].map((t) => (
                  <span key={t} className="text-[11px] rounded-md px-2 py-1 font-medium"
                        style={{ backgroundColor: `${CATEGORIES.serve.color}1A`, color: CATEGORIES.serve.color }}>
                    ✓ {t}
                  </span>
                ))}
              </div>
              <div className="text-[11px] mt-3" style={{ color: CATEGORIES.serve.color }}>BigQuery stays a source via federation — no rip-and-replace</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
