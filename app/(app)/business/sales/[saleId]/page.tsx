import { SaleDetailsClient } from "@/components/business/sales/SaleDetailsClient";

type Props = {
  params: Promise<{ saleId: string }>;
};

export default async function BusinessSaleDetailsPage({ params }: Props) {
  const { saleId } = await params;

  return <SaleDetailsClient saleId={saleId} />;
}
