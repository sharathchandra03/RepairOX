# RepairOX — Changes Summary

## July 21, 2026

### Ticket Management — UI/UX Overhaul

- **Row Selection** — Every ticket row now has a checkbox. A "Select All" checkbox in the header supports indeterminate state. Selected count shown in the toolbar.
- **Bulk Status Change** — Select one or more tickets, click "Change Status", and pick a new status from the inline pill row to update all at once.
- **Actions Column** — Far-right column with a pencil (edit) icon and a "..." menu containing: View, Transfer Ticket, View/Add Comment, Checkout, Email Receipt, Print, and Delete Ticket.
- **Delete Ticket** — Added to the actions menu with a custom RepairOX-styled confirmation dialog (no browser default alert).
- **Edit Ticket** — Pencil icon navigates to the ticket wizard pre-filled with existing data for editing. Saves updates back to the store.
- **Multi-Product Support** — A single ticket can now hold multiple devices/items. The table shows each item as a bulleted list (model, serial, issue) with an "N items" badge.
- **Time-Based Visual Alert** — Tickets open for 40+ minutes get a soft sky-blue row highlight and an elapsed-time badge (e.g. "120m+").
- **Date Range Filters** — Buttons for All, Today, Yesterday, 7 Days, 14 Days, 30 Days filter tickets by creation date.
- **Advanced Filter Panel** — Click "Filter" to reveal dropdowns for Priority, Technician, Status, and Date Range. Active filters show a blue dot on the button.
- **Column Visibility & Reorder** — Click "Columns" to show/hide and reorder table columns using eye toggles and up/down arrows. Checkbox and Actions columns are locked.
- **Column Alignment Fixed** — Table uses `table-fixed` with explicit width classes so headers and data always line up.
- **Removed Columns** — Assigned To, Last Updated removed. Email removed from customer info.
- **Customer Info Cleaned** — Shows name, phone, and company only.
- **Status Pills** — Polished badges with dot indicators and ring borders.
- **Responsive** — Mobile card layout with checkboxes, multi-item display, and action menus preserved.

### Ticket Drawer Flows

- **View Ticket** — Slide-over drawer showing full ticket details (customer, device, status, amount, dates).
- **Transfer Ticket** — Drawer with technician/branch selector and reason textarea.
- **View / Add Comment** — Comment timeline with avatar, author, timestamp, and a reply input.
- **Checkout** — Payment method, discount, and notes form with total display.
- **Email Receipt** — Recipient, CC, message fields with ticket summary card.
- **Print** — Format selector (Receipt/Job Card/Invoice/Delivery Note) with live preview card.

### Global Data Store

- Created a React Context + localStorage store (`lib/store.tsx`) replacing all static mock data.
- Tickets, todos, orders, revenue, and team data are now reactive and persistent.
- Adding/editing/deleting a ticket from any page reflects everywhere instantly.
- Dashboard KPIs (revenue, dues, tickets today, device breakdown) computed from live store data.

### Dashboard — Live Data

- Business Revenue, Dues Outstanding, and Tickets Today KPIs now derive from actual ticket data.
- Device breakdown bar chart dynamically computed from ticket device fields.
- Recent Transactions feed shows the latest tickets from the store.
- Critical Tasks table reads from the store with properly formatted ISO dates.

---

July 19th 
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
