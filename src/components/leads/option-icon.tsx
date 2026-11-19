"use client";
/* RepairOX — icons for Lead dropdown options (Lead Stage, Lead Nature, …).
   An option's icon is chosen in Settings → Lead Settings → Form Edit and
   stored on lead_options.icon as either:
     • "i:<key>"  — one of the curated icons below (crisp, theme-matching), or
     • an emoji   — any single emoji the admin types (🔥 🌤 ❄ 📦 …).
   Unset → the automatic keyword icon, so existing options keep working. */
import {
  AlarmClock, BadgeCheck, Ban, Briefcase, CalendarClock, CheckCircle2, Clock, CreditCard, FileText, Flag, Flame,
  Gift, Handshake, Heart, Home, Hourglass, MapPin, MessageCircle, Package, PauseCircle, PhoneCall, PhoneOff,
  RefreshCw, Snowflake, Sparkles, Star, Store, Sun, Tag, ThumbsDown, ThumbsUp, Trophy, Truck, UserCheck, Wrench, XCircle, Zap,
} from "lucide-react";

export const OPTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, calendar: CalendarClock, phone: PhoneCall, "phone-off": PhoneOff, truck: Truck, home: Home,
  store: Store, handshake: Handshake, trophy: Trophy, x: XCircle, message: MessageCircle, tag: Tag, clock: Clock,
  alarm: AlarmClock, hourglass: Hourglass, pause: PauseCircle, refresh: RefreshCw, check: CheckCircle2, badge: BadgeCheck,
  user: UserCheck, package: Package, wrench: Wrench, file: FileText, card: CreditCard, pin: MapPin, flag: Flag,
  star: Star, heart: Heart, gift: Gift, briefcase: Briefcase, zap: Zap, flame: Flame, sun: Sun, snowflake: Snowflake,
  "thumbs-up": ThumbsUp, "thumbs-down": ThumbsDown, ban: Ban,
};

/** Render a stored icon value. Returns null when unset/unknown (caller falls back). */
export function renderOptionIcon(icon: string | undefined, className = "h-3.5 w-3.5"): React.ReactNode | null {
  if (!icon) return null;
  if (icon.startsWith("i:")) {
    const C = OPTION_ICONS[icon.slice(2)];
    return C ? <C className={className} /> : null;
  }
  return <span className="leading-none">{icon}</span>;
}

/** Quick emoji suggestions in the picker (any emoji can be typed too). */
export const EMOJI_SUGGESTIONS = ["🔥", "🌤", "❄", "⭐", "✅", "❌", "📞", "📅", "📦", "🚚", "🏠", "🏪", "🤝", "🏆", "⏳", "💬", "🛠", "💰", "⚡", "🎯"];

export const OPTION_COLORS = [
  "#2563EB", "#0284C7", "#0891B2", "#0D9488", "#059669", "#65A30D", "#CA8A04", "#D97706",
  "#EA580C", "#E11D48", "#DB2777", "#C026D3", "#9333EA", "#7C3AED", "#4F46E5", "#475569",
];
