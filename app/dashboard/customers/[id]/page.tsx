import { WooResourceEditor } from '@/components/dashboard/woo/WooResourceEditor';

export default async function CustomerEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WooResourceEditor resource="customers" id={id} />;
}
