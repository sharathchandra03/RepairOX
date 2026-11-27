import { redirect } from "next/navigation";

/** Settings › Leads has no landing page of its own — open the first area. */
export default function LeadSettingsIndex() {
  redirect("/settings/leads/form-edit");
}
