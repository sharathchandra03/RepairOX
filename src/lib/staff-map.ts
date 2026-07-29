/* Pure mappers between the Supabase `staff` row (snake_case) and the app's
   TeamMember shape (camelCase). Shared by API routes and the browser reads. */

import type { TeamMember, StaffStatus } from "@/lib/mock-data";
import type { SalaryType } from "@/lib/auth";

export interface StaffRow {
  id: string;
  auth_user_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role_id: string | null;
  branch: string | null;
  status: string | null;
  login_enabled: boolean | null;
  salary_type: string | null;
  salary_amount: number | null;
  department: string | null;
  designation: string | null;
  joining_date: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_login: string | null;
}

export function rowToStaff(r: StaffRow): TeamMember {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    phone: r.phone ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    roleId: r.role_id ?? "",
    branch: r.branch ?? "",
    status: (r.status as StaffStatus) ?? "active",
    loginEnabled: Boolean(r.login_enabled),
    salaryType: (r.salary_type as SalaryType) ?? undefined,
    salaryAmount: r.salary_amount ?? 0,
    department: r.department ?? undefined,
    designation: r.designation ?? undefined,
    joiningDate: r.joining_date ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
    lastLogin: r.last_login ?? undefined,
  };
}
