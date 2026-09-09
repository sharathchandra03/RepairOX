import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-IN").format(n);
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Normalize a phone number into the digits-only form expected by wa.me.
 * - Strips spaces, dashes, brackets and a leading "+".
 * - If the result is a bare 10-digit Indian mobile number, prefixes the
 *   country code (91) so WhatsApp can resolve it.
 * Returns an empty string when there aren't enough digits to be a number.
 */
export function normalizeWhatsAppNumber(raw: string | undefined | null): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  // Bare 10-digit local number → assume India (+91).
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

/**
 * Open a WhatsApp chat for the given number in a new tab/window.
 *
 * Uses the official https://wa.me/ deep link, which WhatsApp automatically
 * resolves to the desktop app / WhatsApp Web on computers and to the WhatsApp
 * mobile app on phones — so the user lands in a chat and can send whatever
 * message they like. When no valid number is provided it opens WhatsApp with
 * just the prefilled text so the user can pick a contact manually.
 *
 * @param phone Raw phone number (any format). Optional.
 * @param message Optional prefilled message text.
 */
export function openWhatsApp(phone?: string | null, message?: string) {
  if (typeof window === "undefined") return;
  const number = normalizeWhatsAppNumber(phone);
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  const url = number ? `https://wa.me/${number}${text}` : `https://wa.me/${text}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
