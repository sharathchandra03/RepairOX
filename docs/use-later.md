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
