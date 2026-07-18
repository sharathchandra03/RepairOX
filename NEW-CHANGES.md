# RepairOX — Changes Summary

## Module Renaming & Reordering

- The three main modules are now displayed in this order everywhere: **Shop Management → Sales Management → Field Management**
- The top switcher tabs now read: **Shop | Leads | Field**
- The login/module selection page heading changed from "Choose a workspace to get started" to **"Choose a module to get started"**
- All references to "Workspace" have been changed to **"Module"** throughout the app
- Module cards on the selection screen now show updated descriptions:
  - **Module 1 — Shop Management**: End-to-end repair shop operations including tickets, customers, invoicing, repairs, pricing, walk-ins, buy-back, and day-to-day business management.
  - **Module 2 — Sales Management**: Manage leads, contacts, companies, deals, quotations, follow-ups, communication, pipeline management, and customer conversion.
  - **Module 3 — Field Management**: Manage technicians, field visits, scheduling, on-site services, route planning, and location-based operations.

---

## Dashboard Changes

- **"New Ticket" button renamed to "Add New"** — on both the dashboard and the tickets list page.
- **Monthly comparison badge** — A "+18.2% vs last month" indicator now shows below the Analytics Overview heading.
- **Tickets Today KPI** — The delta chip now reads "+9 vs yesterday" to compare with the previous day.
- **Total Revenue chart made smaller** — The chart height has been reduced for a cleaner look.
- **Recent Transactions — "View All" button added** — Takes you to Reports.
- **Total Tickets donut chart** — Two new segments added: "Waiting for Approval" (amber) and "Waiting for Parts" (red).
- **To-Do List redesigned as a yellow sticky pad** — Yellow background with a decorative tape at the top and lined-paper effect. Looks like an actual sticky note.
- **Resizable & draggable dashboard cards** — The dashboard now uses a proper drag-and-resize grid. You can:
  - **Drag** cards by their "⋮⋮ Drag to move" handle at the top to rearrange them
  - **Resize** cards by pressing and dragging the edges (right edge, bottom edge, or bottom-right corner) to make them larger or smaller
  - Cards have minimum sizes so they never get too small to read
  - On mobile/tablet, cards stack in a single column and resize is disabled
- **Resize can be disabled** — Go to Settings → Dashboard to toggle the drag/resize feature on or off.

---

## Sidebar Changes

- **Removed "Job Assignment" and "Repair Status"** from the sidebar navigation.
- **Restructured the Shop module sidebar**:
  - MODULE section now contains: Dashboard, Tickets, Invoice, Walk-In, Buy-Back, Price List
  - MANAGE section: Technicians, Notes, Customers
  - BILLING section: Payments, Expenses
  - GENERAL section: Reports, Settings
- **Sidebar is now full-height** — It stays fixed at full screen height while only the content area on the right scrolls.

---

## New Ticket Wizard

- Enhanced visual design with gradient backgrounds, animated step indicators, and a Sparkles icon in the step counter.
- Mobile progress bar added for smaller screens.
- Responsive title sizing for phones and tablets.

---

## Internal Team Chat

- A new **floating chat button** appears at the bottom-right corner of the app.
- Click it to open a team chat panel where employees can message each other in real-time.
- Shows message history, sender avatars, timestamps, and an unread badge.
- Supports typing and sending messages with Enter key or the send button.

---

## Responsive / Mobile Compatibility

- The app now works properly on **tablets, mobile phones, and iPhones** of all screen sizes.
- Added safe-area support for iPhone notch and Dynamic Island.
- Touch targets increased to minimum 44px on mobile for easier tapping.
- Prevented horizontal scrolling issues on small screens.
- Charts resize properly on smaller displays.

---

## Settings

- New **"Dashboard" settings page** added under Settings with a toggle to enable/disable the card resize feature.
- "Workspace Access" renamed to **"Module Access"** in Settings.

---

*All existing routes, navigation links, permissions, and workflows remain unchanged. Only labels, ordering, and visual presentation have been updated.*
