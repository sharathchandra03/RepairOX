"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  X,
  Send,
  Paperclip,
  ArrowLeft,
  Search,
  MoreVertical,
  Smile,
  AtSign,
  Ticket,
  FileText,
  Receipt,
  Store,
  Package,
  Briefcase,
  Truck,
  Wallet,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isOwn: boolean;
  type?: "text" | "file" | "image" | "ticket" | "invoice" | "quote" | "status" | "approval";
  meta?: string;
}

interface Workspace {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  online: number;
  unread: number;
  members: string[];
  color: string;
}

/* ─────────────────────────────────────────────
   Workspace Data
───────────────────────────────────────────── */

const WORKSPACES: Workspace[] = [
  {
    id: "shop",
    name: "Shop",
    icon: <Store className="h-5 w-5" />,
    description: "Front desk & technicians",
    online: 8,
    unread: 2,
    members: ["Anand Rao", "Pooja Iyer", "Vikas Nair", "Sneha Kulkarni", "Amit Shah", "Kavya R.", "Deepak V.", "Lakshmi P."],
    color: "from-blue-500/10 to-blue-600/5",
  },
  {
    id: "stock",
    name: "Stock",
    icon: <Package className="h-5 w-5" />,
    description: "Inventory & purchase orders",
    online: 4,
    unread: 5,
    members: ["Ramesh Kumar", "Divya Menon", "Sanjay T.", "Neha Gupta"],
    color: "from-amber-500/10 to-amber-600/5",
  },
  {
    id: "sales",
    name: "Sales Team",
    icon: <Briefcase className="h-5 w-5" />,
    description: "Leads & customer deals",
    online: 6,
    unread: 3,
    members: ["Priya Sharma", "Arjun Mehta", "Ravi Krishnan", "Sunita Devi", "Mohan K.", "Ananya B."],
    color: "from-emerald-500/10 to-emerald-600/5",
  },
  {
    id: "field",
    name: "Field Team",
    icon: <Truck className="h-5 w-5" />,
    description: "On-site technicians & routes",
    online: 5,
    unread: 1,
    members: ["Suresh Patil", "Karthik Reddy", "Manoj S.", "Vinod Kumar", "Prakash N."],
    color: "from-violet-500/10 to-violet-600/5",
  },
  {
    id: "accounts",
    name: "Accounts",
    icon: <Wallet className="h-5 w-5" />,
    description: "Billing & payments",
    online: 3,
    unread: 4,
    members: ["Meera Joshi", "Rajesh Gupta", "Sonal Thakur"],
    color: "from-rose-500/10 to-rose-600/5",
  },
];

/* ─────────────────────────────────────────────
   Dummy Conversations
───────────────────────────────────────────── */

const CONVERSATIONS: Record<string, ChatMessage[]> = {
  shop: [
    { id: "s1", sender: "Anand Rao", text: "iPhone 16 Pro Max display is ready for collection.", time: "10:32 AM", isOwn: false },
    { id: "s2", sender: "You", text: "Great, I'll call the customer now.", time: "10:34 AM", isOwn: true },
    { id: "s3", sender: "Pooja Iyer", text: "Need approval for the logic board repair on T-8624. Estimate is ₹18,999.", time: "10:45 AM", isOwn: false, type: "approval", meta: "Ticket #T-8624" },
    { id: "s4", sender: "You", text: "Approved. Please proceed with the repair.", time: "10:47 AM", isOwn: true },
    { id: "s5", sender: "Vikas Nair", text: "Customer dropped off a MacBook Air — liquid damage. Assigning to Bench 3.", time: "11:02 AM", isOwn: false, type: "ticket", meta: "Ticket #T-8631" },
    { id: "s6", sender: "Sneha Kulkarni", text: "Reception update: 3 devices ready for pickup today. Calling customers now.", time: "11:15 AM", isOwn: false, type: "status", meta: "Status Update" },
    { id: "s7", sender: "You", text: "Perfect. Make sure we get the feedback forms signed.", time: "11:16 AM", isOwn: true },
  ],
  stock: [
    { id: "st1", sender: "Ramesh Kumar", text: "iPad Air screens running low — only 4 units left in stock.", time: "9:15 AM", isOwn: false, type: "status", meta: "Low Inventory Alert" },
    { id: "st2", sender: "You", text: "Raise a PO for 20 units from the regular supplier.", time: "9:18 AM", isOwn: true },
    { id: "st3", sender: "Ramesh Kumar", text: "PO #PO-4421 created. Awaiting your approval.", time: "9:25 AM", isOwn: false, type: "approval", meta: "PO #PO-4421" },
    { id: "st4", sender: "You", text: "Approved. Expected delivery date?", time: "9:30 AM", isOwn: true },
    { id: "st5", sender: "Ramesh Kumar", text: "Supplier confirmed 3 working days. ETA: Thursday.", time: "9:35 AM", isOwn: false },
    { id: "st6", sender: "Divya Menon", text: "Samsung S24 Ultra batteries received — 12 units. Updated inventory.", time: "10:10 AM", isOwn: false, type: "file", meta: "GRN-0892.pdf" },
  ],
  sales: [
    { id: "sl1", sender: "Priya Sharma", text: "New corporate lead from TechPark Solutions — 50+ devices for AMC.", time: "9:00 AM", isOwn: false, type: "ticket", meta: "Lead #L-2847" },
    { id: "sl2", sender: "You", text: "Excellent! Schedule a site visit for this week.", time: "9:05 AM", isOwn: true },
    { id: "sl3", sender: "Arjun Mehta", text: "Customer is negotiating on the bulk repair quote. Can we offer 10% on 20+ devices?", time: "10:30 AM", isOwn: false },
    { id: "sl4", sender: "You", text: "Yes, approve up to 12% for contracts over ₹2L. Send revised quote.", time: "10:35 AM", isOwn: true },
    { id: "sl5", sender: "Arjun Mehta", text: "Quotation sent.", time: "10:50 AM", isOwn: false, type: "quote", meta: "Quote #Q-1156" },
    { id: "sl6", sender: "Priya Sharma", text: "Follow-up done on L-2844. Customer will confirm by EOD.", time: "11:20 AM", isOwn: false },
    { id: "sl7", sender: "You", text: "Good. Update the CRM status once confirmed.", time: "11:22 AM", isOwn: true },
  ],
  field: [
    { id: "f1", sender: "Suresh Patil", text: "Reached customer location in Koramangala. Starting Samsung TV repair.", time: "9:30 AM", isOwn: false, type: "status", meta: "Visit Started" },
    { id: "f2", sender: "You", text: "Great. Update once done. Next stop is HSR Layout.", time: "9:32 AM", isOwn: true },
    { id: "f3", sender: "Karthik Reddy", text: "Customer in Whitefield not available. Rescheduling.", time: "10:00 AM", isOwn: false },
    { id: "f4", sender: "You", text: "Noted. Move to the Marathahalli appointment instead.", time: "10:05 AM", isOwn: true },
    { id: "f5", sender: "Suresh Patil", text: "Koramangala visit completed. TV panel replaced. Customer signed off.", time: "11:00 AM", isOwn: false, type: "status", meta: "Visit Completed" },
    { id: "f6", sender: "Suresh Patil", text: "Here's the signed service report.", time: "11:02 AM", isOwn: false, type: "image", meta: "service-report-8624.jpg" },
  ],
  accounts: [
    { id: "a1", sender: "Meera Joshi", text: "Invoice #INV-7845 for corporate client is pending approval.", time: "9:45 AM", isOwn: false, type: "invoice", meta: "Invoice #INV-7845 — ₹1,24,500" },
    { id: "a2", sender: "You", text: "Reviewed. Looks correct. Approved.", time: "9:50 AM", isOwn: true },
    { id: "a3", sender: "Meera Joshi", text: "Payment received for INV-7839. ₹45,000 via NEFT.", time: "10:30 AM", isOwn: false, type: "status", meta: "Payment Confirmed" },
    { id: "a4", sender: "Rajesh Gupta", text: "Customer requesting refund for T-8590. Repair was unsatisfactory.", time: "11:00 AM", isOwn: false },
    { id: "a5", sender: "You", text: "Check with the shop team first. If valid, process partial refund of ₹5,000.", time: "11:05 AM", isOwn: true },
    { id: "a6", sender: "Rajesh Gupta", text: "Shop confirmed. Processing refund now.", time: "11:20 AM", isOwn: false, type: "quote", meta: "Refund #RF-0234" },
  ],
};

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */

export function InternalChat() {
  const [open, setOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(CONVERSATIONS);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null!);
  const { currentUser } = usePermissions();
  const userName = currentUser?.name ?? "You";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeWorkspace, open]);

  function sendMessage() {
    if (!input.trim() || !activeWorkspace) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: userName,
      text: input.trim(),
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      isOwn: true,
      type: "text",
    };
    setMessages((prev) => ({
      ...prev,
      [activeWorkspace]: [...(prev[activeWorkspace] || []), msg],
    }));
    setInput("");
  }

  function handleBack() {
    setActiveWorkspace(null);
  }

  const currentWorkspace = WORKSPACES.find((w) => w.id === activeWorkspace);
  const currentMessages = activeWorkspace ? messages[activeWorkspace] || [] : [];
  const totalUnread = WORKSPACES.reduce((sum, w) => sum + w.unread, 0);

  return (
    <>
      {/* ─── Floating Trigger Button ─── */}
      <motion.button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full shadow-lg transition-colors",
          open
            ? "bg-zinc-800 text-white hover:bg-zinc-700"
            : "brand-gradient text-white hover:scale-105 shadow-glow"
        )}
        whileTap={{ scale: 0.92 }}
        aria-label="Internal team chat"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
            {totalUnread}
          </span>
        )}
      </motion.button>

      {/* ─── Chat Panel ─── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed bottom-24 right-6 z-50 flex h-[720px] w-[540px] max-h-[calc(100vh-7rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_25px_60px_-12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(20,30,80,0.04)]"
          >
            <AnimatePresence mode="wait">
              {!activeWorkspace ? (
                <WorkspaceSelector
                  key="selector"
                  workspaces={WORKSPACES}
                  onSelect={setActiveWorkspace}
                />
              ) : (
                <ChatView
                  key="chat"
                  workspace={currentWorkspace!}
                  messages={currentMessages}
                  input={input}
                  setInput={setInput}
                  sendMessage={sendMessage}
                  onBack={handleBack}
                  scrollRef={scrollRef}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─────────────────────────────────────────────
   Workspace Selector View
───────────────────────────────────────────── */

function WorkspaceSelector({
  workspaces,
  onSelect,
}: {
  workspaces: Workspace[];
  onSelect: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col"
    >
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#4361EE] via-[#3B54E8] to-[#3347D6] px-6 py-5">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }} />
        <div className="relative flex items-center gap-3.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.12] ring-1 ring-white/20 backdrop-blur-sm">
            <MessageCircle className="h-[18px] w-[18px] text-white" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-white">Team Communication</h2>
            <p className="mt-0.5 text-[12px] text-white/60 font-medium">Choose where you&apos;d like to start a conversation.</p>
          </div>
        </div>
      </div>

      {/* Workspace Cards */}
      <div className="flex-1 overflow-hidden px-5 py-4">
        <div className="grid h-full grid-cols-2 grid-rows-3 gap-2.5">
          {workspaces.map((ws, i) => (
            <motion.button
              key={ws.id}
              onClick={() => onSelect(ws.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "group relative flex flex-col rounded-[16px] border border-border/70 bg-gradient-to-br p-3.5 text-left transition-all duration-200",
                "hover:border-[#4361EE]/40 hover:shadow-[0_8px_24px_-6px_rgba(67,97,238,0.18),0_0_0_1px_rgba(67,97,238,0.08)] hover:-translate-y-[2px]",
                "active:scale-[0.98] active:shadow-sm cursor-pointer",
                ws.color,
                i === 4 && "col-span-2"
              )}
            >
              {/* Top row: Icon + Badge */}
              <div className="flex items-start justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#4361EE]/[0.08] text-[#4361EE] transition-transform duration-200 group-hover:scale-110">
                  {ws.icon}
                </div>
                {ws.unread > 0 && (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#4361EE] px-1 text-[10px] font-semibold text-white shadow-sm">
                    {ws.unread}
                  </span>
                )}
              </div>

              {/* Name + Description */}
              <div className="mt-2.5 flex-1">
                <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{ws.name}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{ws.description}</p>
              </div>

              {/* Bottom: Avatar stack + Online */}
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center -space-x-1.5">
                  {ws.members.slice(0, 3).map((name) => (
                    <Avatar key={name} name={name} size={20} className="ring-[1.5px] ring-card" />
                  ))}
                  {ws.members.length > 3 && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-muted-foreground ring-[1.5px] ring-card">
                      +{ws.members.length - 3}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-medium text-muted-foreground">{ws.online}</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   Chat View
───────────────────────────────────────────── */

function ChatView({
  workspace,
  messages,
  input,
  setInput,
  sendMessage,
  onBack,
  scrollRef,
}: {
  workspace: Workspace;
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  sendMessage: () => void;
  onBack: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col"
    >
      {/* ─── Chat Header ─── */}
      <div className="relative flex items-center gap-3 overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#4361EE] via-[#3B54E8] to-[#3347D6] px-4 py-3.5">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }} />
        <button
          onClick={onBack}
          className="relative grid h-8 w-8 place-items-center rounded-lg bg-white/[0.1] text-white ring-1 ring-white/15 transition hover:bg-white/[0.18]"
          aria-label="Back to workspaces"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative flex-1 min-w-0">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-white truncate">
            {workspace.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Users className="h-3 w-3 text-white/50" />
            <p className="text-[11px] text-white/60 font-medium">{workspace.members.length} Members · {workspace.online} Online</p>
          </div>
        </div>
        <button className="relative grid h-8 w-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/[0.1] hover:text-white">
          <Search className="h-4 w-4" />
        </button>
        <button className="relative grid h-8 w-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/[0.1] hover:text-white">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Messages ─── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex gap-2.5", msg.isOwn && "flex-row-reverse")}
          >
            {!msg.isOwn && <Avatar name={msg.sender} size={30} />}
            <div className={cn("max-w-[72%]", msg.isOwn && "text-right")}>
              {!msg.isOwn && (
                <p className="mb-1 text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wide">{msg.sender}</p>
              )}

              {/* Meta tag for special message types */}
              {msg.type && msg.type !== "text" && msg.meta && (
                <div
                  className={cn(
                    "mb-1.5 inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[10px] font-medium",
                    msg.type === "ticket" && "bg-[#4361EE]/[0.06] text-[#4361EE]",
                    msg.type === "invoice" && "bg-emerald-500/[0.07] text-emerald-700",
                    msg.type === "quote" && "bg-violet-500/[0.07] text-violet-700",
                    msg.type === "approval" && "bg-amber-500/[0.07] text-amber-700",
                    msg.type === "status" && "bg-slate-500/[0.06] text-slate-600",
                    msg.type === "file" && "bg-orange-500/[0.07] text-orange-700",
                    msg.type === "image" && "bg-pink-500/[0.07] text-pink-700"
                  )}
                >
                  {msg.type === "ticket" && <Ticket className="h-3 w-3" />}
                  {msg.type === "invoice" && <Receipt className="h-3 w-3" />}
                  {msg.type === "quote" && <FileText className="h-3 w-3" />}
                  {msg.type === "file" && <Paperclip className="h-3 w-3" />}
                  {msg.type === "image" && <Paperclip className="h-3 w-3" />}
                  {msg.meta}
                </div>
              )}

              <div
                className={cn(
                  "inline-block rounded-[14px] px-3.5 py-2 text-[13px] leading-relaxed",
                  msg.isOwn
                    ? "bg-[#4361EE] text-white rounded-br-[4px]"
                    : "bg-muted/80 text-foreground rounded-bl-[4px] border border-border/40"
                )}
              >
                {msg.text}
              </div>
              <p className={cn("mt-1 text-[10px] text-muted-foreground/70", msg.isOwn && "text-right")}>
                {msg.time}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="flex items-center gap-0.5 border-t border-border/60 bg-muted/30 px-3 py-1.5">
        <QuickAction icon={<Paperclip className="h-3.5 w-3.5" />} label="Attach" />
        <QuickAction icon={<Smile className="h-3.5 w-3.5" />} label="Emoji" />
        <QuickAction icon={<AtSign className="h-3.5 w-3.5" />} label="Mention" />
        <div className="mx-1 h-4 w-px bg-border/60" />
        <QuickAction icon={<Ticket className="h-3.5 w-3.5" />} label="Ticket" />
        <QuickAction icon={<Receipt className="h-3.5 w-3.5" />} label="Invoice" />
        <QuickAction icon={<FileText className="h-3.5 w-3.5" />} label="Quote" />
      </div>

      {/* ─── Input ─── */}
      <div className="border-t border-border/60 bg-card p-3">
        <div className="flex items-center gap-2.5 rounded-[12px] border border-border/70 bg-background px-3.5 py-2.5 transition-all duration-150 focus-within:border-[#4361EE]/30 focus-within:shadow-[0_0_0_3px_rgba(67,97,238,0.06)]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Write a message..."
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-[8px] transition-all duration-150",
              input.trim()
                ? "brand-gradient text-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                : "bg-muted/60 text-muted-foreground/50"
            )}
            aria-label="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   Quick Action Button
───────────────────────────────────────────── */

function QuickAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
      aria-label={label}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
