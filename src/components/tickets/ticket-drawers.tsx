"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, MessageSquarePlus, CreditCard, Mail, Printer, Send, Eye, FileText, Receipt, Tag } from "lucide-react";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import type { Ticket } from "@/lib/mock-data";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/mock-data";
import { formatINR } from "@/lib/utils";
import { getTicketPrintUrl, type PrintFormat } from "@/lib/print-utils";

/* ─── View Ticket Drawer ─────────────────────────────────────────────── */

export function ViewTicketDrawer({ open, onClose, ticket }: { open: boolean; onClose: () => void; ticket: Ticket | null }) {
  if (!ticket) return null;
  return (
    <Drawer open={open} onClose={onClose} title={`Ticket ${ticket.id}`} subtitle={ticket.model} icon={Eye} width="max-w-md">
      <div className="divide-y divide-border">
        <div className="pb-4">
          <div className="flex items-center gap-3">
            <Avatar name={ticket.customer} size={40} />
            <div>
              <p className="font-semibold">{ticket.customer}</p>
              <p className="text-xs text-muted-foreground">{ticket.phone}</p>
              {ticket.company && <p className="text-xs text-muted-foreground">{ticket.company}</p>}
            </div>
          </div>
        </div>
        <div className="py-4 space-y-0">
          <DetailRow label="Device">{ticket.model}</DetailRow>
          <DetailRow label="Issue">{ticket.issue}</DetailRow>
          <DetailRow label="Service">{ticket.service || "—"}</DetailRow>
          <DetailRow label="Technician">{ticket.technician}</DetailRow>
          <DetailRow label="Priority">
            <span className="capitalize">{ticket.priority}</span>
          </DetailRow>
          <DetailRow label="Status">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_TONE[ticket.status]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {STATUS_LABEL[ticket.status]}
            </span>
          </DetailRow>
          <DetailRow label="Amount">{formatINR(ticket.amount)}</DetailRow>
          <DetailRow label="Created">{new Date(ticket.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</DetailRow>
          {ticket.dueDate && (
            <DetailRow label="Due">{new Date(ticket.dueDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</DetailRow>
          )}
        </div>
      </div>
    </Drawer>
  );
}

/* ─── Transfer Ticket Drawer ─────────────────────────────────────────── */

export function TransferTicketDrawer({ open, onClose, ticket }: { open: boolean; onClose: () => void; ticket: Ticket | null }) {
  const [transferTo, setTransferTo] = useState("");
  const [reason, setReason] = useState("");

  if (!ticket) return null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Transfer Ticket"
      subtitle={`${ticket.id} — ${ticket.customer}`}
      icon={ArrowRightLeft}
      width="max-w-md"
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onClose}>Transfer</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Current Technician</p>
          <p className="mt-0.5 text-sm font-semibold">{ticket.technician}</p>
        </div>

        <div className="space-y-1.5">
          <Label>Transfer To</Label>
          <Select
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            options={[
              { label: "Select technician…", value: "" },
              { label: "Anand", value: "anand" },
              { label: "Vikas", value: "vikas" },
              { label: "Pooja", value: "pooja" },
              { label: "Shubham", value: "shubham" },
              { label: "Ravi", value: "ravi" },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Branch / Queue (Optional)</Label>
          <Select
            options={[
              { label: "Same branch", value: "" },
              { label: "BTM Layout (HQ)", value: "btm" },
              { label: "Koramangala", value: "koramangala" },
              { label: "HSR Layout", value: "hsr" },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Reason for transfer</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this ticket being transferred?"
            rows={3}
          />
        </div>
      </div>
    </Drawer>
  );
}

/* ─── Comment Drawer ─────────────────────────────────────────────────── */

interface Comment {
  id: number;
  author: string;
  text: string;
  time: string;
}

const MOCK_COMMENTS: Comment[] = [
  { id: 1, author: "Anand", text: "Diagnosed the issue — display flex cable damaged. Ordering replacement.", time: "2 hours ago" },
  { id: 2, author: "Pooja", text: "Customer approved the quotation. Proceed with repair.", time: "1 hour ago" },
];

export function CommentDrawer({ open, onClose, ticket }: { open: boolean; onClose: () => void; ticket: Ticket | null }) {
  const [newComment, setNewComment] = useState("");

  if (!ticket) return null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Comments"
      subtitle={`${ticket.id} — ${ticket.customer}`}
      icon={MessageSquarePlus}
      width="max-w-md"
      footer={
        <div className="flex gap-2">
          <Input
            value={newComment}
            onChange={(e: any) => setNewComment(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1"
          />
          <Button size="sm" onClick={() => setNewComment("")}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {MOCK_COMMENTS.map((c) => (
          <div key={c.id} className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Avatar name={c.author} size={24} />
              <span className="text-sm font-semibold">{c.author}</span>
              <span className="text-[11px] text-muted-foreground">{c.time}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
          </div>
        ))}
        {MOCK_COMMENTS.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No comments yet.</p>
        )}
      </div>
    </Drawer>
  );
}

/* ─── Checkout Drawer ────────────────────────────────────────────────── */

export function CheckoutDrawer({ open, onClose, ticket }: { open: boolean; onClose: () => void; ticket: Ticket | null }) {
  if (!ticket) return null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Checkout"
      subtitle={`${ticket.id} — ${ticket.customer}`}
      icon={CreditCard}
      width="max-w-md"
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onClose}>Process Payment</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Service</p>
            <p className="text-sm font-medium">{ticket.service || ticket.issue}</p>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <p className="text-sm font-semibold">Total</p>
            <p className="text-lg font-bold text-foreground">{formatINR(ticket.amount)}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Payment Method</Label>
          <Select
            options={[
              { label: "Cash", value: "cash" },
              { label: "UPI", value: "upi" },
              { label: "Card", value: "card" },
              { label: "Bank Transfer", value: "bank" },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Discount (Optional)</Label>
          <Input placeholder="Enter discount amount" type="number" />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea placeholder="Payment notes…" rows={2} />
        </div>
      </div>
    </Drawer>
  );
}

/* ─── Email Receipt Drawer ───────────────────────────────────────────── */

export function EmailReceiptDrawer({ open, onClose, ticket }: { open: boolean; onClose: () => void; ticket: Ticket | null }) {
  const [email, setEmail] = useState("");

  if (!ticket) return null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Email Receipt"
      subtitle={`${ticket.id} — ${ticket.customer}`}
      icon={Mail}
      width="max-w-md"
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onClose}>
            <Mail className="h-3.5 w-3.5" /> Send Receipt
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground">Ticket Summary</p>
          <p className="mt-1 text-sm font-semibold">{ticket.model} — {ticket.issue}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Amount: {formatINR(ticket.amount)}</p>
        </div>

        <div className="space-y-1.5">
          <Label>Recipient Email</Label>
          <Input
            value={email}
            onChange={(e: any) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            type="email"
          />
        </div>

        <div className="space-y-1.5">
          <Label>CC (Optional)</Label>
          <Input placeholder="cc@example.com" type="email" />
        </div>

        <div className="space-y-1.5">
          <Label>Additional Message</Label>
          <Textarea placeholder="Optional message to include with receipt…" rows={3} />
        </div>
      </div>
    </Drawer>
  );
}

/* ─── Print Drawer ───────────────────────────────────────────────────── */

export function PrintDrawer({ open, onClose, ticket }: { open: boolean; onClose: () => void; ticket: Ticket | null }) {
  const router = useRouter();
  const [format, setFormat] = useState<PrintFormat>("a4");

  if (!ticket) return null;

  const handlePrint = () => {
    const url = getTicketPrintUrl(ticket.id, format);
    router.push(url);
    onClose();
  };

  const FORMAT_CHOICES: { id: PrintFormat; label: string; icon: any; desc: string }[] = [
    { id: "a4", label: "A4 Print", icon: FileText, desc: "Full page professional document" },
    { id: "thermal", label: "Thermal Print", icon: Receipt, desc: "Receipt printer format" },
    { id: "label", label: "Label Print", icon: Tag, desc: "Compact tag for device" },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Print Ticket"
      subtitle={`${ticket.id} — ${ticket.customer}`}
      icon={Printer}
      width="max-w-md"
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> Print Preview
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Format selection */}
        <div className="space-y-2">
          <Label>Print Format</Label>
          <div className="grid gap-2">
            {FORMAT_CHOICES.map((opt) => {
              const Icon = opt.icon;
              const active = format === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setFormat(opt.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-[#4361EE] bg-[#4361EE]/5 ring-1 ring-[#4361EE]/20"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-[#4361EE] text-white" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className={`text-sm font-semibold ${active ? "text-[#4361EE]" : ""}`}>{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick summary */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Summary</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{ticket.customer}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Device</span>
              <span className="font-medium">{ticket.model}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium">{ticket.service || ticket.issue}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-border pt-2">
              <span className="font-semibold">Total</span>
              <span className="font-bold">{formatINR(ticket.amount)}</span>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
