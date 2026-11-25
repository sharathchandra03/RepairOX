import { redirect } from "next/navigation";
/* Ticket Reservations was removed (not used). Old links go to Stock Summary. */
export default function ReservationsRemoved() {
  redirect("/inventory");
}
