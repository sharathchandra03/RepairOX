"use client";
/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Conversation.
   The internal thread for ONE lead between everyone on its chain (Sales Agent →
   Field Manager → Ninja / engineer). The sender picks WHO gets each message
   (any person on the lead, or everyone); recipients are notified and can reply
   in the same thread. Internal only — never a customer channel.
   One component, used on View Lead (sales), View Assignment (field manager)
   and the Ninja trip screen (`variant="ninja"` = larger touch targets).
   Data + permissions: useLeadMessages() → lead_messages RLS + lead_message_send.
   ────────────────────────────────────────────────────────────────────────── */
import * as React from "react";
import { MessagesSquare, Send, CornerUpLeft, X, Users, Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useLeadMessages } from "@/hooks/use-lead-messages";
import { FIELD_QUICK_REPLIES, LEAD_MESSAGE_MAX, type LeadMessage, type LeadMessagePerson } from "@/lib/lead-messages";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
}
const shortRole = (r: string) => r.replace(/\s*\(.*\)/, "");
const firstName = (n: string) => (n || "").trim().split(/\s+/)[0] || n;

export function LeadConversation({
  leadId, leadNo, variant = "app", readOnly = false, fallbackPeople, className, maxThreadHeight,
}: {
  leadId: string;
  leadNo?: string;
  variant?: "app" | "ninja";
  /** Owner "view as agent" lens / view-tier users: thread visible, no composer. */
  readOnly?: boolean;
  /** Local/demo mode only: who is on the lead (the DB supplies this otherwise). */
  fallbackPeople?: LeadMessagePerson[];
  className?: string;
  maxThreadHeight?: number;
}) {
  const { messages, people, unread, loading, sending, send, markRead, meId } = useLeadMessages(leadId, { fallbackPeople, leadNo });
  const ninja = variant === "ninja";
  const others = React.useMemo(() => people.filter((p) => !p.isMe), [people]);
  const nameOf = React.useCallback((id: string) => people.find((p) => p.staffId === id)?.name || "", [people]);
  const [to, setTo] = React.useState<string[]>([]);
  const [everyone, setEveryone] = React.useState(false);
  const [text, setText] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<LeadMessage | null>(null);
  const threadRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const touchedRef = React.useRef(false);

  // Default recipients: whoever wrote to me last (so a reply goes back to them);
  // else the only other person. Never pre-picks when there is a real choice.
  React.useEffect(() => {
    if (touchedRef.current) return;
    const lastFromOther = [...messages].reverse().find((m) => m.authorId && m.authorId !== meId);
    if (lastFromOther && others.some((p) => p.staffId === lastFromOther.authorId)) { setTo([lastFromOther.authorId]); setEveryone(false); return; }
    if (others.length === 1) { setTo([others[0].staffId]); setEveryone(false); }
  }, [messages, others, meId]);

  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (messages.length > 0 && typeof document !== "undefined" && document.visibilityState === "visible") void markRead();
  }, [messages.length, markRead]);

  // Auto-grow the composer (2 → 6 lines).
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  const toggle = (id: string) => { touchedRef.current = true; setEveryone(false); setTo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])); };
  const pickEveryone = () => { touchedRef.current = true; setEveryone((v) => !v); setTo([]); };
  const reply = (m: LeadMessage) => { touchedRef.current = true; setReplyTo(m); setEveryone(false); setTo([m.authorId]); inputRef.current?.focus(); };
  const recipients = everyone ? others.map((p) => p.staffId) : to;
  const canSend = !readOnly && !sending && text.trim().length > 0 && recipients.length > 0;

  const submit = async (override?: string) => {
    const body = (override ?? text).trim();
    if (!body || recipients.length === 0 || sending) return;
    const ok = await send(body, recipients, replyTo?.id);
    if (ok) { setText(""); setReplyTo(null); }
  };

  if (!loading && people.length <= 1 && messages.length === 0) {
    return (
      <div className={cn("rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center", className)}>
        <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[#EEF1FD] text-[#4361EE]"><MessagesSquare className="h-5 w-5" /></span>
        <p className="text-[13px] font-semibold text-foreground">No one to message yet</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Once this lead is routed to Field, you can message the Field Manager and the Ninja here.</p>
      </div>
    );
  }

  const selectedNames = everyone ? "Everyone" : others.filter((p) => to.includes(p.staffId)).map((p) => firstName(p.name)).join(", ");

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {/* People on this lead */}
      <div className="flex items-center gap-2.5">
        <div className="flex -space-x-2">
          {people.slice(0, 5).map((p) => (
            <span key={p.staffId} title={`${p.name} · ${p.roleLabel}`} className="rounded-full ring-2 ring-card"><Avatar name={p.name} size={24} /></span>
          ))}
        </div>
        <p className="min-w-0 truncate text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{people.length} {people.length === 1 ? "person" : "people"}</span> on this lead
          {unread > 0 && <span className="ml-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread} new</span>}
        </p>
      </div>

      {/* Thread */}
      <div
        ref={threadRef}
        style={{ maxHeight: maxThreadHeight ?? (ninja ? 340 : 360), minHeight: 140 }}
        className={cn("space-y-1 overflow-y-auto rounded-2xl border border-border bg-gradient-to-b from-muted/30 to-muted/10 p-3 [scrollbar-width:thin]", ninja && "from-slate-50 to-white")}
      >
        {loading ? (
          <p className="py-10 text-center text-[12px] text-muted-foreground">Loading conversation…</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-[110px] flex-col items-center justify-center gap-1 py-6 text-center">
            <MessagesSquare className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-[12.5px] font-medium text-foreground">No messages yet</p>
            <p className="text-[11.5px] text-muted-foreground">Pick who to tell below and write your first message.</p>
          </div>
        ) : messages.map((m, i) => {
          const mine = m.authorId === meId;
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped = !newDay && prev && prev.authorId === m.authorId;
          const quoted = m.replyTo ? messages.find((x) => x.id === m.replyTo) : undefined;
          const toNames = m.audience.map((id) => (id === meId ? "you" : firstName(nameOf(id)))).filter(Boolean);
          return (
            <React.Fragment key={m.id}>
              {newDay && (
                <div className="flex items-center gap-2 py-2">
                  <span className="h-px flex-1 bg-border" />
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground ring-1 ring-border">{dayLabel(m.createdAt)}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className={cn("group flex items-end gap-2", mine ? "flex-row-reverse" : "flex-row", grouped ? "mt-0.5" : "mt-2.5")}>
                <span className={cn("w-7 shrink-0", grouped && "invisible")}><Avatar name={m.authorName || "?"} size={28} /></span>
                <div className={cn("flex min-w-0 max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
                  {!grouped && (
                    <p className="mb-0.5 flex items-center gap-1.5 px-1 text-[11px]">
                      <span className="font-semibold text-foreground">{mine ? "You" : m.authorName || "—"}</span>
                      {m.authorRole && <span className="rounded-full bg-muted px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{shortRole(m.authorRole)}</span>}
                    </p>
                  )}
                  <div className={cn(
                    "min-w-[64px] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm",
                    mine ? "rounded-br-md bg-[#4361EE] text-white" : "rounded-bl-md border border-border bg-card text-foreground",
                  )}>
                    {quoted && (
                      <p className={cn("mb-1.5 line-clamp-2 rounded-md border-l-2 px-2 py-1 text-[11px]", mine ? "border-white/60 bg-white/15 text-white/90" : "border-[#4361EE]/50 bg-[#EEF1FD]/70 text-muted-foreground")}>
                        <span className="font-semibold">{quoted.authorId === meId ? "You" : firstName(quoted.authorName)}</span>: {quoted.body}
                      </p>
                    )}
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                    <span className={cn("ml-2 inline-block translate-y-0.5 text-[10px] tabular-nums", mine ? "text-white/70" : "text-muted-foreground")}>{fmtTime(m.createdAt)}</span>
                  </div>
                  <div className={cn("mt-0.5 flex items-center gap-2 px-1 text-[10.5px] text-muted-foreground", mine && "flex-row-reverse")}>
                    {toNames.length > 0 && <span className="truncate">to {toNames.length > 2 ? `${toNames.slice(0, 2).join(", ")} +${toNames.length - 2}` : toNames.join(", ")}</span>}
                    {!mine && !readOnly && (
                      <button type="button" onClick={() => reply(m)} className="inline-flex items-center gap-0.5 font-semibold text-[#4361EE] opacity-70 transition hover:underline group-hover:opacity-100">
                        <CornerUpLeft className="h-3 w-3" /> Reply
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Composer */}
      {!readOnly && (
        <div className="space-y-2.5">
          {/* Recipients */}
          <div>
            <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Send to</span>
              <span className={cn("normal-case tracking-normal", recipients.length ? "text-[#4361EE]" : "text-rose-500")}>
                {recipients.length ? selectedNames : "Choose at least one person"}
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((p) => {
                const on = everyone || to.includes(p.staffId);
                return (
                  <button key={p.staffId} type="button" onClick={() => toggle(p.staffId)} aria-pressed={on} title={`${p.name} · ${p.roleLabel}`}
                    className={cn("inline-flex items-center gap-2 rounded-xl border py-1 pl-1 pr-2.5 text-left transition",
                      on ? "border-[#4361EE] bg-[#EEF1FD] ring-1 ring-[#4361EE]/30" : "border-border bg-card hover:border-[#4361EE]/40 hover:bg-muted/40",
                      ninja && "py-1.5")}>
                    <span className="relative"><Avatar name={p.name} size={26} />
                      {on && <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-[#4361EE] text-white ring-2 ring-white"><Check className="h-2 w-2" strokeWidth={4} /></span>}
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className={cn("block max-w-[120px] truncate text-[12px] font-semibold", on ? "text-[#4361EE]" : "text-foreground")}>{firstName(p.name)}</span>
                      <span className="block text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground">{shortRole(p.roleLabel)}</span>
                    </span>
                  </button>
                );
              })}
              {others.length > 1 && (
                <button type="button" onClick={pickEveryone} aria-pressed={everyone}
                  className={cn("inline-flex items-center gap-1.5 rounded-xl border px-3 text-[12px] font-semibold transition",
                    everyone ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-border bg-card text-zinc-600 hover:border-[#4361EE]/40", ninja ? "py-2.5" : "py-2")}>
                  <Users className="h-3.5 w-3.5" /> Everyone
                </button>
              )}
            </div>
          </div>

          {replyTo && (
            <div className="flex items-center gap-2 rounded-lg border-l-2 border-[#4361EE] bg-[#EEF1FD] px-2.5 py-1.5 text-[11.5px] text-[#4361EE]">
              <CornerUpLeft className="h-3 w-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Replying to <b>{firstName(replyTo.authorName)}</b>: {replyTo.body}</span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="rounded p-0.5 hover:bg-white/60"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {ninja && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {FIELD_QUICK_REPLIES.map((q) => (
                <button key={q} type="button" disabled={recipients.length === 0 || sending} onClick={() => void submit(q)}
                  className="shrink-0 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-bold text-slate-700 transition active:scale-95 disabled:opacity-40">{q}</button>
              ))}
            </div>
          )}

          {/* Input with the send button inside */}
          <div className="flex items-end gap-1.5 rounded-2xl border border-input bg-card p-1.5 transition focus-within:border-[#4361EE] focus-within:ring-2 focus-within:ring-[#4361EE]/15">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, LEAD_MESSAGE_MAX))}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) void submit(); } }}
              rows={1}
              placeholder={recipients.length === 0 ? "Choose who to message above…" : `Message ${selectedNames}…`}
              className="max-h-[132px] min-h-[38px] w-full flex-1 resize-none bg-transparent px-2.5 py-2 text-[13px] leading-snug outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={() => void submit()} disabled={!canSend} aria-label="Send message"
              className={cn("mb-0.5 grid shrink-0 place-items-center rounded-xl bg-[#4361EE] text-white shadow-sm transition hover:bg-[#3450D8] active:scale-95 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none", ninja ? "h-11 w-11" : "h-9 w-9")}>
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="px-1 text-[10.5px] text-muted-foreground">Enter to send · Shift+Enter for a new line · Internal only, never shown to the customer</p>
        </div>
      )}
    </div>
  );
}
