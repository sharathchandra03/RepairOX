import { redirect } from "next/navigation";

/* The former static Field Management mockup has been superseded by the real,
   data-driven Field module at /field (part of Shop Management). Redirect any
   old bookmarks/links there. */
export default function FieldManagementRedirect() {
  redirect("/field");
}
