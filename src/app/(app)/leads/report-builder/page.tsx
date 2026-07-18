"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, PieChart, LineChart, Save, Eye, Plus, Filter } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ENTITY_TYPES = ["Lead", "Contact", "Company", "Deal", "Call log", "Task"];
const REPORT_TYPES = ["One Dimensional", "Multi Dimensional", "Goal vs Achievement", "Hierarchy"];
const CHART_TYPES = ["Bar", "Line", "Pie", "Doughnut", "Table"];
const DATE_RANGES = ["Current Month", "Last Month", "Current Quarter", "Last 30 Days", "Custom"];

export default function ReportBuilderPage() {
  const [reportName, setReportName] = useState("");
  const [entityType, setEntityType] = useState("Lead");
  const [reportType, setReportType] = useState("One Dimensional");
  const [chartType, setChartType] = useState("Bar");
  const [dateRange, setDateRange] = useState("Current Month");
  const [hasPreview, setHasPreview] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Create Report"
        subtitle="Build custom reports with dimensions, metrics, and filters."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => setHasPreview(true)}>
              <Eye className="h-3.5 w-3.5" /> Generate Preview
            </Button>
            <Button size="sm" className="gap-1.5 rounded-full">
              <Save className="h-3.5 w-3.5" /> Save Report
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        {/* Builder form */}
        <div className="space-y-5">
          {/* Basic Information */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Basic Information</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Report Name <span className="text-rose-500">*</span></Label>
                  <Input value={reportName} onChange={(e: any) => setReportName(e.target.value)} placeholder="e.g. Lead Source Performance" />
                </div>
                <div className="space-y-1.5">
                  <Label>Report Type <span className="text-rose-500">*</span></Label>
                  <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition">
                    {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition resize-none h-16" placeholder="What this report measures..." />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Entity Type</Label>
                  <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition">
                    {ENTITY_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Chart Type</Label>
                  <select value={chartType} onChange={(e) => setChartType(e.target.value)} className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition">
                    {CHART_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Date & Dimensions */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Date Range & Dimensions</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Date Filter</Label>
                  <select className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition">
                    <option>Created At</option><option>Updated At</option><option>Close Date</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date Range</Label>
                  <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition">
                    {DATE_RANGES.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Dimensions</Label>
                <select className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition">
                  <option>Choose dimension...</option><option>Source</option><option>Owner</option><option>Status</option><option>Priority</option><option>Company</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Metrics</Label>
                <select className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition">
                  <option>Choose metric...</option><option>Count</option><option>Sum of Value</option><option>Average Score</option><option>Conversion Rate</option>
                </select>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Filters</p>
            <div className="flex items-center gap-2">
              <select className="h-9 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition">
                <option>Add a filter...</option><option>Status</option><option>Source</option><option>Owner</option><option>Priority</option><option>Company</option>
              </select>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full"><Plus className="h-3.5 w-3.5" /> Add Filter</Button>
            </div>
          </div>
        </div>

        {/* Preview pane */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-card sticky top-24">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Report Preview</p>
          {hasPreview ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{reportName || "Untitled Report"}</p>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{chartType}</span>
              </div>
              {/* Mock chart preview */}
              <div className="flex h-[200px] items-end gap-2 rounded-xl bg-zinc-50 p-4">
                {[65, 42, 88, 55, 72, 38, 90].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.5, delay: 0.05 * i }}
                    className="flex-1 rounded-t-md bg-gradient-to-t from-[#4361EE] to-[#6780EE]"
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-zinc-50 p-3"><p className="text-lg font-bold tnum">124</p><p className="text-[10px] text-muted-foreground">Records</p></div>
                <div className="rounded-xl bg-zinc-50 p-3"><p className="text-lg font-bold tnum">7</p><p className="text-[10px] text-muted-foreground">Groups</p></div>
              </div>
            </div>
          ) : (
            <div className="flex h-[280px] flex-col items-center justify-center text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-zinc-50">
                <BarChart3 className="h-7 w-7 text-zinc-300" />
              </div>
              <p className="mt-3 text-sm font-semibold text-zinc-700">Add details to see a preview</p>
              <p className="mt-1 max-w-[220px] text-[12px] text-muted-foreground">
                Fill out the report fields and click "Generate Preview" to see your chart.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
