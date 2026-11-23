"use client";
/* RepairOX — useLeadMessages(leadId): the lead's internal conversation.
   Supabase mode: reads lead_messages (RLS: author / addressee / lead owner),
   people via lead_message_people(), sends via lead_message_send(), realtime on
   the lead's rows. Local/demo mode: localStorage thread + caller-supplied
   `fallbackPeople`. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { demoKey } from "@/lib/demo-mode";
import { toast } from "@/components/ui/toaster";
import { notify } from "@/lib/notifications";
import {
  type LeadMessage, type LeadMessagePerson, rowToLeadMessage, rowToLeadMessagePerson, unreadCount,
} from "@/lib/lead-messages";
const LS_KEY = "repairox-lead-messages";
const LS_READ = "repairox-lead-message-reads";
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`);
function readLS<T>(key: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try { const raw = localStorage.getItem(demoKey(key)); return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; }
}
function writeLS(key: string, v: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(demoKey(key), JSON.stringify(v)); } catch { /* quota */ }
}
export function useLeadMessages(leadId: string | undefined, opts?: { fallbackPeople?: LeadMessagePerson[]; leadNo?: string }) {
  const { currentUser } = usePermissions();
  const meId = currentUser?.id ?? "";
  const meName = currentUser?.name ?? "";
  const useDb = isSupabaseConfigured && !!supabase;
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [dbPeople, setDbPeople] = useState<LeadMessagePerson[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const fallbackRef = useRef(opts?.fallbackPeople);
  fallbackRef.current = opts?.fallbackPeople;

  const refresh = useCallback(async () => {
    if (!leadId) { setLoading(false); return; }
    // DB leads are UUIDs; anything else (ad-hoc / demo ids) has no thread to read.
    if (useDb && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) { setLoading(false); return; }
    if (!useDb) {
      setMessages(readLS<LeadMessage[]>(LS_KEY, []).filter((m) => m.leadId === leadId));
      setLastReadAt(readLS<Record<string, string>>(LS_READ, {})[`${meId}:${leadId}`]);
      setLoading(false);
      return;
    }
    const db = supabase!;
    const [msgs, ppl, rd] = await Promise.all([
      db.from("lead_messages").select("*").eq("lead_id", leadId).order("created_at", { ascending: true }),
      db.rpc("lead_message_people", { p_lead: leadId }),
      meId ? db.from("lead_message_reads").select("last_read_at").eq("lead_id", leadId).eq("staff_id", meId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!msgs.error) setMessages((msgs.data ?? []).map(rowToLeadMessage));
    if (!ppl.error) setDbPeople(((ppl.data as any[]) ?? []).map(rowToLeadMessagePerson));
    setLastReadAt((rd as any)?.data?.last_read_at ?? undefined);
    setLoading(false);
  }, [leadId, useDb, meId]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);
  // Realtime: any change to this lead's thread → refetch (cheap, small table).
  useEffect(() => {
    if (!useDb || !leadId) return;
    const db = supabase!;
    const ch = db.channel(`lead-messages-${leadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_messages", filter: `lead_id=eq.${leadId}` }, () => { void refresh(); })
      .subscribe();
    return () => { void db.removeChannel(ch); };
  }, [useDb, leadId, refresh]);

  const people = useMemo<LeadMessagePerson[]>(() => (useDb ? dbPeople : (fallbackRef.current ?? []).map((p) => ({ ...p, isMe: p.staffId === meId }))), [useDb, dbPeople, meId, opts?.fallbackPeople]);

  const send = useCallback(async (body: string, to: string[], replyTo?: string): Promise<boolean> => {
    const text = body.trim();
    if (!leadId || !text) return false;
    setSending(true);
    try {
      if (useDb) {
        const { data, error } = await supabase!.rpc("lead_message_send", { p_lead: leadId, p_body: text, p_to: to, p_reply_to: replyTo ?? null });
        if (error) {
          const m = String(error.message || "");
          toast.error("Message not sent", { description: /no_recipients/.test(m) ? "Choose at least one person on this lead." : /not_on_this_lead/.test(m) ? "You are not on this lead's team." : "Please try again." });
          return false;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setMessages((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, rowToLeadMessage(row)]));
        return true;
      }
      const audience = (to.length ? to : people.filter((p) => !p.isMe).map((p) => p.staffId)).filter((id) => id !== meId);
      if (audience.length === 0) { toast.error("Message not sent", { description: "Choose at least one person on this lead." }); return false; }
      const msg: LeadMessage = { id: uid(), leadId, authorId: meId, authorName: meName, authorRole: people.find((p) => p.isMe)?.roleLabel ?? "Sales", body: text, audience, replyTo, createdAt: new Date().toISOString() };
      const all = [...readLS<LeadMessage[]>(LS_KEY, []), msg];
      writeLS(LS_KEY, all);
      setMessages(all.filter((m) => m.leadId === leadId));
      for (const r of audience) notify({ kind: "lead_message", title: `Message on ${opts?.leadNo || "a lead"} from ${meName || "a teammate"}`, body: text.slice(0, 140), recipientId: r, href: `/leads/${leadId}`, reference: opts?.leadNo, dedupeKey: `lm:${msg.id}:${r}` });
      return true;
    } finally { setSending(false); }
  }, [leadId, useDb, meId, meName, people, opts?.leadNo]);

  const markRead = useCallback(async () => {
    if (!leadId || !meId) return;
    const now = new Date().toISOString();
    setLastReadAt(now);
    if (useDb) { await supabase!.rpc("lead_message_mark_read", { p_lead: leadId }); return; }
    const reads = readLS<Record<string, string>>(LS_READ, {});
    reads[`${meId}:${leadId}`] = now; writeLS(LS_READ, reads);
  }, [leadId, meId, useDb]);

  const unread = useMemo(() => unreadCount(messages, meId, lastReadAt), [messages, meId, lastReadAt]);
  return { messages, people, unread, loading, sending, send, markRead, refresh, meId };
}
