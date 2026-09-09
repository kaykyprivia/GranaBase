import { PurchaseDetailsClient } from "@/components/business/purchases/PurchaseDetailsClient";

type PurchaseDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PurchaseDetailsPage({ params }: PurchaseDetailsPageProps) {
  const { id } = await params;

  return <PurchaseDetailsClient purchaseId={id} />;
}
