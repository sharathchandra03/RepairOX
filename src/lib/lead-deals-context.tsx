"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Deal / Discount-Approval data context (Supabase-first, dual-mode).

   Mirrors leads-context.tsx exactly: Supabase-first with a transparent
   localStorage fallback, Realtime full-refetch, schema-drift / missing-table
   resilience, optimistic writes, logActivity + notify side effects. A DEAL is
   the approval workflow attached to a Lead — it never duplicates the Lead, the
   Customer, or the Sales Agent attribution.

   Exposes: deals, comments, revisions, hydrated, mode, and the operations
     • requestDeal(lead, draft)        — Discounted Lead → create a request
     • resubmitDeal(dealId, draft)     — revise + resubmit after Changes
     • approveDeal / rejectDeal / requestChanges / cancelDeal
     • addDealComment
     • dealsForLead / currentDeal / commentsForDeal / revisionsForDeal
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { demoKey } from "@/lib/demo-mode";
import { toast } from "@/components/ui/toaster";
import { logActivity } from "@/lib/activity-log";
import { notify } from "@/lib/notifications";
import {
  type LeadDeal, type LeadDealComment, type LeadDealRevision, type LeadDealRequestDraft,
  type DealStatus,
  rowToLeadDeal, leadDealToRow, rowToLeadDealComment, rowToLeadDealRevision,
  currentDealForLead, leadHasOpenDeal, canDecideDeal,
  formatDealDiscount, DEAL_STATUS_LABEL,
} from "@/lib/lead-deals";
import type { Lead } from "@/lib/leads-data";

/* The roles that review discount requests (used only to TARGET notifications —
   never a security gate; the DB guard + CAP are the real boundary). */
const APPROVER_ROLES = ["master_shop_owner", "shop_owner_branch_manager", "platform_owner", "developer_admin"];

/* ─── Local-storage keys (prototype mode) ─────────────────────────────── */
const DEALS_KEY = "repairox-lead-deals";
const DEAL_COMMENTS_KEY = "repairox-lead-deal-comments";
const DEAL_REVISIONS_KEY = "repairox-lead-deal-revisions";
const DEAL_SEQ_KEY = "repairox-lead-deal-seq";

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(demoKey(key)); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function writeLS(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(demoKey(key), JSON.stringify(value)); } catch { /* ignore quota */ }
}

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /relation .* does not exist/i.test(err.message ?? "");
}
function isUndefinedColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(err.message ?? "");
}

/* ─── Context shape ───────────────────────────────────────────────────── */

interface DealsContextValue {
  deals: LeadDeal[];
  comments: LeadDealComment[];
  revisions: LeadDealRevision[];
  hydrated: boolean;
  mode: "db" | "local";

  dealsForLead: (leadId: string) => LeadDeal[];
  /** The current (most-recent) deal for a lead, or undefined. */
  currentDeal: (leadId: string) => LeadDeal | undefined;
  commentsForDeal: (dealId: string) => LeadDealComment[];
  revisionsForDeal: (dealId: string) => LeadDealRevision[];
  dealById: (dealId: string) => LeadDeal | undefined;

  /** Create a discount-approval request for a lead (Discounted Lead trigger).
   *  Guards against a duplicate open request. Returns the created deal or null. */
  requestDeal: (lead: Lead, draft: LeadDealRequestDraft) => Promise<LeadDeal | null>;
  /** Revise & resubmit a changes-requested deal (increments revision). */
  resubmitDeal: (dealId: string, draft: LeadDealRequestDraft) => Promise<boolean>;
  /** Approve a deal (optionally with a different approved discount + comment). */
  approveDeal: (dealId: string, opts: { approvedDiscount: number | null; approvedDiscountType: "amount" | "percent"; comment?: string }) => Promise<boolean>;
  /** Reject a deal (mandatory reason). */
  rejectDeal: (dealId: string, reason: string) => Promise<boolean>;
  /** Request changes (mandatory comment). */
  requestChanges: (dealId: string, comment: string) => Promise<boolean>;
  /** Cancel an open deal (kept as history). */
  cancelDeal: (dealId: string, reason?: string) => Promise<boolean>;
  /** Post an internal approval-thread comment. */
  addDealComment: (dealId: string, body: string) => Promise<void>;
}

const DealsContext = createContext<DealsContextValue | null>(null);

/* ─── Provider ────────────────────────────────────────────────────────── */

export function DealsProvider({ children }: { children: ReactNode }) {
  const { authReady, can } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();
  // Top-authority owner (full_access / platform owner / org admin) — the one
  // explicit case allowed to decide a deal they themselves raised (§22).
  const isOwner = can("full_access");
  const isOwnerRef = useRef(isOwner);
  isOwnerRef.current = isOwner;

  const [deals, setDeals] = useState<LeadDeal[]>([]);
  const [comments, setComments] = useState<LeadDealComment[]>([]);
  const [revisions, setRevisions] = useState<LeadDealRevision[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const useDb = isSupabaseConfigured && !!supabase;
  const db = supabase!;

  const dealsRef = useRef<LeadDeal[]>([]);
  dealsRef.current = deals;
  const seqRef = useRef<number>(0);
  const meIdRef = useRef<string | undefined>(currentUserId);
  meIdRef.current = currentUserId;
  const meNameRef = useRef<string>(currentUserName);
  meNameRef.current = currentUserName;

  /* ── Hydration ── */
  useEffect(() => {
    let active = true;
    async function loadFromDb() {
      const [
        { data: dealRows, error: dealErr },
        { data: commentRows, error: commentErr },
        { data: revRows, error: revErr },
      ] = await Promise.all([
        db.from("lead_deals").select("*").order("created_at", { ascending: false }),
        db.from("lead_deal_comments").select("*").order("created_at", { ascending: true }),
        db.from("lead_deal_revisions").select("*").order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      if (!dealErr && dealRows) setDeals(dealRows.map(rowToLeadDeal));
      else if (dealErr && !isMissingTableError(dealErr)) console.error("[deals] loading deals failed:", dealErr.message);
      if (!commentErr && commentRows) setComments(commentRows.map(rowToLeadDealComment));
      else if (commentErr && !isMissingTableError(commentErr)) console.error("[deals] loading comments failed:", commentErr.message);
      if (!revErr && revRows) setRevisions(revRows.map(rowToLeadDealRevision));
      else if (revErr && !isMissingTableError(revErr)) console.error("[deals] loading revisions failed:", revErr.message);
      setHydrated(true);
    }

    if (useDb) {
      if (!authReady) return;
      loadFromDb();
    } else {
      setDeals(readLS<LeadDeal[]>(DEALS_KEY, []));
      setComments(readLS<LeadDealComment[]>(DEAL_COMMENTS_KEY, []));
      setRevisions(readLS<LeadDealRevision[]>(DEAL_REVISIONS_KEY, []));
      seqRef.current = readLS<number>(DEAL_SEQ_KEY, 0);
      setHydrated(true);
    }
    return () => { active = false; };
  }, [useDb, authReady, db]);

  /* ── Realtime (DB mode) ── */
  useEffect(() => {
    if (!useDb || !authReady) return;
    let active = true;
    const channel = db.channel("lead-deals-realtime");
    const reload = async () => {
      const [{ data: dealRows }, { data: commentRows }, { data: revRows }] = await Promise.all([
        db.from("lead_deals").select("*").order("created_at", { ascending: false }),
        db.from("lead_deal_comments").select("*").order("created_at", { ascending: true }),
        db.from("lead_deal_revisions").select("*").order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      if (dealRows) setDeals(dealRows.map(rowToLeadDeal));
      if (commentRows) setComments(commentRows.map(rowToLeadDealComment));
      if (revRows) setRevisions(revRows.map(rowToLeadDealRevision));
    };
    for (const table of ["lead_deals", "lead_deal_comments", "lead_deal_revisions"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, reload);
    }
    channel.subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [useDb, authReady, db]);

  /* ── Local-mode sequence (DA-0001 …) ── */
  const nextDealNoLocal = useCallback((): string => {
    const n = (seqRef.current || 0) + 1;
    seqRef.current = n;
    writeLS(DEAL_SEQ_KEY, n);
    return `DA-${String(n).padStart(4, "0")}`;
  }, []);

  /* ── Read helpers ── */
  const dealsForLead = useCallback((leadId: string) =>
    deals.filter((d) => d.leadId === leadId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  [deals]);
  const currentDeal = useCallback((leadId: string) => currentDealForLead(deals, leadId), [deals]);
  const dealById = useCallback((dealId: string) => deals.find((d) => d.id === dealId), [deals]);
  const commentsForDeal = useCallback((dealId: string) =>
    comments.filter((c) => c.dealId === dealId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  [comments]);
  const revisionsForDeal = useCallback((dealId: string) =>
    revisions.filter((r) => r.dealId === dealId).sort((a, b) => a.revision - b.revision || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  [revisions]);

  /* ── Local-mode revision writer (DB mode writes it via trigger) ── */
  const writeLocalRevision = useCallback((deal: LeadDeal, action: LeadDealRevision["action"], comment: string, actorId: string, actorName: string) => {
    const rev: LeadDealRevision = {
      id: uid(), dealId: deal.id, revision: deal.revision, action,
      requestedDiscount: deal.requestedDiscount, requestedDiscountType: deal.requestedDiscountType,
      requestedReason: deal.requestedReason,
      approvedDiscount: deal.approvedDiscount, approvedDiscountType: deal.approvedDiscountType,
      statusAfter: deal.status, actorId, actorName, comment, createdAt: new Date().toISOString(),
    };
    setRevisions((prev) => { const next = [...prev, rev]; writeLS(DEAL_REVISIONS_KEY, next); return next; });
  }, []);

  /* ── Notify approvers of a new / resubmitted request ── */
  const notifyApprovers = useCallback((deal: LeadDeal, kind: "deal_approval_requested" | "deal_resubmitted") => {
    const title = kind === "deal_resubmitted" ? "Discount request resubmitted" : "Discount approval required";
    const body = `${deal.dealNo} · Lead ${deal.leadNo} · ${deal.salesAgentName || "Agent"} · ${formatDealDiscount(deal.requestedDiscount, deal.requestedDiscountType)} requested`;
    for (const role of APPROVER_ROLES) {
      notify({
        kind, recipientRole: role, title, body,
        href: `/leads/deals?deal=${deal.id}`,
        reference: deal.dealNo,
        dedupeKey: `${kind}:${deal.id}:${deal.revision}:${role}`,
      });
    }
  }, []);

  /* ── Create a request (Discounted Lead trigger) ── */
  const requestDeal = useCallback(async (lead: Lead, draft: LeadDealRequestDraft): Promise<LeadDeal | null> => {
    if (!(draft.requestedReason || "").trim()) {
      toast.error("Reason required", { description: "Explain why the customer needs a discount." });
      return null;
    }
    // Duplicate-request guard (double-click / retry): one open deal per lead.
    if (leadHasOpenDeal(dealsRef.current, lead.id)) {
      const open = currentDealForLead(dealsRef.current, lead.id);
      toast.info("Approval already in progress", { description: `${open?.dealNo || "A deal"} is ${DEAL_STATUS_LABEL[open?.status ?? "pending_approval"]}.` });
      return open ?? null;
    }
    const nowIso = new Date().toISOString();
    const base: Partial<LeadDeal> = {
      branchId: lead.branchId || "",
      leadId: lead.id, leadNo: lead.leadNo,
      customerId: lead.customerId || "", customerName: lead.name || "",
      salesAgentId: lead.assignedTo || "", salesAgentName: lead.assignedToName || lead.agent || "",
      requestedDiscount: draft.requestedDiscount,
      requestedDiscountType: draft.requestedDiscountType,
      requestedReason: draft.requestedReason.trim(),
      leadValue: draft.leadValue ?? lead.estimate ?? null,
      status: "pending_approval",
      revision: 1,
    };

    if (useDb) {
      const row: Record<string, unknown> = leadDealToRow(base);
      // organization_id is a NOT NULL column — resolve it from the lead's org
      // (the insert RLS also checks auth_org_id). created_by / deal_no are
      // stamped by the DB guard.
      const { data: leadRow } = await db.from("leads").select("organization_id").eq("id", lead.id).maybeSingle();
      const orgId = (leadRow as any)?.organization_id ?? null;
      if (orgId) row.organization_id = orgId;
      const { data, error } = await db.from("lead_deals").insert(row).select("*").single();
      if (!error && data) {
        const created = rowToLeadDeal(data);
        setDeals((prev) => [created, ...prev]);
        afterRequested(created);
        return created;
      }
      // Missing table (migration 0063 not applied) → degrade to a local record
      // rather than lose the request, mirroring the leads context. Any other
      // error surfaces its real detail so it's debuggable.
      if (error && !isMissingTableError(error)) {
        console.error("[deals] requestDeal failed:", error.message);
        const friendly = error.message?.includes("deal_reason_required")
          ? "A reason is required."
          : error.message?.includes("lead_deals_one_open_per_lead")
            ? "This lead already has an open discount request."
            : `We couldn't submit the discount request. ${error.message ?? ""}`.trim();
        toast.error("Request not submitted", { description: friendly });
        return null;
      }
      console.warn("[deals] lead_deals table not found (migration 0063 not applied) — keeping the request locally.");
    }

    const deal: LeadDeal = {
      id: uid(), dealNo: nextDealNoLocal(),
      branchId: base.branchId!, leadId: base.leadId!, leadNo: base.leadNo!,
      customerId: base.customerId!, customerName: base.customerName!,
      salesAgentId: base.salesAgentId!, salesAgentName: base.salesAgentName!,
      requestedDiscount: base.requestedDiscount ?? null, requestedDiscountType: base.requestedDiscountType!,
      requestedReason: base.requestedReason!, leadValue: base.leadValue ?? null,
      approvedDiscount: null, approvedDiscountType: base.requestedDiscountType!,
      status: "pending_approval", revision: 1,
      approverId: "", approverName: "", decidedAt: "", approvalComment: "", rejectionReason: "",
      createdBy: meIdRef.current || "", createdByName: meNameRef.current || "",
      createdAt: nowIso, updatedAt: nowIso,
    };
    setDeals((prev) => { const next = [deal, ...prev]; writeLS(DEALS_KEY, next); return next; });
    writeLocalRevision(deal, "submitted", deal.requestedReason, deal.createdBy, deal.createdByName);
    afterRequested(deal);
    return deal;
  }, [useDb, db, nextDealNoLocal, writeLocalRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  function afterRequested(deal: LeadDeal) {
    toast.success("Discount approval submitted", { description: `${deal.dealNo} · ${formatDealDiscount(deal.requestedDiscount, deal.requestedDiscountType)}` });
    logActivity({ module: "Lead", action: "Deal Submitted", severity: "info", entity: "Deal", reference: deal.dealNo, description: `${deal.salesAgentName || "Agent"} requested ${formatDealDiscount(deal.requestedDiscount, deal.requestedDiscountType)} on ${deal.leadNo}.` });
    notifyApprovers(deal, "deal_approval_requested");
  }

  /* ── Shared DB status transition (optimistic + heal) ── */
  const patchDeal = useCallback(async (dealId: string, updates: Partial<LeadDeal>): Promise<boolean> => {
    const current = dealsRef.current.find((d) => d.id === dealId);
    setDeals((prev) => { const next = prev.map((d) => (d.id === dealId ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d)); if (!useDb) writeLS(DEALS_KEY, next); return next; });
    if (useDb) {
      let row = leadDealToRow(updates);
      let { error } = await db.from("lead_deals").update(row).eq("id", dealId);
      let heal = 0;
      while (error && isUndefinedColumnError(error) && heal < 4) {
        heal += 1;
        // drop any unknown column and retry
        const col = (error.message?.match(/column "?([a-z0-9_]+)"?/i)?.[1]) || null;
        if (col && col in row) { delete (row as any)[col]; } else break;
        ({ error } = await db.from("lead_deals").update(row).eq("id", dealId));
      }
      if (error) {
        console.error("[deals] patchDeal failed:", error.message);
        // Roll back to authoritative row.
        const { data: fresh } = await db.from("lead_deals").select("*").eq("id", dealId).maybeSingle();
        if (fresh) setDeals((prev) => prev.map((d) => (d.id === dealId ? rowToLeadDeal(fresh) : d)));
        else if (current) setDeals((prev) => prev.map((d) => (d.id === dealId ? current : d)));
        return false;
      }
    }
    return true;
  }, [useDb, db]);

  /* ── Resubmit (revise + back to pending) ── */
  const resubmitDeal = useCallback(async (dealId: string, draft: LeadDealRequestDraft): Promise<boolean> => {
    const deal = dealsRef.current.find((d) => d.id === dealId);
    if (!deal) return false;
    if (!(draft.requestedReason || "").trim()) {
      toast.error("Reason required", { description: "Explain the revised discount request." });
      return false;
    }
    const nextRevision = (deal.revision || 1) + 1;
    const updates: Partial<LeadDeal> = {
      requestedDiscount: draft.requestedDiscount,
      requestedDiscountType: draft.requestedDiscountType,
      requestedReason: draft.requestedReason.trim(),
      leadValue: draft.leadValue ?? deal.leadValue,
      status: "pending_approval",
      revision: nextRevision,
      approvalComment: "", rejectionReason: "",
    };
    const ok = await patchDeal(dealId, updates);
    if (!ok) return false;
    const updated = { ...deal, ...updates } as LeadDeal;
    if (!useDb) writeLocalRevision(updated, "resubmitted", updated.requestedReason, meIdRef.current || "", meNameRef.current || "");
    logActivity({ module: "Lead", action: "Deal Resubmitted", severity: "info", entity: "Deal", reference: deal.dealNo, description: `${deal.dealNo} resubmitted (revision ${nextRevision}).` });
    toast.success("Resubmitted for approval", { description: `${deal.dealNo} · revision ${nextRevision}` });
    notifyApprovers(updated, "deal_resubmitted");
    return true;
  }, [patchDeal, useDb, writeLocalRevision, notifyApprovers]);

  /* ── Notify the agent of a decision ── */
  const notifyAgent = useCallback((deal: LeadDeal, kind: "deal_approved" | "deal_rejected" | "deal_changes_requested", detail: string) => {
    if (!deal.salesAgentId || deal.salesAgentId === meIdRef.current) return;
    const title = kind === "deal_approved" ? "Discount approved" : kind === "deal_rejected" ? "Discount rejected" : "Changes requested on your discount";
    notify({
      kind, recipientId: deal.salesAgentId, title,
      body: `${deal.dealNo} · Lead ${deal.leadNo} — ${detail}`,
      href: `/leads/list?lead=${deal.leadId}`,
      reference: deal.dealNo,
      dedupeKey: `${kind}:${deal.id}:${deal.revision}`,
    });
  }, []);

  /* ── Approve ── */
  const approveDeal = useCallback(async (dealId: string, opts: { approvedDiscount: number | null; approvedDiscountType: "amount" | "percent"; comment?: string }): Promise<boolean> => {
    const deal = dealsRef.current.find((d) => d.id === dealId);
    if (!deal) return false;
    if (!canDecideDeal(deal, meIdRef.current || "", isOwnerRef.current)) {
      toast.error("Not allowed", { description: "You cannot approve your own discount request. Another authorized approver must review it." });
      return false;
    }
    const now = new Date().toISOString();
    const updates: Partial<LeadDeal> = {
      status: "approved",
      approvedDiscount: opts.approvedDiscount,
      approvedDiscountType: opts.approvedDiscountType,
      approvalComment: opts.comment || "",
      approverId: meIdRef.current || "", approverName: meNameRef.current || "",
      decidedAt: now,
    };
    const ok = await patchDeal(dealId, updates);
    if (!ok) return false;
    const updated = { ...deal, ...updates } as LeadDeal;
    if (!useDb) writeLocalRevision(updated, "approved", opts.comment || "", meIdRef.current || "", meNameRef.current || "");
    logActivity({ module: "Lead", action: "Deal Approved", severity: "success", entity: "Deal", reference: deal.dealNo, description: `${deal.dealNo} approved — ${formatDealDiscount(opts.approvedDiscount, opts.approvedDiscountType)}.` });
    toast.success("Deal approved", { description: `${deal.dealNo} · ${formatDealDiscount(opts.approvedDiscount, opts.approvedDiscountType)}` });
    notifyAgent(updated, "deal_approved", `Approved ${formatDealDiscount(opts.approvedDiscount, opts.approvedDiscountType)}${opts.comment ? ` — ${opts.comment}` : ""}`);
    return true;
  }, [patchDeal, useDb, writeLocalRevision, notifyAgent]);

  /* ── Reject ── */
  const rejectDeal = useCallback(async (dealId: string, reason: string): Promise<boolean> => {
    const deal = dealsRef.current.find((d) => d.id === dealId);
    if (!deal) return false;
    if (!(reason || "").trim()) { toast.error("Reason required", { description: "A rejection reason is mandatory." }); return false; }
    if (!canDecideDeal(deal, meIdRef.current || "", isOwnerRef.current)) {
      toast.error("Not allowed", { description: "You cannot reject your own discount request." });
      return false;
    }
    const now = new Date().toISOString();
    const updates: Partial<LeadDeal> = {
      status: "rejected", rejectionReason: reason.trim(),
      approverId: meIdRef.current || "", approverName: meNameRef.current || "", decidedAt: now,
    };
    const ok = await patchDeal(dealId, updates);
    if (!ok) return false;
    const updated = { ...deal, ...updates } as LeadDeal;
    if (!useDb) writeLocalRevision(updated, "rejected", reason.trim(), meIdRef.current || "", meNameRef.current || "");
    logActivity({ module: "Lead", action: "Deal Rejected", severity: "info", entity: "Deal", reference: deal.dealNo, description: `${deal.dealNo} rejected — ${reason.trim()}.` });
    toast.success("Deal rejected", { description: deal.dealNo });
    notifyAgent(updated, "deal_rejected", reason.trim());
    return true;
  }, [patchDeal, useDb, writeLocalRevision, notifyAgent]);

  /* ── Request changes ── */
  const requestChanges = useCallback(async (dealId: string, comment: string): Promise<boolean> => {
    const deal = dealsRef.current.find((d) => d.id === dealId);
    if (!deal) return false;
    if (!(comment || "").trim()) { toast.error("Comment required", { description: "Tell the agent what to change." }); return false; }
    if (!canDecideDeal(deal, meIdRef.current || "", isOwnerRef.current)) {
      toast.error("Not allowed", { description: "You cannot action your own discount request." });
      return false;
    }
    const now = new Date().toISOString();
    const updates: Partial<LeadDeal> = {
      status: "changes_requested", approvalComment: comment.trim(),
      approverId: meIdRef.current || "", approverName: meNameRef.current || "", decidedAt: now,
    };
    const ok = await patchDeal(dealId, updates);
    if (!ok) return false;
    const updated = { ...deal, ...updates } as LeadDeal;
    if (!useDb) writeLocalRevision(updated, "changes_requested", comment.trim(), meIdRef.current || "", meNameRef.current || "");
    logActivity({ module: "Lead", action: "Deal Changes Requested", severity: "info", entity: "Deal", reference: deal.dealNo, description: `${deal.dealNo} — changes requested: ${comment.trim()}.` });
    toast.success("Changes requested", { description: deal.dealNo });
    notifyAgent(updated, "deal_changes_requested", comment.trim());
    return true;
  }, [patchDeal, useDb, writeLocalRevision, notifyAgent]);

  /* ── Cancel ── */
  const cancelDeal = useCallback(async (dealId: string, reason?: string): Promise<boolean> => {
    const deal = dealsRef.current.find((d) => d.id === dealId);
    if (!deal) return false;
    const updates: Partial<LeadDeal> = { status: "cancelled", approvalComment: reason || deal.approvalComment };
    const ok = await patchDeal(dealId, updates);
    if (!ok) return false;
    const updated = { ...deal, ...updates } as LeadDeal;
    if (!useDb) writeLocalRevision(updated, "cancelled", reason || "", meIdRef.current || "", meNameRef.current || "");
    logActivity({ module: "Lead", action: "Deal Cancelled", severity: "info", entity: "Deal", reference: deal.dealNo, description: `${deal.dealNo} cancelled.` });
    toast.success("Deal cancelled", { description: deal.dealNo });
    return true;
  }, [patchDeal, useDb, writeLocalRevision]);

  /* ── Comment ── */
  const addDealComment = useCallback(async (dealId: string, body: string) => {
    const text = (body || "").trim();
    if (!text) return;
    const deal = dealsRef.current.find((d) => d.id === dealId);
    const nowIso = new Date().toISOString();
    if (useDb) {
      const { data, error } = await db.from("lead_deal_comments")
        .insert({ deal_id: dealId, lead_id: deal?.leadId ?? null, body: text })
        .select("*").single();
      if (error) {
        if (!isMissingTableError(error)) { console.error("[deals] addDealComment failed:", error.message); toast.error("Comment not saved"); }
        return;
      }
      setComments((prev) => [...prev, rowToLeadDealComment(data)]);
      return;
    }
    const c: LeadDealComment = { id: uid(), dealId, authorId: meIdRef.current || "", authorName: meNameRef.current || "", body: text, createdAt: nowIso };
    setComments((prev) => { const next = [...prev, c]; writeLS(DEAL_COMMENTS_KEY, next); return next; });
  }, [useDb, db]);

  const value = useMemo<DealsContextValue>(() => ({
    deals, comments, revisions, hydrated, mode: useDb ? "db" : "local",
    dealsForLead, currentDeal, commentsForDeal, revisionsForDeal, dealById,
    requestDeal, resubmitDeal, approveDeal, rejectDeal, requestChanges, cancelDeal, addDealComment,
  }), [deals, comments, revisions, hydrated, useDb, dealsForLead, currentDeal, commentsForDeal, revisionsForDeal, dealById, requestDeal, resubmitDeal, approveDeal, rejectDeal, requestChanges, cancelDeal, addDealComment]);

  return <DealsContext.Provider value={value}>{children}</DealsContext.Provider>;
}

export function useDeals(): DealsContextValue {
  const ctx = useContext(DealsContext);
  if (!ctx) throw new Error("useDeals must be used within a DealsProvider");
  return ctx;
}
