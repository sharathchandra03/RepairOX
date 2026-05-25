# RepairOX — Premium Mobile-Repair CRM (Redesigned)

A production-grade Next.js + TypeScript + Tailwind + Framer Motion redesign of the RepairOX CRM. Every one of the 15 source screens has been rebuilt with refined visual hierarchy, motion, accessibility, and responsive recomposition — preserving the original workflow while elevating UX, craft, and feel.

## ✨ Highlights

- **Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS v3 · Framer Motion · Recharts · Lucide.
- **Design system:** Tokenised CSS variables, crimson brand gradient, refined neutrals, Inter + Plus Jakarta Sans, 14 px radius, layered shadows, subtle grid backgrounds.
- **Motion:** spring-easing entrance animations, `layoutId` shared-element transitions, animated counters, staggered children, AnimatePresence on route + step changes, performant transform/opacity-only animations.
- **Responsive:** Desktop dense layouts, tablet adaptive grid, mobile recomposition (table → cards), touch-friendly controls.
- **Accessibility:** Visible focus rings, semantic landmarks, contrast-checked colour pairs, ARIA labels, motion that doesn't get in the way.

## 📐 Screen coverage (matches source)

1. **Login** — `/login` · split marketing + form, animated entrance
2. **Modules overview** — `/modules` · Shop / Field / Lead Management with hover lift + connectors
3. **Sidebar (all states)** — collapsible, animated active pill via `layoutId`
4. **Dashboard** — `/dashboard` · KPI cards w/ animated numerals, revenue chart (monthly/yearly tabs), orders status, donut chart, To-Do list, critical-tasks table
5. **Wizard 1 — Select Process** — `/tickets/new` (step 1)
6. **Wizard 2 — Select Category** — step 2
7. **Wizard 3 — Device Details** — step 3
8. **Wizard 4 — Assign Parts** — step 4
9. **Wizard 5 — Search Contact** — step 5 (Personal / Business toggle)
10. **Wizard 6 — Customer Information** — step 6
11. **Wizard 7 — Quotation Summary** — step 7 (new, fills the missing step 7)
12. **Wizard 8 — QC Form** — step 8 (OK / X / NA tri-state per checkpoint)
13. **Wizard 9 — Upload Photos & Documents** — step 9
14. **Wizard 10 — Customer Signature** — step 10 (animated signature stroke)
15. **Thank You / Print** — A4 / Thermal selection + share on WhatsApp & Email

Plus reachable sidebar routes: `/tickets`, `/invoice`, `/stock`, `/contacts`, `/buy-back`, `/price-list`, `/walk-in`, `/expenses`, `/reports`, `/settings`.

## 🚀 Getting started

```bash
# from the project root
cd app
npm install
npm run dev
# open http://localhost:3000
```

The app boots at `/login`. Submit any credentials → `/modules` → Dashboard.

## 🗂 Project structure

```
app/
├── src/
│   ├── app/
│   │   ├── (app)/                # Routes wrapped by sidebar + topbar shell
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── tickets/page.tsx
│   │   │   ├── invoice/page.tsx
│   │   │   ├── stock/page.tsx
│   │   │   ├── contacts/page.tsx
│   │   │   ├── buy-back/page.tsx
│   │   │   ├── price-list/page.tsx
│   │   │   ├── walk-in/page.tsx
│   │   │   ├── expenses/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── layout.tsx
│   │   ├── login/page.tsx        # full-screen
│   │   ├── modules/page.tsx      # full-screen
│   │   ├── tickets/new/page.tsx  # full-screen 10-step wizard
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx              # → redirects to /login
│   ├── components/
│   │   ├── ui/                   # Button, Card, Input, Badge, Tabs, Logo, Avatar, Progress
│   │   ├── layout/               # Sidebar, MobileSidebar, Topbar, AppShell, PageHeader
│   │   ├── dashboard/            # KpiCard, RevenueChart, TicketsDonut
│   │   ├── wizard/               # WizardShell, OptionGrid
│   │   └── common/               # ModulePlaceholder
│   └── lib/
│       ├── utils.ts              # cn(), formatINR(), initials()
│       └── mock-data.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
├── tsconfig.json
└── package.json
```

## 🎨 Design tokens

- Brand crimson: `#E11D48 → #BE123C` (gradient surfaces, active pills, primary buttons).
- Neutrals: HSL CSS variables in `globals.css` (`--background`, `--foreground`, `--muted`, etc.).
- Radius scale: 10 / 12 / 14 / 18 / 22 px (default `--radius: 14px`).
- Shadows: `shadow-card` (subtle layered), `shadow-glow` (brand glow), `shadow-ring` (1 px hairline).

## 💡 Notable interactions

- **Sidebar active pill** uses `layoutId="sidebar-active"` so the gradient slides between items.
- **Segmented tabs** share a `pill` `layoutId` for smooth control transitions.
- **Wizard** uses `AnimatePresence mode="wait"` between steps with a `Progress` bar and stepper labels.
- **Animated counters** on KPIs use `useMotionValue` + `useSpring` triggered when in view.
- **Signature pad** draws a real SVG path via `pathLength` animation on tap.
- **Donut chart** has an animated total in the centre via Recharts + Framer Motion overlay.
- **Page transitions** in `(app)` route group fade-up via the AppShell.

## 📱 Responsive

- Sidebar collapses to icons on `lg`, becomes a Sheet drawer below.
- Tickets table → cards on mobile.
- KPI grid 1 → 2 → 4 columns.
- Wizard adapts to single-column option grids on mobile.

## 🔧 Tech notes / extending

- Mock data lives in `src/lib/mock-data.ts`. Swap with real APIs when wiring backend.
- Charts use `recharts`. Replace gradient stops in `RevenueChart` to retheme.
- All components consume the design tokens; edit `tailwind.config.ts` and `globals.css` to retheme globally.
