import { redirect } from "next/navigation";

/** Lead settings moved into the main Settings (Settings › Leads). Kept as a
 *  redirect so saved links and bookmarks still work. */
export default function LegacyLeadSettingsRedirect() {
  redirect("/settings/leads/productivity");
}
