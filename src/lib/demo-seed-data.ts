/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Demo Seed Data

   Realistic pre-built data that populates the demo workspace so demo users
   see a fully functional repair shop. This data is loaded on first demo
   login and shared among all demo users.

   The data is intentionally comprehensive — covering tickets, customers,
   invoices, inventory, and expenses — so the demo feels like a real shop.
   ────────────────────────────────────────────────────────────────────────── */

import type { TeamMember } from "@/lib/mock-data";
import { hashPassword, DEFAULT_SEED_PASSWORD } from "@/lib/auth";
import type { GrantMap } from "@/lib/permissions-context";

/* ── Demo team members (staff for the demo workspace) ─────────────────── */

function seedDemoStaff(m: Omit<TeamMember, "loginEnabled" | "passwordHash" | "createdAt"> & { loginEnabled?: boolean }): TeamMember {
  const loginEnabled = m.loginEnabled ?? m.status === "active";
  return {
    ...m,
    loginEnabled,
    passwordHash: loginEnabled ? hashPassword(DEFAULT_SEED_PASSWORD, m.id) : undefined,
    createdAt: m.joiningDate ? new Date(m.joiningDate).toISOString() : new Date().toISOString(),
    createdBy: "System",
  };
}

export const DEMO_TEAM: TeamMember[] = [
  seedDemoStaff({
    id: "DEMO-001",
    name: "Demo Owner",
    email: "demo@repairox.in",
    phone: "+91 98765 43210",
    roleId: "demo_user",
    branch: "BTM Layout (HQ)",
    status: "active",
    department: "Management",
    designation: "Store Owner",
    joiningDate: "2024-01-15",
  }),
  seedDemoStaff({
    id: "DEMO-002",
    name: "Ravi Kumar",
    email: "ravi.demo@repairox.in",
    phone: "+91 87654 32109",
    roleId: "demo_user",
    branch: "BTM Layout (HQ)",
    status: "active",
    department: "Service",
    designation: "Senior Technician",
    joiningDate: "2024-02-01",
  }),
  seedDemoStaff({
    id: "DEMO-003",
    name: "Priya Sharma",
    email: "priya.demo@repairox.in",
    phone: "+91 76543 21098",
    roleId: "demo_user",
    branch: "Koramangala",
    status: "active",
    department: "Reception",
    designation: "Front Desk",
    joiningDate: "2024-03-10",
  }),
  seedDemoStaff({
    id: "DEMO-004",
    name: "Arjun M.",
    email: "arjun.demo@repairox.in",
    phone: "+91 65432 10987",
    roleId: "demo_user",
    branch: "BTM Layout (HQ)",
    status: "active",
    department: "Service",
    designation: "Technician",
    joiningDate: "2024-04-05",
  }),
  seedDemoStaff({
    id: "DEMO-005",
    name: "Sneha R.",
    email: "sneha.demo@repairox.in",
    phone: "+91 54321 09876",
    roleId: "demo_user",
    branch: "HSR Layout",
    status: "active",
    department: "Accounts",
    designation: "Accounts Executive",
    joiningDate: "2024-05-20",
  }),
];

/* ── Demo grants (full access for the demo role) ─────────────────────── */

export const DEMO_GRANTS: GrantMap = {
  demo_user: "all",
  platform_owner: "all",
};

/* ── Demo access payload (roles + team for permissions-context) ────────── */

export function getDemoAccessPayload() {
  return {
    grants: DEMO_GRANTS,
    customRoles: [{
      id: "demo_user",
      label: "Demo User",
      summary: "Full access demo account for exploring RepairOX.",
      workspaces: ["leads" as const, "shop" as const, "operations" as const],
      permissions: "all" as const,
    }],
    removedBuiltInRoles: [] as string[],
    team: DEMO_TEAM,
  };
}
