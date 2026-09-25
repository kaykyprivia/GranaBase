import { ProductGuard } from "@/components/guards/ProductGuard";
import { BusinessDashboardPageClient } from "@/components/business/dashboard/BusinessDashboardPageClient";

export default function BusinessPage() {
  return (
    <ProductGuard product="business" productLabel="Negocio">
      <BusinessDashboardPageClient />
    </ProductGuard>
  );
}
