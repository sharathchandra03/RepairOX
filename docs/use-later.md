# Use Later

## RepairOX Pro Upgrade Banner (Sidebar CTA)

Removed from sidebar for now. Re-add when Pro plan is ready.

### Desktop Sidebar (below nav, above profile footer)

```tsx
{/* CTA card — hidden when collapsed to prevent clipping */}
{!collapsed && (
  <div className="mx-3 mb-3 shrink-0 rounded-2xl bg-[#4361EE] p-4 text-white">
    <div className="flex items-center gap-2 mb-2">
      <CalendarDays className="h-4 w-4 opacity-80" />
      <p className="text-sm font-bold leading-tight">RepairOX Pro</p>
    </div>
    <p className="text-[11px] leading-snug opacity-75 mb-3">
      Unlock advanced reports, multi-branch & API access.
    </p>
    <button className="w-full rounded-xl bg-white/20 hover:bg-white/30 transition px-3 py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5">
      <UserPlus className="h-3.5 w-3.5" /> Upgrade Plan
    </button>
  </div>
)}
```

### Mobile Sidebar (below nav, before closing motion.aside)

```tsx
<div className="mx-3 mb-3 shrink-0 rounded-2xl bg-[#4361EE] p-4 text-white">
  <p className="text-sm font-bold mb-1">RepairOX Pro</p>
  <p className="text-[11px] opacity-75 mb-3">Unlock advanced reports & multi-branch.</p>
  <button className="w-full rounded-xl bg-white/20 hover:bg-white/30 transition px-3 py-1.5 text-xs font-semibold">
    Upgrade Plan
  </button>
</div>
```


---

## Ticket Quotation — GST/Tax Component (Removed)

Removed GST/Tax from the ticket quotation flow. Re-add when ready to support tax on tickets.

### QuoteSummary GST Computation (was in `src/app/tickets/new/page.tsx` → QuoteSummary)

```tsx
// Single GST rate → auto-split 50/50 into SGST + CGST
const gstRate = data.gstRate ?? 18;
const sgstRate = gstRate / 2;
const cgstRate = gstRate / 2;
const sgstAmt = Math.round(subtotal * (sgstRate / 100));
const cgstAmt = Math.round(subtotal * (cgstRate / 100));
const tax = sgstAmt + cgstAmt;
const total = subtotal + tax;

const isCustom = !!data.customGstRate;
const [customRaw, setCustomRaw] = useState<string>(String(gstRate));
const [customFocused, setCustomFocused] = useState(false);
```

### QuoteSummary Right Panel — SGST/CGST Rows + GST Rate Selector

```tsx
{/* In the summary <ul> */}
<QRow k="Sub-total" v={formatINR(subtotal)} />
{sgstAmt > 0 && <QRow k={`SGST (${sgstRate}%)`} v={formatINR(sgstAmt)} />}
{cgstAmt > 0 && <QRow k={`CGST (${cgstRate}%)`} v={formatINR(cgstAmt)} />}

{/* GST Rate Selector */}
{setData && (
  <div className="mt-4 pt-3 border-t border-border">
    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">GST Rate</Label>
    <div className="mt-2 flex items-center gap-1.5">
      {[0, 12, 18].map((rate) => (
        <button
          key={rate}
          type="button"
          onClick={() => setData({ ...data, gstRate: rate, customGstRate: false })}
          className={cn(
            "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-all text-center",
            gstRate === rate && !isCustom
              ? "bg-[#4361EE] text-white shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
          )}
        >
          {rate}%
        </button>
      ))}
      <button
        type="button"
        onClick={() => { setData({ ...data, customGstRate: true }); setCustomRaw(String(gstRate)); }}
        className={cn(
          "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-all text-center",
          isCustom
            ? "bg-[#4361EE] text-white shadow-sm"
            : "bg-muted text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
        )}
      >
        Custom
      </button>
    </div>
    {isCustom && (
      <div className="mt-2.5 flex items-center gap-2 flex-nowrap">
        <input
          type="text"
          inputMode="numeric"
          value={customFocused ? customRaw : String(gstRate)}
          onFocus={() => { setCustomFocused(true); setCustomRaw(String(gstRate)); }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, "");
            setCustomRaw(raw);
            const v = parseFloat(raw);
            if (!isNaN(v) && v >= 0 && v <= 100) {
              setData({ ...data, gstRate: v, customGstRate: true });
            } else if (raw === "" || raw === ".") {
              setData({ ...data, gstRate: 0, customGstRate: true });
            }
          }}
          onBlur={() => {
            setCustomFocused(false);
            const v = parseFloat(customRaw);
            if (isNaN(v) || customRaw === "") {
              setData({ ...data, gstRate: 0, customGstRate: true });
            }
          }}
          placeholder="Total GST %"
          className="h-9 w-20 shrink-0 rounded-lg border border-border bg-card px-2.5 text-sm font-medium tabular-nums text-center focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
        />
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">% → SGST {sgstRate}% + CGST {cgstRate}%</span>
      </div>
    )}
  </div>
)}
```

### Ticket Submission — GST Computation (was in handleSave)

```tsx
// Tax computation: single GST rate → split 50/50 into SGST + CGST
const ticketGstRate = data.gstRate ?? 0;
const ticketSgstRate = ticketGstRate / 2;
const ticketCgstRate = ticketGstRate / 2;
const ticketSgst = Math.round(subtotal * (ticketSgstRate / 100));
const ticketCgst = Math.round(subtotal * (ticketCgstRate / 100));
const ticketTotal = subtotal + ticketSgst + ticketCgst;
```

### Print Template — Ticket GST Section (was in `src/components/print/a4-template.tsx`)

```tsx
{/* GST breakdown — only when GST > 0 */}
{(ticket.sgst || 0) + (ticket.cgst || 0) > 0 && (
  <>
    <div className="flex justify-between py-0.5 text-[10px]">
      <span className="text-gray-600">Subtotal</span>
      <span className="font-medium">{formatPrintCurrency(ticket.amount - (ticket.sgst || 0) - (ticket.cgst || 0))}</span>
    </div>
    {(ticket.sgst || 0) > 0 && (
      <div className="flex justify-between py-0.5 text-[10px]">
        <span className="text-gray-600">SGST ({ticket.sgstRate || 0}%)</span>
        <span className="font-medium">{formatPrintCurrency(ticket.sgst || 0)}</span>
      </div>
    )}
    {(ticket.cgst || 0) > 0 && (
      <div className="flex justify-between py-0.5 text-[10px]">
        <span className="text-gray-600">CGST ({ticket.cgstRate || 0}%)</span>
        <span className="font-medium">{formatPrintCurrency(ticket.cgst || 0)}</span>
      </div>
    )}
  </>
)}
```

### Related Types (Keep in `mock-data.ts` Ticket type — fields still on type for backward compat)

- `gstRate?: number`
- `sgstRate?: number`
- `cgstRate?: number`
- `sgst?: number`
- `cgst?: number`

### WizardData fields (still present for future re-enablement)

- `gstRate: number` (default 18 in DEFAULT)
- `customGstRate?: boolean`
- `gstNumber: string`
