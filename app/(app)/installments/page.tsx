import { redirect } from "next/navigation";

export default function InstallmentsPage() {
  redirect("/bills?tab=installments");
}
