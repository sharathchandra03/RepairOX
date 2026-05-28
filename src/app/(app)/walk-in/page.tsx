"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, X, ChevronRight, ArrowLeft, ScanBarcode,
  Receipt, FileText, Tag, Wrench, MoreHorizontal, Trash2,
  ShoppingCart, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils";

const CATEGORIES = [
  { id: "phone",  label: "Phone",        emoji: "📱" },
  { id: "laptop", label: "Laptop",       emoji: "💻" },
  { id: "tablet", label: "Tablet",       emoji: "📟" },
  { id: "watch",  label: "Smart Watch",  emoji: "⌚" },
  { id: "pc",     label: "PC",           emoji: "🖥️" },
  { id: "others", label: "Others",       emoji: "🔧" },
];

const BRANDS: Record<string, { id: string; label: string; color: string }[]> = {
  phone: [
    { id: "apple",   label: "Apple",    color: "#111" },
    { id: "samsung", label: "Samsung",  color: "#1428A0" },
    { id: "mi",      label: "Xiaomi",   color: "#FF6900" },
    { id: "realme",  label: "realme",   color: "#B8860B" },
    { id: "vivo",    label: "vivo",     color: "#415FFF" },
    { id: "oppo",    label: "OPPO",     color: "#1D1D1D" },
    { id: "oneplus", label: "OnePlus",  color: "#F5010C" },
    { id: "iqoo",    label: "iQOO",     color: "#1D1D1D" },
    { id: "moto",    label: "Motorola", color: "#5C2D91" },
    { id: "nokia",   label: "NOKIA",    color: "#124191" },
  ],
  laptop: [
    { id: "apple",  label: "Apple",  color: "#111" },
    { id: "asus",   label: "ASUS",   color: "#1D1D1D" },
    { id: "dell",   label: "Dell",   color: "#007DB8" },
    { id: "hp",     label: "HP",     color: "#0096D6" },
    { id: "lenovo", label: "Lenovo", color: "#E2231A" },
  ],
  tablet:  [{ id: "apple", label: "Apple", color: "#111" }, { id: "samsung", label: "Samsung", color: "#1428A0" }],
  watch:   [{ id: "apple", label: "Apple", color: "#111" }, { id: "samsung", label: "Samsung", color: "#1428A0" }],
  pc:      [{ id: "asus", label: "ASUS", color: "#1D1D1D" }, { id: "dell", label: "Dell", color: "#007DB8" }],
  others:  [{ id: "generic", label: "Generic", color: "#6B7280" }],
};

const MODELS: Record<string, string[]> = {
  apple:   ["iPhone 17 Pro Max","iPhone 17 Pro","iPhone 17","iPhone 17e","iPhone 16 Pro Max","iPhone 16 Pro","iPhone 16","iPhone 16 Plus","iPhone 15 Pro Max","iPhone 15 Pro","iPhone 15","iPhone 15 Plus","iPhone 14 Pro Max","iPhone 14 Pro","iPhone 14"],
  samsung: ["Galaxy S25 Ultra","Galaxy S25+","Galaxy S25","Galaxy S24 FE","Galaxy A55","Galaxy A35","Galaxy A15"],
  mi:      ["14 Ultra","14","13T Pro","Redmi Note 13 Pro+"],
  realme:  ["GT 6T","12 Pro+","Narzo 70 Pro"],
  vivo:    ["X100 Pro","V30 Pro","T3 Pro"],
  oppo:    ["Find X8 Pro","Reno 12 Pro","A3 Pro"],
  oneplus: ["13","12R","Nord 4"],
  iqoo:    ["13","Neo 9 Pro","Z9 Turbo"],
  moto:    ["Edge 50 Pro","G85"],
  nokia:   ["C32","G42"],
  asus:    ["Zenfone 11 Ultra","ROG Phone 8"],
  dell:    ["XPS 15","Inspiron 15","Latitude 5540"],
  hp:      ["Spectre x360","Envy 16","Pavilion 15"],
  lenovo:  ["ThinkPad X1 Carbon","IdeaPad Slim 5"],
  generic: ["Device"],
};

const PARTS = [
  { id: "p1", label: "Screen Assembly",    price: 2999, stock: 1  },
  { id: "p2", label: "OLED Assembly",      price: 4499, stock: 22 },
  { id: "p3", label: "Battery",            price: 1299, stock: 3  },
  { id: "p4", label: "Home Button (Grey)", price: 499,  stock: 18 },
  { id: "p5", label: "Back Glass (Black)", price: 699,  stock: 12 },
  { id: "p6", label: "Back Camera",        price: 2199, stock: 8  },
  { id: "p7", label: "Front Camera",       price: 1599, stock: 8  },
];

const QC_ITEMS = [
  "Power On/Restart","Home/Face ID Error","Home Button Function","Touch Functionality",
  "Post Clean Port","Silent Switch","Cell Signal","Sim Installed",
  "Rear Camera","Front Camera","Volume","Audio IC","Touch IC","Post Liquid Damage",
  "Post Charging","Power Button",
];

type QCValue  = "ok" | "fail" | "na";
type CartItem = { id: string; label: string; price: number; qty: number };
type Step     = "category" | "brand" | "model" | "details" | "inventory" | "preqc";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, type: "spring" as const, stiffness: 340, damping: 28 },
  }),
  exit: { opacity: 0, y: -12, transition: { duration: 0.15 } },
};

const slideIn = {
  hidden: { opacity: 0, x: 24 },
  show:  { opacity: 1, x: 0,  transition: { type: "spring" as const, stiffness: 340, damping: 28 } },
  exit:  { opacity: 0, x: -24, transition: { duration: 0.15 } },
};

function PillSearch({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[#4361EE]/20 bg-[#F5F7FF] px-4 py-2.5 focus-within:border-[#4361EE]/50 focus-within:shadow-[0_0_0_3px_rgba(67,97,238,0.10)] transition-all">
      <Search className="h-4 w-4 shrink-0 text-[#4361EE]/50" />
      <input placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-700 placeholder:text-zinc-400 outline-none border-0" />
    </div>
  );
}

function FieldInput({ label, type = "text" }: { label: string; type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <input type={type} className="w-full rounded-xl border border-[#E5E9F8] bg-[#F8F9FF] px-3.5 py-2.5 text-[13px] text-zinc-700 outline-none focus:border-[#4361EE]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(67,97,238,0.08)] transition-all" />
    </div>
  );
}

function FieldSelect({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <select className="w-full appearance-none rounded-xl border border-[#E5E9F8] bg-[#F8F9FF] px-3.5 py-2.5 text-[13px] text-zinc-700 outline-none focus:border-[#4361EE]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(67,97,238,0.08)] transition-all">
        <option value="">--</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function FieldTextarea({ label }: { label: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <textarea rows={3} className="w-full resize-none rounded-xl border border-[#E5E9F8] bg-[#F8F9FF] px-3.5 py-2.5 text-[13px] text-zinc-700 outline-none focus:border-[#4361EE]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(67,97,238,0.08)] transition-all" />
    </div>
  );
}

function ModalInput({ type = "text", className = "" }: { type?: string; className?: string }) {
  return <input type={type} className={cn("h-10 w-full rounded-xl border border-[#E5E9F8] bg-[#F8F9FF] px-3.5 text-[13px] text-zinc-700 outline-none focus:border-[#4361EE]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(67,97,238,0.08)] transition-all", className)} />;
}

function ModalSelect({ options }: { options: string[] }) {
  return (
    <select className="h-10 w-full appearance-none rounded-xl border border-[#E5E9F8] bg-[#F8F9FF] px-3.5 text-[13px] text-zinc-700 outline-none focus:border-[#4361EE]/40 focus:bg-white transition-all">
      <option value="">--</option>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

export default function Page() {
  const [step, setStep]         = useState<Step>("category");
  const [category, setCategory] = useState("");
  const [brand, setBrand]       = useState("");
  const [model, setModel]       = useState("");
  const [cart, setCart]         = useState<CartItem[]>([]);
  const [qc, setQc]             = useState<Record<string, QCValue>>({});
  const [showCustomer, setShowCustomer] = useState(false);
  const [showDone, setShowDone]         = useState(false);
  const [searchItem, setSearchItem]     = useState("");
  const [imei, setImei]         = useState("");
  const [estimate, setEstimate] = useState("");

  const subTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax   = Math.round(subTotal * 0.18);
  const total = subTotal + tax;

  function addToCart(item: Omit<CartItem, "qty">) {
    setCart((c) => {
      const ex = c.find((x) => x.id === item.id);
      if (ex) return c.map((x) => x.id === item.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { ...item, qty: 1 }];
    });
  }
  function removeFromCart(id: string) { setCart((c) => c.filter((x) => x.id !== id)); }

  const STEP_ORDER: Step[] = ["category","brand","model","details","inventory","preqc"];
  const stepIdx = STEP_ORDER.indexOf(step);
  function handleBack() { if (stepIdx > 0) setStep(STEP_ORDER[stepIdx - 1]); }
  function handleNext() { if (stepIdx < STEP_ORDER.length - 1) setStep(STEP_ORDER[stepIdx + 1]); }

  const breadcrumb = ["Category","Brand","Model","Details","Inventory","Pre QC"].slice(0, stepIdx + 1);

  return (
    <div className="flex h-[calc(100vh-60px)] overflow-hidden bg-[#F2F4FB]">

      {/* LEFT PANEL */}
      <div className="flex w-[320px] shrink-0 flex-col bg-white border-r border-[#E8EBF8]">
        <div className="px-4 pt-4 pb-3 border-b border-[#F0F3FA]">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCustomer(true)}
              className="flex flex-1 items-center gap-2.5 rounded-2xl bg-[#EEF1FD] px-3 py-2 hover:bg-[#E4E8FB] transition-all group">
              <div className="h-8 w-8 rounded-full bg-[#4361EE] flex items-center justify-center shrink-0 shadow-[0_4px_10px_rgba(67,97,238,0.3)]">
                <User className="h-4 w-4 text-white" />
              </div>
              <p className="text-[13px] font-semibold text-zinc-700 group-hover:text-[#4361EE] transition-colors">Walk-in Customer</p>
            </button>
            <button onClick={() => setShowCustomer(true)} title="Search"
              className="grid h-9 w-9 place-items-center rounded-xl bg-[#F5F7FF] text-[#4361EE] hover:bg-[#EEF1FD] transition">
              <Search className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowCustomer(true)} title="New Customer"
              className="grid h-9 w-9 place-items-center rounded-xl bg-[#4361EE] text-white shadow-[0_4px_12px_rgba(67,97,238,0.35)] hover:bg-[#3347D6] transition">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[#F0F3FA]">
          <div className="flex items-center gap-2.5 rounded-2xl border border-[#E5E9F8] bg-[#F8F9FF] px-3.5 py-2.5 focus-within:border-[#4361EE]/40 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(67,97,238,0.08)] transition-all">
            <ScanBarcode className="h-4 w-4 shrink-0 text-[#4361EE]/40" />
            <input value={searchItem} onChange={(e) => setSearchItem(e.target.value)}
              placeholder="Item name, SKU or scan barcode"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-700 placeholder:text-zinc-400 outline-none border-0" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
              <div className="h-14 w-14 rounded-2xl bg-[#EEF1FD] flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-[#4361EE]/40" />
              </div>
              <p className="text-[12px] text-zinc-400 text-center leading-relaxed">Cart is empty.<br />Select parts from the right panel.</p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[1fr_32px_64px_64px_20px] gap-2 px-1 mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                <div>Item</div><div className="text-center">Qty</div><div className="text-right">Price</div><div className="text-right">Total</div><div />
              </div>
              <ul className="space-y-1.5">
                <AnimatePresence>
                  {cart.map((item) => (
                    <motion.li key={item.id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className="grid grid-cols-[1fr_32px_64px_64px_20px] gap-2 items-center rounded-xl bg-[#F8F9FF] px-2 py-2.5">
                      <p className="text-[11px] font-medium text-zinc-700 truncate">{item.label}</p>
                      <p className="text-center text-[12px] font-bold text-[#4361EE]">{item.qty}</p>
                      <p className="text-right text-[11px] text-zinc-500">{formatINR(item.price)}</p>
                      <p className="text-right text-[12px] font-semibold text-zinc-800">{formatINR(item.price * item.qty)}</p>
                      <button onClick={() => removeFromCart(item.id)} className="grid place-items-center text-zinc-300 hover:text-rose-500 transition">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-[#F0F3FA] px-4 py-3 shrink-0 space-y-1.5">
          {[
            { label: "Total Items", value: cart.reduce((s, i) => s + i.qty, 0).toString() },
            { label: "Sub Total",   value: formatINR(subTotal) },
            { label: "Discount",    value: "--" },
            { label: "Tax (18%)",   value: formatINR(tax) },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between text-[12px]">
              <span className="text-zinc-500">{row.label}</span>
              <span className="font-medium text-zinc-700">{row.value}</span>
            </div>
          ))}
          <div className="mt-2 rounded-2xl bg-[#EEF1FD] p-[3px]">
            <div className="rounded-[14px] bg-white px-4 py-2.5 flex items-center justify-between shadow-[inset_0_1px_2px_rgba(67,97,238,0.07)]">
              <span className="text-[14px] font-bold text-[#4361EE]">Total</span>
              <span className="text-[15px] font-extrabold text-[#4361EE]">{formatINR(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E8EBF8] bg-white px-6 py-3 shrink-0">
          <div className="flex items-center gap-1 text-[12px]">
            {breadcrumb.map((b, i) => (
              <span key={b} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-300" />}
                <span className={cn("font-medium", i === breadcrumb.length - 1 ? "text-[#4361EE] font-semibold" : "text-zinc-400")}>{b}</span>
              </span>
            ))}
          </div>
          {step !== "category" && (
            <button onClick={handleBack}
              className="flex items-center gap-1.5 rounded-full border border-[#E5E9F8] bg-[#F5F7FF] px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-[#EEF1FD] transition">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">

            {step === "category" && (
              <motion.div key="category" variants={slideIn} initial="hidden" animate="show" exit="exit">
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-widest text-[#4361EE]/60 font-semibold mb-0.5">Step 1 of 6</p>
                  <h2 className="text-xl font-extrabold text-zinc-800">Select Category</h2>
                </div>
                <PillSearch placeholder="Search category..." />
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {CATEGORIES.map((cat, i) => (
                    <motion.button key={cat.id} custom={i} variants={fadeUp} initial="hidden" animate="show"
                      onClick={() => { setCategory(cat.id); setStep("brand"); }}
                      className="group relative flex flex-col items-center gap-3 rounded-3xl border border-[#E5E9F8] bg-[#F8F9FF] p-7 hover:border-[#4361EE]/25 hover:bg-white hover:shadow-[0_8px_32px_rgba(67,97,238,0.12)] transition-all duration-300">
                      <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 bg-[radial-gradient(ellipse_at_center,rgba(67,97,238,0.05)_0%,transparent_70%)] pointer-events-none transition-opacity duration-300" />
                      <span className="text-4xl">{cat.emoji}</span>
                      <span className="text-[13px] font-semibold text-zinc-600 group-hover:text-[#4361EE] transition-colors">{cat.label}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === "brand" && (
              <motion.div key="brand" variants={slideIn} initial="hidden" animate="show" exit="exit">
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-widest text-[#4361EE]/60 font-semibold mb-0.5">Step 2 of 6</p>
                  <h2 className="text-xl font-extrabold text-zinc-800">Select Brand</h2>
                </div>
                <PillSearch placeholder="Search brand..." />
                <div className="mt-5 grid grid-cols-4 gap-3">
                  <motion.button custom={0} variants={fadeUp} initial="hidden" animate="show"
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#4361EE]/30 bg-[#EEF1FD] py-5 hover:border-[#4361EE]/60 transition-all">
                    <div className="h-8 w-8 rounded-full bg-[#4361EE] flex items-center justify-center shadow-[0_4px_12px_rgba(67,97,238,0.35)]">
                      <Plus className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#4361EE]">Add Brand</span>
                  </motion.button>
                  {(BRANDS[category] ?? []).map((b, i) => (
                    <motion.button key={b.id} custom={i + 1} variants={fadeUp} initial="hidden" animate="show"
                      onClick={() => { setBrand(b.id); setStep("model"); }}
                      className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-[#E5E9F8] bg-white py-5 hover:border-[#4361EE]/30 hover:shadow-[0_6px_24px_rgba(67,97,238,0.1)] transition-all duration-200">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center text-[12px] font-black text-white shadow-sm" style={{ background: b.color }}>
                        {b.label.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[11px] font-semibold text-zinc-600">{b.label}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === "model" && (
              <motion.div key="model" variants={slideIn} initial="hidden" animate="show" exit="exit">
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-widest text-[#4361EE]/60 font-semibold mb-0.5">Step 3 of 6</p>
                  <h2 className="text-xl font-extrabold text-zinc-800">Select Model</h2>
                </div>
                <PillSearch placeholder="Search model..." />
                <div className="mt-5 grid grid-cols-4 gap-2.5">
                  <motion.button custom={0} variants={fadeUp} initial="hidden" animate="show"
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#4361EE]/30 bg-[#EEF1FD] py-5 hover:border-[#4361EE]/60 transition-all">
                    <div className="h-7 w-7 rounded-full bg-[#4361EE] flex items-center justify-center shadow-[0_4px_10px_rgba(67,97,238,0.3)]">
                      <Plus className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#4361EE]">Add Model</span>
                  </motion.button>
                  {(MODELS[brand] ?? []).map((m, i) => (
                    <motion.button key={m} custom={i + 1} variants={fadeUp} initial="hidden" animate="show"
                      onClick={() => { setModel(m); setStep("details"); }}
                      className="flex items-center justify-center rounded-2xl border border-[#E5E9F8] bg-white px-3 py-4 text-center text-[12px] font-medium text-zinc-600 hover:border-[#4361EE]/30 hover:bg-[#F5F7FF] hover:text-[#4361EE] hover:shadow-[0_4px_16px_rgba(67,97,238,0.08)] transition-all">
                      {m}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === "details" && (
              <motion.div key="details" variants={slideIn} initial="hidden" animate="show" exit="exit" className="max-w-2xl">
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-widest text-[#4361EE]/60 font-semibold mb-0.5">Step 4 of 6 - {model}</p>
                  <h2 className="text-xl font-extrabold text-zinc-800">Repair Details</h2>
                </div>
                <PillSearch placeholder="Search Part or Scan Barcode" />
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">IMEI / Serial Number</label>
                    <input value={imei} onChange={(e) => setImei(e.target.value)}
                      className="w-full rounded-xl border border-[#E5E9F8] bg-[#F8F9FF] px-3.5 py-2.5 text-[13px] text-zinc-700 outline-none focus:border-[#4361EE]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(67,97,238,0.08)] transition-all" />
                    <div className="flex gap-2">
                      {["Passcode","Pattern Lock"].map((l) => (
                        <button key={l} className="rounded-full bg-[#4361EE] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#3347D6] active:scale-95 transition-all shadow-[0_4px_10px_rgba(67,97,238,0.25)]">{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Estimate</label>
                    <div className="rounded-2xl border border-[#4361EE]/20 bg-[#EEF1FD] p-[3px]">
                      <input value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="0.00"
                        className="w-full rounded-[14px] bg-white px-3.5 py-2.5 text-[16px] font-bold text-[#4361EE] outline-none placeholder:text-[#4361EE]/25 shadow-[inset_0_1px_2px_rgba(67,97,238,0.07)]" />
                    </div>
                  </div>
                  <FieldInput label="Warranty Applicable" />
                  <FieldSelect label="Repair Task Status" options={["Open","In Progress","Awaiting Part","Done"]} />
                  <FieldInput label="Assigned by" />
                  <FieldSelect label="Device Physical Location" options={["Counter","Workshop","Shelf A","Shelf B"]} />
                  <FieldInput label="Assigned to" />
                  <FieldSelect label="Repair Task Type" options={["Hardware","Software","Diagnostic"]} />
                  <FieldInput label="Task Due Date and Time" type="datetime-local" />
                  <FieldSelect label="Device Network" options={["Unlocked","Jio","Airtel","Vi","BSNL"]} />
                  <FieldTextarea label="Diagnostic Note" />
                  <FieldTextarea label="Additional Note" />
                </div>
              </motion.div>
            )}

            {step === "inventory" && (
              <motion.div key="inventory" variants={slideIn} initial="hidden" animate="show" exit="exit">
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-widest text-[#4361EE]/60 font-semibold mb-0.5">Step 5 of 6 - {model}</p>
                  <h2 className="text-xl font-extrabold text-zinc-800">Select Parts</h2>
                </div>
                <PillSearch placeholder="Search Part or Scan Barcode" />
                <div className="mt-5 grid grid-cols-4 gap-3">
                  <motion.button custom={0} variants={fadeUp} initial="hidden" animate="show"
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#4361EE]/30 bg-[#EEF1FD] py-5 hover:border-[#4361EE]/60 transition-all">
                    <div className="h-8 w-8 rounded-full bg-[#4361EE] flex items-center justify-center shadow-[0_4px_12px_rgba(67,97,238,0.35)]">
                      <Plus className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-[12px] font-semibold text-[#4361EE]">Add Part</span>
                  </motion.button>
                  {PARTS.map((p, i) => (
                    <motion.button key={p.id} custom={i + 1} variants={fadeUp} initial="hidden" animate="show"
                      onClick={() => addToCart({ id: p.id, label: p.label, price: p.price })}
                      className="group flex flex-col gap-2 rounded-2xl border border-[#E5E9F8] bg-white p-4 text-left hover:border-[#4361EE]/30 hover:shadow-[0_6px_24px_rgba(67,97,238,0.1)] active:scale-[0.97] transition-all duration-200">
                      <p className="text-[12px] font-semibold text-zinc-700 group-hover:text-[#4361EE] transition-colors leading-tight">{p.label}</p>
                      <p className="text-[14px] font-extrabold text-[#4361EE]">{formatINR(p.price)}</p>
                      <p className="text-[10px] text-zinc-400">On Hand: {String(p.stock).padStart(2, "0")}</p>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === "preqc" && (
              <motion.div key="preqc" variants={slideIn} initial="hidden" animate="show" exit="exit" className="max-w-2xl">
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-widest text-[#4361EE]/60 font-semibold mb-0.5">Step 6 of 6</p>
                  <h2 className="text-xl font-extrabold text-zinc-800">Pre-QC Checklist</h2>
                  <p className="text-[12px] text-zinc-400 mt-1">Tap each check to cycle: OK / Fail / N/A</p>
                </div>
                <div className="rounded-3xl border border-[#4361EE]/20 bg-[#EEF1FD] p-[4px]">
                  <div className="rounded-[22px] bg-white p-5 shadow-[inset_0_1px_2px_rgba(67,97,238,0.06)]">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                      {QC_ITEMS.map((item, i) => {
                        const val = qc[item] ?? "na";
                        return (
                          <motion.div key={item} custom={i} variants={fadeUp} initial="hidden" animate="show"
                            className="flex items-center justify-between gap-2 rounded-xl border border-[#F0F3FA] bg-[#FAFBFF] px-3 py-2">
                            <span className="text-[12px] font-medium text-zinc-700 flex-1">{item}</span>
                            <div className="flex gap-1 shrink-0">
                              {(["ok","fail","na"] as QCValue[]).map((v) => (
                                <button key={v} onClick={() => setQc({ ...qc, [item]: v })}
                                  className={cn(
                                    "h-6 w-6 rounded-lg text-[10px] font-bold transition-all active:scale-95",
                                    val === v
                                      ? v === "ok"   ? "bg-emerald-500 text-white shadow-sm"
                                        : v === "fail" ? "bg-rose-500 text-white shadow-sm"
                                        : "bg-zinc-400 text-white shadow-sm"
                                      : "bg-[#F0F3FA] text-zinc-400 hover:bg-[#E5E9F8]"
                                  )}>
                                  {v === "ok" ? "V" : v === "fail" ? "X" : "-"}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* ACTION BAR */}
        <div className="border-t border-[#E8EBF8] bg-white px-6 py-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { icon: Receipt,        label: "View Tickets"    },
              { icon: FileText,       label: "View Invoices"   },
              { icon: Tag,            label: "Create Estimate" },
              { icon: Wrench,         label: "Warranty Claim"  },
              { icon: MoreHorizontal, label: "More Actions"    },
            ].map(({ icon: Icon, label }) => (
              <button key={label}
                className="flex items-center gap-1.5 rounded-xl border border-[#E5E9F8] bg-[#F8F9FF] px-3 py-2 text-[11px] font-medium text-zinc-600 hover:border-[#4361EE]/25 hover:bg-white hover:text-[#4361EE] transition-all">
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
            <div className="flex-1" />
            <button className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-[12px] font-semibold text-rose-600 hover:bg-rose-100 active:scale-[0.97] transition-all">
              <Trash2 className="h-3.5 w-3.5" /> Cancel
            </button>
            {step !== "preqc" ? (
              <button onClick={handleNext} disabled={step === "category" || step === "brand" || step === "model"}
                className={cn("rounded-2xl px-6 py-2 text-[13px] font-bold text-white transition-all active:scale-[0.97]",
                  step === "details" || step === "inventory"
                    ? "bg-[#4361EE] shadow-[0_8px_24px_rgba(67,97,238,0.35)] hover:bg-[#3347D6]"
                    : "bg-zinc-300 cursor-not-allowed")}>
                Next
              </button>
            ) : (
              <button onClick={() => setShowDone(true)}
                className="rounded-2xl bg-emerald-500 px-6 py-2 text-[13px] font-bold text-white shadow-[0_8px_24px_rgba(34,197,94,0.35)] hover:bg-emerald-600 active:scale-[0.97] transition-all">
                Create Ticket
              </button>
            )}
            <button className="rounded-2xl border border-[#E5E9F8] bg-white px-5 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-[#F5F7FF] hover:border-[#4361EE]/25 transition-all">
              Checkout
            </button>
          </div>
        </div>
      </div>

      {/* NEW CUSTOMER MODAL */}
      <AnimatePresence>
        {showCustomer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-sm" onClick={() => setShowCustomer(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className="fixed inset-x-0 top-[8%] z-50 mx-auto w-full max-w-[500px] rounded-3xl bg-white p-[3px] shadow-[0_32px_80px_rgba(0,0,0,0.18)]">
              <div className="rounded-[22px] bg-white overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F3FA]">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#4361EE]/60 font-semibold">POS</p>
                    <h2 className="text-[17px] font-extrabold text-zinc-800 mt-0.5">New Customer</h2>
                  </div>
                  <button onClick={() => setShowCustomer(false)}
                    className="grid h-8 w-8 place-items-center rounded-xl bg-[#F5F7FF] text-zinc-400 hover:bg-[#EEF1FD] hover:text-[#4361EE] transition">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex border-b border-[#F0F3FA]">
                  {["Contact","Address","Additional Details"].map((t, i) => (
                    <button key={t} className={cn("flex-1 py-2.5 text-[12px] font-semibold transition-colors",
                      i === 0 ? "text-[#4361EE] border-b-2 border-[#4361EE]" : "text-zinc-400 hover:text-zinc-600")}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Customer Group</label><ModalSelect options={["Walk-in","Regular","VIP"]} /></div>
                    <div className="space-y-1"><label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Tax Class</label><ModalSelect options={["None","GST 18%","GST 28%"]} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">First Name</label><ModalInput /></div>
                    <div className="space-y-1"><label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Last Name</label><ModalInput /></div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Email</label>
                    <div className="flex gap-2">
                      <ModalInput type="email" className="flex-1" />
                      <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#4361EE] text-white shadow-[0_4px_12px_rgba(67,97,238,0.3)] hover:bg-[#3347D6] transition"><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Phone</label>
                    <div className="flex gap-2">
                      <div className="flex h-10 items-center gap-1 rounded-xl border border-[#E5E9F8] bg-[#F8F9FF] px-3 text-[13px] shrink-0">IN</div>
                      <ModalInput type="tel" className="flex-1" />
                      <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#4361EE] text-white shadow-[0_4px_12px_rgba(67,97,238,0.3)] hover:bg-[#3347D6] transition"><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">How did you hear about us?</label>
                    <ModalSelect options={["Walk-in","Google","Instagram","Referral","Other"]} />
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-[13px] font-bold text-zinc-700">Notifications</p>
                      <p className="text-[11px] text-zinc-400">Email Alert</p>
                    </div>
                    <div className="h-6 w-11 rounded-full bg-[#4361EE] relative cursor-pointer">
                      <div className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
                    </div>
                  </div>
                </div>
                <div className="px-6 pb-5">
                  <div className="rounded-2xl bg-[#4361EE] p-[2px] shadow-[0_8px_24px_rgba(67,97,238,0.35)]">
                    <button onClick={() => setShowCustomer(false)}
                      className="w-full rounded-[14px] bg-[#4361EE] py-3 text-[14px] font-bold text-white hover:bg-[#3347D6] transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] active:scale-[0.98]">
                      Save Customer
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* POST-TICKET MODAL */}
      <AnimatePresence>
        {showDone && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-sm" onClick={() => setShowDone(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 28 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 28 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="fixed inset-x-0 top-[10%] z-50 mx-auto w-full max-w-[540px] rounded-3xl bg-white p-[3px] shadow-[0_32px_80px_rgba(0,0,0,0.18)]">
              <div className="rounded-[22px] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F3FA]">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-emerald-500 font-semibold">Ticket Created</p>
                    <h2 className="text-[17px] font-extrabold text-zinc-800 mt-0.5">You probably want to...</h2>
                  </div>
                  <button onClick={() => setShowDone(false)}
                    className="grid h-8 w-8 place-items-center rounded-xl bg-[#F5F7FF] text-zinc-400 hover:bg-[#EEF1FD] hover:text-[#4361EE] transition">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-5 grid grid-cols-3 gap-3">
                  {[
                    { emoji: "🖨️", label: "Print Label",             special: false },
                    { emoji: "🧾", label: "Print Service Receipt",    special: false },
                    { emoji: "📋", label: "Print Thermal Receipt",    special: false },
                    { emoji: "📝", label: "View Ticket",              special: false },
                    { emoji: "✉️", label: "Email Ticket",             special: false },
                    { emoji: "",   label: "+ New Sale",               special: true  },
                  ].map((item, i) => (
                    <motion.button key={item.label} custom={i} variants={fadeUp} initial="hidden" animate="show"
                      className={cn(
                        "flex flex-col items-center justify-center gap-3 rounded-2xl p-6 transition-all active:scale-[0.97]",
                        item.special
                          ? "bg-[#4361EE] text-white shadow-[0_8px_24px_rgba(67,97,238,0.35)] hover:bg-[#3347D6]"
                          : "border border-[#E5E9F8] bg-[#F8F9FF] hover:border-[#4361EE]/25 hover:bg-white hover:shadow-[0_6px_20px_rgba(67,97,238,0.1)]"
                      )}>
                      {item.emoji && <span className="text-3xl">{item.emoji}</span>}
                      <span className={cn("text-[12px] font-semibold text-center", item.special ? "text-white" : "text-zinc-700")}>
                        {item.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}