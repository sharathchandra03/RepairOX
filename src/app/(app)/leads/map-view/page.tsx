"use client";

import { motion } from "framer-motion";
import { MapPin, Users, Building2, Target, Phone, Mail } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatINR } from "@/lib/utils";

interface MapLead {
  id: string;
  name: string;
  company: string;
  location: string;
  value: number;
  status: string;
  lat: number;
  lng: number;
}

const MAP_LEADS: MapLead[] = [
  { id: "1", name: "Aarav Mehta",    company: "TechNova",   location: "Bengaluru",  value: 125000, status: "qualified", lat: 12.97, lng: 77.59 },
  { id: "2", name: "Bina Soni",      company: "DesignHub",  location: "Mumbai",     value: 18000,  status: "contacted", lat: 19.07, lng: 72.87 },
  { id: "3", name: "Diya Sen",       company: "GreenLeaf",  location: "Delhi",      value: 95000,  status: "proposal",  lat: 28.61, lng: 77.20 },
  { id: "4", name: "Eshan Roy",      company: "CloudSync",  location: "Chennai",    value: 8500,   status: "new",       lat: 13.08, lng: 80.27 },
  { id: "5", name: "Falguni Patel",  company: "NexaCore",   location: "Ahmedabad",  value: 280000, status: "won",       lat: 23.02, lng: 72.57 },
  { id: "6", name: "Heena Kapoor",   company: "PixelCraft", location: "Bengaluru",  value: 72000,  status: "qualified", lat: 12.93, lng: 77.62 },
  { id: "7", name: "Jaya Iyer",      company: "SwiftServe", location: "Hyderabad",  value: 65000,  status: "proposal",  lat: 17.38, lng: 78.48 },
  { id: "8", name: "Gaurav Pillai",  company: "",           location: "Kochi",      value: 9800,   status: "new",       lat: 9.93,  lng: 76.26 },
];

const CITY_STATS = [
  { city: "Bengaluru", leads: 3, value: 216800, color: "bg-[#4361EE]" },
  { city: "Mumbai",    leads: 1, value: 18000,  color: "bg-violet-500" },
  { city: "Delhi",     leads: 1, value: 95000,  color: "bg-amber-500" },
  { city: "Chennai",   leads: 1, value: 8500,   color: "bg-sky-500" },
  { city: "Ahmedabad", leads: 1, value: 280000, color: "bg-emerald-500" },
  { city: "Hyderabad", leads: 1, value: 65000,  color: "bg-rose-500" },
  { city: "Kochi",     leads: 1, value: 9800,   color: "bg-orange-500" },
];

const STATUS_DOT: Record<string, string> = {
  new: "bg-sky-500",
  contacted: "bg-violet-500",
  qualified: "bg-indigo-500",
  proposal: "bg-amber-500",
  won: "bg-emerald-500",
};

export default function MapViewPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Map View"
        subtitle="Leads plotted geographically to spot coverage gaps and hot zones."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Map placeholder */}
        <div className="relative min-h-[500px] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-50/50 via-white to-indigo-50/30 shadow-card">
          {/* India outline approximation with positioned dots */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-[400px] w-[350px]">
              {MAP_LEADS.map((lead, i) => {
                const top = `${100 - ((lead.lat - 8) / 22) * 100}%`;
                const left = `${((lead.lng - 72) / 10) * 100}%`;
                return (
                  <motion.div
                    key={lead.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 * i, type: "spring", stiffness: 200 }}
                    className="absolute group"
                    style={{ top, left }}
                  >
                    <div className="relative">
                      <div className={cn("h-4 w-4 rounded-full border-2 border-white shadow-md", STATUS_DOT[lead.status] || "bg-zinc-400")} />
                      <div className={cn("absolute -inset-2 animate-ping rounded-full opacity-20", STATUS_DOT[lead.status] || "bg-zinc-400")} />
                    </div>
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-2 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 whitespace-nowrap z-10">
                      <p className="text-[11px] font-semibold">{lead.name}</p>
                      <p className="text-[10px] text-muted-foreground">{lead.company || lead.location} · {formatINR(lead.value)}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
          {/* Map placeholder overlay */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white/80 to-transparent px-5 pb-4 pt-8">
            <p className="text-[11px] text-muted-foreground text-center">
              Interactive map — connect Google Maps or Mapbox API for full functionality
            </p>
          </div>
        </div>

        {/* City breakdown sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By City</p>
            <ul className="mt-3 space-y-3">
              {CITY_STATS.map((city) => (
                <li key={city.city} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("h-2.5 w-2.5 rounded-full", city.color)} />
                    <span className="text-[12.5px] font-medium text-zinc-800">{city.city}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[12px] font-semibold tnum">{city.leads}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground tnum">{formatINR(city.value)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Lead pins legend */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
            <div className="mt-3 space-y-2">
              {Object.entries(STATUS_DOT).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2 text-[12px]">
                  <span className={cn("h-3 w-3 rounded-full", color)} />
                  <span className="capitalize text-zinc-700">{status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick stats */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold tnum">{MAP_LEADS.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Leads</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold tnum">{CITY_STATS.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cities</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
