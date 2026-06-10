import { WooResourceEditor } from '@/components/dashboard/woo/WooResourceEditor';

export default async function OrderEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WooResourceEditor resource="orders" id={id} />;
}
