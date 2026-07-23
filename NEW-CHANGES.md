# RepairOX — Changes Summary

## July 23, 2026

### Ticket Edit Mode — Fast Save

- **Save Changes Button** — When editing a ticket, a persistent "Save Changes" button appears in the header area, within each form step, and in the fixed bottom navigation bar. Users can save immediately from any step.
- **No Forced Step Traversal** — Users can edit Step 3 (Device) or Step 6 (Customer) and save without navigating through all remaining steps. The wizard still allows step navigation if needed.
- **Unsaved Changes Guard** — If a user tries to navigate away or close the editor with unsaved changes, a confirmation dialog appears offering: Save Changes, Discard Changes, or Continue Editing.
- **Success Toast** — After saving, a green toast appears ("Ticket updated successfully") and the user is automatically returned to the Ticket Detail page.
- **Navigation Context Preserved** — Edit mode returns to the ticket detail page (not the wizard thank-you screen or dashboard).
- **Fixed Bottom Bar** — In edit mode, the bottom navigation shows Previous, Next, and Save Changes — all visible without scrolling.

### Ticket-Inventory Integration

- **Inventory-Linked Parts** — The Parts step in ticket creation now searches real inventory items by name, SKU, or category. Free-text part entry is replaced with an autocomplete dropdown sourced from the Inventory module.
- **Stock Validation** — Each inventory item shows its current stock level. Out-of-stock items cannot be added. Low-stock items show amber warnings. Quantity exceeding available stock triggers a visible alert.
- **Quantity Controls** — Each part has +/- buttons for quantity adjustment. Line totals calculate automatically (qty × unit price).
- **Planned vs Used** — Parts are initially saved as "Planned" on the ticket. They are NOT deducted from inventory until the ticket is marked as Completed.
- **Automatic Deduction** — When a ticket status changes to Completed, all planned parts are deducted from inventory, marked as "Used", and stock movement records are created automatically.
- **Stock Movement History** — Each deduction generates an Outward movement with ticket number, technician, and date for full traceability.
- **Parts in Ticket Detail** — The ticket detail page shows a "Parts Used" table with item name, SKU, quantity, unit price, total, and status badge (Planned/Consumed).
- **Push to Invoice with Parts** — When pushing a ticket to invoice, all parts are transferred as individual line items with correct quantities and prices. No re-entry needed.
- **Reactive Inventory** — Inventory items are now in the global store (reactive, localStorage-persisted) alongside tickets and invoices.

### Expected Resolution Time

- **Resolution Time Field** — A new "Expected Resolution Time" dropdown is available in the ticket creation wizard (Device Details step). Options: 30 min, 45 min, 1 hour, 2 hours, 4 hours, 8 hours (End of Day). If left empty, defaults silently to 59 minutes.
- **Automatic Due Time Calculation** — When a ticket is created or edited, the Due Time is automatically calculated as `Created Time + Resolution Minutes`. No manual due date entry required.
- **Overdue Logic Updated** — The ticket list overdue highlighting (light blue row) now uses the calculated Due Time instead of a hardcoded 40-minute threshold. Tickets become overdue only when `Current Time > Due Time`.
- **Detail Page Display** — The ticket detail page now shows "Expected Resolution" (e.g. "2h", "59 min") and "Due Time" in the Ticket Information section.
- **Edit Support** — When editing a ticket, the resolution time can be changed and the due time recalculates automatically.
- **Backward Compatible** — Existing tickets without `resolutionMinutes` fall back to the 59-minute default for overdue detection.

### Ticket Detail Page — Full Implementation

- **Full-Page Ticket Detail View** — Clicking "View" from the ticket actions menu or clicking a ticket row now opens a dedicated full-page detail screen at `/tickets/[id]` instead of the previous lightweight side drawer.
- **Structured Layout** — The detail page is organized into: Header (ticket ID, status badge, priority, device, customer, elapsed time), Summary Cards (6-card grid showing customer, phone, device, technician, amount, created date), and full Detail Sections for Customer, Device, Ticket, and Billing information.
- **Multi-Device Support** — If a ticket has multiple items, each device is shown in its own bordered card with serial/IMEI, issue, and service details.
- **Activity Timeline** — A right-column timeline shows ticket lifecycle events: creation, technician assignment, status changes, priority updates, and due date setting.
- **Quick Actions Panel** — Dedicated sidebar with one-click access to Push to Invoice, Edit Ticket, Change Status, and Print.
- **Status & Priority Dialogs** — Inline modal dialogs for changing ticket status or priority directly from the detail page without navigating away.
- **Back Navigation** — Prominent back arrow button returns to the ticket list instantly.

### Push to Invoice Integration

- **Push to Invoice Button** — Available in both the ticket detail page header and the ticket actions dropdown menu (new "Push to Invoice" menu item with Receipt icon).
- **Prefilled Invoice Creation** — Clicking "Push to Invoice" navigates to the invoice creation wizard with customer name, phone, company, device, service/issue, amount, and linked ticket ID all prefilled automatically.
- **Duplicate Prevention** — If an invoice is already linked to the ticket (via `ticketId`), the button is disabled and shows "Invoice Linked" with a link to the existing invoice.
- **Seamless Handoff** — The invoice create page reads `fromTicket` query parameters and pre-populates the form including a line item for the repair service, so users never re-enter data.

### Ticket List Improvements

- **Row Click Navigation** — Clicking anywhere on a ticket row navigates to the full detail page. Checkbox and action button clicks are isolated and don't trigger navigation.
- **Actions Menu Updated** — Added "Push to Invoice" option to the ticket row actions dropdown menu between "Email Receipt" and "Print".

---

## July 21, 2026

### Invoice Module — Major Upgrade

- **Two Invoice Types** — Invoices are now categorized as Retail Invoice or Business Invoice. Each type has its own independent numbering sequence (INV001, INV002… and INVG001, INVG002…). Creating one type never affects the other's sequence.
- **Invoice Type Required** — When creating a new invoice, selecting the invoice type (Retail or Business) is now mandatory in the Details step.
- **Status-Colored Invoice IDs** — Invoice IDs in the list table now show a subtle color based on their status (green for paid, amber for pending, red for cancelled, etc.). Hover over any ID to see the full status.
- **Draggable KPI Cards** — The metric cards at the top of the Invoice page can now be rearranged by dragging. Your preferred layout is saved and restored on next login.
- **Invoice Type Filter** — A new "All Types / Retail / Business" filter is available in the filter bar to quickly show only one invoice category.
- **Bulk Delete for Invoices and Tickets** — Select multiple invoices or tickets, then click "Delete" to remove them all at once. A confirmation popup appears before deletion.

### POS — Separated from Walk-In

- **POS is now independent** — The POS (Point of Sale) interface is no longer linked to Walk-In. It has its own route accessed via the highlighted POS button in the top navigation bar.
- **Walk-In is now a separate module** — The Walk-In page is cleared and ready for a future separate implementation.
- **POS Button Glow** — The POS button in the header now has a subtle continuous glowing border effect to draw attention.

### Ticket & Invoice Shared Improvements

- **Bulk Delete** — Both Tickets and Invoices now support selecting multiple items and deleting them in bulk with a confirmation popup.
- **Dropdown Menu Fix** — Action menus (the three-dot menus) now use fixed positioning so they never get clipped by table containers, regardless of scroll position.
- **Column Settings Redesign** — The column visibility panel for both Tickets and Invoices is now a clean two-section layout (Visible / Hidden) with checkboxes, drag handles for reordering, search, and Required badges for locked columns.
- **Numeric Input Fix** — Price, Quantity, and Discount fields no longer produce leading zeros (like "066" or "07"). Fields clear on focus and allow natural typing.

### Invoice Workflow

- **Fixed Footer** — The Previous/Next navigation bar in Create Invoice is now properly fixed at the bottom without overlapping the sidebar.
- **Spacious Layout** — The Create Invoice workflow has improved vertical spacing between breadcrumbs, stepper, and form cards for a more premium feel.
- **Responsive Filters** — The invoice filter panel now wraps cleanly at all zoom levels and screen sizes. Date pickers never overflow the container.

### Dashboard

- **Sort / Filter / Date buttons now work** — The three filter buttons in the Analytics Dashboard are now functional dropdowns. Selecting a sort order, status filter, or date range immediately updates all KPIs, charts, and tables.
- **KPI Cards Redesigned** — Removed decorative wave graphics. Replaced with thin progress bars showing meaningful metrics (Monthly Target, Inventory Capacity, Collection Progress, Daily Target).

### Navigation

- **Process Selection** — Clicking "New Invoice" in the ticket wizard now correctly opens the Invoice creation page. Clicking "Walk-In" opens the Walk-In module.
- **Buy-Back Removed** — Removed from the Shop Management sidebar. Documented in use-later file for future re-addition.

---

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
