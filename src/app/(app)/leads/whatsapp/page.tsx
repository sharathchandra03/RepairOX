"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  MessageSquare, Search, Plus, Check, CheckCheck, Clock, Image,
  Send, Smile, Paperclip, MoreVertical,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";

interface WAContact {
  id: string;
  name: string;
  phone: string;
  company: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

interface ChatMessage {
  id: string;
  text: string;
  time: string;
  isOwn: boolean;
  status: "sent" | "delivered" | "read";
}

const CONTACTS: WAContact[] = [
  { id: "1", name: "Aarav Mehta",    phone: "+91 98765 43210", company: "TechNova",   lastMessage: "Sure, I'll drop off the devices tomorrow morning.",     time: "2:45 PM", unread: 0, online: true },
  { id: "2", name: "Diya Sen",       phone: "+91 65432 10987", company: "GreenLeaf",  lastMessage: "Can we schedule the demo for next Tuesday?",            time: "Yesterday", unread: 2, online: true },
  { id: "3", name: "Bina Soni",      phone: "+91 87654 32109", company: "DesignHub",  lastMessage: "Thanks for the repair photos!",                         time: "Yesterday", unread: 0, online: false },
  { id: "4", name: "Falguni Patel",  phone: "+91 43210 98765", company: "NexaCore",   lastMessage: "Contract signed! Looking forward to it.",               time: "Jul 16",   unread: 0, online: false },
  { id: "5", name: "Chetan Bhatt",   phone: "+91 76543 21098", company: "",           lastMessage: "Reminder: estimate valid until Friday",                time: "Jul 16",   unread: 0, online: false },
  { id: "6", name: "Gaurav Pillai",  phone: "+91 32109 87654", company: "",           lastMessage: "Sent the case study for fleet repairs",                time: "Jul 15",   unread: 0, online: true },
  { id: "7", name: "Heena Kapoor",   phone: "+91 21098 76543", company: "PixelCraft", lastMessage: "Will send the updated agreement by EOD",               time: "Jul 15",   unread: 0, online: false },
  { id: "8", name: "Jaya Iyer",      phone: "+91 99887 76655", company: "SwiftServe", lastMessage: "Hi Jaya, following up on the Pixel 8 repair...",        time: "Jul 14",   unread: 1, online: false },
];

const CHAT_MESSAGES: Record<string, ChatMessage[]> = {
  "1": [
    { id: "m1", text: "Hi Aarav, just wanted to confirm the device drop-off for the fleet repair.", time: "2:30 PM", isOwn: true, status: "read" },
    { id: "m2", text: "We'll have all 12 iPhones ready for inspection.", time: "2:32 PM", isOwn: true, status: "read" },
    { id: "m3", text: "Sure, I'll drop off the devices tomorrow morning. Thanks!", time: "2:45 PM", isOwn: false, status: "read" },
  ],
  "2": [
    { id: "m4", text: "Hi Diya, the iPad classroom proposal is ready with 3 pricing tiers.", time: "10:00 AM", isOwn: true, status: "delivered" },
    { id: "m5", text: "Can we schedule the demo for next Tuesday?", time: "11:30 AM", isOwn: false, status: "read" },
    { id: "m6", text: "I have a few questions about the premium tier.", time: "11:31 AM", isOwn: false, status: "read" },
  ],
};

export default function WhatsAppPage() {
  const [activeContact, setActiveContact] = useState<string>("1");
  const [query, setQuery] = useState("");
  const [msgInput, setMsgInput] = useState("");
  const [tab, setTab] = useState<"all" | "unread">("all");

  const filteredContacts = CONTACTS.filter((c) => {
    const matchQ = !query || `${c.name} ${c.phone} ${c.company}`.toLowerCase().includes(query.toLowerCase());
    const matchTab = tab === "all" || c.unread > 0;
    return matchQ && matchTab;
  });

  const active = CONTACTS.find((c) => c.id === activeContact);
  const messages = CHAT_MESSAGES[activeContact] || [];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Sales"
        title="WhatsApp"
        subtitle="Conversations with leads and customers."
        actions={
          <Can permission="send_communications">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Conversation
            </Button>
          </Can>
        }
      />

      {/* Split panel */}
      <div className="flex h-[calc(100vh-220px)] overflow-hidden rounded-2xl border border-border bg-card shadow-card">

        {/* Left: Contact list */}
        <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
          {/* Search + tabs */}
          <div className="border-b border-border p-3 space-y-2">
            <Input value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Search..." iconLeft={<Search className="h-4 w-4" />} className="h-9" />
            <div className="flex gap-1">
              <button onClick={() => setTab("all")} className={cn("rounded-full px-3 py-1 text-[11px] font-semibold transition", tab === "all" ? "bg-[#4361EE] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200")}>All</button>
              <button onClick={() => setTab("unread")} className={cn("rounded-full px-3 py-1 text-[11px] font-semibold transition", tab === "unread" ? "bg-[#4361EE] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200")}>Unread</button>
            </div>
          </div>

          {/* Contact list */}
          <div className="flex-1 overflow-y-auto">
            {filteredContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setActiveContact(contact.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-3 text-left transition border-b border-border/50",
                  activeContact === contact.id ? "bg-[#EEF1FD]" : "hover:bg-muted/50"
                )}
              >
                <div className="relative shrink-0">
                  <Avatar name={contact.name} size={38} />
                  {contact.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className={cn("text-[13px] truncate", contact.unread > 0 ? "font-bold" : "font-semibold")}>{contact.name}</p>
                    <span className={cn("text-[10px] shrink-0", contact.unread > 0 ? "text-green-600 font-semibold" : "text-muted-foreground")}>{contact.time}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="truncate text-[11px] text-muted-foreground">{contact.lastMessage}</p>
                    {contact.unread > 0 && (
                      <span className="ml-1 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">{contact.unread}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Chat area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {active ? (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={active.name} size={36} />
                  <div>
                    <p className="text-sm font-semibold">{active.name}</p>
                    <p className="text-[11px] text-muted-foreground">{active.company || active.phone}</p>
                  </div>
                </div>
                <button className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700 transition">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[hsl(228,30%,97%)]">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.isOwn ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[70%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                      msg.isOwn ? "bg-[#4361EE] text-white rounded-br-md" : "bg-white border border-border text-zinc-800 rounded-bl-md shadow-sm"
                    )}>
                      <p>{msg.text}</p>
                      <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", msg.isOwn ? "text-white/70" : "text-muted-foreground")}>
                        {msg.time}
                        {msg.isOwn && (msg.status === "read" ? <CheckCheck className="h-3 w-3 text-sky-300" /> : <CheckCheck className="h-3 w-3" />)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input area */}
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                  <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:text-zinc-600 transition"><Smile className="h-4 w-4" /></button>
                  <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:text-zinc-600 transition"><Paperclip className="h-4 w-4" /></button>
                  <input
                    value={msgInput}
                    onChange={(e) => setMsgInput(e.target.value)}
                    placeholder="Type a message..."
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                  />
                  <button className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition", msgInput.trim() ? "brand-gradient text-white" : "bg-zinc-100 text-zinc-400")}>
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 font-semibold">Select a conversation</p>
                <p className="text-sm text-muted-foreground">Choose a contact to start chatting.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
