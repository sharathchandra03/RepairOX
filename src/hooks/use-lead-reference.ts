"use client";
import { useCallback, useEffect, useState } from "react";
import {
  useLeads, rowToLead, rowToFollowUp, rowToAssignmentEvent, rowToConversionEvent,
} from "@/lib/leads-context";
import { rpcLeadReference, type ReferenceBundle } from "@/lib/lead-search";
import type { Lead } from "@/lib/leads-data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReferenceStatus = "idle" | "loading" | "ready" | "missing" | "error";

/**
 * Loads ONE lead (plus its history) that is outside the viewer's normal lead
 * scope, through lead_reference_get(). The server returns null — without
 * revealing whether the lead exists — unless the caller holds the shared
 * reference permission. Rows are registered into the leads-context overlay so
 * the Journey / Follow-up / Assignment panels render unchanged.
 *
 * Read-only by construction: nothing here (or in the RPC) updates the lead,
 * logs an activity or changes a follow-up. The RPC only appends one audit row
 * to lead_reference_access_log.
 */
export function useLeadReference(leadId: string, enabled: boolean) {
  const { registerReferenceRows } = useLeads();
  const [status, setStatus] = useState<ReferenceStatus>("idle");
  const [lead, setLead] = useState<Lead | null>(null);
  const [bundle, setBundle] = useState<ReferenceBundle | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!UUID_RE.test(leadId)) { setStatus("missing"); return; }
    setStatus("loading");
    try {
      const b = await rpcLeadReference(leadId);
      if (!b) { setStatus("missing"); return; }
      const l = rowToLead(b.lead);
      registerReferenceRows(l.id, {
        followUps: b.followups.map(rowToFollowUp),
        assignment: b.assignment.map(rowToAssignmentEvent),
        conversion: b.conversion.map(rowToConversionEvent),
      });
      setLead(l);
      setBundle(b);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lead");
      setStatus("error");
    }
  }, [leadId, registerReferenceRows]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, leadId]);

  return { status, lead, bundle, error, reload: load };
}
