/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Aggregation engine
   ──────────────────────────────────────────────────────────────────────────
   Generic, dataset-agnostic grouping + time-bucketing primitives that feed
   every report category chart/table AND the Custom Report Builder. Everything
   is derived from the filtered dataset — there are no precomputed figures.
   ────────────────────────────────────────────────────────────────────────── */

import type {
  ReportDataset,
  SeriesPoint,
  Granularity,
  DataSourceId,
  AggregationOp,
  CustomReportConfig,
} from "./types";
import { bucketKey, bucketLabel, parseDate, autoGranularity } from "./date-ranges";
import { rangeFromFilters, applyFilters } from "./filters";
import { DATA_SOURCES } from "./registry";
import { STATUS_LABEL, INVOICE_STATUS_LABEL } from "@/lib/mock-data";

/* ─── Time series ───────────────────────────────────────────────────────── */

export function seriesByTime<T>(
  records: T[],
  getDate: (r: T) => string | undefined,
  getValue: (r: T) => number,
  granularity: Granularity
): SeriesPoint[] {
  const buckets = new Map<string, number>();
  for (const r of records) {
    const d = parseDate(getDate(r));
    if (!d) continue;
    const key = bucketKey(d, granularity);
    buckets.set(key, (buckets.get(key) ?? 0) + getValue(r));
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({ key, label: bucketLabel(key, granularity), value }));
}

/* ─── Grouping ──────────────────────────────────────────────────────────── */

interface Acc {
  sum: number;
  count: number;
  min: number;
  max: number;
}

export function groupBy<T>(
  records: T[],
  getKey: (r: T) => string,
  getValue: (r: T) => number,
  op: AggregationOp = "sum"
): SeriesPoint[] {
  const map = new Map<string, Acc>();
  for (const r of records) {
    const key = (getKey(r) || "—").toString();
    const v = getValue(r);
    const a = map.get(key) ?? { sum: 0, count: 0, min: Infinity, max: -Infinity };
    a.sum += v;
    a.count += 1;
    a.min = Math.min(a.min, v);
    a.max = Math.max(a.max, v);
    map.set(key, a);
  }
  const resolve = (a: Acc): number => {
    switch (op) {
      case "count": return a.count;
      case "avg": return a.count ? a.sum / a.count : 0;
      case "min": return a.min === Infinity ? 0 : a.min;
      case "max": return a.max === -Infinity ? 0 : a.max;
      case "sum":
      default: return a.sum;
    }
  };
  return [...map.entries()]
    .map(([key, a]) => ({ key, label: key, value: resolve(a) }))
    .sort((x, y) => y.value - x.value);
}

export function topN(series: SeriesPoint[], n: number): SeriesPoint[] {
  return series.slice(0, n);
}

/* ─── Field resolution for the Custom Report Builder ────────────────────── */

/** Records for a data source, already filtered. */
export function recordsForSource(d: ReportDataset, source: DataSourceId): Record<string, unknown>[] {
  switch (source) {
    case "tickets": return d.tickets as unknown as Record<string, unknown>[];
    case "invoices": return d.invoices as unknown as Record<string, unknown>[];
    case "walkins": return d.walkIns as unknown as Record<string, unknown>[];
    case "inventory": return d.inventory as unknown as Record<string, unknown>[];
    case "expenses": return d.expenses as unknown as Record<string, unknown>[];
    case "customers": return d.customers as unknown as Record<string, unknown>[];
    case "employees": return d.team as unknown as Record<string, unknown>[];
    case "ledger": return d.ledgerTx as unknown as Record<string, unknown>[];
    default: return [];
  }
}

/** Resolve a display value for a field key on a record (handles status labels). */
export function resolveFieldValue(source: DataSourceId, rec: Record<string, unknown>, key: string): string | number {
  if (key === "__stockValue") {
    return Number(rec.currentStock ?? 0) * Number(rec.regularBuyingPrice ?? 0);
  }
  const raw = rec[key];
  if (raw == null) return "";
  if (source === "tickets" && key === "status") return STATUS_LABEL[raw as keyof typeof STATUS_LABEL] ?? String(raw);
  if (source === "invoices" && key === "status") return INVOICE_STATUS_LABEL[raw as keyof typeof INVOICE_STATUS_LABEL] ?? String(raw);
  if (typeof raw === "number") return raw;
  return String(raw);
}

/** The grouping key for a record given a group dimension. */
function resolveGroupKey(source: DataSourceId, rec: Record<string, unknown>, groupBy: string, g: Granularity): string {
  if (groupBy === "__date") {
    const dateField = DATA_SOURCES[source].dateField;
    const d = parseDate(rec[dateField] as string);
    return d ? bucketKey(d, g) : "—";
  }
  const v = resolveFieldValue(source, rec, groupBy);
  return (v === "" ? "—" : String(v));
}

/** Numeric accessor for a metric key. `__count` → 1, `__stockValue` derived. */
function resolveMetric(source: DataSourceId, rec: Record<string, unknown>, metric: string): number {
  if (metric === "__count") return 1;
  if (metric === "__stockValue") return Number(rec.currentStock ?? 0) * Number(rec.regularBuyingPrice ?? 0);
  return Number(rec[metric] ?? 0);
}

export interface CustomReportResult {
  mode: "grouped" | "detail";
  columns: { key: string; label: string; numeric: boolean }[];
  rows: (string | number)[][];
  series: SeriesPoint[];
}

/** Execute a saved/draft custom report config against the dataset.
 *  Returns both a table (rows/columns) and a chartable series. */
export function runCustomReport(config: CustomReportConfig, full: ReportDataset): CustomReportResult {
  const range = rangeFromFilters(config.filters);
  const filtered = applyFilters(full, config.filters, range);
  const source = config.dataSource;
  const def = DATA_SOURCES[source];
  const recs = recordsForSource(filtered, source);

  const g = autoGranularity(range);

  // Grouped mode (chart or aggregated table) when a groupBy dimension is set.
  if (config.groupBy && config.visualization !== "table") {
    const metricKey = config.metric ?? def.metrics[0]?.key ?? "__count";
    const series = groupByGeneric(source, recs, config.groupBy, metricKey, config.aggregation, g);
    const metricLabel = def.metrics.find((m) => m.key === metricKey)?.label ?? "Value";
    const groupLabel = def.groupBy.find((x) => x.key === config.groupBy)?.label ?? "Group";
    return {
      mode: "grouped",
      columns: [
        { key: "label", label: groupLabel, numeric: false },
        { key: "value", label: metricLabel, numeric: true },
      ],
      rows: series.map((s) => [s.label, s.value]),
      series,
    };
  }

  // Grouped table (groupBy set + table viz)
  if (config.groupBy && config.visualization === "table") {
    const metricKey = config.metric ?? def.metrics[0]?.key ?? "__count";
    const series = groupByGeneric(source, recs, config.groupBy, metricKey, config.aggregation, g);
    const metricLabel = def.metrics.find((m) => m.key === metricKey)?.label ?? "Value";
    const groupLabel = def.groupBy.find((x) => x.key === config.groupBy)?.label ?? "Group";
    return {
      mode: "grouped",
      columns: [
        { key: "label", label: groupLabel, numeric: false },
        { key: "value", label: metricLabel, numeric: true },
      ],
      rows: series.map((s) => [s.label, s.value]),
      series,
    };
  }

  // Detail mode — raw rows with the chosen columns.
  const fields = config.fields.length ? config.fields : def.fields.slice(0, 6).map((f) => f.key);
  const columns = fields.map((key) => {
    const fd = def.fields.find((f) => f.key === key);
    return { key, label: fd?.label ?? key, numeric: fd?.kind === "currency" || fd?.kind === "number" };
  });
  const rows = recs.slice(0, 1000).map((rec) => fields.map((key) => resolveFieldValue(source, rec, key)));
  return { mode: "detail", columns, rows, series: [] };
}

function groupByGeneric(
  source: DataSourceId,
  recs: Record<string, unknown>[],
  groupKey: string,
  metricKey: string,
  op: AggregationOp,
  g: Granularity
): SeriesPoint[] {
  const series = groupBy(
    recs,
    (r) => resolveGroupKey(source, r, groupKey, g),
    (r) => resolveMetric(source, r, metricKey),
    op
  );
  // Time buckets should be chronological; categorical stays value-sorted.
  if (groupKey === "__date") {
    return series
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((s) => ({ ...s, label: bucketLabel(s.key, g) }));
  }
  return series;
}
