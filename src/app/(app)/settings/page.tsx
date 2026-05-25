"use client";

import { motion } from "framer-motion";
import { Building2, User, Shield, CreditCard, Plug, Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const SECTIONS = [
  { id: "shop",   icon: Building2, label: "Shop", desc: "Business identity, GSTIN, address" },
  { id: "user",   icon: User,      label: "Profile", desc: "Your account & preferences" },
  { id: "team",   icon: Shield,    label: "Roles", desc: "Technicians, managers, owners" },
  { id: "billing",icon: CreditCard,label: "Billing", desc: "Plan, invoices, taxes" },
  { id: "integ",  icon: Plug,      label: "Integrations", desc: "Razorpay, Tally, WhatsApp" },
  { id: "notif",  icon: Bell,      label: "Notifications", desc: "Email, SMS & push channels" },
];

export default function Settings() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configure"
        title="Settings"
        subtitle="Manage your shop, team and integrations from one polished console."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Vertical nav */}
        <ul className="grid gap-1">
          {SECTIONS.map((s, i) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i }}
            >
              <button
                className={`group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:bg-muted ${i === 0 ? "ring-1 ring-brand-200" : ""}`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${i === 0 ? "brand-gradient text-white shadow-glow" : "bg-muted text-muted-foreground"}`}>
                  <s.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">{s.label}</p>
                  <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                </div>
              </button>
            </motion.li>
          ))}
        </ul>

        {/* Profile card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Avatar name="Shop Owner" size={56} />
              <div>
                <p className="text-lg font-bold">Shop Owner</p>
                <p className="text-sm text-muted-foreground">abc@gmail.com</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">Cancel</Button>
              <Button>Save changes</Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Shop name</Label><Input defaultValue="RepairOX – BTM Layout" /></div>
            <div className="space-y-1.5"><Label>GSTIN</Label><Input defaultValue="29AABCU9603R1ZP" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input defaultValue="+91 91089 55544" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input defaultValue="abc@gmail.com" /></div>
            <div className="md:col-span-2 space-y-1.5"><Label>Address</Label><Input defaultValue="2nd Floor, 100ft Road, Bengaluru 560076" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
