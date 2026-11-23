/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Conversation model.
   An internal, append-only thread per lead between the people on its chain
   (Sales Agent → Field Manager → Ninja / engineer). Never a customer channel.
   The chain + the write path live in the database (0121_lead_messages.sql):
   `lead_message_people` (who can be addressed), `lead_message_send` (the only
   write path — stamps the author, restricts the audience to the chain and
   notifies the recipients).
   ────────────────────────────────────────────────────────────────────────── */
export interface LeadMessage {
  id: string;
  leadId: string;
  authorId: string;
  authorName: string;
  /** Role label at send time ("Sales Agent", "Field Manager", "Ninja (pickup)"…). */
  authorRole: string;
  body: string;
  /** Staff ids this message was addressed to. */
  audience: string[];
  replyTo?: string;
  createdAt: string;
}
export interface LeadMessagePerson {
  staffId: string;
  name: string;
  roleLabel: string;
  isMe: boolean;
}
export const LEAD_MESSAGE_MAX = 2000;
/** Short quick-replies for the field side (tap to send / insert). */
export const FIELD_QUICK_REPLIES = ["On my way", "Reached the location", "Customer not reachable", "Done, will update", "Need more details"];
export function rowToLeadMessage(r: any): LeadMessage {
  return {
    id: r.id,
    leadId: r.lead_id,
    authorId: r.author_id ?? "",
    authorName: r.author_name ?? "",
    authorRole: r.author_role ?? "",
    body: r.body ?? "",
    audience: Array.isArray(r.audience) ? r.audience : [],
    replyTo: r.reply_to ?? undefined,
    createdAt: r.created_at,
  };
}
export function rowToLeadMessagePerson(r: any): LeadMessagePerson {
  return { staffId: r.staff_id, name: r.name ?? "", roleLabel: r.role_label ?? "", isMe: !!r.is_me };
}
/** Messages the user has not read: written by someone else, after last-read. */
export function unreadCount(messages: LeadMessage[], meId: string, lastReadAt?: string): number {
  const since = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  return messages.filter((m) => m.authorId !== meId && new Date(m.createdAt).getTime() > since).length;
}
