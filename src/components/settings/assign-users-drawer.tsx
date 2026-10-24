"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, Check, Search, Users } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import type { TeamMember } from "@/lib/mock-data";
import type { RoleDef } from "@/lib/permissions";

/** "Assign existing users" drawer — grants one or MORE existing organization
 *  users ADDITIONAL access to a store (a non-default `user_stores` grant). It
 *  never creates a user and never changes a user's home branch. The server
 *  (`POST /api/owner/stores/[id]/members`) re-checks org + scope and enforces
 *  the permission; this UI is gated by the same capability on the page.
 *
 *  Keyed to the store by id. Candidates are the org's users (usePermissions().
 *  team) MINUS the people who already have access to this store. A per-user
 *  store role may be chosen; when "Keep each user's role" is selected the grant
 *  inherits the user's own role (roleId omitted). */
export function AssignUsersDrawer({
  open,
  onClose,
  storeName,
  candidates,
  roles,
  saving,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  storeName: string;
  /** Org users NOT already assigned to this store. */
  candidates: TeamMember[];
  /** Org roles (Settings → Roles & Permissions) for the optional per-store role. */
  roles: RoleDef[];
  saving?: boolean;
  /** roleId === "" means "keep each user's own role" (omit the grant role). */
  onConfirm: (staffIds: string[], roleId: string) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [roleId, setRoleId] = useState(""); // "" = keep each user's own role

  // Re-seed whenever the drawer re-opens.
  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setQuery("");
      setRoleId("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.branch ?? "").toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const roleOptions = useMemo(
    () => [{ label: "Keep each user's role", value: "" }, ...roles.map((r) => ({ label: r.label, value: r.id }))],
    [roles],
  );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const count = picked.size;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={UserPlus}
      title="Assign Existing Users"
      subtitle={storeName}
      footer={
        <Button
          className="w-full gap-1.5"
          disabled={count === 0 || saving}
          onClick={() => onConfirm(Array.from(picked), roleId)}
        >
          <Check className="h-4 w-4" />
          {saving ? "Assigning…" : count === 0 ? "Select users to assign" : `Assign ${count} ${count === 1 ? "user" : "users"}`}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-[12.5px] text-muted-foreground">
          Give existing team members access to <span className="font-medium text-foreground">{storeName}</span>.
          This grants an additional store — it doesn&apos;t move their home store or create a new user.
        </p>

        {/* Optional per-store role */}
        <div>
          <Label>Role for this store</Label>
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} options={roleOptions} className="h-[38px]" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Applies to every user you assign here. Choose &quot;Keep each user&apos;s role&quot; to leave their role unchanged.
          </p>
        </div>

        {candidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <Users className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-[13px] font-medium">Everyone already has access</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              All of your organization&apos;s users are already assigned to this store.
            </p>
          </div>
        ) : (
          <div>
            <Label>Select users</Label>
            {/* Search */}
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email or home store…"
                className="h-9 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-[13px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
              />
            </div>

            <div className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-0.5">
              {filtered.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">No users match “{query}”.</p>
              ) : (
                filtered.map((m) => {
                  const on = picked.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={
                        "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition " +
                        (on ? "border-[#4361EE] bg-[#EEF1FD]/60" : "border-border hover:bg-muted/40")
                      }
                    >
                      <Checkbox checked={on} onChange={() => toggle(m.id)} aria-label={`Select ${m.name}`} />
                      <Avatar name={m.name} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold leading-tight">{m.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {m.email || "No email"}
                          {m.branch ? ` · Home: ${m.branch}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
