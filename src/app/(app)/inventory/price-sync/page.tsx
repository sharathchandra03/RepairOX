import { redirect } from "next/navigation";
/* Merged into Price List Edit (Link Health tab). Kept so old links still work. */
export default function PriceSyncRedirect() {
  redirect("/inventory/price-control?tab=link");
}
