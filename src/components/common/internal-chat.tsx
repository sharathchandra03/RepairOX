"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Paperclip } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { CURRENT_USER } from "@/lib/permissions";

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isOwn: boolean;
}

const SEED_MESSAGES: ChatMessage[] = [
  { id: "1", sender: "Anand Rao", text: "iPhone 16 Pro Max display is ready for collection.", time: "10:32 AM", isOwn: false },
  { id: "2", sender: CURRENT_USER.name, text: "Great, I'll call the customer now.", time: "10:34 AM", isOwn: true },
  { id: "3", sender: "Pooja Iyer", text: "Need approval for the logic board repair on T-8624. Estimate is 18,999.", time: "10:45 AM", isOwn: false },
  { id: "4", sender: CURRENT_USER.name, text: "Approved. Please proceed with the repair.", time: "10:47 AM", isOwn: true },
  { id: "5", sender: "Vikas Nair", text: "Stock for iPad Air screens is running low. Should I raise a PO?", time: "11:02 AM", isOwn: false },
];

export function InternalChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  function sendMessage() {
    if (!input.trim()) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: CURRENT_USER.name,
      text: input.trim(),
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      isOwn: true,
    };
    setMessages([...messages, msg]);
    setInput("");
  }

  return (
    <>
      {/* Floating trigger button */}
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
        {!open && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
            3
          </span>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:w-[380px]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-[#4361EE] to-[#3347D6] px-4 py-3">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-white/20">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Team Chat</p>
                <p className="text-[11px] text-white/70">5 members online</p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn("flex gap-2", msg.isOwn && "flex-row-reverse")}
                >
                  {!msg.isOwn && <Avatar name={msg.sender} size={28} />}
                  <div className={cn("max-w-[75%]", msg.isOwn && "text-right")}>
                    {!msg.isOwn && (
                      <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">{msg.sender}</p>
                    )}
                    <div
                      className={cn(
                        "inline-block rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                        msg.isOwn
                          ? "bg-[#4361EE] text-white rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      )}
                    >
                      {msg.text}
                    </div>
                    <p className={cn("mt-0.5 text-[10px] text-muted-foreground", msg.isOwn && "text-right")}>
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <button className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition">
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                  className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition",
                    input.trim()
                      ? "brand-gradient text-white shadow-sm"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
