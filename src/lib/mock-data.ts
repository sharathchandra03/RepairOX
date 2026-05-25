export type TicketStatus =
  | "received"
  | "diagnosis"
  | "repairing"
  | "qc"
  | "completed"
  | "delivered";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  received: "Received",
  diagnosis: "Diagnosis",
  repairing: "Repairing",
  qc: "Quality Check",
  completed: "Completed",
  delivered: "Delivered",
};

export const STATUS_TONE: Record<TicketStatus, string> = {
  received: "bg-info/10 text-info ring-info/20",
  diagnosis: "bg-warning/10 text-amber-700 ring-warning/30",
  repairing: "bg-brand-50 text-brand-700 ring-brand-200",
  qc: "bg-violet-50 text-violet-700 ring-violet-200",
  completed: "bg-success/10 text-emerald-700 ring-success/30",
  delivered: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export type Ticket = {
  id: string;
  customer: string;
  device: string;
  model: string;
  issue: string;
  status: TicketStatus;
  priority: "low" | "med" | "high" | "urgent";
  technician: string;
  createdAt: string;
  amount: number;
};

export const tickets: Ticket[] = [
  { id: "T-1837", customer: "Rahul Kapoor", device: "iPhone", model: "iPhone 16 Pro Max", issue: "Display replacement", status: "diagnosis", priority: "high", technician: "Anand", createdAt: "13/01/2026", amount: 22500 },
  { id: "T-8624", customer: "Manoj S.", device: "iPhone", model: "iPhone 14", issue: "Liquid damage logic board", status: "repairing", priority: "urgent", technician: "Vikas", createdAt: "11/01/2026", amount: 18999 },
  { id: "T-456",  customer: "Ajay Verma", device: "MacBook", model: "MacBook Air M4", issue: "Battery service", status: "qc", priority: "med", technician: "Pooja", createdAt: "13/01/2026", amount: 12999 },
  { id: "T-156",  customer: "Radha Iyer", device: "iWatch", model: "Watch S8 45mm", issue: "Glass replacement", status: "completed", priority: "low", technician: "Shubham", createdAt: "12/01/2026", amount: 6499 },
  { id: "T-911",  customer: "Vikas Nair", device: "iPad", model: "iPad Air 11”", issue: "Touch panel calibration", status: "received", priority: "med", technician: "Anand", createdAt: "14/01/2026", amount: 4999 },
  { id: "T-204",  customer: "Sneha P.", device: "Android", model: "Pixel 9", issue: "Charging port repair", status: "delivered", priority: "low", technician: "Ravi", createdAt: "10/01/2026", amount: 3499 },
  { id: "T-732",  customer: "Imran Khan", device: "iPhone", model: "iPhone 13", issue: "Speaker no audio", status: "repairing", priority: "high", technician: "Pooja", createdAt: "12/01/2026", amount: 2899 },
  { id: "T-621",  customer: "Anjali R.", device: "Windows", model: "Lenovo Yoga 9i", issue: "Hinge replacement", status: "diagnosis", priority: "med", technician: "Shubham", createdAt: "13/01/2026", amount: 8999 },
];

export const revenueMonthly = [
  { m: "Jan", v: 162 }, { m: "Feb", v: 198 }, { m: "Mar", v: 255 },
  { m: "Apr", v: 220 }, { m: "May", v: 245 }, { m: "Jun", v: 240 },
  { m: "Jul", v: 250 }, { m: "Aug", v: 305 }, { m: "Sep", v: 268 },
  { m: "Oct", v: 285 }, { m: "Nov", v: 232 }, { m: "Dec", v: 290 },
];

export const ordersStatus = [
  { detail: "On Site", assigned: 2, received: 2 },
  { detail: "Pick Up", assigned: 2, received: 2 },
  { detail: "Walk-in", assigned: 2, received: 2 },
];

export const todos = [
  { id: 1, title: "Update Anand (Inventory Team)", desc: "Order 16 Pro Max display for Ticket 1837", flag: "info" as const },
  { id: 2, title: "Send Quotation to Ticket 8624", desc: "Replace T2 IC due to liquid damage on the M3", flag: "info" as const },
  { id: 3, title: "Manoj’s iPhone 14", desc: "Overdue since Dec 2025, update customer & attempt delivery", flag: "danger" as const },
  { id: 4, title: "AC Service due", desc: "Take approval from owner & schedule", flag: "warn" as const },
  { id: 5, title: "Office stock audit", desc: "Check Mobile and Laptop stock in office", flag: "warn" as const },
  { id: 6, title: "Accessories refilling", desc: "Tempered glass & latest mobile pouches to be ordered", flag: "warn" as const },
];

export const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "Home" as const },
  { href: "/tickets", label: "Tickets", icon: "Ticket" as const },
  { href: "/invoice", label: "Invoice", icon: "FileText" as const },
  { href: "/stock", label: "Stock", icon: "Boxes" as const },
  { href: "/contacts", label: "Contacts", icon: "Users" as const },
  { href: "/buy-back", label: "Buy-Back", icon: "Recycle" as const },
  { href: "/price-list", label: "Price List", icon: "ClipboardList" as const },
  { href: "/walk-in", label: "Walk-In", icon: "Store" as const },
  { href: "/expenses", label: "Expenses", icon: "Wallet" as const },
  { href: "/settings", label: "Settings", icon: "Settings" as const },
  { href: "/reports", label: "Reports", icon: "BarChart3" as const },
];
