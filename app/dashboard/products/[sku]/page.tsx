import { WooResourceEditor } from '@/components/dashboard/woo/WooResourceEditor';

export default async function ProductEditorPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return <WooResourceEditor resource="products" id={sku} />;
}
