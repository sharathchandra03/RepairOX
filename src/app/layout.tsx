import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepairOX — Repair Smarter, Grow Faster",
  description:
    "End-to-end CRM for mobile and electronics repair shops. Tickets, inventory, billing, customers, and analytics — beautifully designed.",
  themeColor: "#E11D48",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
