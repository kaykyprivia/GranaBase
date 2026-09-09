import { InventoryProductDetailsClient } from "@/components/business/inventory/InventoryProductDetailsClient";

type Props = {
  params: Promise<{ productId: string }>;
};

export default async function BusinessInventoryProductPage({ params }: Props) {
  const { productId } = await params;

  return <InventoryProductDetailsClient productId={productId} />;
}
