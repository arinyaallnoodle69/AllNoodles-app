import { redirect } from "next/navigation";

export default function SettingsCustomerPricingPage() {
  redirect("/settings/customers?tab=pricing");
}
