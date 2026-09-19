/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Capability resolution (UI enforcement helper)

   The permission CATALOG (permissions.ts) and the MATRIX (permission-levels.ts)
   define fine-grained keys per feature. Historically the UI gated many actions
   on a few COARSE keys (manage_repair_jobs, manage_invoices, manage_sales,
   use_pos, …). To enforce the granular keys WITHOUT breaking existing roles,
   every action resolves to a small OR-set: the granular key(s) that should now
   gate it, PLUS the coarse legacy key(s) that used to. `full_access` (and the
   DB wildcard `*`) already imply everything via checkGrantedPermission, so they
   never need listing here.

   Usage (client):
     const { can } = usePermissions();
     if (allow(can, "ticket.delete")) { … }
     <Can permission={CAP.ticket.delete}>…</Can>   // key[] with mode="any"

   This is the SINGLE place the granular↔legacy fallback is expressed, so the
   whole app stays consistent and a new feature only has to add one entry here.
   ────────────────────────────────────────────────────────────────────────── */

import type { PermissionKey } from "@/lib/permissions";

/** For each logical action, the keys that GRANT it (checked with mode "any").
 *  First entries are the precise granular keys; trailing entries are the
 *  backward-compatible coarse keys so pre-existing roles keep working. */
export const CAP = {
  ticket: {
    view: ["view_ticket", "manage_repair_jobs"],
    create: ["create_ticket", "manage_repair_jobs"],
    edit: ["edit_ticket", "manage_repair_jobs"],
    delete: ["delete_ticket", "manage_repair_jobs"],
    changeStatus: ["change_ticket_status", "update_repair_status", "manage_repair_jobs"],
    changePriority: ["change_ticket_priority", "edit_ticket", "manage_repair_jobs"],
    pin: ["pin_ticket", "edit_ticket", "manage_repair_jobs"],
    assign: ["assign_technician", "assign_technicians", "manage_repair_jobs"],
    parts: ["add_parts", "remove_parts", "manage_repair_jobs"],
    qc: ["perform_qc", "manage_repair_jobs"],
    pushToInvoice: ["push_to_invoice", "manage_repair_jobs", "manage_invoices"],
    print: ["print_ticket", "print_documents", "manage_repair_jobs"],
    transfer: ["transfer_ticket", "manage_repair_jobs"],
    sendComms: ["ticket_send_comms", "send_communications", "manage_repair_jobs"],
    downloadPdf: ["print_ticket", "print_documents", "view_ticket", "manage_repair_jobs"],
  },
  warranty: {
    view: ["view_warranty", "manage_repair_jobs"],
    create: ["create_warranty", "manage_repair_jobs"],
    edit: ["edit_warranty", "manage_repair_jobs"],
    complete: ["complete_warranty", "edit_warranty", "manage_repair_jobs"],
    convert: ["convert_warranty_to_ticket", "create_ticket", "manage_repair_jobs"],
  },
  invoice: {
    view: ["view_invoice", "manage_invoices"],
    create: ["create_invoice", "manage_invoices"],
    createPartial: ["create_partial_invoice", "create_invoice", "manage_invoices"],
    edit: ["edit_invoice", "manage_invoices"],
    delete: ["delete_invoice", "manage_invoices"],
    duplicate: ["duplicate_invoice", "create_invoice", "manage_invoices"],
    cancel: ["cancel_invoice", "change_invoice_status", "manage_invoices"],
    changeStatus: ["change_invoice_status", "manage_invoices"],
    updatePayment: ["update_payment", "manage_payments", "manage_invoices"],
    applyDiscount: ["apply_invoice_discount", "manage_invoices"],
    print: ["print_invoice", "print_documents", "manage_invoices"],
    share: ["share_invoice", "send_communications", "manage_invoices"],
    export: ["export_invoices", "export_reports", "manage_invoices"],
    convertFromTicket: ["convert_from_ticket", "create_invoice", "manage_invoices"],
  },
  walkin: {
    view: ["walkin_view", "use_pos", "manage_repair_jobs"],
    create: ["walkin_create", "use_pos", "manage_repair_jobs", "manage_sales"],
    edit: ["walkin_edit", "use_pos", "manage_repair_jobs"],
    delete: ["walkin_delete", "manage_repair_jobs"],
    bulkDelete: ["walkin_bulk_delete", "walkin_delete", "manage_repair_jobs"],
    convert: ["walkin_convert_to_ticket", "create_ticket", "manage_repair_jobs"],
    pin: ["walkin_pin", "walkin_edit", "use_pos", "manage_repair_jobs"],
    finalStatus: ["walkin_final_status_change", "walkin_edit", "use_pos", "manage_repair_jobs"],
    import: ["walkin_import", "import_data", "use_pos", "manage_repair_jobs"],
    export: ["walkin_export", "export_reports", "export_csv", "use_pos"],
    followup: ["walkin_followup_create", "walkin_followup_reschedule", "walkin_followup_complete", "walkin_edit", "use_pos", "manage_repair_jobs"],
    followupCancel: ["walkin_followup_cancel", "walkin_edit", "use_pos", "manage_repair_jobs"],
    reportsView: ["walkin_reports_view", "view_reports", "use_pos"],
  },
  lead: {
    view: ["leads_view", "manage_sales"],
    create: ["leads_create", "manage_sales"],
    edit: ["leads_edit", "manage_sales"],
    delete: ["leads_delete", "manage_sales"],
    assign: ["leads_assign", "assign", "manage_sales"],
    stageChange: ["leads_stage_change", "manage_sales"],
    priorityChange: ["leads_priority_change", "manage_sales"],
    pin: ["leads_pin", "leads_edit", "manage_sales"],
    convert: ["leads_convert", "manage_sales"],
    import: ["leads_import", "import_data", "manage_sales"],
    export: ["leads_export", "export_reports", "manage_sales"],
  },
  deal: {
    create: ["deals_create", "manage_sales"],
    edit: ["deals_edit", "manage_sales"],
    delete: ["deals_delete", "manage_sales"],
  },
  quotation: {
    create: ["quotations_create", "manage_sales"],
    send: ["quotations_send", "send_communications", "manage_sales"],
    convertToInvoice: ["quotations_convert_to_invoice", "create_invoice", "manage_invoices"],
  },
  dashboard: {
    editTargets: ["edit_dashboard_targets", "manage_settings"],
    export: ["export_dashboard", "export_reports", "manage_reports"],
  },
  field: {
    assignFieldManager: ["assign_field_manager", "manage_field_jobs"],
    advancePickup: ["field_pickup_status_change", "update_pickup", "manage_field_jobs"],
    advanceDrop: ["field_drop_status_change", "update_drop", "manage_field_jobs"],
  },
} satisfies Record<string, Record<string, PermissionKey[]>>;

/** True when the caller's `can()` grants ANY of the keys for an action.
 *  `full_access` / `*` are already handled inside `can` (checkGrantedPermission). */
export function allow(can: (k: PermissionKey) => boolean, keys: PermissionKey[]): boolean {
  return keys.some(can);
}
