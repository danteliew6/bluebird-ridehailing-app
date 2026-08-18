// ============================================================================
// Bluebird architecture diagram — SINGLE SOURCE OF TRUTH.
// Edit this file to reconfigure the diagram: add/remove layers, nodes, edges,
// or change a node's category/detail. The Architecture page renders from here.
// ============================================================================

export type CategoryKey = 'source' | 'ingest' | 'quality' | 'govern' | 'serve';

export interface ArchNode {
  id: string;
  title: string;
  sub: string;
  icon: string; // emoji
  category: CategoryKey;
  detail: string; // shown in the inspector when the node is clicked
}

export interface ArchLayer {
  id: string;
  title: string;
  nodes: ArchNode[];
}

export interface ArchEdge {
  from: string;
  to: string;
  label?: string;
}

export const CATEGORIES: Record<CategoryKey, { label: string; color: string }> = {
  source: { label: 'Sources', color: '#64748B' },
  ingest: { label: 'Ingestion', color: '#1D6FB8' },
  quality: { label: 'Data quality', color: '#F2B705' },
  govern: { label: 'Governance', color: '#8E5AA6' },
  serve: { label: 'Serving & AI', color: '#0B3C8A' },
};

export const LAYERS: ArchLayer[] = [
  {
    id: 'sources',
    title: 'Sources',
    nodes: [
      { id: 'bigquery', title: 'BigQuery', sub: 'Warehouse (federated)', icon: '🗄️', category: 'source',
        detail: 'Existing Google BigQuery warehouse stays in place — queried via Lakehouse Federation, no migration required.' },
      { id: 'events', title: 'Trip & App Events', sub: 'Streaming / batch', icon: '📲', category: 'source',
        detail: 'Ride requests, driver matching and payment events from the Bluebird apps and dispatch systems.' },
      { id: 'telematics', title: 'Vehicle Telematics', sub: 'IoT sensors', icon: '🛰️', category: 'source',
        detail: 'Per-vehicle sensor readings: engine temperature, brake wear, battery voltage, fault codes.' },
    ],
  },
  {
    id: 'ingest',
    title: 'Ingest → Bronze',
    nodes: [
      { id: 'lakeflow_connect', title: 'Lakeflow Ingest', sub: 'Auto Loader / Connect', icon: '🔌', category: 'ingest',
        detail: 'Managed ingestion lands raw source data into the bronze layer — no self-built connectors to maintain.' },
      { id: 'bronze', title: 'Bronze', sub: 'Raw landing (~9% dirty)', icon: '🥉', category: 'ingest',
        detail: 'trip_events_bronze — raw, schema-on-read, intentionally contains ~9% quality defects to prove the cleansing story.' },
    ],
  },
  {
    id: 'cleanse',
    title: 'Cleanse → Gold',
    nodes: [
      { id: 'dq', title: 'Lakeflow Pipeline', sub: '6 DQ expectations', icon: '✅', category: 'quality',
        detail: 'Declarative pipeline with data-quality expectations; violating rows are dropped to a quarantine table with a labelled reason. Pipeline metrics are monitored.' },
      { id: 'silver', title: 'Silver', sub: 'Cleansed & conformed', icon: '🥈', category: 'quality',
        detail: 'trips_silver — typed, de-duplicated, conformed records that passed all quality rules.' },
      { id: 'gold', title: 'Gold Star Schema', sub: 'facts + dims', icon: '🥇', category: 'quality',
        detail: 'trips_curated_gold plus dim_/fact_ tables — the analytics-ready model powering BI, Genie and ML.' },
      { id: 'metrics', title: 'Metric Views', sub: 'Governed KPIs', icon: '📐', category: 'quality',
        detail: 'Reusable, governed KPI definitions (revenue, cancellation rate, surge, fleet health) shared across Genie and dashboards.' },
    ],
  },
  {
    id: 'serve',
    title: 'Serve & Consume',
    nodes: [
      { id: 'genie', title: 'Genie', sub: 'NL analytics (EN/Bahasa)', icon: '💬', category: 'serve',
        detail: 'Natural-language questions over the governed gold model, in English or Bahasa Indonesia, with auto-generated SQL and visualizations.' },
      { id: 'aibi', title: 'AI/BI Dashboards', sub: 'Self-service BI', icon: '📊', category: 'serve',
        detail: 'Managed Lakeview dashboards on the same governed metrics — embeddable and cross-filtered.' },
      { id: 'automl', title: 'AutoML + Serving', sub: 'Maintenance + forecast', icon: '🤖', category: 'serve',
        detail: 'AutoML predictive-maintenance model (served for real-time risk scoring) and a 7-day demand forecast.' },
      { id: 'app', title: 'Bluebird App', sub: 'This ops cockpit', icon: '🚕', category: 'serve',
        detail: 'The white-labeled Databricks App you are using now — native charts, Genie chat and live ML predictions.' },
    ],
  },
];

// Governance is cross-cutting — rendered as a band spanning the whole flow.
export const GOVERNANCE = {
  title: 'Unity Catalog — governance across every layer',
  points: [
    'PII column masks (name / phone / NIK)',
    'Attribute-based row filters (city scoping)',
    'End-to-end lineage bronze → gold → dashboard',
    'Tags, audit & one permission model for BI, AI and apps',
  ],
};

export const EDGES: ArchEdge[] = [
  { from: 'bigquery', to: 'lakeflow_connect' },
  { from: 'events', to: 'lakeflow_connect' },
  { from: 'telematics', to: 'lakeflow_connect' },
  { from: 'lakeflow_connect', to: 'bronze' },
  { from: 'bronze', to: 'dq' },
  { from: 'dq', to: 'silver', label: 'expectations' },
  { from: 'silver', to: 'gold' },
  { from: 'gold', to: 'metrics' },
  { from: 'gold', to: 'genie' },
  { from: 'gold', to: 'aibi' },
  { from: 'gold', to: 'automl' },
  { from: 'metrics', to: 'app' },
  { from: 'automl', to: 'app' },
];
